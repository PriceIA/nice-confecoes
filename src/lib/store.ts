import { Cliente, Parcela, Pedido, ProgressoSetor, Terceirizada } from '@/types'
import { addBusinessDays, format } from 'date-fns'
import { supabase } from './supabase'

function mapCliente(row: any): Cliente {
  return {
    id: row.id,
    nome: row.nome,
    empresa: row.empresa ?? '',
    responsavelEmpresa: row.responsavel_empresa ?? undefined,
    telefone: row.telefone ?? '',
    email: row.email ?? '',
    dataCadastro: row.data_cadastro,
  }
}

function mapPedido(row: any): Pedido {
  const c = row.clientes
  const parcelas: Parcela[] = row.parcelas ?? []
  const valorTotal = parcelas.length > 0
    ? parcelas.reduce((a: number, p: Parcela) => a + (p.valor || 0), 0)
    : Number(row.valor_total) || 0
  const valorPago = parcelas.length > 0
    ? parcelas.filter((p: Parcela) => p.pago).reduce((a: number, p: Parcela) => a + (p.valor || 0), 0)
    : Number(row.valor_pago) || 0
  return {
    id: row.id,
    numero: row.numero,
    cliente: {
      nome: c?.nome ?? '',
      empresa: c?.empresa ?? '',
      telefone: c?.telefone ?? '',
      email: c?.email ?? '',
    },
    consultor: row.consultor ?? '',
    tipo: row.tipo,
    status: row.status,
    pecas: row.pecas ?? [],
    parcelas,
    dataEntrada: row.data_entrada,
    dataEntrega: row.data_entrega,
    progresso: row.progresso,
    observacoes: row.observacoes ?? '',
    valorTotal,
    valorPago,
  }
}

function mapTerceirizada(row: any): Terceirizada {
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo,
    pedidoId: row.pedido_id ?? '',
    numeroPedido: row.numero_pedido ?? '',
    itens: row.itens ?? '',
    dataEnvio: row.data_envio,
    dataRetornoPrevisto: row.data_retorno_previsto,
    dataRetornoReal: row.data_retorno_real ?? undefined,
    valorCombinado: Number(row.valor_combinado) || 0,
    valorPago: Number(row.valor_pago) || 0,
    status: row.status,
    observacoes: row.observacoes ?? '',
  }
}

async function gerarNumero(): Promise<string> {
  const ano = new Date().getFullYear()
  const { count, error } = await supabase.from('pedidos').select('*', { count: 'exact', head: true })
  if (error) throw error
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `${ano}-${seq}`
}

// Pedidos
export async function getPedidos(): Promise<Pedido[]> {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(*)')
    .order('data_entrada', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPedido)
}

export async function getPedidoById(id: string): Promise<Pedido | undefined> {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapPedido(data) : undefined
}

export async function criarPedido(dados: Omit<Pedido, 'id' | 'numero' | 'dataEntrada' | 'progresso'>): Promise<Pedido> {
  console.log('[criarPedido] iniciando, dados cliente:', dados.cliente)
  const cliente = await buscarOuCriarCliente(dados.cliente)
  console.log('[criarPedido] cliente ok:', cliente.id)
  const numero = await gerarNumero()
  console.log('[criarPedido] numero gerado:', numero)
  const progresso: ProgressoSetor = {
    atendimento: 'concluido',
    compra: 'pendente',
    corte: 'pendente',
    costura: 'pendente',
    estamparia_silk: 'pendente',
    prensa_dtf: 'pendente',
    prensa_sublimacao: 'pendente',
    acabamento: 'pendente',
  }

  const parcelas = dados.parcelas ?? []
  const vTotal = parcelas.length > 0
    ? parcelas.reduce((a, p) => a + (p.valor || 0), 0)
    : dados.valorTotal
  const vPago = parcelas.length > 0
    ? parcelas.filter(p => p.pago).reduce((a, p) => a + (p.valor || 0), 0)
    : dados.valorPago

  const insertPayload = {
    numero,
    cliente_id: cliente.id,
    consultor: dados.consultor ?? '',
    tipo: dados.tipo,
    status: dados.status,
    data_entrega: dados.dataEntrega,
    valor_total: vTotal,
    valor_pago: vPago,
    observacoes: dados.observacoes,
    pecas: dados.pecas,
    parcelas,
    progresso,
  }
  console.log('[criarPedido] insert payload:', JSON.stringify(insertPayload, null, 2))
  const { data, error } = await supabase
    .from('pedidos')
    .insert(insertPayload)
    .select('*, clientes(*)')
    .single()
  if (error) {
    console.error('[criarPedido] erro no insert:', JSON.stringify(error, null, 2))
    throw error
  }
  console.log('[criarPedido] pedido criado:', data?.id)
  return mapPedido(data)
}

export async function atualizarPedido(id: string, dados: Partial<Pedido>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (dados.consultor !== undefined) update.consultor = dados.consultor
  if (dados.tipo !== undefined) update.tipo = dados.tipo
  if (dados.status !== undefined) update.status = dados.status
  if (dados.dataEntrega !== undefined) update.data_entrega = dados.dataEntrega
  if (dados.observacoes !== undefined) update.observacoes = dados.observacoes
  if (dados.pecas !== undefined) update.pecas = dados.pecas
  if (dados.progresso !== undefined) update.progresso = dados.progresso
  if (dados.parcelas !== undefined) {
    update.parcelas = dados.parcelas
    update.valor_total = dados.parcelas.reduce((a, p) => a + (p.valor || 0), 0)
    update.valor_pago = dados.parcelas.filter(p => p.pago).reduce((a, p) => a + (p.valor || 0), 0)
  } else {
    if (dados.valorTotal !== undefined) update.valor_total = dados.valorTotal
    if (dados.valorPago !== undefined) update.valor_pago = dados.valorPago
  }
  if (dados.cliente !== undefined) {
    const cliente = await buscarOuCriarCliente(dados.cliente)
    update.cliente_id = cliente.id
  }

  const { error } = await supabase.from('pedidos').update(update).eq('id', id)
  if (error) throw error
}

