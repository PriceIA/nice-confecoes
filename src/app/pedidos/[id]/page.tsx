'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ArrowLeft, Printer, ChevronRight, Pencil, Save, X, PlusCircle, Trash2 } from 'lucide-react'
import { getPedidoById, atualizarPedido } from '@/lib/store'
import { carregarEtapas, etapasDoPedido } from '@/lib/etapas'
import { STATUS_CONFIG, COMPLEXIDADE_CONFIG, SETOR_LABELS, PERSONALIZACOES, totalPecas, CATALOGO, calcularComplexidade } from '@/lib/helpers'
import { Pedido, Peca, Parcela, ExcecaoPagamento, StatusPedido, StatusSetor, EtapaProducao, Personalizacao, TamanhoQuantidade, TipoPedido } from '@/types'
import FotoUpload from '@/components/FotoUpload'
import MiniaturaArquivo from '@/components/MiniaturaArquivo'
import { primeiraImagem, contarPdfs } from '@/lib/arquivos'
import {
  decidir, excecaoPendente, liberacaoDireta,
  motivoBloqueio, novaSolicitacao, podeIrParaProducao,
} from '@/lib/excecaoPagamento'
import CriarCartaoDoPedido from '@/components/kanban/CriarCartaoDoPedido'
import ModalProntoParaEnvio from '@/components/producao/ModalProntoParaEnvio'
import FluxoEtapas from '@/components/producao/FluxoEtapas'
import Modal from '@/components/kanban/Modal'
import { pedidoConcluido } from '@/lib/kanban-ui'
import { useMembro } from '@/components/AuthProvider'
import clsx from 'clsx'
import Link from 'next/link'

const STATUS_LIST: StatusPedido[] = ['orcamento', 'aprovado', 'aguardando_pagamento', 'em_producao', 'finalizado', 'entregue', 'cancelado']

// '—' pra não aplicável: a ficha impressa não pode dizer "pendente" de um
// setor que o pedido nunca vai passar (docs/fase-c0.md, seção 5, item 5).
const STATUS_SETOR_LABEL: Record<StatusSetor, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
  nao_se_aplica: '—',
}

const TAMANHOS_ADULTO = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'UNICO'] as const
const TAMANHOS_INFANTIL = ['01', '02', '04', '06', '08', '10', '12', '14'] as const

/** Sentinela do <select>: "quero digitar". Não é um tamanho. */
const OUTRO_TAMANHO = '__OUTRO_TAMANHO__'
const TAMANHOS_CONHECIDOS: string[] = [...TAMANHOS_ADULTO, ...TAMANHOS_INFANTIL, 'SOB_MEDIDA']

/** Tamanho digitado à mão (fora da régua e diferente de Sob Medida). */
function ehTamanhoLivre(t: string): boolean {
  return t !== '' && !TAMANHOS_CONHECIDOS.includes(t)
}

/**
 * Combina os 3 setores de personalização (silk/DTF/sublimação) numa linha só
 * da ficha impressa. "Não se aplica" sai da conta: só quando os TRÊS não se
 * aplicam a linha some como "—"; se pelo menos um foi concluído, a
 * personalização conta como feita — a peça pode ter passado só por um deles.
 */
