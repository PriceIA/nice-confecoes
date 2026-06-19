'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Trash2, Search, UserPlus } from 'lucide-react'
import { criarPedido, calcularDataEntrega, getClientes } from '@/lib/store'
import {
  CATALOGO, PERSONALIZACOES, TAMANHOS,
  calcularComplexidade, COMPLEXIDADE_CONFIG, formatarTelefone
} from '@/lib/helpers'
import { Cliente, Peca, TamanhoQuantidade, Personalizacao, TipoPedido } from '@/types'
import clsx from 'clsx'

function novaPeca(): Peca {
  return {
    id: crypto.randomUUID(),
    categoria: 'Empresarial',
    tipo: 'Camiseta PV',
    cor: '',
    tamanhos: [{ tamanho: 'M', quantidade: 1 }],
    personalizacoes: [],
    complexidade: 'P1',
    observacoes: '',
  }
}

export default function NovoPedidoPage() {
  const router = useRouter()

  const [cliente, setCliente] = useState({ nome: '', empresa: '', telefone: '', email: '' })
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [buscaCliente, setBuscaCliente] = useState('')
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState(false)
  const [tipo, setTipo] = useState<TipoPedido>('normal')
  const [dataEntrega, setDataEntrega] = useState(calcularDataEntrega(25))
  const [pecas, setPecas] = useState<Peca[]>([novaPeca()])
  const [obs, setObs] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [valorPago, setValorPago] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { (async () => setClientes(await getClientes()))() }, [])

  const sugestoes = useMemo(() => {
    const q = buscaCliente.trim().toLowerCase()
    if (!q) return []
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      c.empresa?.toLowerCase().includes(q) ||
      c.telefone?.includes(q)
    ).slice(0, 6)
  }, [buscaCliente, clientes])

  function selecionarCliente(c: Cliente) {
    setCliente({ nome: c.nome, empresa: c.empresa, telefone: c.telefone, email: c.email })
    setBuscaCliente(c.nome)
    setSugestoesAbertas(false)
    setClienteSelecionado(true)
  }

  function handleBuscaChange(valor: string) {
    setBuscaCliente(valor)
    setCliente(c => ({ ...c, nome: valor }))
    setSugestoesAbertas(true)
    setClienteSelecionado(false)
  }

  function updatePeca(id: string, campo: Partial<Peca>) {
    setPecas(prev => prev.map(p => {
      if (p.id !== id) return p
      const updated = { ...p, ...campo }
      updated.complexidade = calcularComplexidade(updated.tipo, updated.personalizacoes)
      return updated
    }))
  }

  function addTamanho(pecaId: string) {
    setPecas(prev => prev.map(p => p.id === pecaId
      ? { ...p, tamanhos: [...p.tamanhos, { tamanho: 'G', quantidade: 1 }] }
      : p))
  }

  function updateTamanho(pecaId: string, idx: number, campo: Partial<TamanhoQuantidade>) {
    setPecas(prev => prev.map(p => {
      if (p.id !== pecaId) return p
      const tamanhos = p.tamanhos.map((t, i) => i === idx ? { ...t, ...campo } : t)
      return { ...p, tamanhos }
    }))
  }

  function removeTamanho(pecaId: string, idx: number) {
    setPecas(prev => prev.map(p => p.id === pecaId
      ? { ...p, tamanhos: p.tamanhos.filter((_, i) => i !== idx) }
      : p))
  }

  function togglePersonalizacao(pecaId: string, val: Personalizacao) {
    setPecas(prev => prev.map(p => {
      if (p.id !== pecaId) return p
      const personalizacoes = p.personalizacoes.includes(val)
        ? p.personalizacoes.filter(x => x !== val)
        : [...p.personalizacoes, val]
      return { ...p, personalizacoes, complexidade: calcularComplexidade(p.tipo, personalizacoes) }
    }))
  }

  const totalUnidades = pecas.reduce((acc, p) => acc + p.tamanhos.reduce((a, t) => a + t.quantidade, 0), 0)

  async function handleSubmit() {
    if (!cliente.nome) return alert('Informe o nome do cliente.')
    setSaving(true)
    try {
      await criarPedido({
        cliente,
        tipo,
        status: 'orcamento',
        pecas,
        dataEntrega,
        observacoes: obs,
        valorTotal: parseFloat(valorTotal) || 0,
        valorPago: parseFloat(valorPago) || 0,
      })
      router.push('/pedidos')
    } catch {
      alert('Erro ao salvar o pedido. Tente novamente.')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-nice-800">Novo Pedido</h1>
        <p className="text-sm text-gray-500 mt-0.5">Preencha os dados do cliente e as peças do pedido</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário principal */}
        <div className="lg:col-span-2 space-y-6">

          {/* Dados do cliente */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-nice-800 text-base">Dados do Cliente</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 relative">
                <label className="label">Buscar Cliente *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="input pl-9" placeholder="Digite o nome para buscar ou cadastrar..."
                    value={buscaCliente}
                    onChange={e => handleBuscaChange(e.target.value)}
                    onFocus={() => setSugestoesAbertas(true)}
                    onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
                  />
                </div>
                {sugestoesAbertas && buscaCliente && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {sugestoes.length > 0 ? sugestoes.map(c => (
                      <button key={c.id} type="button" onClick={() => selecionarCliente(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-nice-50 transition-colors flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-gray-800">{c.nome}</div>
                          {c.empresa && <div className="text-xs text-gray-400">{c.empresa}</div>}
                        </div>
                        <span className="text-xs text-gray-400">{c.telefone}</span>
                      </button>
                    )) : (
                      <div className="px-4 py-2.5 text-xs text-gray-400 flex items-center gap-2">
                        <UserPlus className="w-3.5 h-3.5" /> Nenhum cliente encontrado — será cadastrado um novo
                      </div>
                    )}
                  </div>
                )}
                {clienteSelecionado && (
                  <p className="text-xs text-nice-600 mt-1.5">Cliente cadastrado selecionado.</p>
                )}
              </div>
              <div>
                <label className="label">Empresa</label>
                <input className="input" placeholder="Empresa ou equipe" value={cliente.empresa} onChange={e => setCliente(c => ({ ...c, empresa: e.target.value }))} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" placeholder="(44) 99999-0000" value={cliente.telefone}
                  onChange={e => setCliente(c => ({ ...c, telefone: formatarTelefone(e.target.value) }))} />
              </div>
              <div className="col-span-2">
                <label className="label">E-mail</label>
                <input className="input" type="email" placeholder="cliente@email.com" value={cliente.email} onChange={e => setCliente(c => ({ ...c, email: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Tipo e Data */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-nice-800 text-base">Configurações do Pedido</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Tipo</label>
                <div className="flex gap-2">
                  {([['normal', 'Normal'], ['urgente', 'Urgente'], ['grande_volume', 'Grande Volume']] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setTipo(v)}
                      className={clsx('flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors',
                        tipo === v ? 'bg-nice-500 text-white border-nice-500' : 'bg-white border-gray-200 text-gray-600 hover:border-nice-300')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Data de Entrega</label>
                <input className="input" type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Valor Total (R$)</label>
                <input className="input" type="number" placeholder="0,00" value={valorTotal} onChange={e => setValorTotal(e.target.value)} />
              </div>
              <div>
                <label className="label">Valor Pago (R$)</label>
                <input className="input" type="number" placeholder="0,00" value={valorPago} onChange={e => setValorPago(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Observações gerais</label>
              <textarea className="input resize-none" rows={3} placeholder="Observações sobre o pedido..." value={obs} onChange={e => setObs(e.target.value)} />
            </div>
          </div>

          {/* Peças */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-nice-800 text-base">Peças</h2>
              <button type="button" onClick={() => setPecas(p => [...p, novaPeca()])} className="btn-secondary text-sm">
                <PlusCircle className="w-4 h-4" /> Adicionar Peça
              </button>
            </div>

            {pecas.map((peca, pi) => {
              const cc = COMPLEXIDADE_CONFIG[peca.complexidade]
              return (
                <div key={peca.id} className="card border-l-4 border-l-nice-400 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-nice-700">Peça {pi + 1}</span>
                      <span className={clsx('badge text-xs', cc.bg, cc.color)}>{cc.label}</span>
                    </div>
                    {pecas.length > 1 && (
                      <button type="button" onClick={() => setPecas(p => p.filter(x => x.id !== peca.id))}
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
                          updatePeca(peca.id, { categoria: cat, tipo })
                        }}>
                        {Object.keys(CATALOGO).map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tipo de Peça</label>
                      <select className="input" value={peca.tipo} onChange={e => updatePeca(peca.id, { tipo: e.target.value })}>
                        {(CATALOGO[peca.categoria as keyof typeof CATALOGO] || []).map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Cor</label>
                      <input className="input" placeholder="Ex: branca, preta..." value={peca.cor} onChange={e => updatePeca(peca.id, { cor: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Personalizações</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {PERSONALIZACOES.map(({ value, label }) => (
                          <button key={value} type="button"
                            onClick={() => togglePersonalizacao(peca.id, value)}
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

                  {/* Tamanhos */}
                  <div>
                    <label className="label">Tamanhos e Quantidades</label>
                    <div className="space-y-2">
                      {peca.tamanhos.map((t, ti) => (
                        <div key={ti} className="flex items-center gap-2">
                          <select className="input w-28" value={t.tamanho}
                            onChange={e => updateTamanho(peca.id, ti, { tamanho: e.target.value as any })}>
                            {TAMANHOS.map(s => <option key={s}>{s}</option>)}
                          </select>
                          <input type="number" min={1} className="input w-24" value={t.quantidade}
                            onChange={e => updateTamanho(peca.id, ti, { quantidade: parseInt(e.target.value) || 1 })} />
                          <span className="text-xs text-gray-400">un.</span>
                          {peca.tamanhos.length > 1 && (
                            <button type="button" onClick={() => removeTamanho(peca.id, ti)}
                              className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addTamanho(peca.id)}
                        className="text-nice-600 text-xs font-medium hover:underline flex items-center gap-1 mt-1">
                        <PlusCircle className="w-3.5 h-3.5" /> Adicionar tamanho
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="label">Observações da peça</label>
                    <input className="input" placeholder="Ex: logotipo no peito esquerdo..." value={peca.observacoes}
                      onChange={e => updatePeca(peca.id, { observacoes: e.target.value })} />
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
                <span className="font-semibold text-nice-700">{totalUnidades} un.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tipos de peças</span>
                <span className="font-semibold">{pecas.length}</span>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Complexidades</p>
              <div className="space-y-1.5">
                {pecas.map((p, i) => {
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
            </div>

            <div className="border-t pt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tipo</span>
                <span className={clsx('font-medium', tipo === 'urgente' ? 'text-red-600' : 'text-gray-700')}>
                  {tipo === 'normal' ? 'Normal' : tipo === 'urgente' ? '🔴 Urgente' : 'Grande Volume'}
                </span>
              </div>
              {valorTotal && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Valor total</span>
                  <span className="font-semibold text-nice-700">R$ {parseFloat(valorTotal).toFixed(2)}</span>
                </div>
              )}
            </div>

            <button type="button" onClick={handleSubmit} disabled={saving} className="btn-primary w-full justify-center">
              {saving ? 'Salvando...' : 'Criar Pedido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
