'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ArrowLeft, Printer, ChevronRight, CheckCircle2, Circle, Loader2, Pencil, Save, X, PlusCircle, Trash2 } from 'lucide-react'
import { getPedidoById, atualizarPedido } from '@/lib/store'
import { STATUS_CONFIG, COMPLEXIDADE_CONFIG, SETOR_LABELS, PERSONALIZACOES, totalPecas, CATALOGO, calcularComplexidade } from '@/lib/helpers'
import { Pedido, Peca, StatusPedido, StatusSetor, ProgressoSetor, Personalizacao, TamanhoQuantidade } from '@/types'
import FotoUpload from '@/components/FotoUpload'
import clsx from 'clsx'
import Link from 'next/link'

const STATUS_LIST: StatusPedido[] = ['orcamento', 'aprovado', 'aguardando_pagamento', 'em_producao', 'finalizado', 'entregue', 'cancelado']

const STATUS_SETOR_LABEL: Record<StatusSetor, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
}

const TAMANHOS_ADULTO = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'UNICO'] as const
const TAMANHOS_INFANTIL = ['01', '02', '04', '06', '08', '10', '12', '14'] as const

function combinarStatus(estados: StatusSetor[]): StatusSetor {
  if (estados.length === 0) return 'pendente'
  if (estados.every(s => s === 'concluido')) return 'concluido'
  if (estados.some(s => s === 'em_andamento' || s === 'concluido')) return 'em_andamento'
  return 'pendente'
}

function personalizacaoLabel(valor: string): string {
  return PERSONALIZACOES.find(p => p.value === valor)?.label ?? valor
}

function gradeTamanhos(peca: Peca): string {
  return peca.tamanhos
    .map(t => `${t.tamanho === 'SOB_MEDIDA' ? (t.medidaEspecial || 'Sob Medida') : t.tamanho}: ${t.quantidade}`)
    .join(' · ')
}

function PrintHeader({ pedido }: { pedido: Pedido }) {
  const badge = pedido.tipo === 'urgente' ? 'URGENTE' : pedido.tipo === 'grande_volume' ? 'EVENTO' : null
  return (
    <div className="flex items-start justify-between border-b-2 border-black pb-2 mb-3">
      <div>
        <div className="text-2xl font-extrabold tracking-tight leading-none">Nice Confecções</div>
        <div className="text-[10px] text-gray-600 mt-1">Pedido #{pedido.numero}</div>
      </div>
      <div className="text-right text-[11px] leading-tight">
        <div>Data do Pedido: {format(new Date(pedido.dataEntrada), 'dd/MM/yy')}</div>
        <div>Data da Entrega: {format(new Date(pedido.dataEntrega), 'dd/MM/yy')}</div>
        {badge && <div className="mt-1 inline-block border border-black px-2 py-0.5 font-bold text-[10px]">{badge}</div>}
      </div>
    </div>
  )
}

