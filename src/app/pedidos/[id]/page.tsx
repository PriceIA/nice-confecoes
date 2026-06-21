'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ArrowLeft, Printer, ChevronRight, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { getPedidoById, atualizarPedido } from '@/lib/store'
import { STATUS_CONFIG, COMPLEXIDADE_CONFIG, SETOR_LABELS, totalPecas } from '@/lib/helpers'
import { Pedido, StatusPedido, StatusSetor, ProgressoSetor } from '@/types'
import clsx from 'clsx'
import Link from 'next/link'

const STATUS_LIST: StatusPedido[] = ['orcamento', 'aprovado', 'aguardando_pagamento', 'em_producao', 'finalizado', 'entregue', 'cancelado']

export default function DetalhePedidoPage() {
  const { id } = useParams()
  const router = useRouter()
  const [pedido, setPedido] = useState<Pedido | null>(null)

  const carregar = async () => {
    const p = await getPedidoById(id as string)
    if (!p) router.push('/pedidos')
    else setPedido(p)
  }

  useEffect(() => { carregar() }, [id])

  if (!pedido) return <div className="text-gray-400 text-sm">Carregando...</div>

  const sc = STATUS_CONFIG[pedido.status]

  async function mudarStatus(status: StatusPedido) {
    if (status === 'em_producao' && pedido!.valorPago <= 0) {
      alert('Pedido não pode ir para produção sem pagamento registrado.')
      return
    }
    await atualizarPedido(pedido!.id, { status })
    carregar()
  }

  async function ciclarSetor(setor: keyof ProgressoSetor) {
    const ciclo: StatusSetor[] = ['pendente', 'em_andamento', 'concluido']
    const atual = pedido!.progresso[setor]
    const proximo = ciclo[(ciclo.indexOf(atual) + 1) % ciclo.length]
    const progresso = { ...pedido!.progresso, [setor]: proximo }
    await atualizarPedido(pedido!.id, { progresso })
    carregar()
  }

  async function marcarParcelaPaga(parcelaId: string, pago: boolean) {
    const parcelas = pedido!.parcelas.map(p =>
      p.id === parcelaId
        ? { ...p, pago, dataPagamento: pago ? new Date().toISOString().split('T')[0] : undefined }
        : p
    )
    await atualizarPedido(pedido!.id, { parcelas })
    carregar()
  }

  const setorIcone = (s: StatusSetor) => {
    if (s === 'concluido') return <CheckCircle2 className="w-4 h-4 text-nice-500" />
    if (s === 'em_andamento') return <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
    return <Circle className="w-4 h-4 text-gray-300" />
  }

  const totalParcelas = pedido.parcelas.reduce((a, p) => a + (p.valor || 0), 0)
  const totalPago = pedido.parcelas.filter(p => p.pago).reduce((a, p) => a + (p.valor || 0), 0)
  const saldo = totalParcelas - totalPago

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/pedidos" className="btn-ghost px-2">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-nice-800">Pedido #{pedido.numero}</h1>
              <span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span>
              {pedido.tipo === 'urgente' && <span className="badge bg-red-100 text-red-600">urgente</span>}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">Entrada: {format(new Date(pedido.dataEntrada), 'dd/MM/yyyy')}</p>
          </div>
        </div>
        <button onClick={() => window.print()} className="btn-secondary">
          <Printer className="w-4 h-4" /> Imprimir
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Cliente */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-nice-800">Cliente</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400 text-xs">Nome</span><p className="font-medium text-gray-800">{pedido.cliente.nome}</p></div>
              {pedido.cliente.empresa && <div><span className="text-gray-400 text-xs">Empresa</span><p className="font-medium text-gray-800">{pedido.cliente.empresa}</p></div>}
              {pedido.cliente.telefone && <div><span className="text-gray-400 text-xs">Telefone</span><p className="font-medium text-gray-800">{pedido.cliente.telefone}</p></div>}
              {pedido.cliente.email && <div><span className="text-gray-400 text-xs">E-mail</span><p className="font-medium text-gray-800">{pedido.cliente.email}</p></div>}
              {pedido.consultor && <div><span className="text-gray-400 text-xs">Consultor</span><p className="font-medium text-gray-800">{pedido.consultor}</p></div>}
            </div>
          </div>

          {/* Peças */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-nice-800">Peças ({totalPecas(pedido)} un.)</h2>
            </div>
            {pedido.pecas.map((p, i) => {
              const cc = COMPLEXIDADE_CONFIG[p.complexidade]
              const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
              return (
                <div key={p.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-800">Peça {i + 1} — {p.tipo}</span>
                      <span className={clsx('badge', cc.bg, cc.color)}>{cc.label}</span>
                    </div>
                    <span className="text-sm text-gray-500 font-medium">{qtd} un.</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                    {p.cor && <div><span className="font-medium text-gray-400">Cor:</span> {p.cor}</div>}
                    {p.personalizacoes.length > 0 && (
                      <div className="col-span-2">
                        <span className="font-medium text-gray-400">Person.:</span> {p.personalizacoes.join(', ')}
                        {p.corPersonalizacao && <span className="ml-1 text-gray-500">({p.corPersonalizacao})</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.tamanhos.map((t, ti) => (
                      <span key={ti} className="px-2 py-0.5 bg-nice-50 text-nice-700 rounded-lg text-xs font-medium">
                        {t.tamanho === 'SOB_MEDIDA'
                          ? `Sob Medida${t.medidaEspecial ? ': ' + t.medidaEspecial : ''}`
                          : t.tamanho
                        }: {t.quantidade}
                      </span>
                    ))}
                  </div>
                  {p.observacoes && <p className="text-xs text-gray-500 italic">{p.observacoes}</p>}
                </div>
              )
            })}
          </div>

          {/* Parcelas */}
          {pedido.parcelas.length > 0 && (
            <div className="card space-y-4">
              <h2 className="font-semibold text-nice-800">Pagamentos</h2>
              <div className="space-y-2">
                {pedido.parcelas.map((p, i) => (
                  <div key={p.id}
                    className={clsx('flex items-center justify-between px-4 py-3 rounded-xl border text-sm',
                      p.pago ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100')}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={p.pago}
                        onChange={e => marcarParcelaPaga(p.id, e.target.checked)}
                        className="w-4 h-4 accent-nice-500 cursor-pointer" />
                      <div>
                        <p className={clsx('font-medium', p.pago ? 'text-green-700' : 'text-gray-700')}>
                          {p.descricao || `Parcela ${i + 1}`}
                        </p>
                        {p.dataPrevista && (
                          <p className="text-xs text-gray-400">
                            Previsto: {format(new Date(p.dataPrevista + 'T00:00:00'), 'dd/MM/yyyy')}
                            {p.dataPagamento && ` · Pago: ${format(new Date(p.dataPagamento + 'T00:00:00'), 'dd/MM/yyyy')}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={clsx('font-semibold', p.pago ? 'text-green-700' : 'text-gray-700')}>
                      R$ {(p.valor || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="font-semibold text-nice-700">R$ {totalParcelas.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Pago</span>
                  <span className="font-medium text-green-600">R$ {totalPago.toFixed(2)}</span>
                </div>
                {saldo > 0 && (
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-500">Saldo restante</span>
                    <span className="font-semibold text-orange-600">R$ {saldo.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progresso setores */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-nice-800">Progresso por Setor</h2>
            <div className="space-y-2">
              {(Object.keys(pedido.progresso) as (keyof ProgressoSetor)[]).map(setor => {
                const status = pedido.progresso[setor]
                return (
                  <button key={setor} onClick={() => ciclarSetor(setor)}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-sm',
                      status === 'concluido' ? 'bg-nice-50 border-nice-200' :
                      status === 'em_andamento' ? 'bg-orange-50 border-orange-200' :
                      'bg-gray-50 border-gray-100 hover:border-gray-200'
                    )}>
                    <div className="flex items-center gap-3">
                      {setorIcone(status)}
                      <span className={clsx('font-medium', status === 'concluido' ? 'text-nice-700' : status === 'em_andamento' ? 'text-orange-600' : 'text-gray-500')}>
                        {SETOR_LABELS[setor]}
                      </span>
                    </div>
                    <span className={clsx('text-xs font-semibold capitalize',
                      status === 'concluido' ? 'text-nice-600' : status === 'em_andamento' ? 'text-orange-500' : 'text-gray-400')}>
                      {status === 'pendente' ? 'pendente' : status === 'em_andamento' ? 'em andamento' : 'concluído'}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-400">Clique em um setor para avançar o status</p>
          </div>
        </div>

        {/* Sidebar lateral */}
        <div className="space-y-4">
          {/* Status */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-nice-800 text-sm">Alterar Status</h2>
            <div className="space-y-1.5">
              {STATUS_LIST.map(s => {
                const c = STATUS_CONFIG[s]
                return (
                  <button key={s} onClick={() => mudarStatus(s)}
                    className={clsx('w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm border transition-all',
                      pedido.status === s ? `${c.bg} ${c.color} border-current font-semibold` : 'border-transparent hover:bg-gray-50 text-gray-600')}>
                    {c.label}
                    {pedido.status === s && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Datas e valor */}
          <div className="card space-y-3 text-sm">
            <h2 className="font-semibold text-nice-800">Informações</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Entrega</span>
                <span className="font-medium">{format(new Date(pedido.dataEntrega), 'dd/MM/yyyy')}</span>
              </div>
              {pedido.parcelas.length === 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total</span>
                    <span className="font-semibold text-nice-700">
                      {pedido.valorTotal > 0 ? `R$ ${pedido.valorTotal.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Pago</span>
                    <span className="font-medium text-green-600">
                      {pedido.valorPago > 0 ? `R$ ${pedido.valorPago.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  {pedido.valorTotal > 0 && pedido.valorPago < pedido.valorTotal && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-400">Restante</span>
                      <span className="font-semibold text-orange-600">R$ {(pedido.valorTotal - pedido.valorPago).toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {pedido.observacoes && (
            <div className="card space-y-2">
              <h2 className="font-semibold text-nice-800 text-sm">Observações</h2>
              <p className="text-sm text-gray-600">{pedido.observacoes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
