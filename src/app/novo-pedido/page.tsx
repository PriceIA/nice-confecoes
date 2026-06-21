'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Trash2, Search, UserPlus } from 'lucide-react'
import { criarPedido, calcularDataEntrega, getClientes } from '@/lib/store'
import {
  CATALOGO, PERSONALIZACOES,
  calcularComplexidade, COMPLEXIDADE_CONFIG, formatarTelefone
} from '@/lib/helpers'
import { Cliente, Parcela, Peca, TamanhoQuantidade, Personalizacao, TipoPedido } from '@/types'
import { supabase } from '@/lib/supabase'

type PersonItem = { value: string; label: string }
import clsx from 'clsx'

const PRECO_FALLBACK: Record<string, number> = { P1: 30, P2: 45, P3: 65, P4: 90, P5: 120 }

function getFaixaTamanho(tamanho: string): string {
  if (['PP', 'P', 'M', 'G'].includes(tamanho)) return 'P/M/G'
  if (['GG', 'XGG'].includes(tamanho)) return 'GG'
  if (['01', '02'].includes(tamanho)) return '0-02'
  if (['04', '06'].includes(tamanho)) return '04-06'
  if (['08', '10'].includes(tamanho)) return '08-10'
  if (['12', '14'].includes(tamanho)) return '12-14'
  return 'P/M/G'
}

const TAMANHOS_ADULTO = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'UNICO'] as const
const TAMANHOS_INFANTIL = ['01', '02', '04', '06', '08', '10', '12', '14'] as const

function novaPeca(): Peca {
  return {
    id: crypto.randomUUID(),
    categoria: 'Empresarial',
    tipo: 'Camiseta PV',
    cor: '',
    tamanhos: [{ tamanho: 'M', quantidade: 1 }],
    personalizacoes: [],
    corPersonalizacao: '',
    complexidade: 'P1',
    observacoes: '',
  }
}

function novaParcela(): Parcela {
  return {
    id: crypto.randomUUID(),
    descricao: '',
    valor: 0,
    dataPrevista: '',
    pago: false,
  }
}

