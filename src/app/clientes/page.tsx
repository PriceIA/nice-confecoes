'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Users2, X, ArrowRight, Phone, Mail } from 'lucide-react'
import { getClientes, getPedidos, pedidosDoCliente } from '@/lib/store'
import { STATUS_CONFIG } from '@/lib/helpers'
import { Cliente, Pedido } from '@/types'
import clsx from 'clsx'

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [selecionado, setSelecionado] = useState<Cliente | null>(null)

  useEffect(() => {
    (async () => {
      const [cli, ped] = await Promise.all([getClientes(), getPedidos()])
      setClientes(cli)
      setPedidos(ped)
    })()
  }, [])

  const historico = selecionado
    ? pedidosDoCliente(selecionado, pedidos).sort((a, b) => new Date(b.dataEntrada).getTime() - new Date(a.dataEntrada).getTime())
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-nice-800">Clientes</h1>
        <p className="text-sm text-gray-500 mt-0.5">{clientes.length} cliente(s) cadastrado(s)</p>
      </div>

      {clientes.length === 0 ? (
        <div className="card py-20 text-center text-gray-400">
          <Users2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum cliente cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientes.map(c => {
            const pedidosCliente = pedidosDoCliente(c, pedidos)
            const valorTotal = pedidosCliente.reduce((a, p) => a + p.valorTotal, 0)
            const ultimoPedido = pedidosCliente.reduce<Pedido | null>((mais, p) =>
              !mais || new Date(p.dataEntrada) > new Date(mais.dataEntrada) ? p : mais, null)

            return (
              <button key={c.id} onClick={() => setSelecionado(c)}
                className="card text-left hover:border-nice-300 border border-transparent transition-colors space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-nice-50 flex items-center justify-center shrink-0">
                    <Users2 className="w-5 h-5 text-nice-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-nice-800 truncate">{c.nome}</div>
                    {c.empresa && <div className="text-xs text-gray-400 truncate">{c.empresa}</div>}
                  </div>
                </div>

                {c.telefone && (
                  <div className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />{c.telefone}
                  </div>
                )}

                <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-lg font-bold text-nice-700">{pedidosCliente.length}</div>
                    <div className="text-xs text-gray-400">pedido(s)</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-nice-700">R$ {valorTotal.toFixed(2)}</div>
                    <div className="text-xs text-gray-400">gasto total</div>
                  </div>
                </div>

                {ultimoPedido && (
                  <div className="text-xs text-gray-400">
                    Último pedido: {format(new Date(ultimoPedido.dataEntrada), 'dd/MM/yyyy')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Drawer de histórico */}
      {selecionado && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelecionado(null)} />
          <aside className="relative h-screen w-full max-w-md bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-nice-800 text-lg">{selecionado.nome}</h2>
                {selecionado.empresa && <p className="text-sm text-gray-400">{selecionado.empresa}</p>}
              </div>
              <button onClick={() => setSelecionado(null)} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 border-b border-gray-100 space-y-2">
              {selecionado.telefone && (
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />{selecionado.telefone}
                </div>
              )}
              {selecionado.email && (
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />{selecionado.email}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Histórico de Pedidos ({historico.length})
              </h3>

              {historico.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Nenhum pedido encontrado.</p>
              ) : historico.map(p => {
                const sc = STATUS_CONFIG[p.status]
                return (
                  <Link key={p.id} href={`/pedidos/${p.id}`}
                    className="block border border-gray-100 rounded-xl px-4 py-3 hover:border-nice-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-nice-700 text-sm">#{p.numero}</span>
                      <span className={clsx('badge text-xs', sc.bg, sc.color)}>{sc.label}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                      <span>{format(new Date(p.dataEntrada), 'dd/MM/yyyy')}</span>
                      <span className="font-medium text-gray-700">R$ {p.valorTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-end mt-1">
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
