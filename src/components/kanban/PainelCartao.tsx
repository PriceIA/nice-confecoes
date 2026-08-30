'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, Link2, Lock, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/kanban/Modal'
import { PERFIL_LABEL, PERFIL_LABEL_CURTO, PERFIS, type Perfil } from '@/lib/permissoes'
import { badgePrazo, modoVisibilidadeDe, OPCOES_VISIBILIDADE, PERFIS_GESTAO, type ModoVisibilidade } from '@/lib/kanban-ui'
import { getPedidos } from '@/lib/store'
import { getEquipe } from '@/lib/kanban'
import type { Cartao, MembroEquipe, Pedido } from '@/types'

export type DadosPainel = {
  titulo: string
  descricao: string
  prazo: string | null
  perfisVisiveis: Perfil[] | null
  membrosVisiveis: string[] | null
  privado: boolean
  pedidoId: string | null
  concluido: boolean
}

type Props = {
  aberto: boolean
  /** null = criando um cartão novo. */
  cartao: Cartao | null
  numeroPedido?: string
  podeEditar: boolean
  salvando: boolean
  onSalvar: (dados: DadosPainel) => void
  onExcluir?: () => void
  onFechar: () => void
}

const VAZIO: DadosPainel = {
  titulo: '', descricao: '', prazo: null,
  perfisVisiveis: null, membrosVisiveis: null, privado: false,
  pedidoId: null, concluido: false,
}