export default function NovoPedidoPage() {
  const router = useRouter()

  const [cliente, setCliente] = useState({ nome: '', empresa: '', telefone: '', email: '' })
  const [clienteResponsavel, setClienteResponsavel] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [buscaCliente, setBuscaCliente] = useState('')
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState(false)
  const [tipo, setTipo] = useState<TipoPedido>('normal')
  const [dataEntrega, setDataEntrega] = useState(calcularDataEntrega(25))
  const [pecas, setPecas] = useState<Peca[]>([novaPeca()])
  const [obs, setObs] = useState('')
  const [parcelas, setParcelas] = useState<Parcela[]>([novaParcela()])
  const [consultor, setConsultor] = useState('Pedro')
  const [consultorCustom, setConsultorCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const [catalogoEfetivo, setCatalogoEfetivo] = useState<Record<string, string[]>>(
    () => Object.fromEntries(Object.entries(CATALOGO).map(([k, v]) => [k, [...v]]))
  )
  const [personalizacoesEfetivas, setPersonalizacoesEfetivas] = useState<PersonItem[]>([...PERSONALIZACOES])
  const [tabelaPrecos, setTabelaPrecos] = useState<Record<string, Record<string, number>>>({})
  const [parcelasEditadas, setParcelasEditadas] = useState(false)

  useEffect(() => {
    (async () => {
      setClientes(await getClientes())
      const { data } = await supabase.from('tabela_precos').select('produto, faixa_tamanho, preco_unitario')
      if (data) {
        const tabela: Record<string, Record<string, number>> = {}
        for (const row of data) {
          if (!tabela[row.produto]) tabela[row.produto] = {}
          tabela[row.produto][row.faixa_tamanho] = row.preco_unitario
        }
        setTabelaPrecos(tabela)
      }
    })()
    const savedCat = localStorage.getItem('nice_catalogo')
    if (savedCat) { try { setCatalogoEfetivo(JSON.parse(savedCat)) } catch {} }
    const savedPerson = localStorage.getItem('nice_personalizacoes')
    if (savedPerson) { try { setPersonalizacoesEfetivas(JSON.parse(savedPerson)) } catch {} }
  }, [])

  useEffect(() => {
    if (Object.keys(tabelaPrecos).length === 0) return
    setPecas(prev => prev.map(p => {
      if (p.valorUnitario !== undefined) return p
      const faixa = p.tamanhos.length > 0 ? getFaixaTamanho(p.tamanhos[0].tamanho) : 'P/M/G'
      return { ...p, valorUnitario: tabelaPrecos[p.tipo]?.[faixa] ?? PRECO_FALLBACK[p.complexidade] ?? 30 }
    }))
  }, [tabelaPrecos])

  useEffect(() => {
    if (parcelasEditadas) return
    const total = pecas.reduce((sum, peca) => {
      const qtd = peca.tamanhos.reduce((a, t) => a + t.quantidade, 0)
      return sum + (peca.valorUnitario ?? 0) * qtd
    }, 0)
    const entrada = Math.round(total * 0.5 * 100) / 100
    setParcelas(prev => {
      const [first, ...rest] = prev
      return [{ ...first, descricao: 'Entrada 50%', valor: entrada }, ...rest]
    })
  }, [pecas, parcelasEditadas])

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
    setClienteResponsavel(c.responsavelEmpresa ?? '')
    setBuscaCliente(c.nome)
    setSugestoesAbertas(false)
    setClienteSelecionado(true)
  }

  function handleBuscaChange(valor: string) {
    setBuscaCliente(valor)
    setCliente(c => ({ ...c, nome: valor }))
    setSugestoesAbertas(true)
    setClienteSelecionado(false)
    setClienteResponsavel('')
  }

  function updatePeca(id: string, campo: Partial<Peca>) {
    setPecas(prev => prev.map(p => {
      if (p.id !== id) return p
      const updated = { ...p, ...campo }
      updated.complexidade = calcularComplexidade(updated.tipo, updated.personalizacoes)
      if (('tipo' in campo || 'categoria' in campo) && !('valorUnitario' in campo)) {
        const faixa = updated.tamanhos.length > 0 ? getFaixaTamanho(updated.tamanhos[0].tamanho) : 'P/M/G'
        updated.valorUnitario = tabelaPrecos[updated.tipo]?.[faixa] ?? PRECO_FALLBACK[updated.complexidade] ?? 30
      }
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

  function togglePersonalizacao(pecaId: string, val: string) {
    setPecas(prev => prev.map(p => {
      if (p.id !== pecaId) return p
      const v = val as Personalizacao
      const personalizacoes = p.personalizacoes.includes(v)
        ? p.personalizacoes.filter(x => x !== v)
        : [...p.personalizacoes, v]
      return { ...p, personalizacoes, complexidade: calcularComplexidade(p.tipo, personalizacoes) }
    }))
  }

  function addParcela() {
    setParcelas(prev => [...prev, novaParcela()])
  }

  function updateParcela(id: string, campo: Partial<Parcela>) {
    setParcelasEditadas(true)
    setParcelas(prev => prev.map(p => p.id === id ? { ...p, ...campo } : p))
  }

  function removeParcela(id: string) {
    setParcelas(prev => prev.filter(p => p.id !== id))
  }

  const totalUnidades = pecas.reduce((acc, p) => acc + p.tamanhos.reduce((a, t) => a + t.quantidade, 0), 0)
  const totalPecas = pecas.reduce((sum, p) => {
    const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
    return sum + (p.valorUnitario ?? 0) * qtd
  }, 0)
  const totalParcelas = parcelas.reduce((a, p) => a + (p.valor || 0), 0)
  const totalPago = parcelas.filter(p => p.pago).reduce((a, p) => a + (p.valor || 0), 0)
  const saldo = totalParcelas - totalPago
  const consultorFinal = consultor === 'Outro' ? consultorCustom : consultor

  async function handleSubmit() {
    if (!cliente.nome) return alert('Informe o nome do cliente.')
    setSaving(true)
    try {
      await criarPedido({
        cliente,
        consultor: consultorFinal,
        tipo,
        status: 'orcamento',
        pecas,
        parcelas,
        dataEntrega,
        observacoes: obs,
        valorTotal: totalPecas,
        valorPago: totalPago,
      })
      router.push('/pedidos')
    } catch (error) {
      console.error('Erro detalhado:', JSON.stringify(error, null, 2))
      console.error('Erro raw:', error)
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
                          {c.empresa && (
                            <div className="text-xs text-gray-400">
                              {c.empresa}{c.responsavelEmpresa ? ` — ${c.responsavelEmpresa}` : ''}
                            </div>
                          )}
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
                <input className="input" placeholder="Empresa ou equipe" value={cliente.empresa}
                  onChange={e => setCliente(c => ({ ...c, empresa: e.target.value }))} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" placeholder="(44) 99999-0000" value={cliente.telefone}
                  onChange={e => setCliente(c => ({ ...c, telefone: formatarTelefone(e.target.value) }))} />
              </div>
              <div className="col-span-2">
                <label className="label">E-mail</label>
                <input className="input" type="email" placeholder="cliente@email.com" value={cliente.email}
                  onChange={e => setCliente(c => ({ ...c, email: e.target.value }))} />
              </div>
              {clienteSelecionado && clienteResponsavel && (
                <div className="col-span-2">
                  <label className="label">Responsável da Empresa</label>
                  <p className="text-sm text-gray-700 font-medium">{clienteResponsavel}</p>
                </div>
              )}
            </div>
          </div>

          {/* Tipo, Data e Consultor */}
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
                <label className="label">Consultor Responsável</label>
                <select className="input" value={consultor} onChange={e => setConsultor(e.target.value)}>
                  <option value="Pedro">Pedro</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              {consultor === 'Outro' && (
                <div>
                  <label className="label">Nome do Consultor</label>
                  <input className="input" placeholder="Digite o nome..." value={consultorCustom}
                    onChange={e => setConsultorCustom(e.target.value)} />
                </div>
              )}
            </div>
            <div>
              <label className="label">Observações gerais</label>
              <textarea className="input resize-none" rows={3} placeholder="Observações sobre o pedido..."
                value={obs} onChange={e => setObs(e.target.value)} />
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
              const qtdPeca = peca.tamanhos.reduce((a, t) => a + t.quantidade, 0)
              const subtotalPeca = (peca.valorUnitario ?? 0) * qtdPeca
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
                          const t = catalogoEfetivo[cat]?.[0] || ''
                          updatePeca(peca.id, { categoria: cat, tipo: t })
                        }}>
                        {Object.keys(catalogoEfetivo).map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Tipo de Peça</label>
                      <select className="input" value={peca.tipo}
                        onChange={e => updatePeca(peca.id, { tipo: e.target.value })}>
                        {(catalogoEfetivo[peca.categoria] || []).map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Cor</label>
                      <input className="input" placeholder="Ex: branca, preta..." value={peca.cor}
                        onChange={e => updatePeca(peca.id, { cor: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Personalizações</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {personalizacoesEfetivas.map(({ value, label }) => (
                          <button key={value} type="button"
                            onClick={() => togglePersonalizacao(peca.id, value)}
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
                          <input className="input" placeholder="Ex: preto, branco, dourado..."
                            value={peca.corPersonalizacao ?? ''}
                            onChange={e => updatePeca(peca.id, { corPersonalizacao: e.target.value })} />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="label">Valor unitário (R$)</label>
                      <input className="input" type="number" min={0} step={0.01} placeholder="0,00"
                        value={peca.valorUnitario ?? ''}
                        onChange={e => updatePeca(peca.id, { valorUnitario: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="flex items-end pb-1">
                      <p className="text-sm text-gray-500">
                        Subtotal:{' '}
                        <span className="font-semibold text-nice-700">R$ {subtotalPeca.toFixed(2)}</span>
                        <span className="text-gray-400 ml-1">({qtdPeca} un.)</span>
                      </p>
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
                              onChange={e => updateTamanho(peca.id, ti, { tamanho: e.target.value as any, medidaEspecial: '' })}>
                              <optgroup label="Adulto">
                                {TAMANHOS_ADULTO.map(s => <option key={s} value={s}>{s}</option>)}
                              </optgroup>
                              <optgroup label="Infantil">
                                {TAMANHOS_INFANTIL.map(s => <option key={s} value={s}>{s}</option>)}
                              </optgroup>
                              <option value="SOB_MEDIDA">Sob Medida</option>
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
                          {t.tamanho === 'SOB_MEDIDA' && (
                            <input className="input text-sm" placeholder="Descreva as medidas específicas..."
                              value={t.medidaEspecial ?? ''}
                              onChange={e => updateTamanho(peca.id, ti, { medidaEspecial: e.target.value })} />
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

          {/* Pagamentos / Parcelas */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-nice-800 text-base">Pagamentos</h2>
              <button type="button" onClick={addParcela} className="btn-secondary text-sm">
                <PlusCircle className="w-4 h-4" /> Adicionar parcela
              </button>
            </div>
            <div className="space-y-3">
              {parcelas.map((parcela, pi) => (
                <div key={parcela.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Parcela {pi + 1}</span>
                    {parcelas.length > 1 && (
                      <button type="button" onClick={() => removeParcela(parcela.id)}
                        className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="label">Descrição</label>
                      <input className="input" placeholder="Ex: Entrada 50%" value={parcela.descricao}
                        onChange={e => updateParcela(parcela.id, { descricao: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Valor (R$)</label>
                      <input className="input" type="number" min={0} step={0.01} placeholder="0,00"
                        value={parcela.valor || ''}
                        onChange={e => updateParcela(parcela.id, { valor: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <label className="label">Data prevista</label>
                      <input className="input" type="date" value={parcela.dataPrevista}
                        onChange={e => updateParcela(parcela.id, { dataPrevista: e.target.value })} />
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <input type="checkbox" id={`pago-${parcela.id}`} checked={parcela.pago}
                        onChange={e => updateParcela(parcela.id, { pago: e.target.checked })}
                        className="w-4 h-4 accent-nice-500" />
                      <label htmlFor={`pago-${parcela.id}`} className="text-sm text-gray-700 cursor-pointer">Pago</label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Total</span>
                <span className="font-semibold text-nice-700">R$ {totalParcelas.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total pago</span>
                <span className="font-medium text-green-600">R$ {totalPago.toFixed(2)}</span>
              </div>
              {saldo > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Saldo restante</span>
                  <span className="font-semibold text-orange-600">R$ {saldo.toFixed(2)}</span>
                </div>
              )}
            </div>
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
              {consultorFinal && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Consultor</span>
                  <span className="font-semibold text-gray-700">{consultorFinal}</span>
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Peças</p>
              <div className="space-y-1.5">
                {pecas.map(p => {
                  const cc = COMPLEXIDADE_CONFIG[p.complexidade]
                  const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
                  const sub = (p.valorUnitario ?? 0) * qtd
                  return (
                    <div key={p.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={clsx('badge text-xs', cc.bg, cc.color)}>{p.complexidade}</span>
                        <span className="text-xs text-gray-600 truncate max-w-20">{p.tipo}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">{qtd} un.</div>
                        {sub > 0 && <div className="text-xs font-semibold text-nice-700">R$ {sub.toFixed(2)}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border-t pt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tipo</span>
                <span className={clsx('font-medium', tipo === 'urgente' ? 'text-red-600' : 'text-gray-700')}>
                  {tipo === 'normal' ? 'Normal' : tipo === 'urgente' ? 'Urgente' : 'Grande Volume'}
                </span>
              </div>
              {totalPecas > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total</span>
                    <span className="font-semibold text-nice-700">R$ {totalPecas.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pago</span>
                    <span className="font-medium text-green-600">R$ {totalPago.toFixed(2)}</span>
                  </div>
                  {saldo > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Saldo</span>
                      <span className="font-semibold text-orange-600">R$ {saldo.toFixed(2)}</span>
                    </div>
                  )}
                </>
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
