'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Trash2, Search, UserPlus, Table2 } from 'lucide-react'
import { criarPedido, calcularDataEntrega, getClientes } from '@/lib/store'
import {
  CATALOGO, PERSONALIZACOES,
  calcularComplexidade, COMPLEXIDADE_CONFIG, formatarTelefone
} from '@/lib/helpers'
import { Cliente, Parcela, Peca, TamanhoQuantidade, Personalizacao, TipoPedido } from '@/types'
import {
  Estrutura, MapaPrecos, carregarPrecos, precosDaTabela, registrarProduto,
} from '@/lib/tabelasPreco'
import { FAIXAS, TABELA_PADRAO } from '@/lib/precosEscolar'
import FotoUpload from '@/components/FotoUpload'
import Modal from '@/components/kanban/Modal'
import { useMembro } from '@/components/AuthProvider'
import clsx from 'clsx'

type PersonItem = { value: string; label: string }

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

/**
 * Valores-sentinela dos <select>. Não são tamanho nem peça de verdade: existem
 * só para o "escolher" e o "digitar" caberem no mesmo controle.
 */
const OUTRO_TAMANHO = '__OUTRO_TAMANHO__'
const OUTRA_PECA = '__OUTRA_PECA__'

const TAMANHOS_CONHECIDOS: string[] = [...TAMANHOS_ADULTO, ...TAMANHOS_INFANTIL, 'SOB_MEDIDA']