export default function PainelCartao({
  aberto, cartao, numeroPedido, podeEditar, salvando, onSalvar, onExcluir, onFechar,
}: Props) {
  const [dados, setDados] = useState<DadosPainel>(VAZIO)
  const [modo, setModo] = useState<ModoVisibilidade>('todos')
  const [buscandoPedido, setBuscandoPedido] = useState(false)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [buscaPedido, setBuscaPedido] = useState('')
  const [equipe, setEquipe] = useState<MembroEquipe[]>([])
  const [equipeErro, setEquipeErro] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const iniciais = cartao ? {
      titulo: cartao.titulo,
      descricao: cartao.descricao,
      prazo: cartao.prazo,
      perfisVisiveis: cartao.perfisVisiveis,
      membrosVisiveis: cartao.membrosVisiveis,
      privado: cartao.privado,
      pedidoId: cartao.pedidoId,
      concluido: cartao.concluido,
    } : VAZIO
    setDados(iniciais)
    // O seletor precisa nascer na opção certa, lendo o estado atual do
    // cartão — boa parte dos cartões já existentes tem `perfisVisiveis`
    // restrito, e "Todos" errado por padrão seria pior que não ter seletor.
    setModo(modoVisibilidadeDe(iniciais))
    setBuscandoPedido(false)
    setBuscaPedido('')
  }, [aberto, cartao])

  // Só busca a equipe quando "Pessoas específicas" é escolhido — não faz
  // sentido carregar a lista toda vez que alguém abre qualquer cartão.
  useEffect(() => {
    if (modo !== 'pessoas' || equipe.length > 0) return
    getEquipe()
      .then(setEquipe)
      .catch(() => setEquipeErro(true))
  }, [modo, equipe.length])

  // Os pedidos só são buscados quando o usuário pede para vincular — não faz
  // sentido carregar a base inteira toda vez que alguém abre um cartão.
  useEffect(() => {
    if (!buscandoPedido || pedidos.length > 0) return
    getPedidos().then(setPedidos).catch(() => setPedidos([]))
  }, [buscandoPedido, pedidos.length])

  const resultados = useMemo(() => {
    const t = buscaPedido.trim().toLowerCase()
    const base = t
      ? pedidos.filter(p =>
          p.numero.toLowerCase().includes(t) ||
          p.cliente.nome.toLowerCase().includes(t) ||
          p.cliente.empresa.toLowerCase().includes(t))
      : pedidos
    return base.slice(0, 8)
  }, [pedidos, buscaPedido])

  const pedidoVinculado = dados.pedidoId
    ? pedidos.find(p => p.id === dados.pedidoId)
    : undefined
  const rotuloPedido = pedidoVinculado?.numero ?? numeroPedido

  const prazo = badgePrazo(dados.prazo, dados.concluido)

  /**
   * Troca de opção: grava os 3 campos JUNTOS, exatamente como a tabela da
   * Fase D2.2 manda — nunca só um deles. Trocar de "Grupo" para "Todos", por
   * exemplo, precisa limpar `perfisVisiveis` pra `null` no mesmo instante em
   * que zera `privado`; deixar um campo do modo anterior sobrando é como o
   * cartão nasceria com uma visibilidade que a tela não mostra mais.
   */
  function escolherModo(m: ModoVisibilidade) {
    setModo(m)
    setDados(d => {
      switch (m) {
        case 'todos':   return { ...d, perfisVisiveis: null, membrosVisiveis: null, privado: false }
        case 'gestao':  return { ...d, perfisVisiveis: [...PERFIS_GESTAO], membrosVisiveis: null, privado: false }
        case 'grupo':   return { ...d, perfisVisiveis: [], membrosVisiveis: null, privado: false }
        case 'pessoas': return { ...d, perfisVisiveis: null, membrosVisiveis: [], privado: false }
        case 'privado': return { ...d, perfisVisiveis: null, membrosVisiveis: null, privado: true }
      }
    })
  }

  function alternarPerfilGrupo(p: Perfil) {
    setDados(d => {
      const atual = d.perfisVisiveis ?? []
      const proximo = atual.includes(p) ? atual.filter(x => x !== p) : [...atual, p]
      return { ...d, perfisVisiveis: proximo }
    })
  }

  function alternarMembro(id: string) {
    setDados(d => {
      const atual = d.membrosVisiveis ?? []
      const proximo = atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id]
      return { ...d, membrosVisiveis: proximo }
    })
  }

  // "Grupo" sem nenhum perfil marcado, ou "Pessoas específicas" sem ninguém
  // marcado, seria um cartão que ninguém vê — sempre engano (mesma regra que
  // já valia pro seletor de perfis antigo). Bloqueia salvar em vez de virar
  // "Todos" sozinho, porque isso esconderia o engano em vez de evitá-lo.
  const grupoVazio = modo === 'grupo' && (dados.perfisVisiveis?.length ?? 0) === 0
  const pessoasVazio = modo === 'pessoas' && (dados.membrosVisiveis?.length ?? 0) === 0
  const visibilidadeInvalida = grupoVazio || pessoasVazio

  function resumoVisibilidadeLeitura(): string {
    switch (modoVisibilidadeDe(dados)) {
      case 'privado': return 'Privado — só quem criou vê'
      case 'pessoas': return 'Pessoas específicas'
      case 'gestao':  return 'Só a gestão'
      case 'grupo':   return dados.perfisVisiveis!.map(p => PERFIL_LABEL[p]).join(', ')
      default:        return 'Todos os perfis'
    }
  }

  const titulo = cartao ? (podeEditar ? 'Editar cartão' : 'Cartão') : 'Novo cartão'

  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      onFechar={onFechar}
      largura="lg"
      rodape={podeEditar ? (
        <>
          {cartao && onExcluir && (
            <button onClick={onExcluir} disabled={salvando}
              className="btn-secondary text-red-600 hover:bg-red-50 hover:border-red-200">
              <Trash2 className="w-4 h-4" /> Excluir
            </button>
          )}
          <button onClick={onFechar} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={() => onSalvar(dados)} disabled={salvando || !dados.titulo.trim() || visibilidadeInvalida}
            className="btn-primary flex-1 justify-center disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      ) : (
        <button onClick={onFechar} className="btn-secondary flex-1 justify-center">Fechar</button>
      )}
    >
      <div className="space-y-5">
        <div>
          <label className="label">Título *</label>
          {podeEditar ? (
            <input className="input" autoFocus value={dados.titulo}
              onChange={e => setDados(d => ({ ...d, titulo: e.target.value }))}
              placeholder="O que precisa ser feito" />
          ) : (
            <p className="text-sm font-medium text-conteudo">{dados.titulo}</p>
          )}
        </div>

        <div>
          <label className="label">Descrição</label>
          {podeEditar ? (
            <textarea className="input min-h-[110px] resize-y" value={dados.descricao}
              onChange={e => setDados(d => ({ ...d, descricao: e.target.value }))} />
          ) : (
            <p className="text-sm text-suave whitespace-pre-line">{dados.descricao || '—'}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Prazo</label>
            {podeEditar ? (
              <div className="flex items-center gap-2">
                <input type="date" className="input" value={dados.prazo ?? ''}
                  onChange={e => setDados(d => ({ ...d, prazo: e.target.value || null }))} />
                {dados.prazo && (
                  <button onClick={() => setDados(d => ({ ...d, prazo: null }))}
                    aria-label="Limpar prazo" className="text-fraco hover:text-suave p-1">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-suave">{dados.prazo ?? '—'}</p>
            )}
            {prazo && <span className={clsx('badge mt-2', prazo.classes)}>{prazo.texto}</span>}
          </div>

          <div>
            <label className="label">Situação</label>
            <button
              onClick={() => podeEditar && setDados(d => ({ ...d, concluido: !d.concluido }))}
              disabled={!podeEditar}
              className={clsx('badge disabled:cursor-default',
                dados.concluido ? 'bg-marca-suave text-marca-texto' : 'bg-superficie-3 text-suave')}>
              {dados.concluido ? 'Concluído' : 'Em aberto'}
            </button>
          </div>
        </div>

        {/* Visibilidade */}
        <div>
          <label className="label flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Quem vê este cartão
          </label>
          {podeEditar ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                {OPCOES_VISIBILIDADE.map(o => (
                  <label key={o.value}
                    className="flex items-center gap-2 text-sm text-conteudo cursor-pointer">
                    <input type="radio" name="modo-visibilidade" className="accent-nice-500"
                      checked={modo === o.value} onChange={() => escolherModo(o.value)} />
                    {o.label}
                  </label>
                ))}
              </div>

              {modo === 'grupo' && (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {PERFIS.map(p => {
                      const marcado = dados.perfisVisiveis?.includes(p) ?? false
                      return (
                        <button key={p} type="button" onClick={() => alternarPerfilGrupo(p)}
                          className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                            marcado
                              ? 'bg-nice-500 text-white border-nice-500'
                              : 'bg-superficie border-borda text-suave hover:border-nice-300')}>
                          {PERFIL_LABEL[p]}
                        </button>
                      )
                    })}
                  </div>
                  {grupoVazio && (
                    <p className="text-xs text-red-600 mt-1.5">Marque ao menos um perfil.</p>
                  )}
                </div>
              )}

              {modo === 'pessoas' && (
                <div>
                  {equipeErro ? (
                    <p className="text-xs text-red-600 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Não deu para carregar a lista de
                      pessoas. Confirme com o Pedro se isso persistir.
                    </p>
                  ) : equipe.length === 0 ? (
                    <p className="text-xs text-fraco">Carregando pessoas...</p>
                  ) : (
                    <div className="border border-borda rounded-xl divide-y divide-borda max-h-48 overflow-y-auto">
                      {equipe.map(m => {
                        const marcado = dados.membrosVisiveis?.includes(m.id) ?? false
                        return (
                          <label key={m.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-superficie-2">
                            <input type="checkbox" className="accent-nice-500" checked={marcado}
                              onChange={() => alternarMembro(m.id)} />
                            <span className="text-conteudo">{m.nome}</span>
                            <span className="text-xs text-fraco">{PERFIL_LABEL_CURTO[m.perfil]}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {pessoasVazio && (
                    <p className="text-xs text-red-600 mt-1.5">Marque ao menos uma pessoa.</p>
                  )}
                </div>
              )}

              {modo === 'privado' && (
                <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  Só você verá este cartão. Nem o Pedro nem a Kalomira.
                </p>
              )}

              {(modo === 'todos' || modo === 'gestao') && (
                <p className="text-xs text-fraco">
                  {modo === 'todos'
                    ? 'Todos os perfis veem este cartão.'
                    : 'Só gestor e recepcionista veem este cartão.'}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-suave">{resumoVisibilidadeLeitura()}</p>
          )}
        </div>

        {/* Pedido vinculado */}
        <div>
          <label className="label">Pedido vinculado</label>

          {dados.pedidoId ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/pedidos/${dados.pedidoId}`}
                className="badge bg-marca-suave text-marca-texto gap-1 hover:bg-marca-borda">
                <ExternalLink className="w-3 h-3" /> {rotuloPedido ? `#${rotuloPedido}` : 'Abrir pedido'}
              </Link>
              {podeEditar && (
                <button onClick={() => setDados(d => ({ ...d, pedidoId: null }))}
                  className="text-xs text-fraco hover:text-red-600 font-medium">
                  remover vínculo
                </button>
              )}
            </div>
          ) : !podeEditar ? (
            <p className="text-sm text-suave">—</p>
          ) : !buscandoPedido ? (
            <button onClick={() => setBuscandoPedido(true)} className="btn-secondary text-sm">
              <Link2 className="w-4 h-4" /> Vincular a um pedido
            </button>
          ) : (
            <div className="space-y-2">
              <input className="input" autoFocus placeholder="Número, cliente ou empresa..."
                value={buscaPedido} onChange={e => setBuscaPedido(e.target.value)} />
              <div className="border border-borda rounded-xl divide-y divide-borda max-h-52 overflow-y-auto">
                {resultados.length === 0 ? (
                  <p className="text-xs text-fraco px-3 py-4 text-center">
                    {pedidos.length === 0 ? 'Carregando pedidos...' : 'Nenhum pedido encontrado.'}
                  </p>
                ) : resultados.map(p => (
                  <button key={p.id}
                    onClick={() => { setDados(d => ({ ...d, pedidoId: p.id })); setBuscandoPedido(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-marca-suave transition-colors">
                    <span className="text-sm font-semibold text-marca-texto">#{p.numero}</span>
                    <span className="text-sm text-suave ml-2">{p.cliente.nome}</span>
                    {p.cliente.empresa && (
                      <span className="text-xs text-fraco ml-1">— {p.cliente.empresa}</span>
                    )}
                  </button>
                ))}
              </div>
              <button onClick={() => setBuscandoPedido(false)}
                className="text-xs text-fraco hover:text-suave font-medium">
                cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