function combinarStatus(estados: StatusSetor[]): StatusSetor {
  const relevantes = estados.filter(s => s !== 'nao_se_aplica')
  if (relevantes.length === 0) return 'nao_se_aplica'
  if (relevantes.every(s => s === 'concluido')) return 'concluido'
  if (relevantes.some(s => s === 'em_andamento' || s === 'concluido')) return 'em_andamento'
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
        <div className="text-[10px] text-suave mt-1">Pedido #{pedido.numero}</div>
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
  const { membro, permissoes } = useMembro()
  const [pedido, setPedido] = useState<Pedido | null>(null)

  const [editando, setEditando] = useState(false)
  const [editPecas, setEditPecas] = useState<Peca[]>([])
  const [editCliente, setEditCliente] = useState({
    nome: '', empresa: '', telefone: '', email: '',
    responsavel: '', endereco: '', documento: '',
  })
  // Campos do PEDIDO em si (não do cliente, não das peças). Antes, o modo de
  // edição só alcançava cliente + peças: mudar data de entrega, observação,
  // tipo, consultor ou parcela exigia refazer o pedido. Agora tudo que o
  // gestor/recepcionista pode mudar está aqui.
  const [editDados, setEditDados] = useState({
    dataEntrega: '',
    dataEntrada: '',
    tipo: 'normal' as TipoPedido,
    consultor: '',
    observacoes: '',
    valorPago: 0,
  })
  const [editParcelas, setEditParcelas] = useState<Parcela[]>([])
  const [editVetorizacao, setEditVetorizacao] = useState({ necessaria: false, valor: 0 })
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [etapas, setEtapas] = useState<EtapaProducao[]>([])
  const [catalogoSemente, setCatalogoSemente] = useState(true)

  // Exceção "pagar na retirada": o modal serve para pedir (recepcionista),
  // liberar direto (gestor) e recusar (gestor com observação).
  const [modalExcecao, setModalExcecao] = useState<'solicitar' | 'liberar' | 'recusar' | null>(null)
  const [motivoExcecao, setMotivoExcecao] = useState('')
  const [erroExcecao, setErroExcecao] = useState<string | null>(null)
  const [salvandoExcecao, setSalvandoExcecao] = useState(false)

  const carregar = async () => {
    const [p, catalogo] = await Promise.all([
      getPedidoById(id as string),
      carregarEtapas(),
    ])
    setEtapas(catalogo.etapas)
    setCatalogoSemente(catalogo.semente)
    if (!p) router.push('/pedidos')
    else setPedido(p)
  }

  useEffect(() => { carregar() }, [id])

  if (!pedido) return <div className="text-fraco text-sm">Carregando...</div>

  const sc = STATUS_CONFIG[pedido.status]

  function iniciarEdicao() {
    setEditPecas(pedido!.pecas.map(p => ({ ...p, fotos: [...(p.fotos ?? [])] })))
    setEditCliente({ ...pedido!.cliente })
    setEditDados({
      // `data_entrega` é `date` no banco e `data_entrada` é `timestamptz`;
      // <input type="date"> só aceita 'AAAA-MM-DD', daí o corte no 'T'.
      dataEntrega: (pedido!.dataEntrega ?? '').split('T')[0],
      dataEntrada: (pedido!.dataEntrada ?? '').split('T')[0],
      tipo: pedido!.tipo,
      consultor: pedido!.consultor ?? '',
      observacoes: pedido!.observacoes ?? '',
      valorPago: pedido!.valorPago ?? 0,
    })
    setEditParcelas(pedido!.parcelas.map(p => ({ ...p })))
    setEditVetorizacao({
      necessaria: pedido!.vetorizacao?.necessaria ?? false,
      valor: pedido!.vetorizacao?.valor ?? 50,
    })
    setErroSalvar(null)
    setEditando(true)
  }

  function cancelarEdicao() {
    setEditando(false)
  }

  /** Soma das peças + vetorização. Só vale quando NÃO há parcelas (regra 4). */
  function totalDasPecas(): number {
    const pecas = editPecas.reduce((sum, p) => {
      const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
      return sum + (p.valorUnitario ?? 0) * qtd
    }, 0)
    return pecas + (editVetorizacao.necessaria ? editVetorizacao.valor : 0)
  }

  async function salvarEdicao() {
    if (!editDados.dataEntrega) {
      setErroSalvar('Informe a data de entrega antes de salvar.')
      return
    }
    setSalvando(true)
    setErroSalvar(null)
    try {
      const temParcelas = editParcelas.length > 0
      await atualizarPedido(pedido!.id, {
        pecas: editPecas,
        cliente: editCliente,
        dataEntrega: editDados.dataEntrega,
        dataEntrada: editDados.dataEntrada || undefined,
        tipo: editDados.tipo,
        consultor: editDados.consultor,
        observacoes: editDados.observacoes,
        vetorizacao: editVetorizacao,
        parcelas: editParcelas,
        // Regra 4: havendo parcelas, elas mandam no total e no pago, e enviar
        // esses dois campos junto só criaria conflito. Sem parcelas, o total
        // vem das peças e o pago é digitado à mão.
        ...(temParcelas ? {} : { valorTotal: totalDasPecas(), valorPago: editDados.valorPago }),
      })
      setEditando(false)
      carregar()
    } catch {
      setErroSalvar('Não foi possível salvar. Verifique a conexão e tente de novo — nada foi alterado.')
    } finally {
      setSalvando(false)
    }
  }

  // --- Parcelas dentro do modo de edição ---

  function addEditParcela() {
    setEditParcelas(prev => [...prev, {
      id: crypto.randomUUID(),
      descricao: `Parcela ${prev.length + 1}`,
      valor: 0,
      dataPrevista: editDados.dataEntrega || new Date().toISOString().split('T')[0],
      pago: false,
    }])
  }

  function updateEditParcela(pid: string, campo: Partial<Parcela>) {
    setEditParcelas(prev => prev.map(p => {
      if (p.id !== pid) return p
      const atualizada = { ...p, ...campo }
      // Marcar como paga carimba a data; desmarcar apaga, senão fica um
      // pagamento fantasma com data de quando alguém errou o clique.
      if (campo.pago === true && !atualizada.dataPagamento) {
        atualizada.dataPagamento = new Date().toISOString().split('T')[0]
      }
      if (campo.pago === false) atualizada.dataPagamento = undefined
      return atualizada
    }))
  }

  function removeEditParcela(pid: string) {
    setEditParcelas(prev => prev.filter(p => p.id !== pid))
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
    // Regra 1 do CLAUDE.md, agora com a exceção "pagar na retirada". A decisão
    // inteira vive em @/lib/excecaoPagamento — aqui só se pergunta.
    if (status === 'em_producao' && !podeIrParaProducao(pedido!)) {
      alert(motivoBloqueio(pedido!))
      return
    }
    await atualizarPedido(pedido!.id, { status })
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

  // --- Exceção "pagar na retirada" ---

  function abrirExcecao(tipo: 'solicitar' | 'liberar' | 'recusar') {
    setMotivoExcecao('')
    setErroExcecao(null)
    setModalExcecao(tipo)
  }

  async function gravarExcecao(nova: ExcecaoPagamento) {
    setSalvandoExcecao(true)
    setErroExcecao(null)
    try {
      await atualizarPedido(pedido!.id, { excecaoPagamento: nova })
      setModalExcecao(null)
      await carregar()
    } catch {
      // O trigger do banco (migration 013) recusa aprovação de quem não é
      // gestor. Se a tela deixou passar, a mensagem tem que dizer isso.
      setErroExcecao('Não foi possível gravar. Se você não é o gestor, a aprovação é recusada pelo próprio banco — peça ao gestor.')
    } finally {
      setSalvandoExcecao(false)
    }
  }

  function confirmarExcecao() {
    const quem = membro?.nome ?? 'desconhecido'
    const motivo = motivoExcecao.trim()

    if (modalExcecao === 'recusar') {
      // Recusar não exige motivo novo — a observação é opcional e o motivo
      // original de quem pediu continua registrado.
      gravarExcecao(decidir(pedido!.excecaoPagamento!, false, quem, motivo))
      return
    }

    if (!motivo) {
      setErroExcecao('Escreva o motivo — é o que fica registrado no pedido e o que o gestor lê para decidir.')
      return
    }
    if (modalExcecao === 'liberar') gravarExcecao(liberacaoDireta(quem, motivo))
    else gravarExcecao(novaSolicitacao(quem, motivo))
  }

  async function aprovarExcecao() {
    await gravarExcecao(decidir(pedido!.excecaoPagamento!, true, membro?.nome ?? 'desconhecido'))
  }


  // "Segunda porta": quem pulou o modal (ou o Acabamento já estava concluído
  // antes desta fase) ainda precisa de um jeito de abri-lo depois.
  const podeLiberarEnvio = pedido.progresso?.acabamento?.status === 'concluido' &&
    Object.keys(pedido.progresso).some(s =>
      s !== 'acabamento' &&
      (pedido.progresso[s]?.status === 'pendente' || pedido.progresso[s]?.status === 'em_andamento'))

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
              <h1 className="text-2xl font-bold text-titulo">Pedido #{pedido.numero}</h1>
              <span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span>
              {pedido.tipo === 'urgente' && <span className="badge bg-red-100 text-red-600">urgente</span>}
            </div>
            <p className="text-sm text-fraco mt-0.5">Entrada: {format(new Date(pedido.dataEntrada), 'dd/MM/yyyy')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editando && permissoes.editarPedido && (
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
            <h2 className="font-semibold text-titulo text-base flex items-center gap-2">
              <Pencil className="w-4 h-4 text-nice-500" /> Editando Pedido
            </h2>
            <button onClick={cancelarEdicao} className="text-fraco hover:text-suave p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Edit: Cliente */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-fraco uppercase tracking-wide border-b pb-1">Dados do Cliente</h3>
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

          {/* Edit: Dados do pedido.

              Estes campos não existiam no modo de edição — só cliente e peças
              eram editáveis, então corrigir uma data de entrega ou uma
              observação obrigava a refazer o pedido. Todos passam por
              `atualizarPedido`, que já sabia gravá-los; faltava a tela. */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-fraco uppercase tracking-wide border-b pb-1">Dados do Pedido</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Data de entrada</label>
                <input className="input" type="date" value={editDados.dataEntrada}
                  onChange={e => setEditDados(v => ({ ...v, dataEntrada: e.target.value }))} />
              </div>
              <div>
                <label className="label">Data de entrega *</label>
                <input className="input" type="date" value={editDados.dataEntrega}
                  onChange={e => setEditDados(v => ({ ...v, dataEntrega: e.target.value }))} />
              </div>
              <div>
                <label className="label">Consultor</label>
                <input className="input" value={editDados.consultor}
                  onChange={e => setEditDados(v => ({ ...v, consultor: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tipo do pedido</label>
                <select className="input" value={editDados.tipo}
                  onChange={e => setEditDados(v => ({ ...v, tipo: e.target.value as TipoPedido }))}>
                  <option value="normal">Normal</option>
                  <option value="urgente">Urgente</option>
                  <option value="grande_volume">Grande Volume</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Observações gerais</label>
                <textarea className="input min-h-[72px]" value={editDados.observacoes}
                  onChange={e => setEditDados(v => ({ ...v, observacoes: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Edit: Financeiro. Guardado por `verFinanceiro` pelo mesmo motivo
              do modo leitura — quem não pode ver dinheiro também não edita.
              Hoje só gestor e recepcionista chegam aqui (são os únicos com
              `editarPedido`), mas a checagem fica explícita para não depender
              de as duas flags andarem sempre juntas. */}
          {permissoes.verFinanceiro && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-fraco uppercase tracking-wide border-b pb-1">Pagamento</h3>

              <label className="flex items-center gap-2 text-sm text-conteudo">
                <input type="checkbox" checked={editVetorizacao.necessaria}
                  onChange={e => setEditVetorizacao(v => ({ ...v, necessaria: e.target.checked }))} />
                Cobrar vetorização
              </label>
              {editVetorizacao.necessaria && (
                <div className="w-40">
                  <label className="label">Valor da vetorização (R$)</label>
                  <input className="input" type="number" min={0} step={0.01} value={editVetorizacao.valor}
                    onChange={e => setEditVetorizacao(v => ({ ...v, valor: parseFloat(e.target.value) || 0 }))} />
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-semibold text-fraco uppercase tracking-wide">Parcelas</span>
                <button type="button" onClick={addEditParcela} className="btn-ghost text-xs">
                  <PlusCircle className="w-4 h-4" /> Adicionar parcela
                </button>
              </div>

              {editParcelas.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-fraco">
                    Sem parcelas: o total vem da soma das peças (R$ {totalDasPecas().toFixed(2)}) e o valor pago é digitado abaixo.
                  </p>
                  <div className="w-40">
                    <label className="label">Valor pago (R$)</label>
                    <input className="input" type="number" min={0} step={0.01} value={editDados.valorPago}
                      onChange={e => setEditDados(v => ({ ...v, valorPago: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {editParcelas.map((parc, idx) => (
                    <div key={parc.id} className="grid grid-cols-12 gap-2 items-end border border-borda rounded-xl p-3">
                      <div className="col-span-4">
                        <label className="label">Descrição</label>
                        <input className="input" value={parc.descricao}
                          onChange={e => updateEditParcela(parc.id, { descricao: e.target.value })} />
                      </div>
                      <div className="col-span-3">
                        <label className="label">Valor (R$)</label>
                        <input className="input" type="number" min={0} step={0.01} value={parc.valor}
                          onChange={e => updateEditParcela(parc.id, { valor: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="col-span-3">
                        <label className="label">Vencimento</label>
                        <input className="input" type="date" value={(parc.dataPrevista ?? '').split('T')[0]}
                          onChange={e => updateEditParcela(parc.id, { dataPrevista: e.target.value })} />
                      </div>
                      <div className="col-span-2 flex items-center justify-between pb-2">
                        <label className="flex items-center gap-1.5 text-xs text-suave">
                          <input type="checkbox" checked={parc.pago}
                            onChange={e => updateEditParcela(parc.id, { pago: e.target.checked })} />
                          Paga
                        </label>
                        <button type="button" onClick={() => removeEditParcela(parc.id)}
                          className="text-red-400 hover:text-red-600" title={`Remover ${parc.descricao || `parcela ${idx + 1}`}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-fraco">
                    Havendo parcelas, elas são a fonte da verdade: total R$ {editParcelas.reduce((a, p) => a + (p.valor || 0), 0).toFixed(2)}
                    {' · '}pago R$ {editParcelas.filter(p => p.pago).reduce((a, p) => a + (p.valor || 0), 0).toFixed(2)}.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Edit: Peças */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-fraco uppercase tracking-wide border-b pb-1">Peças</h3>
            {editPecas.map((peca, pi) => {
              const cc = COMPLEXIDADE_CONFIG[peca.complexidade]
              const catalogoKeys = Object.keys(CATALOGO)
              return (
                <div key={peca.id} className="border border-borda rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-conteudo">Peça {pi + 1}</span>
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
                      {/* Peça criada por digitação livre no /novo-pedido não
                          está no CATALOGO. Sem esta opção explícita o <select>
                          descartaria o valor em silêncio e a peça viraria a
                          primeira da lista ao salvar. */}
                      <select className="input" value={peca.tipo}
                        onChange={e => updateEditPeca(peca.id, { tipo: e.target.value })}>
                        {peca.tipo && !((CATALOGO as any)[peca.categoria] || []).includes(peca.tipo) && (
                          <option value={peca.tipo}>{peca.tipo}</option>
                        )}
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
                                : 'bg-superficie border-borda text-suave hover:border-nice-300')}>
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
                            <select className="input w-36"
                              value={ehTamanhoLivre(t.tamanho) ? OUTRO_TAMANHO : t.tamanho}
                              onChange={e => updateEditTamanho(peca.id, ti, {
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
                              onChange={e => updateEditTamanho(peca.id, ti, { quantidade: parseInt(e.target.value) || 1 })} />
                            <span className="text-xs text-fraco">un.</span>
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
                          {(t.tamanho === '' || ehTamanhoLivre(t.tamanho)) && (
                            <input className="input text-sm" placeholder="Digite o tamanho (ex: BL P, EXG)"
                              value={t.tamanho}
                              onChange={e => updateEditTamanho(peca.id, ti, { tamanho: e.target.value })} />
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addEditTamanho(peca.id)}
                        className="text-marca-texto text-xs font-medium hover:underline flex items-center gap-1 mt-1">
                        <PlusCircle className="w-3.5 h-3.5" /> Adicionar tamanho
                      </button>
                    </div>
                  </div>

                  {/* Arte da peça: imagem ou PDF */}
                  <div>
                    <label className="label">Arte (imagem ou PDF)</label>
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

          {erroSalvar && (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-xl px-3 py-2">{erroSalvar}</p>
          )}

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
            <h2 className="font-semibold text-titulo">Cliente</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-fraco text-xs">Nome</span><p className="font-medium text-conteudo">{pedido.cliente.nome}</p></div>
              {pedido.cliente.empresa && <div><span className="text-fraco text-xs">Empresa</span><p className="font-medium text-conteudo">{pedido.cliente.empresa}</p></div>}
              {pedido.cliente.responsavel && <div><span className="text-fraco text-xs">Responsável</span><p className="font-medium text-conteudo">{pedido.cliente.responsavel}</p></div>}
              {pedido.cliente.telefone && <div><span className="text-fraco text-xs">Telefone</span><p className="font-medium text-conteudo">{pedido.cliente.telefone}</p></div>}
              {pedido.cliente.email && <div><span className="text-fraco text-xs">E-mail</span><p className="font-medium text-conteudo">{pedido.cliente.email}</p></div>}
              {pedido.cliente.documento && <div><span className="text-fraco text-xs">CNPJ/CPF</span><p className="font-medium text-conteudo">{pedido.cliente.documento}</p></div>}
              {pedido.cliente.endereco && <div className="col-span-2"><span className="text-fraco text-xs">Endereço</span><p className="font-medium text-conteudo">{pedido.cliente.endereco}</p></div>}
            </div>
          </div>

          {/* Peças */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-titulo">Peças ({totalPecas(pedido)} un.)</h2>
            </div>
            {pedido.pecas.map((p, i) => {
              const cc = COMPLEXIDADE_CONFIG[p.complexidade]
              const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
              return (
                <div key={p.id} className="border border-borda rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-conteudo">Peça {i + 1} — {p.tipo}</span>
                      <span className={clsx('badge', cc.bg, cc.color)}>{cc.label}</span>
                    </div>
                    <span className="text-sm text-suave font-medium">{qtd} un.</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-suave">
                    {p.cor && <div><span className="font-medium text-fraco">Cor:</span> {p.cor}</div>}
                    {p.personalizacoes.length > 0 && (
                      <div className="col-span-2">
                        <span className="font-medium text-fraco">Person.:</span> {p.personalizacoes.join(', ')}
                        {p.corPersonalizacao && <span className="ml-1 text-suave">({p.corPersonalizacao})</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.tamanhos.map((t, ti) => (
                      <span key={ti} className="px-2 py-0.5 bg-marca-suave text-marca-texto rounded-lg text-xs font-medium">
                        {t.tamanho === 'SOB_MEDIDA'
                          ? `Sob Medida${t.medidaEspecial ? ': ' + t.medidaEspecial : ''}`
                          : t.tamanho
                        }: {t.quantidade}
                      </span>
                    ))}
                  </div>
                  {p.observacoes && <p className="text-xs text-suave italic">{p.observacoes}</p>}
                  {p.fotos && p.fotos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {p.fotos.map((url, fi) => (
                        <MiniaturaArquivo key={fi} url={url} indice={fi}
                          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagar na retirada.

              Só aparece para quem pode ver dinheiro — é uma condição comercial,
              não informação de produção. O estado da liberação fica visível o
              tempo todo (inclusive depois de aprovada), porque é o registro de
              que a regra 1 foi contornada com autorização, e por quem. */}
          {permissoes.verFinanceiro && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-titulo">Pagar na retirada</h2>
                {pedido.excecaoPagamento && (
                  <span className={clsx('badge',
                    pedido.excecaoPagamento.status === 'aprovada' ? 'bg-green-100 text-green-800'
                      : pedido.excecaoPagamento.status === 'pendente' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700')}>
                    {pedido.excecaoPagamento.status === 'aprovada' ? 'Liberado'
                      : pedido.excecaoPagamento.status === 'pendente' ? 'Aguardando aprovação' : 'Recusado'}
                  </span>
                )}
              </div>

              {!pedido.excecaoPagamento && (
                <p className="text-sm text-suave">
                  Sem liberação. Este pedido só vai para produção com pagamento registrado.
                </p>
              )}

              {pedido.excecaoPagamento && (
                <div className="text-sm space-y-1">
                  <p className="text-conteudo"><span className="text-fraco">Motivo: </span>{pedido.excecaoPagamento.motivo}</p>
                  <p className="text-xs text-fraco">
                    Solicitado por {pedido.excecaoPagamento.solicitadoPor} em{' '}
                    {format(new Date(pedido.excecaoPagamento.solicitadoEm), 'dd/MM/yyyy HH:mm')}
                  </p>
                  {pedido.excecaoPagamento.decididoPor && pedido.excecaoPagamento.decididoEm && (
                    <p className="text-xs text-fraco">
                      {pedido.excecaoPagamento.status === 'aprovada' ? 'Aprovado' : 'Recusado'} por{' '}
                      {pedido.excecaoPagamento.decididoPor} em{' '}
                      {format(new Date(pedido.excecaoPagamento.decididoEm), 'dd/MM/yyyy HH:mm')}
                    </p>
                  )}
                  {pedido.excecaoPagamento.decisaoObservacao && (
                    <p className="text-xs text-suave italic">"{pedido.excecaoPagamento.decisaoObservacao}"</p>
                  )}
                </div>
              )}

              {/* Fila de decisão do gestor. A recepcionista vê o pedido dela
                  aqui, mas sem botão — a decisão não é dela. */}
              {excecaoPendente(pedido) && permissoes.aprovarExcecaoPagamento && (
                <div className="flex gap-2 pt-1">
                  <button onClick={aprovarExcecao} disabled={salvandoExcecao} className="btn-primary text-sm">
                    Aprovar
                  </button>
                  <button onClick={() => abrirExcecao('recusar')} disabled={salvandoExcecao} className="btn-secondary text-sm">
                    Recusar
                  </button>
                </div>
              )}

              {excecaoPendente(pedido) && !permissoes.aprovarExcecaoPagamento && (
                <p className="text-xs text-yellow-700">
                  Aguardando o gestor. O pedido não avança para produção até ele aprovar.
                </p>
              )}

              {!pedido.excecaoPagamento && permissoes.aprovarExcecaoPagamento && (
                <button onClick={() => abrirExcecao('liberar')} className="btn-secondary text-sm">
                  Liberar pagamento na retirada
                </button>
              )}

              {!pedido.excecaoPagamento && !permissoes.aprovarExcecaoPagamento && permissoes.solicitarExcecaoPagamento && (
                <button onClick={() => abrirExcecao('solicitar')} className="btn-secondary text-sm">
                  Solicitar liberação ao gestor
                </button>
              )}

              {pedido.excecaoPagamento?.status === 'recusada' && permissoes.solicitarExcecaoPagamento && (
                <button onClick={() => abrirExcecao(permissoes.aprovarExcecaoPagamento ? 'liberar' : 'solicitar')}
                  className="btn-ghost text-sm">
                  Pedir de novo
                </button>
              )}
            </div>
          )}

          {/* Parcelas — some inteira para quem não pode ver dinheiro. Esconder
              só os valores deixaria vazar quantas parcelas existem e quais já
              foram pagas, que também é informação financeira. */}
          {permissoes.verFinanceiro && pedido.parcelas.length > 0 && (
            <div className="card space-y-4">
              <h2 className="font-semibold text-titulo">Pagamentos</h2>
              <div className="space-y-2">
                {pedido.parcelas.map((p, i) => (
                  <div key={p.id}
                    className={clsx('flex items-center justify-between px-4 py-3 rounded-xl border text-sm',
                      p.pago ? 'bg-green-50 border-green-200' : 'bg-superficie-2 border-borda')}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={p.pago}
                        disabled={!permissoes.editarPedido}
                        onChange={e => marcarParcelaPaga(p.id, e.target.checked)}
                        className="w-4 h-4 accent-nice-500 cursor-pointer disabled:cursor-default" />
                      <div>
                        <p className={clsx('font-medium', p.pago ? 'text-green-700' : 'text-conteudo')}>
                          {p.descricao || `Parcela ${i + 1}`}
                        </p>
                        {p.dataPrevista && (
                          <p className="text-xs text-fraco">
                            Previsto: {format(new Date(p.dataPrevista + 'T00:00:00'), 'dd/MM/yyyy')}
                            {p.dataPagamento && ` · Pago: ${format(new Date(p.dataPagamento + 'T00:00:00'), 'dd/MM/yyyy')}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={clsx('font-semibold', p.pago ? 'text-green-700' : 'text-conteudo')}>
                      R$ {(p.valor || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-suave">Total</span>
                  <span className="font-semibold text-marca-texto">R$ {totalParcelas.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-suave">Pago</span>
                  <span className="font-medium text-green-600">R$ {totalPago.toFixed(2)}</span>
                </div>
                {saldo > 0 && (
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-suave">Saldo restante</span>
                    <span className="font-semibold text-orange-600">R$ {saldo.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progresso setores */}
          <div className="card space-y-4">
            <h2 className="font-semibold text-titulo">Progresso por Setor</h2>

            <FluxoEtapas
              pedidoId={pedido.id}
              progresso={pedido.progresso}
              etapas={etapas}
              catalogoSemente={catalogoSemente}
              podeEditarStatus={permissoes.editarProducao}
              podeEditarFluxo={permissoes.editarFluxoProducao}
              nomeMembro={membro?.nome}
              onGravado={carregar}
              onAcabamentoConcluido={() => setModalAberto(true)}
              variante="lista"
            />

            <p className="text-xs text-fraco print:hidden">
              Clique numa etapa para avançar o status.
              {permissoes.editarFluxoProducao && ' Arraste pelo ⠿ para mudar a ordem deste pedido.'}
            </p>

            {podeLiberarEnvio && permissoes.editarProducao && (
              <button type="button" onClick={() => setModalAberto(true)}
                className="text-marca-texto text-xs font-medium hover:underline print:hidden">
                Este pedido está pronto para envio?
              </button>
            )}
          </div>
        </div>

        {/* Sidebar lateral */}
        <div className="space-y-4">
          {/* Pedido pronto: oferece virar cartão no Kanban. Sugestão, não
              automação — quem cria decide se aceita o texto sugerido. */}
          {permissoes.editarKanban && pedidoConcluido(pedido) && (
            <CriarCartaoDoPedido pedido={pedido} />
          )}

          {/* Status */}
          {permissoes.editarPedido && (
          <div className="card space-y-3">
            <h2 className="font-semibold text-titulo text-sm">Alterar Status</h2>
            <div className="space-y-1.5">
              {STATUS_LIST.map(s => {
                const c = STATUS_CONFIG[s]
                return (
                  <button key={s} onClick={() => mudarStatus(s)}
                    className={clsx('w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm border transition-all',
                      pedido.status === s ? `${c.bg} ${c.color} border-current font-semibold` : 'border-transparent hover:bg-superficie-2 text-suave')}>
                    {c.label}
                    {pedido.status === s && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                )
              })}
            </div>
          </div>
          )}

          {/* Datas e valor */}
          <div className="card space-y-3 text-sm">
            <h2 className="font-semibold text-titulo">Informações</h2>
            <div className="space-y-2">
              {pedido.consultor && (
                <div className="flex justify-between">
                  <span className="text-fraco">Consultor</span>
                  <span className="font-medium text-conteudo">{pedido.consultor}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-fraco">Entrega</span>
                <span className="font-medium">{format(new Date(pedido.dataEntrega), 'dd/MM/yyyy')}</span>
              </div>
              {/* De qual lista de preços os valores saíram. Pedido anterior às
                  múltiplas tabelas não registrou nenhuma — e a tela diz isso
                  em vez de chutar 'Escolar 1'. */}
              {permissoes.verFinanceiro && (
                <div className="flex justify-between">
                  <span className="text-fraco">Tabela de preço</span>
                  <span className={clsx('font-medium', pedido.tabelaPreco ? 'text-conteudo' : 'text-fraco')}>
                    {pedido.tabelaPreco || 'não registrada'}
                  </span>
                </div>
              )}
              {permissoes.verFinanceiro && pedido.vetorizacao?.necessaria && (
                <div className="flex justify-between">
                  <span className="text-fraco">Vetorização</span>
                  <span className="font-medium text-marca-texto">R$ {pedido.vetorizacao.valor.toFixed(2)}</span>
                </div>
              )}
              {permissoes.verFinanceiro && pedido.parcelas.length === 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-fraco">Total</span>
                    <span className="font-semibold text-marca-texto">
                      {pedido.valorTotal > 0 ? `R$ ${pedido.valorTotal.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fraco">Pago</span>
                    <span className="font-medium text-green-600">
                      {pedido.valorPago > 0 ? `R$ ${pedido.valorPago.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  {pedido.valorTotal > 0 && pedido.valorPago < pedido.valorTotal && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-fraco">Restante</span>
                      <span className="font-semibold text-orange-600">R$ {(pedido.valorTotal - pedido.valorPago).toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {pedido.observacoes && (
            <div className="card space-y-2">
              <h2 className="font-semibold text-titulo text-sm">Observações</h2>
              <p className="text-sm text-suave">{pedido.observacoes}</p>
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
          pedido.progresso.estamparia_silk?.status ?? 'pendente',
          pedido.progresso.prensa_dtf?.status ?? 'pendente',
          pedido.progresso.prensa_sublimacao?.status ?? 'pendente',
        ])
        // As 6 colunas fixas são o formulário de papel da fábrica, não uma
        // tradução de SETOR_LABELS: 'Matéria Prima' é o setor `compra`, os três
        // setores de estampa viram uma coluna só, e 'Loja' é um campo manual
        // que não existe no sistema. Por isso a lista é escrita à mão.
        //
        // O que a Fase D3 acrescenta: as etapas criadas pelo Pedro (`extra_*`)
        // entram DEPOIS das fixas, na ordem deste pedido. Sem isso, uma etapa
        // "Bordado" simplesmente não sairia na ficha — some da folha sem erro
        // nenhum, que é o pior tipo de falha.
        const extras = etapasDoPedido(pedido.progresso, etapas)
          .filter(e => e.chave.startsWith('extra_'))
          .map(e => ({ label: e.rotulo, status: e.entrada.status }))

        const setoresLinha: { label: string; status: StatusSetor }[] = [
          { label: 'Matéria Prima', status: pedido.progresso.compra?.status ?? 'pendente' },
          { label: 'Corte', status: pedido.progresso.corte?.status ?? 'pendente' },
          { label: 'Personalização', status: statusPersonalizacao },
          { label: 'Costura', status: pedido.progresso.costura?.status ?? 'pendente' },
          ...extras,
          { label: 'Acabamento', status: pedido.progresso.acabamento?.status ?? 'pendente' },
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
                  {/* A ficha impressa mostra UMA miniatura, e ela só funciona se
                      for imagem — `<img src="...pdf">` imprime um quadrado
                      quebrado. Peça que só tem PDF anexado sai como aviso de
                      texto: quem está na produção precisa saber que a arte
                      existe e está no sistema. */}
                  {primeiraImagem(p.fotos) ? (
                    <img src={primeiraImagem(p.fotos)} alt={`Arte da peça ${i + 1}`} className="w-full h-full object-cover" />
                  ) : contarPdfs(p.fotos) > 0 ? (
                    <span className="text-[9px] text-center px-1 leading-tight">
                      Arte em PDF<br />({contarPdfs(p.fotos)} arquivo{contarPdfs(p.fotos) > 1 ? 's' : ''})
                    </span>
                  ) : (
                    <span className="text-[9px] text-fraco text-center px-1">Sem arte</span>
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

      {/* Página final: resumo e pagamento.
          Só sai no papel para quem pode ver dinheiro. As páginas por peça
          acima continuam saindo para todo mundo — são a ordem de produção, e é
          delas que o chão de fábrica precisa. */}
      {permissoes.verFinanceiro && (
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
      )}
    </div>

    <Modal
      aberto={modalExcecao !== null}
      titulo={
        modalExcecao === 'liberar' ? 'Liberar pagamento na retirada'
          : modalExcecao === 'recusar' ? 'Recusar a liberação'
          : 'Solicitar pagamento na retirada'
      }
      onFechar={() => setModalExcecao(null)}
      rodape={
        <>
          <button onClick={() => setModalExcecao(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={confirmarExcecao} disabled={salvandoExcecao} className="btn-primary flex-1 justify-center">
            {salvandoExcecao ? 'Gravando...' : 'Confirmar'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-suave">
          {modalExcecao === 'liberar'
            ? 'Este pedido poderá ir para produção sem pagamento registrado. Fica gravado no pedido quem liberou e por quê.'
            : modalExcecao === 'recusar'
            ? 'O pedido continua barrado até que haja pagamento registrado. A observação é opcional.'
            : 'A solicitação vai para o gestor. Até ele aprovar, o pedido NÃO avança para produção.'}
        </p>
        <div>
          <label className="label">
            {modalExcecao === 'recusar' ? 'Observação (opcional)' : 'Motivo'}
          </label>
          <textarea className="input min-h-[80px]" autoFocus value={motivoExcecao}
            placeholder={modalExcecao === 'recusar' ? 'Ex: cliente ainda tem saldo em aberto do pedido anterior' : 'Ex: cliente antigo, sempre paga na retirada'}
            onChange={e => setMotivoExcecao(e.target.value)} />
        </div>
        {erroExcecao && <p className="text-sm text-red-600">{erroExcecao}</p>}
      </div>
    </Modal>

    {modalAberto && (
      <ModalProntoParaEnvio
        pedido={pedido}
        etapas={etapas}
        onFechar={() => setModalAberto(false)}
        onSalvo={carregar}
        nomeMembro={membro?.nome}
      />
    )}
    </>
  )
}
