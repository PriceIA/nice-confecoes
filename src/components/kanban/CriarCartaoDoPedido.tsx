'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, KanbanSquare } from 'lucide-react'
import Modal from '@/components/kanban/Modal'
import BannerErro from '@/components/kanban/BannerErro'
import { useMembro } from '@/components/AuthProvider'
import {
  ESPACO_POSICAO, criarCartao, getListas, getQuadros, ultimaPosicaoDaLista,
} from '@/lib/kanban'
import {
  descreverFalhaKanban, descricaoSugerida, tituloSugerido, type MsgKanban,
} from '@/lib/kanban-ui'
import type { Lista, Pedido, Quadro } from '@/types'

// Ação sugerida em /pedidos/[id] quando os 8 setores estão concluídos.
//
// É SUGESTÃO, nunca automática: nada é criado sem alguém abrir o modal, escolher
// o destino e confirmar. O título e a descrição vêm prontos só para poupar
// digitação — quem cria pode reescrever tudo antes de salvar.

export default function CriarCartaoDoPedido({ pedido }: { pedido: Pedido }) {
  const { membro } = useMembro()
  const [aberto, setAberto] = useState(false)
  const [quadros, setQuadros] = useState<Quadro[]>([])
  const [listas, setListas] = useState<Lista[]>([])
  const [quadroId, setQuadroId] = useState('')
  const [listaId, setListaId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<MsgKanban | null>(null)
  const [criado, setCriado] = useState<{ quadroId: string } | null>(null)

  function abrir() {
    setTitulo(tituloSugerido(pedido))
    setDescricao(descricaoSugerida(pedido))
    setPrazo(pedido.dataEntrega ? pedido.dataEntrega.slice(0, 10) : '')
    setCriado(null)
    setAberto(true)
  }

  useEffect(() => {
    if (!aberto || quadros.length > 0) return
    getQuadros()
      .then(qs => {
        setQuadros(qs)
        if (qs.length > 0) setQuadroId(qs[0].id)
      })
      .catch(err => setMsg(descreverFalhaKanban(err, 'carregar os quadros')))
  }, [aberto, quadros.length])

  useEffect(() => {
    if (!quadroId) { setListas([]); setListaId(''); return }
    getListas(quadroId)
      .then(ls => {
        setListas(ls)
        setListaId(ls[0]?.id ?? '')
      })
      .catch(err => setMsg(descreverFalhaKanban(err, 'carregar as listas')))
  }, [quadroId])

  async function salvar() {
    if (!listaId || !titulo.trim() || !membro) return
    setSalvando(true)
    try {
      // Posição no fim da lista escolhida. Uma leitura a mais, mas evita entrar
      // na frente de cartões que já estavam lá.
      const ultima = await ultimaPosicaoDaLista(listaId)
      await criarCartao({
        listaId,
        titulo: titulo.trim(),
        descricao,
        prazo: prazo || null,
        // Cartão nascido daqui é sempre público (sem seletor de visibilidade
        // nesta ação) — mas `criado_por` precisa ser gravado do mesmo jeito,
        // pela mesma regra da Fase D2.2 (ver QuadroBoard.tsx).
        criadoPor: membro.id,
        pedidoId: pedido.id,
        posicao: ultima + ESPACO_POSICAO,
      })
      setCriado({ quadroId })
      setMsg(null)
    } catch (err) {
      setMsg(descreverFalhaKanban(err, 'criar o cartão'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <div className="card space-y-3">
        <h2 className="font-semibold text-titulo text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-nice-500" /> Pedido concluído
        </h2>
        <p className="text-xs text-suave">
          Todos os 8 setores estão concluídos. Se quiser acompanhar o que ainda
          falta (entrega, cobrança, pós-venda), dá para abrir um cartão no Kanban.
        </p>
        <button onClick={abrir} className="btn-secondary w-full justify-center">
          <KanbanSquare className="w-4 h-4" /> Criar cartão no Kanban
        </button>
      </div>

      <Modal
        aberto={aberto}
        titulo="Criar cartão no Kanban"
        onFechar={() => setAberto(false)}
        largura="lg"
        rodape={criado ? (
          <>
            <button onClick={() => setAberto(false)} className="btn-secondary flex-1 justify-center">
              Fechar
            </button>
            <Link href={`/quadros/${criado.quadroId}`} className="btn-primary flex-1 justify-center">
              Abrir o quadro
            </Link>
          </>
        ) : (
          <>
            <button onClick={() => setAberto(false)} className="btn-secondary flex-1 justify-center">
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando || !listaId || !titulo.trim() || !membro}
              className="btn-primary flex-1 justify-center disabled:opacity-50">
              {salvando ? 'Criando...' : 'Criar cartão'}
            </button>
          </>
        )}
      >
        {criado ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-nice-500 mx-auto" />
            <p className="text-sm font-medium text-titulo">Cartão criado.</p>
            <p className="text-xs text-suave">
              Ele já aparece na lista escolhida, com link de volta para este pedido.
            </p>
          </div>
        ) : quadros.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-suave">Nenhum quadro disponível ainda.</p>
            <Link href="/quadros" className="btn-secondary mx-auto w-fit">
              <KanbanSquare className="w-4 h-4" /> Criar um quadro
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Quadro *</label>
                <select className="input" value={quadroId} onChange={e => setQuadroId(e.target.value)}>
                  {quadros.map(q => <option key={q.id} value={q.id}>{q.titulo}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Lista *</label>
                <select className="input" value={listaId} onChange={e => setListaId(e.target.value)}
                  disabled={listas.length === 0}>
                  {listas.length === 0
                    ? <option value="">Este quadro não tem listas</option>
                    : listas.map(l => <option key={l.id} value={l.id}>{l.titulo}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Título *</label>
              <input className="input" value={titulo} onChange={e => setTitulo(e.target.value)} />
            </div>

            <div>
              <label className="label">Descrição</label>
              <textarea className="input min-h-[140px] resize-y" value={descricao}
                onChange={e => setDescricao(e.target.value)} />
              <p className="text-xs text-fraco mt-1.5">
                Texto sugerido a partir do pedido. Pode reescrever à vontade.
              </p>
            </div>

            <div>
              <label className="label">Prazo</label>
              <input type="date" className="input" value={prazo} onChange={e => setPrazo(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>

      <BannerErro msg={msg} onFechar={() => setMsg(null)} />
    </>
  )
}
