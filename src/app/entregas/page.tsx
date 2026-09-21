'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, PackageCheck, ArrowRight } from 'lucide-react'
import { getPedidos, atualizarPedido } from '@/lib/store'
import { pedidoConcluido, badgePrazo } from '@/lib/kanban-ui'
import { totalPecas } from '@/lib/helpers'
import { Pedido } from '@/types'
import { useMembro } from '@/components/AuthProvider'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import { useSkeletonDelay } from '@/lib/hooks'
import EsqueletoBarra from '@/components/EsqueletoBarra'
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

/**
 * Fila de pedidos prontos pra entrega: os 8 setores de produção concluídos
 * (mesmo critério que já libera "Criar cartão no Kanban" em /pedidos/[id] —
 * reaproveita `pedidoConcluido`, não recalcula) e status ainda não
 * 'entregue' nem 'cancelado'.
 *
 * Só lista pendentes de propósito — assim que marcado, o pedido sai daqui.
 * O histórico de entregues continua em /pedidos, filtrando por "Entregue".
 *
 * Regra 8 do CLAUDE.md: /producao continua sendo a fonte da verdade do
 * progresso; esta tela só lê esse progresso pra decidir quem aparece, nunca
 * o altera.
 */
export default function EntregasPage() {
  const { permissoes } = useMembro()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const mostrarSkeleton = useSkeletonDelay(loading)

  const carregar = async () => {
    setErro(null)
    try {
      setPedidos(await getPedidos())
    } catch (err) {
      setErro(descreverFalhaCarregar(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const prontos = pedidos
    .filter(p => p.status !== 'entregue' && p.status !== 'cancelado' && pedidoConcluido(p))
    .sort((a, b) => new Date(a.dataEntrega).getTime() - new Date(b.dataEntrega).getTime())

  async function marcarEntregue(pedido: Pedido) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Entregas</h1>
        <p className="text-sm text-suave mt-0.5">
          {loading ? 'Carregando...' : `${prontos.length} pedido(s) com produção concluída, prontos pra entrega`}
        </p>
      </div>

      {erro && (
        <div className="flex items-center gap-2 rounded-xl bg-red-100 text-red-700 px-4 py-3 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

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
                  return (
                    <tr key={p.id} className="hover:bg-superficie-2 transition-colors">
                      <td className="px-6 py-4 font-semibold text-marca-texto num">#{p.numero}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-conteudo">{p.cliente.nome}</div>
                        {p.cliente.empresa && <div className="text-xs text-fraco">{p.cliente.empresa}</div>}
                      </td>
                      <td className="px-6 py-4 text-suave num">{totalPecas(p)} un.</td>
                      <td className="px-6 py-4">
                        {prazo && (
                          <span className={clsx('badge', prazo.classes)} title={prazo.titulo}>{prazo.texto}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/pedidos/${p.id}`} className="text-marca-texto hover:text-marca-texto font-medium text-xs flex items-center gap-1 whitespace-nowrap">
                            Ver <ArrowRight className="w-3 h-3" />
                          </Link>
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
  )
}
