'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  ArrowLeft, Printer, ChevronRight, CheckCircle2, Circle, Loader2,
  Pencil, PlusCircle, Trash2, X, Save
} from 'lucide-react'
import { getPedidoById, atualizarPedido } from '@/lib/store'
import {
  STATUS_CONFIG, COMPLEXIDADE_CONFIG, SETOR_LABELS, totalPecas,
  CATALOGO, PERSONALIZACOES, TAMANHOS, calcularComplexidade, formatarTelefone
} from '@/lib/helpers'
import { Pedido, StatusPedido, StatusSetor, ProgressoSetor, Peca, TamanhoQuantidade, Personalizacao, TipoPedido } from '@/types'
import FotoUpload from '@/components/FotoUpload'
import clsx from 'clsx'
import Link from 'next/link'

const STATUS_LIST: StatusPedido[] = ['orcamento', 'aprovado', 'em_producao', 'finalizado', 'entregue', 'cancelado']

type ClienteEdit = Pedido['cliente']

function novaEditPeca(): Peca {
  return {
    id: crypto.randomUUID(),
    categoria: 'Empresarial',
    tipo: 'Camiseta PV',
    cor: '',
    tamanhos: [{ tamanho: 'M', quantidade: 1 }],
    personalizacoes: [],
    complexidade: 'P1',
    observacoes: '',
    fotos: [],
  }
}

