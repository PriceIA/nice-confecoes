'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { PlusCircle, Search, ArrowRight, Trash2 } from 'lucide-react'
import { getPedidos, deletarPedido } from '@/lib/store'
import { STATUS_CONFIG, totalPecas } from '@/lib/helpers'
import { Pedido, StatusPedido } from '@/types'
import clsx from 'clsx'

const FILTROS: { value: StatusPedido | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'aguardando_pagamento', label: 'Ag. Pagamento' },
  { value: 'em_producao', label: 'Em Produção' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelado', label: 'Cancelado' },
]

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [filtro, setFiltro] = useState<StatusPedido | 'todos'>('todos')
  const [busca, setBusca] = useState('')

  const carregar = async () => setPedidos(await getPedidos())

  useEffect(() => { carregar() }, [])

  const filtrados = pedidos.filter(p => {
    const matchStatus = filtro === 'todos' || p.status === filtro
    const q = busca.toLowerCase()
    const matchBusca = !q || p.cliente.nome.toLowerCase().includes(q) || p.numero.includes(q) || p.cliente.empresa?.toLowerCase().includes(q)
    return matchStatus && matchBusca
  })

  async function handleDeletar(id: string) {
    if (confirm('Deseja excluir este pedido?')) {
      await deletarPedido(id)
      carregar()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nice-800">Pedidos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pedidos.length} pedido(s) cadastrado(s)</p>
        </div>
        <Link href="/novo-pedido" className="btn-primary">
          <PlusCircle className="w-4 h-4" />
          Novo Pedido
        </Link>
      </div>

      {/* Filtros + Busca */}
      <div className="card py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por cliente, empresa ou número..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTROS.map(f => (
              <button key={f.value} onClick={() => setFiltro(f.value)}
                className={clsx('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                  filtro === f.value
                    ? 'bg-nice-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <p className="text-sm">Nenhum pedido encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Nº</th>
                  <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-6 py-3 font-semibold">Tipo</th>
                  <th className="text-left px-6 py-3 font-semibold">Peças</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="text-left px-6 py-3 font-semibold">Entrada</th>
                  <th className="text-left px-6 py-3 font-semibold">Entrega</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map(p => {
                  const sc = STATUS_CONFIG[p.status]
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4 font-semibold text-nice-700">#{p.numero}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-800">{p.cliente.nome}</div>
                        {p.cliente.empresa && <div className="text-xs text-gray-400">{p.cliente.empresa}</div>}
                        {p.consultor && <div className="text-xs text-nice-500">Consultor: {p.consultor}</div>}
                      </td>
                      <td className="px-6 py-4">
                        {p.tipo === 'urgente' && <span className="badge bg-red-100 text-red-600">urgente</span>}
                        {p.tipo === 'grande_volume' && <span className="badge bg-purple-100 text-purple-600">grande vol.</span>}
                        {p.tipo === 'normal' && <span className="text-gray-400 text-xs">normal</span>}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{totalPecas(p)} un.</td>
                      <td className="px-6 py-4">
                        <span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{format(new Date(p.dataEntrada), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4 text-gray-600 font-medium">{format(new Date(p.dataEntrega), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/pedidos/${p.id}`} className="text-nice-600 hover:text-nice-700 font-medium text-xs flex items-center gap-1">
                            Ver <ArrowRight className="w-3 h-3" />
                          </Link>
                          <button onClick={() => handleDeletar(p.id)} className="text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
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