export async function deletarPedido(id: string): Promise<void> {
  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) throw error
}

// Terceirizadas
export async function getTerceirizadas(): Promise<Terceirizada[]> {
  const { data, error } = await supabase
    .from('terceirizadas')
    .select('*')
    .order('data_envio', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapTerceirizada)
}

export async function criarTerceirizada(dados: Omit<Terceirizada, 'id'>): Promise<Terceirizada> {
  const { data, error } = await supabase
    .from('terceirizadas')
    .insert({
      nome: dados.nome,
      tipo: dados.tipo,
      pedido_id: dados.pedidoId || null,
      numero_pedido: dados.numeroPedido,
      itens: dados.itens,
      data_envio: dados.dataEnvio,
      data_retorno_previsto: dados.dataRetornoPrevisto,
      data_retorno_real: dados.dataRetornoReal || null,
      valor_combinado: dados.valorCombinado,
      valor_pago: dados.valorPago,
      status: dados.status,
      observacoes: dados.observacoes,
    })
    .select()
    .single()
  if (error) throw error
  return mapTerceirizada(data)
}

export async function atualizarTerceirizada(id: string, dados: Partial<Terceirizada>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (dados.nome !== undefined) update.nome = dados.nome
  if (dados.tipo !== undefined) update.tipo = dados.tipo
  if (dados.pedidoId !== undefined) update.pedido_id = dados.pedidoId || null
  if (dados.numeroPedido !== undefined) update.numero_pedido = dados.numeroPedido
  if (dados.itens !== undefined) update.itens = dados.itens
  if (dados.dataEnvio !== undefined) update.data_envio = dados.dataEnvio
  if (dados.dataRetornoPrevisto !== undefined) update.data_retorno_previsto = dados.dataRetornoPrevisto
  if (dados.dataRetornoReal !== undefined) update.data_retorno_real = dados.dataRetornoReal || null
  if (dados.valorCombinado !== undefined) update.valor_combinado = dados.valorCombinado
  if (dados.valorPago !== undefined) update.valor_pago = dados.valorPago
  if (dados.status !== undefined) update.status = dados.status
  if (dados.observacoes !== undefined) update.observacoes = dados.observacoes

  const { error } = await supabase.from('terceirizadas').update(update).eq('id', id)
  if (error) throw error
}

// Clientes
export async function getClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('data_cadastro', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapCliente)
}

export async function criarCliente(dados: Omit<Cliente, 'id' | 'dataCadastro'>): Promise<Cliente> {
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nome: dados.nome,
      empresa: dados.empresa,
      responsavel_empresa: dados.responsavelEmpresa ?? null,
      telefone: dados.telefone,
      email: dados.email,
    })
    .select()
    .single()
  if (error) throw error
  return mapCliente(data)
}

export async function atualizarCliente(id: string, dados: Partial<Cliente>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (dados.nome !== undefined) update.nome = dados.nome
  if (dados.empresa !== undefined) update.empresa = dados.empresa
  if (dados.responsavelEmpresa !== undefined) update.responsavel_empresa = dados.responsavelEmpresa
  if (dados.telefone !== undefined) update.telefone = dados.telefone
  if (dados.email !== undefined) update.email = dados.email

  const { error } = await supabase.from('clientes').update(update).eq('id', id)
  if (error) throw error
}

export async function buscarOuCriarCliente(dados: Omit<Cliente, 'id' | 'dataCadastro'>): Promise<Cliente> {
  if (dados.telefone) {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefone', dados.telefone)
      .maybeSingle()
    if (error) throw error
    if (data) {
      const existente = mapCliente(data)
      const atualizado: Cliente = {
        ...existente,
        nome: dados.nome || existente.nome,
        empresa: dados.empresa || existente.empresa,
        email: dados.email || existente.email,
      }
      await atualizarCliente(existente.id, atualizado)
      return atualizado
    }
  }
  return criarCliente(dados)
}

export function pedidosDoCliente(cliente: Cliente, pedidos: Pedido[]): Pedido[] {
  return pedidos.filter(p => cliente.telefone
    ? p.cliente.telefone === cliente.telefone
    : p.cliente.nome.toLowerCase() === cliente.nome.toLowerCase())
}

// Helpers
export function calcularDataEntrega(diasUteis = 25): string {
  return format(addBusinessDays(new Date(), diasUteis), 'yyyy-MM-dd')
}

export function pedidosStats(pedidos: Pedido[]) {
  const hoje = new Date()
  const em7dias = new Date(hoje)
  em7dias.setDate(em7dias.getDate() + 7)

  return {
    emProducao: pedidos.filter(p => p.status === 'em_producao').length,
    urgentes: pedidos.filter(p => p.tipo === 'urgente' && !['entregue', 'cancelado'].includes(p.status)).length,
    entregaEm7dias: pedidos.filter(p => {
      if (['entregue', 'cancelado'].includes(p.status)) return false
      const d = new Date(p.dataEntrega)
      return d >= hoje && d <= em7dias
    }).length,
    aguardandoProducao: pedidos.filter(p => p.status === 'aprovado').length,
  }
}
