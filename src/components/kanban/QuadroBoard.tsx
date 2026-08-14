'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  closestCorners, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, horizontalListSortingStrategy,
  sortableKeyboardCoordinates, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ArrowLeft, Eye, Plus, Trash2, X } from 'lucide-react'
import { useMembro } from '@/components/AuthProvider'
import Modal from '@/components/kanban/Modal'
import BannerErro from '@/components/kanban/BannerErro'
import ColunaSortable, { ColunaVisual } from '@/components/kanban/ColunaLista'
import CartaoSortable, { CartaoVisual } from '@/components/kanban/CartaoKanban'
import PainelCartao, { type DadosPainel } from '@/components/kanban/PainelCartao'
import {
  ESPACO_POSICAO, atualizarCartao, atualizarLista, criarCartao, criarLista,
  excluirCartao, excluirLista, getQuadro, numerosDePedidos, posicaoEntre,
  posicoesRenormalizadas, renormalizarCartoes, renormalizarListas,
} from '@/lib/kanban'
import {
  cartoesDaLista, descreverFalhaKanban, porPosicao, type MsgKanban,
} from '@/lib/kanban-ui'
import type { Cartao, CorLista, Lista, Quadro } from '@/types'

type Estado = { listas: Lista[]; cartoes: Cartao[] }
type Ativo = { id: string; tipo: 'lista' | 'cartao' } | null

