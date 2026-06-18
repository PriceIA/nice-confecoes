'use client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { PlusCircle, CheckCircle2, Clock, Truck } from 'lucide-react'
import { getTerceirizadas, criarTerceirizada, atualizarTerceirizada, getPedidos } from '@/lib/store'
import { Terceirizada, Pedido } from '@/types'
import clsx from 'clsx'

const TIPO_CONFIG = {
  costura:     { label: 'Costura',      color: 'text-blue-600',   bg: 'bg-blue-50' },
  dtf:         { label: 'DTF',          color: 'text-purple-600', bg: 'bg-purple-50' },
  sublimacao:  { label: 'Sublimação',   color: 'text-orange-600', bg: 'bg-orange-50' },
  bordado:     { label: 'Bordado',      color: 'text-nice-600',   bg: 'bg-nice-50' },
}

const STATUS_TC = {
  enviado:   { label: 'Enviado',   icon: Truck,         color: 'text-blue-500',  bg: 'bg-blue-50' },
  retornado: { label: 'Retornado', icon: CheckCircle2,  color: 'text-nice-500',  bg: 'bg-nice-50' },
  pago:      { label: 'Pago',      icon: CheckCircle2,  color: 'text-green-600', bg: 'bg-green-50' },
}

const VAZIO: Omit<Terceirizada, 'id'> = {
  nome: '', tipo: 'costura', pedidoId: '', numeroPedido: '', itens: '',
  dataEnvio: new Date().toISOString().slice(0, 10),
  dataRetornoPrevisto: '', dataRetornoReal: '', valorCombinado: 0, valorPago: 0,
  status: 'enviado', observacoes: '',
}

export default function TerceirizadasPage() {
  const [lista, setLista] = useState<Terceirizada[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Omit<Terceirizada, 'id'>>(VAZIO)

  const carregar = () => {
    setLista(getTerceirizadas())
    setPedidos(getPedidos().filter(p => !['entregue', 'cancelado'].includes(p.status)))
  }

  useEffect(() => { carregar() }, [])

  function handleSalvar() {
    if (!form.nome || !form.dataEnvio) return alert('Preencha os campos obrigatórios.')
    criarTerceirizada(form)
    setModal(false)
    setForm(VAZIO)
    carregar()
  }

  function avancarStatus(id: string, atual: Terceirizada['status']) {
    const prox = atual === 'enviado' ? 'retornado' : atual === 'retornado' ? 'pago' : 'pago'
    atualizarTerceirizada(id, { status: prox, ...(prox === 'retornado' ? { dataRetornoReal: new Date().toISOString().slice(0, 10) } : {}) })
    carregar()
  }

  const totalAPagar = lista.filter(t => t.status !== 'pago').reduce((a, t) => a + (t.valorCombinado - t.valorPago), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nice-800">Terceirizadas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Controle de envios e pagamentos</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary">
          <PlusCircle className="w-4 h-4" /> Registrar Envio
        </button>
      </div>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4 border border-orange-200">
          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
            <Clock className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-nice-800">R$ {totalAPagar.toFixed(2)}</div>
            <div className="text-xs text-gray-400">A pagar</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Truck className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-nice-800">{lista.filter(t => t.status === 'enviado').length}</div>
            <div className="text-xs text-gray-400">Aguardando retorno</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 bg-nice-50 rounded-xl flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-nice-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-nice-800">{lista.filter(t => t.status === 'retornado').length}</div>
            <div className="text-xs text-gray-400">Retornados</div>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="card p-0 overflow-hidden">
        {lista.length === 0 ? (
          <div className="py-20 text-center text-gray-400 text-sm">Nenhum registro de terceirizada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Prestadora</th>
                  <th className="text-left px-6 py-3 font-semibold">Tipo</th>
                  <th className="text-left px-6 py-3 font-semibold">Pedido</th>
                  <th className="text-left px-6 py-3 font-semibold">Envio</th>
                  <th className="text-left px-6 py-3 font-semibold">Valor</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(t => {
                  const tc = TIPO_CONFIG[t.tipo]
                  const sc = STATUS_TC[t.status]
                  const StatusIcon = sc.icon
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-800">{t.nome}</td>
                      <td className="px-6 py-4"><span className={clsx('badge', tc.bg, tc.color)}>{tc.label}</span></td>
                      <td className="px-6 py-4 text-gray-600">{t.numeroPedido ? `#${t.numeroPedido}` : '—'}</td>
                      <td className="px-6 py-4 text-gray-500">{format(new Date(t.dataEnvio), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-800">R$ {t.valorCombinado.toFixed(2)}</div>
                        {t.valorPago > 0 && <div className="text-xs text-green-600">Pago: R$ {t.valorPago.toFixed(2)}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={clsx('badge', sc.bg, sc.color, 'gap-1')}>
                          <StatusIcon className="w-3 h-3" />{sc.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {t.status !== 'pago' && (
                          <button onClick={() => avancarStatus(t.id, t.status)}
                            className="text-nice-600 text-xs font-medium hover:underline">
                            {t.status === 'enviado' ? 'Marcar retorno' : 'Marcar pago'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="font-bold text-nice-800 text-lg">Registrar Envio</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Prestadora *</label>
                <input className="input" placeholder="Ex: Talícia, Quésia..." value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tipo de Serviço</label>
                <select className="input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}>
                  <option value="costura">Costura</option>
                  <option value="dtf">DTF</option>
                  <option value="sublimacao">Sublimação</option>
                  <option value="bordado">Bordado</option>
                </select>
              </div>
              <div>
                <label className="label">Pedido (opcional)</label>
                <select className="input" value={form.pedidoId} onChange={e => {
                  const p = pedidos.find(x => x.id === e.target.value)
                  setForm(f => ({ ...f, pedidoId: e.target.value, numeroPedido: p?.numero || '' }))
                }}>
                  <option value="">— Sem vínculo —</option>
                  {pedidos.map(p => <option key={p.id} value={p.id}>#{p.numero} — {p.cliente.nome}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Itens enviados</label>
                <input className="input" placeholder="Descrição do que foi enviado" value={form.itens} onChange={e => setForm(f => ({ ...f, itens: e.target.value }))} />
              </div>
              <div>
                <label className="label">Data de Envio *</label>
                <input className="input" type="date" value={form.dataEnvio} onChange={e => setForm(f => ({ ...f, dataEnvio: e.target.value }))} />
              </div>
              <div>
                <label className="label">Retorno Previsto</label>
                <input className="input" type="date" value={form.dataRetornoPrevisto} onChange={e => setForm(f => ({ ...f, dataRetornoPrevisto: e.target.value }))} />
              </div>
              <div>
                <label className="label">Valor combinado (R$)</label>
                <input className="input" type="number" placeholder="0,00" value={form.valorCombinado || ''} onChange={e => setForm(f => ({ ...f, valorCombinado: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">Valor já pago (R$)</label>
                <input className="input" type="number" placeholder="0,00" value={form.valorPago || ''} onChange={e => setForm(f => ({ ...f, valorPago: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Observações</label>
                <textarea className="input resize-none" rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={handleSalvar} className="btn-primary flex-1 justify-center">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
