'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { differenceInCalendarDays } from 'date-fns'
import { AlertTriangle, PackageCheck, Hourglass, ArrowRight } from 'lucide-react'
import { getPedidosLista, atualizarPedido } from '@/lib/store'
import { badgePrazo } from '@/lib/kanban-ui'
import { totalPecas, ordenarPedidos, moeda, prazoTexto, formatarData } from '@/lib/helpers'
import {
  MOTIVO_LABEL,
  confirmar as confirmarAguardando,
  diasAguardando, estaAguardando, lembreteDevido, perguntarEntrega,
  prontoParaRetirada, saldoEmAberto,
} from '@/lib/aguardandoCliente'
import { MotivoAguardando, PedidoLista } from '@/types'
import { useMembro } from '@/components/AuthProvider'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import { useSkeletonDelay } from '@/lib/hooks'
import EsqueletoBarra from '@/components/EsqueletoBarra'
import ModalNaoRetirou from '@/components/entrega/ModalNaoRetirou'
import clsx from 'clsx'

/** Mesmo padrão de /pedidos e /dashboard. */
function descreverFalhaCarregar(err: unknown): string {
  const f = classificarErro(err)
  const motivo =
    f.tipo === 'offline' ? 'Sem conexão com a internet' :
    f.tipo === 'rede' ? 'Servidor inacessível' :
    f.tipo === 'permissao' ? 'Seu perfil não tem permissão para ver os pedidos' :
    `Falha${sufixoCodigo(f)}: ${f.message || 'erro desconhecido'}`
  return `${motivo}, não deu para carregar as entregas.`
}

const MOTIVO_BADGE: Record<MotivoAguardando, string> = {
  pagamento: 'bg-amber-100 text-amber-700',
  sem_tempo: 'bg-blue-100 text-blue-700',
  outro: 'bg-superficie-3 text-suave',
}

/**
 * Fila de pedidos prontos pra entrega (Fase I3: `prontoParaRetirada`, status
 * `finalizado` OU `pedidoConcluido` — não mais só o segundo) e status ainda
 * não 'entregue' nem 'cancelado', e o grupo "Aguardando o cliente" — pedido
 * pronto e vencido que já tem motivo registrado (não conta como atraso da
 * Nice, ver CLAUDE.md/docs/fase-i.md).
 *
 * Regra 8 do CLAUDE.md: /producao continua sendo a fonte da verdade do
 * progresso; esta tela só lê esse progresso (e `aguardandoCliente`) pra
 * decidir quem aparece, nunca os altera por fora de `@/lib/aguardandoCliente`.
 */