function ClienteTabela({ pedido, resumida }: { pedido: Pedido; resumida?: boolean }) {
  return (
    <div className="mb-3">
      <h3 className="text-xs font-bold uppercase border-b border-black mb-1 pb-0.5">Dados do Cliente</h3>
      <table className="w-full text-[11px] border border-black">
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1 font-semibold w-1/6">Empresa</td>
            <td className="border border-black px-2 py-1 w-1/3">{pedido.cliente.empresa || pedido.cliente.nome}</td>
            <td className="border border-black px-2 py-1 font-semibold w-1/6">Responsável</td>
            <td className="border border-black px-2 py-1">{pedido.cliente.responsavel || pedido.cliente.nome}</td>
          </tr>
          {!resumida && (
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">Telefone</td>
              <td className="border border-black px-2 py-1">{pedido.cliente.telefone}</td>
              <td className="border border-black px-2 py-1 font-semibold">Endereço</td>
              <td className="border border-black px-2 py-1">{pedido.cliente.endereco}</td>
            </tr>
          )}
          {!resumida && (
            <tr>
              <td className="border border-black px-2 py-1 font-semibold">Email</td>
              <td className="border border-black px-2 py-1" colSpan={3}>{pedido.cliente.email}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function DetalhePedidoPage() {
  const { id } = useParams()
  const router = useRouter()
  const [pedido, setPedido] = useState<Pedido | null>(null)

  const [editando, setEditando] = useState(false)
  const [editPecas, setEditPecas] = useState<Peca[]>([])
  const [editCliente, setEditCliente] = useState({
    nome: '', empresa: '', telefone: '', email: '',
    responsavel: '', endereco: '', documento: '',
  })
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    const p = await getPedidoById(id as string)
    if (!p) router.push('/pedidos')
    else setPedido(p)
  }

  useEffect(() => { carregar() }, [id])

  if (!pedido) return <div className="text-gray-400 text-sm">Carregando...</div>

  const sc = STATUS_CONFIG[pedido.status]

  function iniciarEdicao() {
    setEditPecas(pedido!.pecas.map(p => ({ ...p, fotos: [...(p.fotos ?? [])] })))
    setEditCliente({ ...pedido!.cliente })
    setEditando(true)
  }

  function cancelarEdicao() {
    setEditando(false)
  }

  async function salvarEdicao() {
    setSalvando(true)
    try {
      const valorTotal = editPecas.reduce((sum, p) => {
        const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
        return sum + (p.valorUnitario ?? 0) * qtd
      }, 0) + (pedido!.vetorizacao?.necessaria ? pedido!.vetorizacao.valor : 0)
      await atualizarPedido(pedido!.id, {
        pecas: editPecas,
        cliente: editCliente,
        ...(pedido!.parcelas.length === 0 ? { valorTotal } : {}),
      })
      setEditando(false)
      carregar()
    } catch {
      alert('Erro ao salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  function updateEditPeca(pid: string, campo: Partial<Peca>) {
    setEditPecas(prev => prev.map(p => {
      if (p.id !== pid) return p
      const updated = { ...p, ...campo }
      updated.complexidade = calcularComplexidade(updated.tipo, updated.personalizacoes)
      return updated
    }))
  }

  function addEditTamanho(pid: string) {
    setEditPecas(prev => prev.map(p => p.id === pid
      ? { ...p, tamanhos: [...p.tamanhos, { tamanho: 'G', quantidade: 1 }] }
      : p))
  }

  function updateEditTamanho(pid: string, idx: number, campo: Partial<TamanhoQuantidade>) {
    setEditPecas(prev => prev.map(p => {
      if (p.id !== pid) return p
      const tamanhos = p.tamanhos.map((t, i) => i === idx ? { ...t, ...campo } : t)
      return { ...p, tamanhos }
    }))
  }

  function removeEditTamanho(pid: string, idx: number) {
    setEditPecas(prev => prev.map(p => p.id === pid
      ? { ...p, tamanhos: p.tamanhos.filter((_, i) => i !== idx) }
      : p))
  }

  function toggleEditPersonalizacao(pid: string, val: string) {
    setEditPecas(prev => prev.map(p => {
      if (p.id !== pid) return p
      const v = val as Personalizacao
      const personalizacoes = p.personalizacoes.includes(v)
        ? p.personalizacoes.filter(x => x !== v)
        : [...p.personalizacoes, v]
      return { ...p, personalizacoes, complexidade: calcularComplexidade(p.tipo, personalizacoes) }
    }))
  }

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
    <>
    <div className="max-w-4xl space-y-6 print:hidden">
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
        <div className="flex items-center gap-2">
          {!editando && (
            <button onClick={iniciarEdicao} className="btn-secondary">
              <Pencil className="w-4 h-4" /> Editar Pedido
            </button>
          )}
          <button onClick={() => window.print()} className="btn-secondary">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* Edit mode */}
      {editando && (
        <div className="card space-y-6 border-2 border-nice-300">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-nice-800 text-base flex items-center gap-2">
              <Pencil className="w-4 h-4 text-nice-500" /> Editando Pedido
            </h2>
            <button onClick={cancelarEdicao} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Edit: Cliente */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b pb-1">Dados do Cliente</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nome *</label>
                <input className="input" value={editCliente.nome}
                  onChange={e => setEditCliente(c => ({ ...c, nome: e.target.value }))} />
              </div>
              <div>
                <label className="label">Empresa</label>
                <input className="input" value={editCliente.empresa}
                  onChange={e => setEditCliente(c => ({ ...c, empresa: e.target.value }))} />
              </div>
              <div>
                <label className="label">Responsável</label>
                <input className="input" value={editCliente.responsavel}
                  onChange={e => setEditCliente(c => ({ ...c, responsavel: e.target.value }))} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={editCliente.telefone}
                  onChange={e => setEditCliente(c => ({ ...c, telefone: e.target.value }))} />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input className="input" type="email" value={editCliente.email}
                  onChange={e => setEditCliente(c => ({ ...c, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">CNPJ / CPF</label>
                <input className="input" value={editCliente.documento}
                  onChange={e => setEditCliente(c => ({ ...c, documento: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Endereço</label>
                <input className="input" value={editCliente.endereco}
                  onChange={e => setEditCliente(c => ({ ...c, endereco: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Edit: Peças */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b pb-1">Peças</h3>
            {editPecas.map((peca, pi) => {
              const cc = COMPLEXIDADE_CONFIG[peca.complexidade]
              const catalogoKeys = Object.keys(CATALOGO)
              return (
                <div key={peca.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700">Peça {pi + 1}</span>
                      <span className={clsx('badge text-xs', cc.bg, cc.color)}>{cc.label}</span>
                    </div>
                    {editPecas.length > 1 && (
                      <button type="button"
                        onClick={() => setEditPecas(prev => prev.filter(p => p.id !== peca.id))}
                        className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Categoria</label>
                      <select className="input" value={peca.categoria}
                        onChange={e => {
                          const cat = e.target.value
                          const t = (CATALOGO as any)[cat]?.[0] || ''
                          updateEditPeca(peca.id, { categoria: cat, tipo: t })
                        }}>
                        {catalogoKeys.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tipo de Peça</label>
                      <select className="input" value={peca.tipo}
                        onChange={e => updateEditPeca(peca.id, { tipo: e.target.value })}>
                        {((CATALOGO as any)[peca.categoria] || []).map((t: string) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Cor</label>
                      <input className="input" value={peca.cor}
                        onChange={e => updateEditPeca(peca.id, { cor: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Valor unitário (R$)</label>
                      <input className="input" type="number" min={0} step={0.01}
                        value={peca.valorUnitario ?? ''}
                        onChange={e => updateEditPeca(peca.id, { valorUnitario: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-2">
                      <label className="label">Personalizações</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {PERSONALIZACOES.map(({ value, label }) => (
                          <button key={value} type="button"
                            onClick={() => toggleEditPersonalizacao(peca.id, value)}
                            className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                              peca.personalizacoes.includes(value as Personalizacao)
                                ? 'bg-nice-500 text-white border-nice-500'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-nice-300')}>
                            {label}
                          </button>
                        ))}
                      </div>
                      {peca.personalizacoes.length > 0 && (
                        <div className="mt-2">
                          <label className="label">Cor da personalização</label>
                          <input className="input" value={peca.corPersonalizacao ?? ''}
                            onChange={e => updateEditPeca(peca.id, { corPersonalizacao: e.target.value })} />
                        </div>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="label">Observações</label>
                      <input className="input" value={peca.observacoes}
                        onChange={e => updateEditPeca(peca.id, { observacoes: e.target.value })} />
                    </div>
                  </div>

                  {/* Tamanhos */}
                  <div>
                    <label className="label">Tamanhos e Quantidades</label>
                    <div className="space-y-2">
                      {peca.tamanhos.map((t, ti) => (
                        <div key={ti} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <select className="input w-36" value={t.tamanho}
                              onChange={e => updateEditTamanho(peca.id, ti, { tamanho: e.target.value as any, medidaEspecial: '' })}>
                              <optgroup label="Adulto">
                                {TAMANHOS_ADULTO.map(s => <option key={s} value={s}>{s}</option>)}
                              </optgroup>
                              <optgroup label="Infantil">
                                {TAMANHOS_INFANTIL.map(s => <option key={s} value={s}>{s}</option>)}
                              </optgroup>
                              <option value="SOB_MEDIDA">Sob Medida</option>
                            </select>
                            <input type="number" min={1} className="input w-24" value={t.quantidade}
                              onChange={e => updateEditTamanho(peca.id, ti, { quantidade: parseInt(e.target.value) || 1 })} />
                            <span className="text-xs text-gray-400">un.</span>
                            {peca.tamanhos.length > 1 && (
                              <button type="button" onClick={() => removeEditTamanho(peca.id, ti)}
                                className="text-red-400 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {t.tamanho === 'SOB_MEDIDA' && (
                            <input className="input text-sm" placeholder="Descreva as medidas..."
                              value={t.medidaEspecial ?? ''}
                              onChange={e => updateEditTamanho(peca.id, ti, { medidaEspecial: e.target.value })} />
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addEditTamanho(peca.id)}
                        className="text-nice-600 text-xs font-medium hover:underline flex items-center gap-1 mt-1">
                        <PlusCircle className="w-3.5 h-3.5" /> Adicionar tamanho
                      </button>
                    </div>
                  </div>

                  {/* Fotos */}
                  <div>
                    <label className="label">Fotos</label>
                    <FotoUpload
                      pecaId={peca.id}
                      fotos={peca.fotos ?? []}
                      onChange={fotos => updateEditPeca(peca.id, { fotos })}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={cancelarEdicao} className="btn-secondary flex-1 justify-center">
              Cancelar
            </button>
            <button onClick={salvarEdicao} disabled={salvando} className="btn-primary flex-1 justify-center">
              <Save className="w-4 h-4" /> {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Cliente */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-nice-800">Cliente</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400 text-xs">Nome</span><p className="font-medium text-gray-800">{pedido.cliente.nome}</p></div>
              {pedido.cliente.empresa && <div><span className="text-gray-400 text-xs">Empresa</span><p className="font-medium text-gray-800">{pedido.cliente.empresa}</p></div>}
              {pedido.cliente.responsavel && <div><span className="text-gray-400 text-xs">Responsável</span><p className="font-medium text-gray-800">{pedido.cliente.responsavel}</p></div>}
              {pedido.cliente.telefone && <div><span className="text-gray-400 text-xs">Telefone</span><p className="font-medium text-gray-800">{pedido.cliente.telefone}</p></div>}
              {pedido.cliente.email && <div><span className="text-gray-400 text-xs">E-mail</span><p className="font-medium text-gray-800">{pedido.cliente.email}</p></div>}
              {pedido.cliente.documento && <div><span className="text-gray-400 text-xs">CNPJ/CPF</span><p className="font-medium text-gray-800">{pedido.cliente.documento}</p></div>}
              {pedido.cliente.endereco && <div className="col-span-2"><span className="text-gray-400 text-xs">Endereço</span><p className="font-medium text-gray-800">{pedido.cliente.endereco}</p></div>}
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
                  {p.fotos && p.fotos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {p.fotos.map((url, fi) => (
                        <img key={fi} src={url} alt={`Foto ${fi + 1} — Peça ${i + 1}`}
                          className="w-20 h-20 object-cover rounded-xl border border-gray-200 cursor-pointer"
                          onClick={() => window.open(url, '_blank')} />
                      ))}
                    </div>
                  )}
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
              {pedido.consultor && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Consultor</span>
                  <span className="font-medium text-gray-700">{pedido.consultor}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Entrega</span>
                <span className="font-medium">{format(new Date(pedido.dataEntrega), 'dd/MM/yyyy')}</span>
              </div>
              {pedido.vetorizacao?.necessaria && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Vetorização</span>
                  <span className="font-medium text-nice-700">R$ {pedido.vetorizacao.valor.toFixed(2)}</span>
                </div>
              )}
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

    {/* Layout de impressão */}
    <div className="hidden print:block text-black">
      {pedido.pecas.map((p, i) => {
        const cc = COMPLEXIDADE_CONFIG[p.complexidade]
        const statusPersonalizacao = combinarStatus([
          pedido.progresso.estamparia_silk,
          pedido.progresso.prensa_dtf,
          pedido.progresso.prensa_sublimacao,
        ])
        const setoresLinha: { label: string; status: StatusSetor }[] = [
          { label: 'Matéria Prima', status: pedido.progresso.compra },
          { label: 'Corte', status: pedido.progresso.corte },
          { label: 'Personalização', status: statusPersonalizacao },
          { label: 'Costura', status: pedido.progresso.costura },
          { label: 'Acabamento', status: pedido.progresso.acabamento },
          { label: 'Loja', status: 'pendente' },
        ]
        return (
          <div key={p.id} className="break-after-page">
            <PrintHeader pedido={pedido} />
            <ClienteTabela pedido={pedido} />

            <div className="mb-3">
              <h3 className="text-xs font-bold uppercase border-b border-black mb-1 pb-0.5">Matéria Prima</h3>
              <table className="w-full text-[11px] border border-black">
                <tbody>
                  <tr>
                    <td className="border border-black px-2 py-1 font-semibold w-1/4">Malha/Tecido</td>
                    <td className="border border-black px-2 py-1"></td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2 py-1 font-semibold">Aviamento</td>
                    <td className="border border-black px-2 py-1"></td>
                  </tr>
                  <tr>
                    <td className="border border-black px-2 py-1 font-semibold">Arte</td>
                    <td className="border border-black px-2 py-1">{p.observacoes || 'ARTE OK'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mb-3">
              <table className="w-full text-[10px] border border-black text-center">
                <thead>
                  <tr>
                    {setoresLinha.map(s => (
                      <th key={s.label} className="border border-black px-1 py-1 font-bold uppercase">{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {setoresLinha.map(s => (
                      <td key={s.label} className={clsx('border border-black px-1 py-1', s.status === 'concluido' && 'font-bold')}>
                        {STATUS_SETOR_LABEL[s.status]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mb-2">
              <h3 className="text-xs font-bold uppercase border-b border-black mb-2 pb-0.5">Dados do Pedido</h3>
              <div className="text-center font-bold text-sm mb-2">
                Peça {i + 1} — {p.tipo} {p.cor && `(${p.cor})`}
                <span className={clsx('ml-2 text-[10px] font-normal', cc.color)}>{cc.label}</span>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-32 h-32 border border-black flex items-center justify-center shrink-0 overflow-hidden">
                  {p.fotos && p.fotos.length > 0 ? (
                    <img src={p.fotos[0]} alt={`Foto da peça ${i + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] text-gray-400 text-center px-1">Sem foto</span>
                  )}
                </div>
                <table className="flex-1 text-[11px] border border-black">
                  <thead>
                    <tr>
                      <th className="border border-black px-2 py-1">Tamanho</th>
                      <th className="border border-black px-2 py-1">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.tamanhos.map((t, ti) => (
                      <tr key={ti}>
                        <td className="border border-black px-2 py-1 text-center">
                          {t.tamanho === 'SOB_MEDIDA' ? (t.medidaEspecial || 'Sob Medida') : t.tamanho}
                        </td>
                        <td className="border border-black px-2 py-1 text-center">{t.quantidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.observacoes && (
                <p className="text-[11px] mt-2"><span className="font-semibold">Descrição:</span> {p.observacoes}</p>
              )}
              {p.personalizacoes.length > 0 && (
                <p className="text-[11px] mt-1">
                  <span className="font-semibold">Personalizações:</span>{' '}
                  {p.personalizacoes.map(personalizacaoLabel).join(', ')}
                  {p.corPersonalizacao && ` — Cor: ${p.corPersonalizacao}`}
                </p>
              )}
            </div>
          </div>
        )
      })}

      {/* Página final: resumo e pagamento */}
      <div>
        <PrintHeader pedido={pedido} />
        <ClienteTabela pedido={pedido} resumida />

        <div className="mb-3">
          <h3 className="text-xs font-bold uppercase border-b border-black mb-1 pb-0.5">Dados do Pedido</h3>
          <table className="w-full text-[11px] border border-black">
            <thead>
              <tr>
                <th className="border border-black px-2 py-1">Modelo</th>
                <th className="border border-black px-2 py-1">Grade de Tamanho</th>
                <th className="border border-black px-2 py-1">Qtd. Total</th>
                <th className="border border-black px-2 py-1">Valor Unitário</th>
                <th className="border border-black px-2 py-1">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {pedido.pecas.map((p, i) => {
                const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
                const valorUnit = p.valorUnitario ?? 0
                return (
                  <tr key={p.id}>
                    <td className="border border-black px-2 py-1">{p.tipo}</td>
                    <td className="border border-black px-2 py-1">{gradeTamanhos(p)}</td>
                    <td className="border border-black px-2 py-1 text-center">{qtd}</td>
                    <td className="border border-black px-2 py-1 text-right">R$ {valorUnit.toFixed(2)}</td>
                    <td className="border border-black px-2 py-1 text-right">R$ {(valorUnit * qtd).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase border-b border-black mb-1 pb-0.5">Pagamento</h3>
          <table className="w-full text-[11px] border border-black mb-2">
            <tbody>
              <tr>
                <td className="border border-black px-2 py-1 font-semibold w-1/4">Valor Total do Pedido</td>
                <td className="border border-black px-2 py-1" colSpan={3}>R$ {pedido.valorTotal.toFixed(2)}</td>
              </tr>
              {pedido.vetorizacao?.necessaria && (
                <tr>
                  <td className="border border-black px-2 py-1 font-semibold">Vetorização</td>
                  <td className="border border-black px-2 py-1" colSpan={3}>R$ {pedido.vetorizacao.valor.toFixed(2)}</td>
                </tr>
              )}
              <tr>
                <td className="border border-black px-2 py-1 font-semibold">Forma de Pagamento</td>
                <td className="border border-black px-2 py-1" colSpan={3}></td>
              </tr>
            </tbody>
          </table>

          {pedido.parcelas.length > 0 && (
            <table className="w-full text-[11px] border border-black mb-2">
              <thead>
                <tr>
                  <th className="border border-black px-2 py-1">Descrição</th>
                  <th className="border border-black px-2 py-1">Valor</th>
                  <th className="border border-black px-2 py-1">Data Prevista</th>
                  <th className="border border-black px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {pedido.parcelas.map((parc, pi) => (
                  <tr key={parc.id}>
                    <td className="border border-black px-2 py-1">{parc.descricao || `Parcela ${pi + 1}`}</td>
                    <td className="border border-black px-2 py-1 text-right">R$ {(parc.valor || 0).toFixed(2)}</td>
                    <td className="border border-black px-2 py-1 text-center">
                      {parc.dataPrevista ? format(new Date(parc.dataPrevista + 'T00:00:00'), 'dd/MM/yy') : ''}
                    </td>
                    <td className="border border-black px-2 py-1 text-center font-semibold">
                      {parc.pago ? 'Pago' : 'Pendente'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {pedido.observacoes && (
            <div className="text-[11px] mt-2">
              <span className="font-semibold">Observações gerais:</span> {pedido.observacoes}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
