'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format, isAfter, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Factory, AlertTriangle, Clock, ClipboardCheck,
  PlusCircle, ArrowRight, TrendingUp, Users2
} from 'lucide-react'
import { getPedidos, getClientes, pedidosStats } from '@/lib/store'
import { STATUS_CONFIG, COMPLEXIDADE_CONFIG, totalPecas } from '@/lib/helpers'
import { Pedido } from '@/types'
import clsx from 'clsx'

export default function DashboardPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [totalClientes, setTotalClientes] = useState(0)
  const [stats, setStats] = useState({ emProducao: 0, urgentes: 0, entregaEm7dias: 0, aguardandoProducao: 0 })

  useEffect(() => {
    const data = getPedidos()
    setPedidos(data)
    setStats(pedidosStats(data))
    setTotalClientes(getClientes().length)
  }, [])

  const ativos = pedidos.filter(p => !['entregue', 'cancelado'].includes(p.status))
  const urgentes = pedidos.filter(p => p.tipo === 'urgente' && !['entregue', 'cancelado'].includes(p.status))

  const CARDS = [
    { label: 'Em Produção', value: stats.emProducao, icon: Factory, color: 'text-nice-600', bg: 'bg-nice-50', border: 'border-nice-200' },
    { label: 'Urgentes', value: stats.urgentes, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
    { label: 'Entrega em 7 dias', value: stats.entregaEm7dias, icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
    { label: 'Aguardando Produção', value: stats.aguardandoProducao, icon: ClipboardCheck, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Total de Clientes', value: totalClientes, icon: Users2, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nice-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <Link href="/novo-pedido" className="btn-primary">
          <PlusCircle className="w-4 h-4" />
          Novo Pedido
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {CARDS.map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={clsx('card flex items-center gap-4 border', border)}>
            <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', bg)}>
              <Icon className={clsx('w-6 h-6', color)} />
            </div>
            <div>
              <div className="text-2xl font-bold text-nice-800">{value}</div>
              <div className="text-xs text-gray-500 font-medium">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Alertas urgentes */}
      {urgentes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" />
            Pedidos Urgentes — atenção necessária
          </div>
          {urgentes.map(p => (
            <Link key={p.id} href={`/pedidos/${p.id}`}
              className="flex items-center justify-between bg-white border border-red-100 rounded-xl px-4 py-3 hover:border-red-300 transition-colors">
              <div>
                <span className="font-semibold text-nice-800 text-sm">#{p.numero}</span>
                <span className="text-gray-500 text-sm ml-2">{p.cliente.nome}</span>
                {p.cliente.empresa && <span className="text-gray-400 text-xs ml-1">— {p.cliente.empresa}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-red-600 font-medium">Entrega: {format(new Date(p.dataEntrega), 'dd/MM/yyyy')}</span>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Tabela de pedidos ativos */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-nice-800 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-nice-500" />
            Pedidos Ativos
          </h2>
          <Link href="/pedidos" className="text-nice-600 text-sm font-medium hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {ativos.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum pedido ativo no momento.</p>
            <Link href="/novo-pedido" className="text-nice-600 text-sm font-medium mt-2 inline-block hover:underline">Criar primeiro pedido →</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Pedido</th>
                  <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-6 py-3 font-semibold">Peças</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="text-left px-6 py-3 font-semibold">Entrega</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ativos.slice(0, 10).map(p => {
                  const sc = STATUS_CONFIG[p.status]
                  const vencendo = isAfter(addDays(new Date(), 7), new Date(p.dataEntrega))
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-nice-700">#{p.numero}</span>
                          {p.tipo === 'urgente' && <span className="badge bg-red-100 text-red-600">urgente</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-800">{p.cliente.nome}</div>
                        {p.cliente.empresa && <div className="text-xs text-gray-400">{p.cliente.empresa}</div>}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{totalPecas(p)} un.</td>
                      <td className="px-6 py-4">
                        <span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={clsx('text-sm font-medium', vencendo && p.status !== 'finalizado' ? 'text-orange-500' : 'text-gray-600')}>
                          {format(new Date(p.dataEntrega), 'dd/MM/yyyy')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Link href={`/pedidos/${p.id}`} className="text-nice-600 hover:text-nice-700 font-medium text-xs flex items-center gap-1">
                          Ver <ArrowRight className="w-3 h-3" />
                        </Link>
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