/** Tamanho digitado à mão (não está na régua e não é Sob Medida). */
function ehTamanhoLivre(t: string): boolean {
  return t !== '' && !TAMANHOS_CONHECIDOS.includes(t)
}

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
    fotos: [],
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
  const { membro } = useMembro()

  const [cliente, setCliente] = useState({
    nome: '', empresa: '', telefone: '', email: '',
    responsavel: '', endereco: '', documento: '',
  })
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [buscaCliente, setBuscaCliente] = useState('')
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState(false)
  const [tipo, setTipo] = useState<TipoPedido>('normal')
  const [dataEntrega, setDataEntrega] = useState(calcularDataEntrega(25))
  const [pecas, setPecas] = useState<Peca[]>([novaPeca()])
  const [obs, setObs] = useState('')
  const [parcelas, setParcelas] = useState<Parcela[]>([novaParcela()])
  const [consultor, setConsultor] = useState(membro?.nome ?? '')
  const [consultorCustom, setConsultorCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const [catalogoEfetivo, setCatalogoEfetivo] = useState<Record<string, string[]>>(
    () => Object.fromEntries(Object.entries(CATALOGO).map(([k, v]) => [k, [...v]]))
  )
  const [personalizacoesEfetivas, setPersonalizacoesEfetivas] = useState<PersonItem[]>([...PERSONALIZACOES])
  // Preços de TODAS as tabelas ficam em memória; a tabela escolhida no pedido
  // é só um recorte (`precosDaTabela`). Assim trocar de tabela no seletor não
  // exige nova ida ao banco, e registrar uma peça atualiza tudo de uma vez.
  const [estruturaPrecos, setEstruturaPrecos] = useState<Estrutura>({})
  const [precosTodos, setPrecosTodos] = useState<MapaPrecos>({})
  const [tabelaSelecionada, setTabelaSelecionada] = useState<string>(TABELA_PADRAO)

  // Peça digitada à mão: o modal pergunta se é só para este pedido ou se entra
  // numa tabela de preço.
  const [pecaLivre, setPecaLivre] = useState<{ pecaId: string } | null>(null)
  const [nomePecaLivre, setNomePecaLivre] = useState('')
  const [registrarPeca, setRegistrarPeca] = useState(false)
  const [destinoTabela, setDestinoTabela] = useState('')
  const [destinoGrupo, setDestinoGrupo] = useState('')
  const [destinoGrupoNovo, setDestinoGrupoNovo] = useState('')
  const [precoInicial, setPrecoInicial] = useState('')
  const [erroPecaLivre, setErroPecaLivre] = useState<string | null>(null)
  const [salvandoPeca, setSalvandoPeca] = useState(false)
  const [parcelasEditadas, setParcelasEditadas] = useState(false)
  const [vetorizacao, setVetorizacao] = useState({ necessaria: false, valor: 50 })

  useEffect(() => {
    (async () => {
      setClientes(await getClientes())
      try {
        const r = await carregarPrecos()
        setEstruturaPrecos(r.estrutura)
        setPrecosTodos(r.precos)
        const nomes = Object.keys(r.estrutura)
        setTabelaSelecionada(nomes.includes(TABELA_PADRAO) ? TABELA_PADRAO : (nomes[0] ?? TABELA_PADRAO))
      } catch {
        // Sem preço carregado o pedido continua possível: o valor unitário de
        // cada peça é editável e o fallback por complexidade assume.
        setEstruturaPrecos({})
        setPrecosTodos({})
      }
    })()
    const savedCat = localStorage.getItem('nice_catalogo')
    if (savedCat) { try { setCatalogoEfetivo(JSON.parse(savedCat)) } catch {} }
    const savedPerson = localStorage.getItem('nice_personalizacoes')
    if (savedPerson) { try { setPersonalizacoesEfetivas(JSON.parse(savedPerson)) } catch {} }
  }, [])

  /** Preços da tabela escolhida, no formato produto -> faixa -> valor. */
  const tabelaPrecos = useMemo(
    () => precosDaTabela(precosTodos, tabelaSelecionada),
    [precosTodos, tabelaSelecionada],
  )

  /** Nomes das tabelas cadastradas, para o seletor do pedido. */
  const tabelasDisponiveis = useMemo(() => Object.keys(estruturaPrecos).sort(), [estruturaPrecos])

  useEffect(() => {
    if (Object.keys(tabelaPrecos).length === 0) return
    setPecas(prev => prev.map(p => {
      if (p.valorUnitario !== undefined) return p
      const faixa = p.tamanhos.length > 0 ? getFaixaTamanho(p.tamanhos[0].tamanho) : 'P/M/G'
      return { ...p, valorUnitario: tabelaPrecos[p.tipo]?.[faixa] ?? PRECO_FALLBACK[p.complexidade] ?? 30 }
    }))
  }, [tabelaPrecos])

  /**
   * Trocar a tabela do pedido reprecifica as peças — inclusive as que já
   * tinham valor.
   *
   * O effect acima só preenche peça SEM valor, de propósito (não sobrescreve
   * preço digitado à mão). Mas escolher outra tabela é dizer "estes valores
   * saíram da lista errada": deixar os antigos ali seria pior do que
   * recalcular. Quem digitou um valor especial redigita — e vê acontecer.
   */
  useEffect(() => {
    setPecas(prev => prev.map(p => {
      const faixa = p.tamanhos.length > 0 ? getFaixaTamanho(p.tamanhos[0].tamanho) : 'P/M/G'
      const daTabela = tabelaPrecos[p.tipo]?.[faixa]
      return daTabela === undefined ? p : { ...p, valorUnitario: daTabela }
    }))
    // Só quando a ESCOLHA muda; `tabelaPrecos` recalculado por outro motivo
    // (ex: peça registrada) não deve reescrever preço digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabelaSelecionada])

  useEffect(() => {
    if (parcelasEditadas) return
    const totalPecasVal = pecas.reduce((sum, peca) => {
      const qtd = peca.tamanhos.reduce((a, t) => a + t.quantidade, 0)
      return sum + (peca.valorUnitario ?? 0) * qtd
    }, 0)
    const total = totalPecasVal + (vetorizacao.necessaria ? vetorizacao.valor : 0)
    const entrada = Math.round(total * 0.5 * 100) / 100
    setParcelas(prev => {
      const [first, ...rest] = prev
      return [{ ...first, descricao: 'Entrada 50%', valor: entrada }, ...rest]
    })
  }, [pecas, parcelasEditadas, vetorizacao])

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
    setCliente({
      nome: c.nome,
      empresa: c.empresa,
      telefone: c.telefone,
      email: c.email,
      responsavel: c.responsavel ?? '',
      endereco: c.endereco ?? '',
      documento: c.documento ?? '',
    })
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
      if (('tipo' in campo || 'categoria' in campo) && !('valorUnitario' in campo)) {
        const faixa = updated.tamanhos.length > 0 ? getFaixaTamanho(updated.tamanhos[0].tamanho) : 'P/M/G'
        updated.valorUnitario = tabelaPrecos[updated.tipo]?.[faixa] ?? PRECO_FALLBACK[updated.complexidade] ?? 30
      }
      return updated
    }))
  }

  // --- Peça digitada à mão ---

  /**
   * Abre o modal quando o usuário escolhe "Outra peça" no seletor.
   *
   * O destino padrão é a tabela e o primeiro grupo já em uso no pedido: no
   * caso comum (peça escolar que faltava no catálogo) o Pedro só digita o nome
   * e confirma.
   */
  function abrirPecaLivre(pecaId: string) {
    const grupos = estruturaPrecos[tabelaSelecionada] ?? []
    setPecaLivre({ pecaId })
    setNomePecaLivre('')
    setRegistrarPeca(false)
    setDestinoTabela(tabelaSelecionada)
    setDestinoGrupo(grupos[0]?.grupo ?? '')
    setDestinoGrupoNovo('')
    setPrecoInicial('')
    setErroPecaLivre(null)
  }

  async function confirmarPecaLivre() {
    const nome = nomePecaLivre.trim()
    if (!nome) { setErroPecaLivre('Digite o nome da peça.'); return }
    const pecaId = pecaLivre!.pecaId

    if (!registrarPeca) {
      // Só neste pedido: `peca.tipo` é texto livre e sempre foi — nada a
      // gravar em lugar nenhum, a peça existe dentro do JSONB do pedido.
      updatePeca(pecaId, { tipo: nome })
      setPecaLivre(null)
      return
    }

    const grupo = (destinoGrupoNovo.trim() || destinoGrupo).trim()
    if (!destinoTabela) { setErroPecaLivre('Escolha em qual tabela a peça entra.'); return }
    if (!grupo) { setErroPecaLivre('Escolha o grupo, ou digite o nome de um grupo novo.'); return }

    // O preço informado vale para a faixa do PRIMEIRO tamanho da peça — é o
    // que o atendimento tem em mãos naquele momento. As outras faixas entram
    // como linha sem valor: a peça passa a existir na tabela e o Pedro completa
    // os preços depois em /tabela-precos.
    const pecaAtual = pecas.find(p => p.id === pecaId)
    const faixa = pecaAtual && pecaAtual.tamanhos.length > 0
      ? getFaixaTamanho(pecaAtual.tamanhos[0].tamanho)
      : 'P/M/G'
    const preco = parseFloat(precoInicial)
    const valores: Record<string, number | null> = {}
    for (const f of FAIXAS) valores[f] = null
    if (!isNaN(preco)) valores[faixa] = Math.round(preco * 100) / 100

    setSalvandoPeca(true)
    setErroPecaLivre(null)
    try {
      await registrarProduto(destinoTabela, grupo, nome, valores)
      const r = await carregarPrecos()
      setEstruturaPrecos(r.estrutura)
      setPrecosTodos(r.precos)
      updatePeca(pecaId, {
        tipo: nome,
        ...(isNaN(preco) ? {} : { valorUnitario: Math.round(preco * 100) / 100 }),
      })
      setPecaLivre(null)
    } catch {
      setErroPecaLivre('Não foi possível gravar a peça na tabela de preços. Você ainda pode usá-la só neste pedido.')
    } finally {
      setSalvandoPeca(false)
    }
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
  const totalGeral = totalPecas + (vetorizacao.necessaria ? vetorizacao.valor : 0)
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
        valorTotal: totalGeral,
        valorPago: totalPago,
        vetorizacao,
        tabelaPreco: tabelaSelecionada,
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
        <h1 className="text-2xl font-bold text-titulo">Novo Pedido</h1>
        <p className="text-sm text-suave mt-0.5">Preencha os dados do cliente e as peças do pedido</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Dados do cliente */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-titulo text-base">Dados do Cliente</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 relative">
                <label className="label">Buscar Cliente *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fraco" />
                  <input className="input pl-9" placeholder="Digite o nome para buscar ou cadastrar..."
                    value={buscaCliente}
                    onChange={e => handleBuscaChange(e.target.value)}
                    onFocus={() => setSugestoesAbertas(true)}
                    onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
                  />
                </div>
                {sugestoesAbertas && buscaCliente && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-superficie border border-borda rounded-xl shadow-lg overflow-hidden">
                    {sugestoes.length > 0 ? sugestoes.map(c => (
                      <button key={c.id} type="button" onClick={() => selecionarCliente(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-marca-suave transition-colors flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-conteudo">{c.nome}</div>
                          {c.empresa && (
                            <div className="text-xs text-fraco">
                              {c.empresa}{c.responsavel ? ` — ${c.responsavel}` : ''}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-fraco">{c.telefone}</span>
                      </button>
                    )) : (
                      <div className="px-4 py-2.5 text-xs text-fraco flex items-center gap-2">
                        <UserPlus className="w-3.5 h-3.5" /> Nenhum cliente encontrado — será cadastrado um novo
                      </div>
                    )}
                  </div>
                )}
                {clienteSelecionado && (
                  <p className="text-xs text-marca-texto mt-1.5">Cliente cadastrado selecionado.</p>
                )}
              </div>
              <div>
                <label className="label">Empresa</label>
                <input className="input" placeholder="Empresa ou equipe" value={cliente.empresa}
                  onChange={e => setCliente(c => ({ ...c, empresa: e.target.value }))} />
              </div>
              <div>
                <label className="label">Responsável</label>
                <input className="input" placeholder="Nome do responsável" value={cliente.responsavel}
                  onChange={e => setCliente(c => ({ ...c, responsavel: e.target.value }))} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" placeholder="(44) 99999-0000" value={cliente.telefone}
                  onChange={e => setCliente(c => ({ ...c, telefone: formatarTelefone(e.target.value) }))} />
              </div>
              <div>
                <label className="label">CNPJ / CPF</label>
                <input className="input" placeholder="CNPJ ou CPF" value={cliente.documento}
                  onChange={e => setCliente(c => ({ ...c, documento: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">E-mail</label>
                <input className="input" type="email" placeholder="cliente@email.com" value={cliente.email}
                  onChange={e => setCliente(c => ({ ...c, email: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Endereço</label>
                <input className="input" placeholder="Rua, número, bairro, cidade..." value={cliente.endereco}
                  onChange={e => setCliente(c => ({ ...c, endereco: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Tipo, Data e Consultor */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-titulo text-base">Configurações do Pedido</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Tipo</label>
                <div className="flex gap-2">
                  {([['normal', 'Normal'], ['urgente', 'Urgente'], ['grande_volume', 'Grande Volume']] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setTipo(v)}
                      className={clsx('flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors',
                        tipo === v ? 'bg-nice-500 text-white border-nice-500' : 'bg-superficie border-borda text-suave hover:border-nice-300')}>
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
                  {membro && <option value={membro.nome}>{membro.nome}</option>}
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
            {/* Qual lista de preços vale para ESTE pedido.

                A Nice tem várias tabelas escolares com as mesmas peças e
                valores diferentes conforme o grupo de escolas, então o cálculo
                automático precisa saber de qual lista ler. A escolha fica
                gravada no pedido (`tabela_preco`), senão reabrir o pedido
                depois não teria como saber de onde os valores saíram. */}
            {tabelasDisponiveis.length > 0 && (
              <div className="card flex flex-wrap items-end gap-3">
                <div className="min-w-56">
                  <label className="label flex items-center gap-1.5">
                    <Table2 className="w-3.5 h-3.5" /> Tabela de preço deste pedido
                  </label>
                  <select className="input" value={tabelaSelecionada}
                    onChange={e => setTabelaSelecionada(e.target.value)}>
                    {tabelasDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <p className="text-xs text-fraco flex-1 min-w-48 pb-2">
                  Trocar a tabela recalcula o valor unitário das peças que existem nela.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-titulo text-base">Peças</h2>
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
                      <span className="text-sm font-semibold text-marca-texto">Peça {pi + 1}</span>
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
                      {/* Três origens no mesmo seletor:
                          1. o catálogo local (/configuracoes, por categoria);
                          2. as peças com preço na tabela escolhida, agrupadas
                             pelo grupo delas — é lá que peça cadastrada nova
                             aparece;
                          3. "Outra peça", que abre o campo de digitação.
                          A peça atual entra explicitamente na lista: se veio de
                          digitação livre, ela não está em nenhuma das origens e
                          o <select> a descartaria em silêncio. */}
                      <select className="input" value={peca.tipo}
                        onChange={e => {
                          if (e.target.value === OUTRA_PECA) abrirPecaLivre(peca.id)
                          else updatePeca(peca.id, { tipo: e.target.value })
                        }}>
                        {peca.tipo && !(catalogoEfetivo[peca.categoria] || []).includes(peca.tipo)
                          && !(estruturaPrecos[tabelaSelecionada] ?? []).some(g => g.produtos.includes(peca.tipo)) && (
                          <option value={peca.tipo}>{peca.tipo} (só neste pedido)</option>
                        )}
                        <optgroup label={`Catálogo — ${peca.categoria}`}>
                          {(catalogoEfetivo[peca.categoria] || []).map(t => <option key={t} value={t}>{t}</option>)}
                        </optgroup>
                        {(estruturaPrecos[tabelaSelecionada] ?? []).map(g => {
                          const novos = g.produtos.filter(t => !(catalogoEfetivo[peca.categoria] || []).includes(t))
                          if (novos.length === 0) return null
                          return (
                            <optgroup key={g.grupo} label={`${tabelaSelecionada} — ${g.grupo}`}>
                              {novos.map(t => <option key={t} value={t}>{t}</option>)}
                            </optgroup>
                          )
                        })}
                        <option value={OUTRA_PECA}>+ Outra peça (digitar)…</option>
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
                                : 'bg-superficie border-borda text-suave hover:border-nice-300')}>
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
                      <p className="text-sm text-suave">
                        Subtotal:{' '}
                        <span className="font-semibold text-marca-texto">R$ {subtotalPeca.toFixed(2)}</span>
                        <span className="text-fraco ml-1">({qtdPeca} un.)</span>
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
                            <select className="input w-36"
                              value={ehTamanhoLivre(t.tamanho) ? OUTRO_TAMANHO : t.tamanho}
                              onChange={e => updateTamanho(peca.id, ti, {
                                // Escolher "Outro" limpa o campo para o usuário
                                // digitar; o input livre aparece logo abaixo.
                                tamanho: e.target.value === OUTRO_TAMANHO ? '' : e.target.value,
                                medidaEspecial: '',
                              })}>
                              <optgroup label="Adulto">
                                {TAMANHOS_ADULTO.map(s => <option key={s} value={s}>{s}</option>)}
                              </optgroup>
                              <optgroup label="Infantil">
                                {TAMANHOS_INFANTIL.map(s => <option key={s} value={s}>{s}</option>)}
                              </optgroup>
                              <option value="SOB_MEDIDA">Sob Medida</option>
                              <option value={OUTRO_TAMANHO}>Outro (digitar)…</option>
                            </select>
                            <input type="number" min={1} className="input w-24" value={t.quantidade}
                              onChange={e => updateTamanho(peca.id, ti, { quantidade: parseInt(e.target.value) || 1 })} />
                            <span className="text-xs text-fraco">un.</span>
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
                          {/* Tamanho fora da régua: baby look, EXG, numeração da
                              escola. Vale só neste pedido — sai impresso na
                              grade exatamente como foi digitado. */}
                          {(t.tamanho === '' || ehTamanhoLivre(t.tamanho)) && (
                            <input className="input text-sm" placeholder="Digite o tamanho (ex: BL P, EXG)"
                              value={t.tamanho}
                              onChange={e => updateTamanho(peca.id, ti, { tamanho: e.target.value })} />
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addTamanho(peca.id)}
                        className="text-marca-texto text-xs font-medium hover:underline flex items-center gap-1 mt-1">
                        <PlusCircle className="w-3.5 h-3.5" /> Adicionar tamanho
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="label">Observações da peça</label>
                    <input className="input" placeholder="Ex: logotipo no peito esquerdo..." value={peca.observacoes}
                      onChange={e => updatePeca(peca.id, { observacoes: e.target.value })} />
                  </div>

                  <div>
                    <label className="label">Arte da peça (imagem ou PDF)</label>
                    <FotoUpload
                      pecaId={peca.id}
                      fotos={peca.fotos}
                      onChange={fotos => updatePeca(peca.id, { fotos })}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagamentos / Parcelas */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-titulo text-base">Pagamentos</h2>
              <button type="button" onClick={addParcela} className="btn-secondary text-sm">
                <PlusCircle className="w-4 h-4" /> Adicionar parcela
              </button>
            </div>
            <div className="flex items-center gap-3 p-3 bg-superficie-2 rounded-xl">
              <input type="checkbox" id="vetorizacao" checked={vetorizacao.necessaria}
                onChange={e => setVetorizacao(v => ({ ...v, necessaria: e.target.checked }))}
                className="w-4 h-4 accent-nice-500 cursor-pointer" />
              <label htmlFor="vetorizacao" className="text-sm font-medium text-conteudo cursor-pointer flex-1">
                Vetorização necessária
              </label>
              {vetorizacao.necessaria && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-suave">R$</span>
                  <input type="number" min={0} step={0.01} className="input w-24 py-1 text-sm"
                    value={vetorizacao.valor}
                    onChange={e => setVetorizacao(v => ({ ...v, valor: parseFloat(e.target.value) || 0 }))} />
                </div>
              )}
            </div>

            <div className="space-y-3">
              {parcelas.map((parcela, pi) => (
                <div key={parcela.id} className="border border-borda rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-conteudo">Parcela {pi + 1}</span>
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
                      <label htmlFor={`pago-${parcela.id}`} className="text-sm text-conteudo cursor-pointer">Pago</label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-suave">Total</span>
                <span className="font-semibold text-marca-texto">R$ {totalParcelas.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-suave">Total pago</span>
                <span className="font-medium text-green-600">R$ {totalPago.toFixed(2)}</span>
              </div>
              {saldo > 0 && (
                <div className="flex justify-between">
                  <span className="text-suave">Saldo restante</span>
                  <span className="font-semibold text-orange-600">R$ {saldo.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resumo lateral */}
        <div className="lg:col-span-1">
          <div className="card sticky top-8 space-y-4">
            <h2 className="font-semibold text-titulo text-base">Resumo</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-suave">Total de peças</span>
                <span className="font-semibold text-marca-texto">{totalUnidades} un.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-suave">Tipos de peças</span>
                <span className="font-semibold">{pecas.length}</span>
              </div>
              {consultorFinal && (
                <div className="flex justify-between text-sm">
                  <span className="text-suave">Consultor</span>
                  <span className="font-semibold text-conteudo">{consultorFinal}</span>
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-xs text-suave font-medium uppercase tracking-wide mb-2">Peças</p>
              <div className="space-y-1.5">
                {pecas.map(p => {
                  const cc = COMPLEXIDADE_CONFIG[p.complexidade]
                  const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
                  const sub = (p.valorUnitario ?? 0) * qtd
                  return (
                    <div key={p.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={clsx('badge text-xs', cc.bg, cc.color)}>{p.complexidade}</span>
                        <span className="text-xs text-suave truncate max-w-20">{p.tipo}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-fraco">{qtd} un.</div>
                        {sub > 0 && <div className="text-xs font-semibold text-marca-texto">R$ {sub.toFixed(2)}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border-t pt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-suave">Tipo</span>
                <span className={clsx('font-medium', tipo === 'urgente' ? 'text-red-600' : 'text-conteudo')}>
                  {tipo === 'normal' ? 'Normal' : tipo === 'urgente' ? 'Urgente' : 'Grande Volume'}
                </span>
              </div>
              {totalGeral > 0 && (
                <>
                  {vetorizacao.necessaria && (
                    <div className="flex justify-between text-sm">
                      <span className="text-suave">Vetorização</span>
                      <span className="font-medium text-marca-texto">R$ {vetorizacao.valor.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-suave">Total</span>
                    <span className="font-semibold text-marca-texto">R$ {totalGeral.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-suave">Pago</span>
                    <span className="font-medium text-green-600">R$ {totalPago.toFixed(2)}</span>
                  </div>
                  {saldo > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-suave">Saldo</span>
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

      {/* Peça que não existe no catálogo.

          A pergunta central é a do Pedro: "é só deste pedido ou fica no
          sistema?". Só deste pedido não grava nada — `peca.tipo` sempre foi
          texto livre dentro do JSONB. Ficar no sistema significa entrar numa
          TABELA DE PREÇO (que tabela, que grupo), porque é lá que uma peça
          existe de verdade para o cálculo automático. */}
      <Modal
        aberto={pecaLivre !== null}
        titulo="Peça que não está no catálogo"
        onFechar={() => setPecaLivre(null)}
        rodape={
          <>
            <button onClick={() => setPecaLivre(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={confirmarPecaLivre} disabled={salvandoPeca} className="btn-primary flex-1 justify-center">
              {salvandoPeca ? 'Gravando...' : 'Confirmar'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nome da peça</label>
            <input className="input" autoFocus placeholder="Ex: Camiseta Dry Fit"
              value={nomePecaLivre} onChange={e => setNomePecaLivre(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-conteudo cursor-pointer">
              <input type="radio" className="mt-1" checked={!registrarPeca}
                onChange={() => setRegistrarPeca(false)} />
              <span>
                <strong>Usar só neste pedido</strong>
                <span className="block text-xs text-fraco">A peça não fica cadastrada. O valor unitário é o que você digitar na peça.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-conteudo cursor-pointer">
              <input type="radio" className="mt-1" checked={registrarPeca}
                onChange={() => setRegistrarPeca(true)} />
              <span>
                <strong>Registrar no sistema</strong>
                <span className="block text-xs text-fraco">A peça entra numa tabela de preço e passa a aparecer para todo mundo, em qualquer PC.</span>
              </span>
            </label>
          </div>

          {registrarPeca && (
            <div className="space-y-3 border-t border-borda pt-3">
              <div>
                <label className="label">Em qual tabela</label>
                <select className="input" value={destinoTabela}
                  onChange={e => {
                    setDestinoTabela(e.target.value)
                    setDestinoGrupo((estruturaPrecos[e.target.value] ?? [])[0]?.grupo ?? '')
                  }}>
                  {tabelasDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Em qual grupo</label>
                <select className="input" value={destinoGrupo}
                  onChange={e => { setDestinoGrupo(e.target.value); setDestinoGrupoNovo('') }}
                  disabled={destinoGrupoNovo.trim() !== ''}>
                  {(estruturaPrecos[destinoTabela] ?? []).map(g => (
                    <option key={g.grupo} value={g.grupo}>{g.grupo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">…ou um grupo novo</label>
                <input className="input" placeholder="Deixe em branco para usar o grupo acima"
                  value={destinoGrupoNovo} onChange={e => setDestinoGrupoNovo(e.target.value)} />
              </div>
              <div>
                <label className="label">Preço (opcional)</label>
                <input className="input" type="number" min={0} step={0.01} placeholder="Pode ficar em branco"
                  value={precoInicial} onChange={e => setPrecoInicial(e.target.value)} />
                <p className="text-xs text-fraco mt-1">
                  Vale para a faixa de tamanho da peça neste pedido. As outras faixas ficam em branco
                  e podem ser preenchidas depois em Tabelas de Preço.
                </p>
              </div>
            </div>
          )}

          {erroPecaLivre && <p className="text-sm text-red-600">{erroPecaLivre}</p>}
        </div>
      </Modal>
    </div>
  )
}
