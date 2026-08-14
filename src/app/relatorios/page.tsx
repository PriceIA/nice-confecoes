'use client'
import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Printer, TrendingUp, Package, CheckCircle2, XCircle } from 'lucide-react'
import { getPedidos } from '@/lib/store'
import { STATUS_CONFIG, COMPLEXIDADE_CONFIG, totalPecas } from '@/lib/helpers'
import { Pedido, Complexidade } from '@/types'
import clsx from 'clsx'

export default function RelatoriosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [mes, setMes] = useState(format(new Date(), 'yyyy-MM'))

  useEffect(() => { (async () => setPedidos(await getPedidos()))() }, [])

  const inicio = startOfMonth(new Date(`${mes}-01`))
  const fim = endOfMonth(new Date(`${mes}-01`))

  const doMes = pedidos.filter(p =>
    isWithinInterval(new Date(p.dataEntrada), { start: inicio, end: fim })
  )

  const entregues = doMes.filter(p => p.status === 'entregue')
  const cancelados = doMes.filter(p => p.status === 'cancelado')
  const emAndamento = pedidos.filter(p => !['entregue', 'cancelado'].includes(p.status))

  const receitaTotal = entregues.reduce((a, p) => a + p.valorTotal, 0)
  const totalUnidades = doMes.reduce((a, p) => a + totalPecas(p), 0)

  const porComplexidade = (['P1', 'P2', 'P3', 'P4', 'P5'] as Complexidade[]).map(c => {
    const pecas = doMes.flatMap(p => p.pecas.filter(x => x.complexidade === c))
    const qtd = pecas.reduce((a, p) => a + p.tamanhos.reduce((b, t) => b + t.quantidade, 0), 0)
    return { complexidade: c, qtd, config: COMPLEXIDADE_CONFIG[c] }
  })

  const maxQtd = Math.max(...porComplexidade.map(x => x.qtd), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Relatórios</h1>
          <p className="text-sm text-suave mt-0.5 capitalize">
            {format(new Date(`${mes}-01`), "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <div className="flex gap-3">
          <input className="input w-44" type="month" value={mes} onChange={e => setMes(e.target.value)} />
          <button onClick={() => window.print()} className="btn-secondary">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Pedidos no mês', value: doMes.length, icon: Package, color: 'text-marca-texto', bg: 'bg-marca-suave', border: 'border-marca-borda' },
          { label: 'Entregues', value: entregues.length, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
          { label: 'Cancelados', value: cancelados.length, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
          { label: 'Receita (entregues)', value: `R$ ${receitaTotal.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={clsx('card flex items-center gap-4 border', border)}>
            <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', bg)}>
              <Icon className={clsx('w-6 h-6', color)} />
            </div>
            <div>
              <div className="text-xl font-bold text-titulo">{value}</div>
              <div className="text-xs text-suave">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribuição por complexidade */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-titulo">Distribuição por Complexidade</h2>
          <div className="space-y-3">
            {porComplexidade.map(({ complexidade, qtd, config }) => (
              <div key={complexidade}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <span className={clsx('badge', config.bg, config.color)}>{complexidade}</span>
                    <span className="text-suave text-xs">{config.label.split('—')[1]?.trim()}</span>
                  </div>
                  <span className="font-semibold text-conteudo">{qtd} un.</span>
                </div>
                <div className="w-full bg-superficie-3 rounded-full h-2">
                  <div className={clsx('h-2 rounded-full transition-all',
                    complexidade === 'P1' ? 'bg-gray-400' :
                    complexidade === 'P2' ? 'bg-blue-400' :
                    complexidade === 'P3' ? 'bg-yellow-400' :
                    complexidade === 'P4' ? 'bg-orange-400' : 'bg-red-400'
                  )} style={{ width: `${(qtd / maxQtd) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 text-sm text-suave">
            Total: <span className="font-semibold text-marca-texto">{totalUnidades} peças</span>
          </div>
        </div>

        {/* Em andamento */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-titulo">Em Andamento ({emAndamento.length})</h2>
          {emAndamento.length === 0 ? (
            <p className="text-sm text-fraco">Nenhum pedido em andamento.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {emAndamento.map(p => {
                const sc = STATUS_CONFIG[p.status]
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-borda last:border-0">
                    <div>
                      <span className="font-semibold text-marca-texto text-sm">#{p.numero}</span>
                      <span className="text-suave text-sm ml-2">{p.cliente.nome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span>
                      <span className="text-xs text-fraco">{format(new Date(p.dataEntrega), 'dd/MM')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tabela do mês */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-borda">
          <h2 className="font-semibold text-titulo">Todos os Pedidos do Mês ({doMes.length})</h2>
        </div>
        {doMes.length === 0 ? (
          <div className="py-16 text-center text-fraco text-sm">Nenhum pedido neste mês.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Nº</th>
                  <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-6 py-3 font-semibold">Peças</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="text-left px-6 py-3 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {doMes.map(p => {
                  const sc = STATUS_CONFIG[p.status]
                  return (
                    <tr key={p.id}>
                      <td className="px-6 py-3 font-semibold text-marca-texto">#{p.numero}</td>
                      <td className="px-6 py-3 text-conteudo">{p.cliente.nome}</td>
                      <td className="px-6 py-3 text-suave">{totalPecas(p)} un.</td>
                      <td className="px-6 py-3"><span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span></td>
                      <td className="px-6 py-3 font-medium text-conteudo">{p.valorTotal > 0 ? `R$ ${p.valorTotal.toFixed(2)}` : '—'}</td>
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