export default function EntregasPage() {
  const { membro, permissoes } = useMembro()
  const [pedidos, setPedidos] = useState<PedidoLista[]>([])
  const [loading, setLoading] = useState(true)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [modalPedido, setModalPedido] = useState<PedidoLista | null>(null)
  const mostrarSkeleton = useSkeletonDelay(loading)

  const carregar = async () => {
    setErro(null)
    try {
      // Fase G4, item 2: pedidos entregue/cancelado nunca aparecem aqui —
      // excluí-los na própria query corta o payload antes de baixar; o
      // critério real (prontoParaRetirada/estaAguardando) continua no
      // cliente, porque depende do JSONB de progresso e de aguardandoCliente.
      setPedidos(await getPedidosLista({ statusExcluir: ['entregue', 'cancelado'] }))
    } catch (err) {
      setErro(descreverFalhaCarregar(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const prontos = ordenarPedidos(
    pedidos.filter(p => prontoParaRetirada(p) && !estaAguardando(p)),
    'entrega_asc',
  )
  const aguardando = [...pedidos.filter(estaAguardando)]
    .sort((a, b) => diasAguardando(b) - diasAguardando(a))

  const pecasParadas = aguardando.reduce((a, p) => a + totalPecas(p), 0)
  const saldoParado = aguardando.reduce((a, p) => a + saldoEmAberto(p), 0)

  async function marcarEntregue(pedido: PedidoLista) {
    if (!confirm(`Marcar o pedido #${pedido.numero} (${pedido.cliente.nome}) como entregue?`)) return
    setErro(null)
    setMarcando(pedido.id)
    try {
      await atualizarPedido(pedido.id, { status: 'entregue' })
      await carregar()
    } catch {
      setErro(`Não foi possível marcar o pedido #${pedido.numero} como entregue. Tente de novo.`)
    } finally {
      setMarcando(null)
    }
  }

  async function confirmarAindaAguardando(pedido: PedidoLista) {
    setErro(null)
    setMarcando(pedido.id)
    try {
      await atualizarPedido(pedido.id, {
        aguardandoCliente: confirmarAguardando(pedido.aguardandoCliente!, membro?.nome ?? 'desconhecido'),
      })
      await carregar()
    } catch {
      setErro(`Não foi possível gravar a confirmação do pedido #${pedido.numero}. Tente de novo.`)
    } finally {
      setMarcando(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Entregas</h1>
        <p className="text-sm text-suave mt-0.5">
          {loading ? 'Carregando...' : `${prontos.length} prontos pra entrega · ${aguardando.length} aguardando o cliente`}
        </p>
      </div>

      {erro && (
        <div className="flex items-center gap-2 rounded-xl bg-red-100 text-red-700 px-4 py-3 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold text-titulo">Prontos pra entrega</h2>
        <div className="card p-0 overflow-hidden" aria-busy={loading}>
          {mostrarSkeleton && <span role="status" className="sr-only">Carregando entregas</span>}
          {mostrarSkeleton ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                    <th className="text-left px-6 py-3 font-semibold">Nº</th>
                    <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                    <th className="text-left px-6 py-3 font-semibold">Peças</th>
                    <th className="text-left px-6 py-3 font-semibold">Prazo de entrega</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-14" /></td>
                      <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-32" /></td>
                      <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-10" /></td>
                      <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-20" /></td>
                      <td className="px-6 py-4" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : loading ? null : prontos.length === 0 ? (
            <div className="py-20 text-center text-fraco">
              <PackageCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum pedido pronto pra entrega no momento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                    <th className="text-left px-6 py-3 font-semibold">Nº</th>
                    <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                    <th className="text-left px-6 py-3 font-semibold">Peças</th>
                    <th className="text-left px-6 py-3 font-semibold">Prazo de entrega</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {prontos.map(p => {
                    const prazo = badgePrazo(p.dataEntrega)
                    const saldo = saldoEmAberto(p)
                    const venceu = perguntarEntrega(p)
                    return (
                      <tr key={p.id} className="hover:bg-superficie-2 transition-colors">
                        <td className="px-6 py-4 font-semibold text-marca-texto num">#{p.numero}</td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-conteudo">{p.cliente.nome}</div>
                          {p.cliente.empresa && <div className="text-xs text-fraco">{p.cliente.empresa}</div>}
                          {permissoes.verFinanceiro && saldo > 0 && (
                            <div className="text-xs text-fraco">falta {moeda(saldo)}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-suave num">{totalPecas(p)} un.</td>
                        <td className="px-6 py-4">
                          {venceu ? (
                            <span className="badge bg-red-100 text-red-700">
                              Venceu há {Math.abs(prazoTexto(p.dataEntrega).dias ?? 0)}d
                            </span>
                          ) : prazo && (
                            <span className={clsx('badge', prazo.classes)} title={prazo.titulo}>{prazo.texto}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-3">
                            <Link href={`/pedidos/${p.id}`} className="text-marca-texto hover:text-marca-texto font-medium text-xs flex items-center gap-1 whitespace-nowrap">
                              Ver <ArrowRight className="w-3 h-3" />
                            </Link>
                            {venceu && permissoes.responderEntrega && (
                              <button
                                onClick={() => setModalPedido(p)}
                                disabled={marcando === p.id}
                                className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap"
                              >
                                Não retirou…
                              </button>
                            )}
                            {permissoes.editarPedido && (
                              <button
                                onClick={() => marcarEntregue(p)}
                                disabled={marcando === p.id}
                                className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap"
                              >
                                {marcando === p.id ? 'Marcando...' : 'Marcar como entregue'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {!loading && aguardando.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-titulo flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Hourglass className="w-4 h-4" />
              </span>
              Aguardando o cliente
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-superficie border border-borda rounded-full px-3 py-1 text-xs text-suave">
                {aguardando.length} {aguardando.length === 1 ? 'pedido' : 'pedidos'}
              </span>
              <span className="bg-superficie border border-borda rounded-full px-3 py-1 text-xs text-suave">
                {pecasParadas} peças paradas
              </span>
              {permissoes.verFinanceiro && (
                <span className="bg-superficie border border-borda rounded-full px-3 py-1 text-xs text-suave">
                  {moeda(saldoParado)} a receber
                </span>
              )}
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                    <th className="text-left px-6 py-3 font-semibold">Nº</th>
                    <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                    <th className="text-left px-6 py-3 font-semibold">Motivo</th>
                    <th className="text-left px-6 py-3 font-semibold">Parado há</th>
                    {permissoes.verFinanceiro && (
                      <th className="text-left px-6 py-3 font-semibold">Falta receber</th>
                    )}
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {aguardando.map(p => {
                    const a = p.aguardandoCliente!
                    const dias = diasAguardando(p)
                    const saldo = saldoEmAberto(p)
                    const lembrete = lembreteDevido(p)
                    const quemTexto = a.confirmadoEm
                      ? `confirmado por ${a.confirmadoPor} há ${Math.max(0, differenceInCalendarDays(new Date(), new Date(a.confirmadoEm)))} dias`
                      : `registrado por ${a.registradoPor}`
                    return (
                      <tr key={p.id} className="hover:bg-superficie-2 transition-colors align-top">
                        <td className="px-6 py-4 font-semibold text-marca-texto num">#{p.numero}</td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-conteudo">{p.cliente.nome}</div>
                          <div className="text-xs text-fraco">{quemTexto}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={clsx('badge', MOTIVO_BADGE[a.motivo])}>{MOTIVO_LABEL[a.motivo]}</span>
                          {a.observacao && <div className="text-xs text-fraco mt-1">{a.observacao}</div>}
                          {a.previsaoRetirada && (
                            <div className="text-xs text-fraco mt-0.5">
                              combinou {formatarData(a.previsaoRetirada, 'dd/MM')}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-suave num">{dias} {dias === 1 ? 'dia' : 'dias'}</td>
                        {permissoes.verFinanceiro && (
                          <td className="px-6 py-4 num">
                            {saldo > 0
                              ? <span className="text-amber-700 font-medium">{moeda(saldo)}</span>
                              : <span className="text-fraco">quitado</span>}
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <Link href={`/pedidos/${p.id}`} className="text-marca-texto hover:text-marca-texto font-medium text-xs flex items-center gap-1 whitespace-nowrap">
                              Ver <ArrowRight className="w-3 h-3" />
                            </Link>
                            {permissoes.responderEntrega && (
                              <>
                                {lembrete && (
                                  <>
                                    <span className="badge bg-blue-100 text-blue-700 whitespace-nowrap">confirmar</span>
                                    <button
                                      onClick={() => confirmarAindaAguardando(p)}
                                      disabled={marcando === p.id}
                                      className="btn-secondary text-xs px-3 py-1.5 whitespace-nowrap"
                                    >
                                      Sim, ainda
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => marcarEntregue(p)}
                                  disabled={marcando === p.id}
                                  className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap"
                                >
                                  {marcando === p.id ? 'Marcando...' : 'Cliente retirou'}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modalPedido && (
        <ModalNaoRetirou
          pedido={modalPedido}
          aberto
          modo="registrar"
          onFechar={() => setModalPedido(null)}
          onGravado={carregar}
          nomeMembro={membro?.nome}
        />
      )}
    </div>
  )
}