export default function QuadroBoard({ quadroId }: { quadroId: string }) {
  const { permissoes } = useMembro()
  const podeEditar = permissoes.editarKanban

  const [quadro, setQuadro] = useState<Quadro | null>(null)
  const [listas, setListas] = useState<Lista[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [numerosPedido, setNumerosPedido] = useState<Map<string, string>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [msg, setMsg] = useState<MsgKanban | null>(null)

  const [ativo, setAtivo] = useState<Ativo>(null)
  const [painelAberto, setPainelAberto] = useState(false)
  const [cartaoEmFoco, setCartaoEmFoco] = useState<Cartao | null>(null)
  const [listaAlvo, setListaAlvo] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [compondoLista, setCompondoLista] = useState(false)
  const [tituloNovaLista, setTituloNovaLista] = useState('')
  const [confirmarLista, setConfirmarLista] = useState<Lista | null>(null)

  // Espelhos do estado. Os handlers de drag precisam ler o estado MAIS RECENTE:
  // o onDragOver já mexeu nos cartões antes de o onDragEnd rodar, e ler pelo
  // closure devolveria o valor de antes.
  const listasRef = useRef(listas)
  const cartoesRef = useRef(cartoes)
  listasRef.current = listas
  cartoesRef.current = cartoes

  // Foto do estado tirada no início do arrasto — é para cá que a tela volta se
  // a gravação falhar.
  const snapshotRef = useRef<Estado | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const dados = await getQuadro(quadroId)
      if (!dados) { setNaoEncontrado(true); return }
      setQuadro(dados.quadro)
      setListas(dados.listas)
      setCartoes(dados.cartoes)
      setMsg(null)

      const ids = dados.cartoes.map(c => c.pedidoId).filter(Boolean) as string[]
      setNumerosPedido(await numerosDePedidos(ids))
    } catch (err) {
      setMsg(descreverFalhaKanban(err, 'carregar o quadro'))
    } finally {
      setCarregando(false)
    }
  }, [quadroId])

  useEffect(() => { carregar() }, [carregar])

  // Mouse por distância, touch por DELAY.
  //
  // No touch, ativar por distância seria o contrário do desejado: os primeiros
  // 8px de uma rolagem já virariam arrasto e a tela travaria. Com delay +
  // tolerância, deslizar o dedo rola normalmente (o movimento cancela o drag
  // antes dos 220ms) e segurar um instante é o gesto que pega o cartão — que é
  // como o operador espera que funcione no tablet.
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function restaurar(snap: Estado) {
    setListas(snap.listas)
    setCartoes(snap.cartoes)
  }

  /**
   * Grava o que já foi movido na tela. Se falhar, DESFAZ o movimento e diz que
   * não salvou — a tela nunca fica mostrando algo que o banco não tem.
   */
  async function gravar(acao: string, snap: Estado, fn: () => Promise<void>) {
    try {
      await fn()
      setMsg(null)
    } catch (err) {
      restaurar(snap)
      setMsg(descreverFalhaKanban(err, acao, true))
    }
  }

  function listaAlvoDe(over: { id: string | number; data: { current?: any } }): string | null {
    const tipo = over.data.current?.tipo
    if (tipo === 'lista') return String(over.id)
    if (tipo === 'cartao') return String(over.data.current?.listaId)
    return null
  }

  // ----- arrasto -----------------------------------------------------------

  function aoIniciarArrasto(e: DragStartEvent) {
    snapshotRef.current = { listas: listasRef.current, cartoes: cartoesRef.current }
    setAtivo({ id: String(e.active.id), tipo: e.active.data.current?.tipo })
  }

  /** Só move na tela. Nada vai ao banco aqui — isso é trabalho do onDragEnd. */
  function aoPassarPorCima(e: DragOverEvent) {
    const { active, over } = e
    if (!over || active.data.current?.tipo !== 'cartao') return

    const destinoId = listaAlvoDe(over)
    if (!destinoId) return
    const id = String(active.id)

    setCartoes(prev => {
      const atual = prev.find(c => c.id === id)
      if (!atual || atual.listaId === destinoId) return prev

      const destino = prev.filter(c => c.listaId === destinoId).sort(porPosicao)
      let indice = destino.length
      if (over.data.current?.tipo === 'cartao') {
        const i = destino.findIndex(c => c.id === String(over.id))
        if (i >= 0) {
          const meio = over.rect.top + over.rect.height / 2
          const topo = active.rect.current.translated?.top ?? 0
          indice = topo > meio ? i + 1 : i
        }
      }

      const pos = posicaoEntre(destino[indice - 1]?.posicao, destino[indice]?.posicao)
        ?? (destino.length + 1) * ESPACO_POSICAO
      return prev.map(c => (c.id === id ? { ...c, listaId: destinoId, posicao: pos } : c))
    })
  }

  function aoSoltar(e: DragEndEvent) {
    const { active, over } = e
    const snap = snapshotRef.current
    snapshotRef.current = null
    setAtivo(null)
    if (!snap) return

    // Soltou fora de qualquer alvo: desfaz o que o onDragOver já tinha mexido.
    if (!over) { restaurar(snap); return }

    if (active.data.current?.tipo === 'lista') finalizarLista(active, over, snap)
    else if (active.data.current?.tipo === 'cartao') finalizarCartao(active, over, snap)
  }

  function aoCancelar() {
    const snap = snapshotRef.current
    snapshotRef.current = null
    setAtivo(null)
    if (snap) restaurar(snap)
  }

  function finalizarLista(active: DragEndEvent['active'], over: NonNullable<DragEndEvent['over']>, snap: Estado) {
    const id = String(active.id)
    const alvo = listaAlvoDe(over)
    if (!alvo || alvo === id) return

    const ordenadas = [...listasRef.current].sort(porPosicao)
    const de = ordenadas.findIndex(l => l.id === id)
    const para = ordenadas.findIndex(l => l.id === alvo)
    if (de < 0 || para < 0 || de === para) return

    const nova = arrayMove(ordenadas, de, para)
    // Os vizinhos do novo índice ainda carregam as posições originais, e estão
    // em ordem crescente entre si — é exatamente o intervalo que queremos.
    const pos = posicaoEntre(nova[para - 1]?.posicao, nova[para + 1]?.posicao)

    if (pos === null) {
      const posicoes = posicoesRenormalizadas(nova.length)
      const mapa = new Map(nova.map((l, i) => [l.id, posicoes[i]]))
      setListas(prev => prev.map(l => ({ ...l, posicao: mapa.get(l.id) ?? l.posicao })))
      gravar('reordenar as listas', snap, () => renormalizarListas(nova.map(l => l.id)))
      return
    }

    setListas(prev => prev.map(l => (l.id === id ? { ...l, posicao: pos } : l)))
    gravar('mover a lista', snap, () => atualizarLista(id, { posicao: pos }))
  }

  function finalizarCartao(active: DragEndEvent['active'], over: NonNullable<DragEndEvent['over']>, snap: Estado) {
    const id = String(active.id)
    const destinoId = listaAlvoDe(over)
    if (!destinoId) { restaurar(snap); return }

    const origemId = snap.cartoes.find(c => c.id === id)?.listaId
    const mudouLista = origemId !== destinoId

    const destino = cartoesRef.current.filter(c => c.listaId === destinoId).sort(porPosicao)
    const de = destino.findIndex(c => c.id === id)
    if (de < 0) { restaurar(snap); return }

    let para = over.data.current?.tipo === 'cartao'
      ? destino.findIndex(c => c.id === String(over.id))
      : destino.length - 1
    if (para < 0) para = destino.length - 1

    const nova = arrayMove(destino, de, para)
    const idx = nova.findIndex(c => c.id === id)

    // Mesma lista e mesmo lugar de onde saiu: não há o que gravar.
    //
    // Ainda assim volta ao snapshot, em vez de só sair. O arrasto pode ter
    // passeado por outra lista e voltado, e nesse caminho o onDragOver deixou
    // uma `posicao` provisória no estado que nunca foi ao banco. Restaurar
    // garante o invariante do módulo: o que está na tela é o que está no banco.
    if (!mudouLista) {
      const idxOriginal = snap.cartoes
        .filter(c => c.listaId === origemId).sort(porPosicao)
        .findIndex(c => c.id === id)
      if (idx === idxOriginal) { restaurar(snap); return }
    }

    const pos = posicaoEntre(nova[idx - 1]?.posicao, nova[idx + 1]?.posicao)

    if (pos === null) {
      const posicoes = posicoesRenormalizadas(nova.length)
      const mapa = new Map(nova.map((c, i) => [c.id, posicoes[i]]))
      setCartoes(prev => prev.map(c =>
        mapa.has(c.id) ? { ...c, listaId: destinoId, posicao: mapa.get(c.id)! } : c))
      gravar('mover o cartão', snap, () => renormalizarCartoes(destinoId, nova.map(c => c.id)))
      return
    }

    setCartoes(prev => prev.map(c => (c.id === id ? { ...c, listaId: destinoId, posicao: pos } : c)))
    gravar('mover o cartão', snap, () => atualizarCartao(id, { listaId: destinoId, posicao: pos }))
  }

  // ----- listas ------------------------------------------------------------

  async function adicionarLista() {
    const titulo = tituloNovaLista.trim()
    if (!titulo) return
    const ultima = [...listas].sort(porPosicao).at(-1)
    setSalvando(true)
    try {
      const lista = await criarLista(quadroId, titulo, (ultima?.posicao ?? 0) + ESPACO_POSICAO)
      setListas(prev => [...prev, lista])
      setTituloNovaLista('')
      setCompondoLista(false)
      setMsg(null)
    } catch (err) {
      setMsg(descreverFalhaKanban(err, 'criar a lista'))
    } finally {
      setSalvando(false)
    }
  }

  function renomearLista(lista: Lista, titulo: string) {
    const snap = { listas, cartoes }
    setListas(prev => prev.map(l => (l.id === lista.id ? { ...l, titulo } : l)))
    gravar('renomear a lista', snap, () => atualizarLista(lista.id, { titulo }))
  }

  function mudarCorLista(lista: Lista, cor: CorLista) {
    const snap = { listas, cartoes }
    setListas(prev => prev.map(l => (l.id === lista.id ? { ...l, cor } : l)))
    gravar('mudar a cor da lista', snap, () => atualizarLista(lista.id, { cor }))
  }

  async function removerLista() {
    if (!confirmarLista) return
    const alvo = confirmarLista
    setSalvando(true)
    try {
      await excluirLista(alvo.id)
      setListas(prev => prev.filter(l => l.id !== alvo.id))
      setCartoes(prev => prev.filter(c => c.listaId !== alvo.id))
      setConfirmarLista(null)
      setMsg(null)
    } catch (err) {
      setMsg(descreverFalhaKanban(err, 'excluir a lista'))
    } finally {
      setSalvando(false)
    }
  }

  // ----- cartões -----------------------------------------------------------

  function abrirNovoCartao(listaId: string) {
    setCartaoEmFoco(null)
    setListaAlvo(listaId)
    setPainelAberto(true)
  }

  function abrirCartao(cartao: Cartao) {
    setCartaoEmFoco(cartao)
    setListaAlvo(cartao.listaId)
    setPainelAberto(true)
  }

  // Criar e editar esperam o banco antes de mexer na tela: o usuário está num
  // modal, parado — não há ganho em ser otimista, e assim o quadro nunca exibe
  // um cartão que o banco recusou.
  async function salvarCartao(dados: DadosPainel) {
    if (!dados.titulo.trim()) return
    setSalvando(true)
    try {
      if (cartaoEmFoco) {
        await atualizarCartao(cartaoEmFoco.id, dados)
        setCartoes(prev => prev.map(c => (c.id === cartaoEmFoco.id ? { ...c, ...dados } : c)))
      } else if (listaAlvo) {
        const ultimo = cartoesDaLista(cartoes, listaAlvo).at(-1)
        const novo = await criarCartao({
          listaId: listaAlvo,
          titulo: dados.titulo,
          descricao: dados.descricao,
          prazo: dados.prazo,
          perfisVisiveis: dados.perfisVisiveis,
          pedidoId: dados.pedidoId,
          posicao: (ultimo?.posicao ?? 0) + ESPACO_POSICAO,
        })
        setCartoes(prev => [...prev, novo])
      }
      // Vinculou a um pedido que o quadro ainda não conhecia: busca só o número
      // que falta e junta ao mapa, em vez de recarregar todos.
      if (dados.pedidoId && !numerosPedido.has(dados.pedidoId)) {
        const novo = await numerosDePedidos([dados.pedidoId])
        setNumerosPedido(prev => new Map([...Array.from(prev), ...Array.from(novo)]))
      }
      setPainelAberto(false)
      setMsg(null)
    } catch (err) {
      setMsg(descreverFalhaKanban(err, cartaoEmFoco ? 'salvar o cartão' : 'criar o cartão'))
    } finally {
      setSalvando(false)
    }
  }

  async function removerCartao() {
    if (!cartaoEmFoco) return
    const alvo = cartaoEmFoco
    setSalvando(true)
    try {
      await excluirCartao(alvo.id)
      setCartoes(prev => prev.filter(c => c.id !== alvo.id))
      setPainelAberto(false)
      setMsg(null)
    } catch (err) {
      setMsg(descreverFalhaKanban(err, 'excluir o cartão'))
    } finally {
      setSalvando(false)
    }
  }

  function alternarConcluido(cartao: Cartao) {
    const snap = { listas, cartoes }
    const concluido = !cartao.concluido
    setCartoes(prev => prev.map(c => (c.id === cartao.id ? { ...c, concluido } : c)))
    gravar('marcar o cartão', snap, () => atualizarCartao(cartao.id, { concluido }))
  }

  // ----- render ------------------------------------------------------------

  if (naoEncontrado) {
    return (
      <div className="card py-20 text-center text-fraco space-y-3">
        <p className="text-sm">Quadro não encontrado, ou seu perfil não tem acesso a ele.</p>
        <Link href="/quadros" className="btn-secondary mx-auto w-fit">
          <ArrowLeft className="w-4 h-4" /> Voltar aos quadros
        </Link>
      </div>
    )
  }

  const listasOrdenadas = [...listas].sort(porPosicao)

  const cartoesDe = (listaId: string) => cartoesDaLista(cartoes, listaId)

  const cartaoArrastado = ativo?.tipo === 'cartao'
    ? cartoes.find(c => c.id === ativo.id)
    : undefined
  const listaArrastada = ativo?.tipo === 'lista'
    ? listas.find(l => l.id === ativo.id)
    : undefined

  function colunaProps(lista: Lista) {
    return {
      lista,
      quantidade: cartoesDe(lista.id).length,
      podeEditar,
      onAdicionarCartao: podeEditar ? () => abrirNovoCartao(lista.id) : undefined,
      onRenomear: podeEditar ? (t: string) => renomearLista(lista, t) : undefined,
      onMudarCor: podeEditar ? (c: CorLista) => mudarCorLista(lista, c) : undefined,
      onExcluir: podeEditar ? () => setConfirmarLista(lista) : undefined,
    }
  }

  function cartaoProps(cartao: Cartao) {
    return {
      cartao,
      numeroPedido: cartao.pedidoId ? numerosPedido.get(cartao.pedidoId) : undefined,
      podeEditar,
      onAbrir: () => abrirCartao(cartao),
      onAlternarConcluido: podeEditar ? () => alternarConcluido(cartao) : undefined,
    }
  }

  const colunas = listasOrdenadas.map(lista => (
    podeEditar ? (
      <ColunaSortable key={lista.id} {...colunaProps(lista)}>
        <SortableContext
          items={cartoesDe(lista.id).map(c => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cartoesDe(lista.id).map(c => <CartaoSortable key={c.id} {...cartaoProps(c)} />)}
        </SortableContext>
      </ColunaSortable>
    ) : (
      <ColunaVisual key={lista.id} {...colunaProps(lista)}>
        {cartoesDe(lista.id).map(c => <CartaoVisual key={c.id} {...cartaoProps(c)} />)}
      </ColunaVisual>
    )
  ))

  const composerLista = podeEditar && (
    <div className="snap-start shrink-0 w-[80vw] max-w-[19rem] sm:w-72">
      {compondoLista ? (
        <div className="bg-superficie-2 rounded-2xl border border-borda p-3 space-y-2">
          <input className="input" autoFocus placeholder="Nome da lista" value={tituloNovaLista}
            onChange={e => setTituloNovaLista(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') adicionarLista()
              if (e.key === 'Escape') { setCompondoLista(false); setTituloNovaLista('') }
            }} />
          <div className="flex gap-2">
            <button onClick={adicionarLista} disabled={salvando || !tituloNovaLista.trim()}
              className="btn-primary text-sm flex-1 justify-center disabled:opacity-50">
              Adicionar
            </button>
            <button onClick={() => { setCompondoLista(false); setTituloNovaLista('') }}
              aria-label="Cancelar" className="btn-secondary px-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCompondoLista(true)}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-borda text-sm font-medium text-fraco hover:border-nice-300 hover:text-marca-texto transition-colors">
          <Plus className="w-4 h-4" /> Nova lista
        </button>
      )}
    </div>
  )

  // Trilho: rola na horizontal e "assenta" numa coluna por vez. O -mx-8 px-8
  // fura o padding do AppShell para o quadro rolar de borda a borda.
  const trilho = (
    <div className="flex-1 min-h-0 -mx-8 px-8 overflow-x-auto overflow-y-hidden snap-x snap-mandatory">
      <div className="flex gap-4 items-start h-full pb-2">
        {colunas}
        {composerLista}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] md:h-[calc(100vh-4rem)]">
      <div className="flex items-start justify-between gap-3 pb-4 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/quadros" className="btn-ghost px-2 shrink-0" aria-label="Voltar aos quadros">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-titulo truncate">
              {quadro?.titulo ?? (carregando ? 'Carregando...' : 'Quadro')}
            </h1>
            {quadro?.descricao && (
              <p className="text-sm text-suave mt-0.5 line-clamp-1">{quadro.descricao}</p>
            )}
          </div>
        </div>
        {!podeEditar && (
          <span className="badge bg-superficie-3 text-suave gap-1 shrink-0">
            <Eye className="w-3 h-3" /> somente leitura
          </span>
        )}
      </div>

      {carregando ? (
        <div className="text-fraco text-sm">Carregando...</div>
      ) : listasOrdenadas.length === 0 && !podeEditar ? (
        <div className="card py-20 text-center text-fraco">
          <p className="text-sm">Este quadro ainda não tem listas.</p>
        </div>
      ) : podeEditar ? (
        <DndContext
          sensors={sensores}
          collisionDetection={closestCorners}
          onDragStart={aoIniciarArrasto}
          onDragOver={aoPassarPorCima}
          onDragEnd={aoSoltar}
          onDragCancel={aoCancelar}
        >
          <SortableContext
            items={listasOrdenadas.map(l => l.id)}
            strategy={horizontalListSortingStrategy}
          >
            {trilho}
          </SortableContext>

          <DragOverlay>
            {cartaoArrastado && (
              <CartaoVisual cartao={cartaoArrastado} podeEditar={false} sombra
                numeroPedido={cartaoArrastado.pedidoId ? numerosPedido.get(cartaoArrastado.pedidoId) : undefined} />
            )}
            {listaArrastada && (
              <ColunaVisual
                lista={listaArrastada}
                quantidade={cartoesDe(listaArrastada.id).length}
                podeEditar={false}
              >
                {cartoesDe(listaArrastada.id).map(c => (
                  <CartaoVisual key={c.id} cartao={c} podeEditar={false}
                    numeroPedido={c.pedidoId ? numerosPedido.get(c.pedidoId) : undefined} />
                ))}
              </ColunaVisual>
            )}
          </DragOverlay>
        </DndContext>
      ) : trilho}

      <PainelCartao
        aberto={painelAberto}
        cartao={cartaoEmFoco}
        numeroPedido={cartaoEmFoco?.pedidoId ? numerosPedido.get(cartaoEmFoco.pedidoId) : undefined}
        podeEditar={podeEditar}
        salvando={salvando}
        onSalvar={salvarCartao}
        onExcluir={cartaoEmFoco ? removerCartao : undefined}
        onFechar={() => setPainelAberto(false)}
      />

      <Modal
        aberto={confirmarLista !== null}
        titulo="Excluir lista"
        onFechar={() => setConfirmarLista(null)}
        rodape={
          <>
            <button onClick={() => setConfirmarLista(null)} className="btn-secondary flex-1 justify-center">
              Cancelar
            </button>
            <button onClick={removerLista} disabled={salvando}
              className="btn-perigo flex-1 justify-center disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {salvando ? 'Excluindo...' : 'Excluir'}
            </button>
          </>
        }
      >
        <p className="text-sm text-suave">
          Excluir <strong className="text-titulo">{confirmarLista?.titulo}</strong> apaga
          junto os {confirmarLista ? cartoesDe(confirmarLista.id).length : 0} cartão(ões) dela.
          Não dá para desfazer.
        </p>
      </Modal>

      <BannerErro msg={msg} onFechar={() => setMsg(null)} onRecarregar={carregar} />
    </div>
  )
}