export default function DetalhePedidoPage() {
  const { id } = useParams()
  const router = useRouter()
  const [pedido, setPedido] = useState<Pedido | null>(null)

  // Edit mode state
  const [editando, setEditando] = useState(false)
  const [editCliente, setEditCliente] = useState<ClienteEdit>({
    nome: '', empresa: '', telefone: '', email: '', responsavel: '', endereco: '', documento: '',
  })
  const [editPecas, setEditPecas] = useState<Peca[]>([])
  const [editTipo, setEditTipo] = useState<TipoPedido>('normal')
  const [editDataEntrega, setEditDataEntrega] = useState('')
  const [editValorTotal, setEditValorTotal] = useState('')
  const [editValorPago, setEditValorPago] = useState('')
  const [editObs, setEditObs] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  const carregar = async () => {
    const p = await getPedidoById(id as string)
    if (!p) router.push('/pedidos')
    else setPedido(p)
  }

  useEffect(() => { carregar() }, [id])

  if (!pedido) return <div className="text-gray-400 text-sm">Carregando...</div>

  const sc = STATUS_CONFIG[pedido.status]

  function iniciarEdicao() {
    setEditCliente({ ...pedido!.cliente })
    setEditPecas(pedido!.pecas.map(p => ({
      ...p,
      tamanhos: [...p.tamanhos],
      fotos: [...(p.fotos || [])],
    })))
    setEditTipo(pedido!.tipo)
    setEditDataEntrega(pedido!.dataEntrega)
    setEditValorTotal(pedido!.valorTotal > 0 ? pedido!.valorTotal.toString() : '')
    setEditValorPago(pedido!.valorPago > 0 ? pedido!.valorPago.toString() : '')
    setEditObs(pedido!.observacoes)
    setEditando(true)
  }

  async function salvarEdicao() {
    setSalvandoEdicao(true)
    try {
      await atualizarPedido(pedido!.id, {
        cliente: editCliente,
        pecas: editPecas,
        tipo: editTipo,
        dataEntrega: editDataEntrega,
        valorTotal: parseFloat(editValorTotal) || 0,
        valorPago: parseFloat(editValorPago) || 0,
        observacoes: editObs,
      })
      setEditando(false)
      await carregar()
    } catch {
      alert('Erro ao salvar alterações. Tente novamente.')
      setSalvandoEdicao(false)
    }
  }

  async function mudarStatus(status: StatusPedido) {
    if (status === 'em_producao' && (pedido.valorPago ?? 0) <= 0) {
      alert('Registre um valor pago antes de enviar para produção.')
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

  const setorIcone = (s: StatusSetor) => {
    if (s === 'concluido') return <CheckCircle2 className="w-4 h-4 text-nice-500" />
    if (s === 'em_andamento') return <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
    return <Circle className="w-4 h-4 text-gray-300" />
  }

  // Edit mode piece helpers
  function updateEditPeca(pecaId: string, campo: Partial<Peca>) {
    setEditPecas(prev => prev.map(p => {
      if (p.id !== pecaId) return p
      const updated = { ...p, ...campo }
      updated.complexidade = calcularComplexidade(updated.tipo, updated.personalizacoes)
      return updated
    }))
  }

  function addEditTamanho(pecaId: string) {
    setEditPecas(prev => prev.map(p => p.id === pecaId
      ? { ...p, tamanhos: [...p.tamanhos, { tamanho: 'G', quantidade: 1 }] }
      : p))
  }

  function updateEditTamanho(pecaId: string, idx: number, campo: Partial<TamanhoQuantidade>) {
    setEditPecas(prev => prev.map(p => {
      if (p.id !== pecaId) return p
      const tamanhos = p.tamanhos.map((t, i) => i === idx ? { ...t, ...campo } : t)
      return { ...p, tamanhos }
    }))
  }

  function removeEditTamanho(pecaId: string, idx: number) {
    setEditPecas(prev => prev.map(p => p.id === pecaId
      ? { ...p, tamanhos: p.tamanhos.filter((_, i) => i !== idx) }
      : p))
  }

  function toggleEditPersonalizacao(pecaId: string, val: Personalizacao) {
    setEditPecas(prev => prev.map(p => {
      if (p.id !== pecaId) return p
      const personalizacoes = p.personalizacoes.includes(val)
        ? p.personalizacoes.filter(x => x !== val)
        : [...p.personalizacoes, val]
      return { ...p, personalizacoes, complexidade: calcularComplexidade(p.tipo, personalizacoes) }
    }))
  }

  const editTotalUnidades = editPecas.reduce((acc, p) => acc + p.tamanhos.reduce((a, t) => a + t.quantidade, 0), 0)

  // ─── MODO EDIÇÃO ───────────────────────────────────────────────────────────
  if (editando) {
    return (
      <div className="max-w-4xl space-y-6">
        {/* Header edição */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setEditando(false)} className="btn-ghost px-2">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-nice-800">Editando #{pedido.numero}</h1>
              <p className="text-xs text-gray-400 mt-0.5">Salve para confirmar as alterações</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditando(false)} className="btn-secondary">
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button onClick={salvarEdicao} disabled={salvandoEdicao} className="btn-primary">
              <Save className="w-4 h-4" /> {salvandoEdicao ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            {/* Cliente */}
            <div className="card space-y-4">
              <h2 className="font-semibold text-nice-800 text-base">Dados do Cliente</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
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
                    onChange={e => setEditCliente(c => ({ ...c, telefone: formatarTelefone(e.target.value) }))} />
                </div>
                <div>
                  <label className="label">CNPJ / CPF</label>
                  <input className="input" value={editCliente.documento}
                    onChange={e => setEditCliente(c => ({ ...c, documento: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="label">E-mail</label>
                  <input className="input" type="email" value={editCliente.email}
                    onChange={e => setEditCliente(c => ({ ...c, email: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="label">Endereço</label>
                  <input className="input" value={editCliente.endereco}
                    onChange={e => setEditCliente(c => ({ ...c, endereco: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Config pedido */}
            <div className="card space-y-4">
              <h2 className="font-semibold text-nice-800 text-base">Configurações do Pedido</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Tipo</label>
                  <div className="flex gap-2">
                    {([['normal', 'Normal'], ['urgente', 'Urgente'], ['grande_volume', 'Grande Volume']] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setEditTipo(v)}
                        className={clsx('flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors',
                          editTipo === v ? 'bg-nice-500 text-white border-nice-500' : 'bg-white border-gray-200 text-gray-600 hover:border-nice-300')}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Data de Entrega</label>
                  <input className="input" type="date" value={editDataEntrega}
                    onChange={e => setEditDataEntrega(e.target.value)} />
                </div>
                <div>
                  <label className="label">Valor Total (R$)</label>
                  <input className="input" type="number" placeholder="0,00" value={editValorTotal}
                    onChange={e => setEditValorTotal(e.target.value)} />
                </div>
                <div>
                  <label className="label">Valor Pago (R$)</label>
                  <input className="input" type="number" placeholder="0,00" value={editValorPago}
                    onChange={e => setEditValorPago(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Observações</label>
                <textarea className="input resize-none" rows={3} value={editObs}
                  onChange={e => setEditObs(e.target.value)} />
              </div>
            </div>

            {/* Peças edição */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-nice-800 text-base">Peças</h2>
                <button type="button" onClick={() => setEditPecas(p => [...p, novaEditPeca()])} className="btn-secondary text-sm">
                  <PlusCircle className="w-4 h-4" /> Adicionar Peça
                </button>
              </div>

              {editPecas.map((peca, pi) => {
                const cc = COMPLEXIDADE_CONFIG[peca.complexidade]
                return (
                  <div key={peca.id} className="card border-l-4 border-l-nice-400 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-nice-700">Peça {pi + 1}</span>
                        <span className={clsx('badge text-xs', cc.bg, cc.color)}>{cc.label}</span>
                      </div>
                      {editPecas.length > 1 && (
                        <button type="button"
                          onClick={() => setEditPecas(p => p.filter(x => x.id !== peca.id))}
                          className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Categoria</label>
                        <select className="input" value={peca.categoria}
                          onChange={e => {
                            const cat = e.target.value
                            const tipo = Object.entries(CATALOGO).find(([k]) => k === cat)?.[1][0] || ''
                            updateEditPeca(peca.id, { categoria: cat, tipo })
                          }}>
                          {Object.keys(CATALOGO).map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Tipo de Peça</label>
                        <select className="input" value={peca.tipo}
                          onChange={e => updateEditPeca(peca.id, { tipo: e.target.value })}>
                          {(CATALOGO[peca.categoria as keyof typeof CATALOGO] || []).map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Cor</label>
                        <input className="input" placeholder="Ex: branca..." value={peca.cor}
                          onChange={e => updateEditPeca(peca.id, { cor: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Personalizações</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {PERSONALIZACOES.map(({ value, label }) => (
                            <button key={value} type="button"
                              onClick={() => toggleEditPersonalizacao(peca.id, value)}
                              className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                                peca.personalizacoes.includes(value)
                                  ? 'bg-nice-500 text-white border-nice-500'
                                  : 'bg-white border-gray-200 text-gray-600 hover:border-nice-300')}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="label">Tamanhos e Quantidades</label>
                      <div className="space-y-2">
                        {peca.tamanhos.map((t, ti) => (
                          <div key={ti} className="flex items-center gap-2">
                            <select className="input w-28" value={t.tamanho}
                              onChange={e => updateEditTamanho(peca.id, ti, { tamanho: e.target.value as any })}>
                              {TAMANHOS.map(s => <option key={s}>{s}</option>)}
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
                        ))}
                        <button type="button" onClick={() => addEditTamanho(peca.id)}
                          className="text-nice-600 text-xs font-medium hover:underline flex items-center gap-1 mt-1">
                          <PlusCircle className="w-3.5 h-3.5" /> Adicionar tamanho
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="label">Observações da peça</label>
                      <input className="input" value={peca.observacoes}
                        onChange={e => updateEditPeca(peca.id, { observacoes: e.target.value })} />
                    </div>

                    <div>
                      <label className="label">Fotos da peça</label>
                      <FotoUpload
                        pecaId={peca.id}
                        fotos={peca.fotos}
                        onChange={fotos => updateEditPeca(peca.id, { fotos })}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Resumo lateral */}
          <div className="lg:col-span-1">
            <div className="card sticky top-8 space-y-4">
              <h2 className="font-semibold text-nice-800 text-base">Resumo</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total de peças</span>
                  <span className="font-semibold text-nice-700">{editTotalUnidades} un.</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tipos</span>
                  <span className="font-semibold">{editPecas.length}</span>
                </div>
              </div>
              <div className="border-t pt-3 space-y-1.5">
                {editPecas.map(p => {
                  const cc = COMPLEXIDADE_CONFIG[p.complexidade]
                  const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
                  return (
                    <div key={p.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={clsx('badge text-xs', cc.bg, cc.color)}>{p.complexidade}</span>
                        <span className="text-xs text-gray-600 truncate max-w-24">{p.tipo}</span>
                      </div>
                      <span className="text-xs text-gray-500">{qtd} un.</span>
                    </div>
                  )
                })}
              </div>
              <div className="border-t pt-3">
                <button onClick={salvarEdicao} disabled={salvandoEdicao} className="btn-primary w-full justify-center">
                  <Save className="w-4 h-4" /> {salvandoEdicao ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── MODO VISUALIZAÇÃO ─────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/pedidos" className="btn-ghost px-2">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-nice-800">Pedido #{pedido.numero}</h1>
              <span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span>
              {pedido.tipo === 'urgente' && <span className="badge bg-red-100 text-red-600">urgente</span>}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">Entrada: {format(new Date(pedido.dataEntrada), 'dd/MM/yyyy')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={iniciarEdicao} className="btn-secondary">
            <Pencil className="w-4 h-4" /> Editar Pedido
          </button>
          <button onClick={() => window.print()} className="btn-secondary print:hidden">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Cliente */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-nice-800">Cliente</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-400 text-xs">Nome</span>
                <p className="font-medium text-gray-800">{pedido.cliente.nome}</p>
              </div>
              {pedido.cliente.empresa && (
                <div>
                  <span className="text-gray-400 text-xs">Empresa</span>
                  <p className="font-medium text-gray-800">{pedido.cliente.empresa}</p>
                </div>
              )}
              {pedido.cliente.responsavel && (
                <div>
                  <span className="text-gray-400 text-xs">Responsável</span>
                  <p className="font-medium text-gray-800">{pedido.cliente.responsavel}</p>
                </div>
              )}
              {pedido.cliente.documento && (
                <div>
                  <span className="text-gray-400 text-xs">CNPJ / CPF</span>
                  <p className="font-medium text-gray-800">{pedido.cliente.documento}</p>
                </div>
              )}
              {pedido.cliente.telefone && (
                <div>
                  <span className="text-gray-400 text-xs">Telefone</span>
                  <p className="font-medium text-gray-800">{pedido.cliente.telefone}</p>
                </div>
              )}
              {pedido.cliente.email && (
                <div>
                  <span className="text-gray-400 text-xs">E-mail</span>
                  <p className="font-medium text-gray-800">{pedido.cliente.email}</p>
                </div>
              )}
              {pedido.cliente.endereco && (
                <div className="col-span-2">
                  <span className="text-gray-400 text-xs">Endereço</span>
                  <p className="font-medium text-gray-800">{pedido.cliente.endereco}</p>
                </div>
              )}
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
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.tamanhos.map((t, ti) => (
                      <span key={ti} className="px-2 py-0.5 bg-nice-50 text-nice-700 rounded-lg text-xs font-medium">
                        {t.tamanho}: {t.quantidade}
                      </span>
                    ))}
                  </div>
                  {p.observacoes && <p className="text-xs text-gray-500 italic">{p.observacoes}</p>}

                  {/* Fotos da peça */}
                  {p.fotos && p.fotos.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-2">Fotos</p>
                      <div className="flex flex-wrap gap-2">
                        {p.fotos.map((url, fi) => (
                          <a key={fi} href={url} target="_blank" rel="noreferrer">
                            <img
                              src={url}
                              alt={`Foto ${fi + 1}`}
                              className="w-20 h-20 object-cover rounded-xl border border-gray-200 hover:border-nice-400 transition-colors cursor-pointer"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Progresso setores */}
          <div className="card space-y-4 print:hidden">
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
                      <span className={clsx('font-medium',
                        status === 'concluido' ? 'text-nice-700' :
                        status === 'em_andamento' ? 'text-orange-600' : 'text-gray-500')}>
                        {SETOR_LABELS[setor]}
                      </span>
                    </div>
                    <span className={clsx('text-xs font-semibold capitalize',
                      status === 'concluido' ? 'text-nice-600' :
                      status === 'em_andamento' ? 'text-orange-500' : 'text-gray-400')}>
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
          <div className="card space-y-3 print:hidden">
            <h2 className="font-semibold text-nice-800 text-sm">Alterar Status</h2>
            <div className="space-y-1.5">
              {STATUS_LIST.map(s => {
                const c = STATUS_CONFIG[s]
                return (
                  <button key={s} onClick={() => mudarStatus(s)}
                    className={clsx('w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm border transition-all',
                      pedido.status === s
                        ? `${c.bg} ${c.color} border-current font-semibold`
                        : 'border-transparent hover:bg-gray-50 text-gray-600')}>
                    {c.label}
                    {pedido.status === s && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-orange-500">Produção exige valor pago registrado.</p>
          </div>

          {/* Datas e valor */}
          <div className="card space-y-3 text-sm">
            <h2 className="font-semibold text-nice-800">Informações</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Entrega</span>
                <span className="font-medium">{format(new Date(pedido.dataEntrega), 'dd/MM/yyyy')}</span>
              </div>
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
                  <span className="font-semibold text-orange-600">
                    R$ {(pedido.valorTotal - pedido.valorPago).toFixed(2)}
                  </span>
                </div>
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
