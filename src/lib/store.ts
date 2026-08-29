import { Cliente, Parcela, Pedido, ProgressoSetor, StatusSetor, Terceirizada } from '@/types'
import { addBusinessDays, format } from 'date-fns'
import { supabase } from './supabase'
import { criarClienteBrowser } from './supabase/client'
import { sanitizarNome } from './arquivos'

// Fase B: pedidos/clientes/terceirizadas ganharam RLS baseada em auth.uid()
// (ver CLAUDE.md, "Estado de segurança atual"). O client anônimo de
// './supabase' não carrega sessão — auth.uid() vira null dentro do banco e
// toda policy falha em silêncio, exatamente o bug que o Kanban já evitava
// usando criarClienteBrowser(). Este arquivo passa a fazer o mesmo, função por
// função, igual a src/lib/kanban.ts. `supabase` (anônimo) continua importado
// só para o Storage de fotos, que não entrou na Fase B.

const SETORES_PROGRESSO = [
  'atendimento', 'compra', 'corte', 'costura',
  'estamparia_silk', 'prensa_dtf', 'prensa_sublimacao', 'acabamento',
] as const

/**
 * Normaliza `progresso` vindo do banco para o formato atual.
 *
 * Pedidos gravados antes desta mudança guardam `{ corte: 'pendente', ... }` —
 * string direto, sem autor. JSONB não tem schema, então o banco nunca vai
 * "migrar" isso sozinho; é aqui, na leitura, que os dois formatos convergem.
 * Pedido com o formato novo passa por isso e sai igual.
 */
const STATUS_SETOR_VALIDOS: StatusSetor[] = ['pendente', 'em_andamento', 'concluido', 'nao_se_aplica']

/** Status desconhecido (JSONB sem schema, pedido antigo, valor corrompido) vira `pendente` — nunca `undefined`. */
function normalizarStatusSetor(v: unknown): StatusSetor {
  return STATUS_SETOR_VALIDOS.includes(v as StatusSetor) ? (v as StatusSetor) : 'pendente'
}

function normalizarProgresso(raw: any): ProgressoSetor {
  const out = {} as ProgressoSetor
  for (const setor of SETORES_PROGRESSO) {
    const v = raw?.[setor]
    out[setor] = typeof v === 'string'
      ? { status: normalizarStatusSetor(v) }
      : { status: normalizarStatusSetor(v?.status), atualizadoPor: v?.atualizadoPor, atualizadoEm: v?.atualizadoEm }
  }
  return out
}

function mapCliente(row: any): Cliente {
  return {
    id: row.id,
    nome: row.nome,
    empresa: row.empresa ?? '',
    telefone: row.telefone ?? '',
    email: row.email ?? '',
    responsavel: row.responsavel ?? '',
    endereco: row.endereco ?? '',
    documento: row.documento ?? '',
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
      responsavel: c?.responsavel ?? '',
      endereco: c?.endereco ?? '',
      documento: c?.documento ?? '',
    },
    consultor: row.consultor ?? '',
    tipo: row.tipo,
    status: row.status,
    pecas: (row.pecas ?? []).map((p: any) => ({ fotos: [], ...p })),
    parcelas,
    dataEntrada: row.data_entrada,
    dataEntrega: row.data_entrega,
    progresso: normalizarProgresso(row.progresso),
    observacoes: row.observacoes ?? '',
    valorTotal,
    valorPago,
    vetorizacao: row.vetorizacao ?? undefined,
    tabelaPreco: row.tabela_preco ?? undefined,
    excecaoPagamento: row.excecao_pagamento ?? undefined,
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
    dataRetornoPrevisto: row.data_retorno_previsto ?? '',
    dataRetornoReal: row.data_retorno_real ?? undefined,
    valorCombinado: Number(row.valor_combinado) || 0,
    valorPago: Number(row.valor_pago) || 0,
    status: row.status,
    observacoes: row.observacoes ?? '',
  }
}

async function gerarNumero(): Promise<string> {
  const supabase = criarClienteBrowser()
  const ano = new Date().getFullYear()
  const { count, error } = await supabase.from('pedidos').select('*', { count: 'exact', head: true })
  if (error) throw error
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `${ano}-${seq}`
}

// Pedidos
export async function getPedidos(): Promise<Pedido[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(*)')
    .order('data_entrada', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPedido)
}

export async function getPedidoById(id: string): Promise<Pedido | undefined> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? mapPedido(data) : undefined
}

export async function criarPedido(dados: Omit<Pedido, 'id' | 'numero' | 'dataEntrada' | 'progresso'>): Promise<Pedido> {
  const supabase = criarClienteBrowser()
  console.log('[criarPedido] iniciando, dados cliente:', dados.cliente)
  const cliente = await buscarOuCriarCliente(dados.cliente)
  console.log('[criarPedido] cliente ok:', cliente.id)
  const numero = await gerarNumero()
  console.log('[criarPedido] numero gerado:', numero)
  // Sem autor: é o sistema criando o pedido, ninguém clicou em nada ainda.
  const progresso: ProgressoSetor = {
    atendimento: { status: 'concluido' },
    compra: { status: 'pendente' },
    corte: { status: 'pendente' },
    costura: { status: 'pendente' },
    estamparia_silk: { status: 'pendente' },
    prensa_dtf: { status: 'pendente' },
    prensa_sublimacao: { status: 'pendente' },
    acabamento: { status: 'pendente' },
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
    valor_total: dados.valorTotal ?? vTotal,
    valor_pago: vPago,
    observacoes: dados.observacoes,
    pecas: dados.pecas,
    parcelas,
    progresso,
    vetorizacao: dados.vetorizacao ?? null,
    tabela_preco: dados.tabelaPreco ?? null,
    excecao_pagamento: dados.excecaoPagamento ?? null,
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
  const supabase = criarClienteBrowser()

  // Atualização só de progresso (clique num setor em /producao ou no card
  // "Progresso por Setor" em /pedidos/[id]): todo perfil com editarProducao
  // pode fazer isso, mas não pode tocar em mais nada do pedido. RLS bloqueia
  // UPDATE direto na tabela pra quem não é gestor/recepcionista — por isso
  // este caso, e só ele, passa pela função atualizar_progresso_pedido
  // (security definer), que só aceita gravar a coluna progresso. Ver
  // supabase/migrations/009_rls_fase_b.sql.
  const chaves = Object.keys(dados)
  if (chaves.length === 1 && chaves[0] === 'progresso') {
    const { error } = await supabase.rpc('atualizar_progresso_pedido', {
      p_pedido_id: id,
      p_progresso: dados.progresso,
    })
    if (error) throw error
    return
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (dados.consultor !== undefined) update.consultor = dados.consultor
  if (dados.tipo !== undefined) update.tipo = dados.tipo
  if (dados.status !== undefined) update.status = dados.status
  if (dados.dataEntrega !== undefined) update.data_entrega = dados.dataEntrega
  if (dados.dataEntrada !== undefined) update.data_entrada = dados.dataEntrada
  if (dados.observacoes !== undefined) update.observacoes = dados.observacoes
  if (dados.pecas !== undefined) update.pecas = dados.pecas
  if (dados.progresso !== undefined) update.progresso = dados.progresso
  if (dados.parcelas !== undefined) update.parcelas = dados.parcelas

  // Regra 4 do CLAUDE.md: HAVENDO parcelas, elas são a fonte da verdade de
  // total e pago. A leitura (`mapPedido`) já decide assim, e a escrita
  // acompanha.
  //
  // O `.length > 0` é o detalhe que faltava: quando a edição do pedido apaga
  // a última parcela, `dados.parcelas` chega como `[]` — array vazio é
  // "não há parcelas", não "as parcelas somam zero". Sem essa checagem, tirar
  // a última parcela zerava valor_total e valor_pago do pedido em silêncio.
  const temParcelas = dados.parcelas !== undefined && dados.parcelas.length > 0
  if (temParcelas) {
    update.valor_total = dados.parcelas!.reduce((a, p) => a + (p.valor || 0), 0)
    update.valor_pago = dados.parcelas!.filter(p => p.pago).reduce((a, p) => a + (p.valor || 0), 0)
  } else {
    if (dados.valorTotal !== undefined) update.valor_total = dados.valorTotal
    if (dados.valorPago !== undefined) update.valor_pago = dados.valorPago
  }
  if (dados.cliente !== undefined) {
    const cliente = await buscarOuCriarCliente(dados.cliente)
    update.cliente_id = cliente.id
  }
  if (dados.vetorizacao !== undefined) update.vetorizacao = dados.vetorizacao
  if (dados.tabelaPreco !== undefined) update.tabela_preco = dados.tabelaPreco
  if (dados.excecaoPagamento !== undefined) update.excecao_pagamento = dados.excecaoPagamento

  const { error } = await supabase.from('pedidos').update(update).eq('id', id)
  if (error) throw error
}

export async function deletarPedido(id: string): Promise<void> {
  const supabase = criarClienteBrowser()
  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) throw error
}

// Terceirizadas
export async function getTerceirizadas(): Promise<Terceirizada[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('terceirizadas')
    .select('*')
    .order('data_envio', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapTerceirizada)
}

export async function criarTerceirizada(dados: Omit<Terceirizada, 'id'>): Promise<Terceirizada> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('terceirizadas')
    .insert({
      nome: dados.nome,
      tipo: dados.tipo,
      pedido_id: dados.pedidoId || null,
      numero_pedido: dados.numeroPedido,
      itens: dados.itens,
      data_envio: dados.dataEnvio,
      data_retorno_previsto: dados.dataRetornoPrevisto || null,
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
  const supabase = criarClienteBrowser()
  const update: Record<string, unknown> = {}
  if (dados.nome !== undefined) update.nome = dados.nome
  if (dados.tipo !== undefined) update.tipo = dados.tipo
  if (dados.pedidoId !== undefined) update.pedido_id = dados.pedidoId || null
  if (dados.numeroPedido !== undefined) update.numero_pedido = dados.numeroPedido
  if (dados.itens !== undefined) update.itens = dados.itens
  if (dados.dataEnvio !== undefined) update.data_envio = dados.dataEnvio
  if (dados.dataRetornoPrevisto !== undefined) update.data_retorno_previsto = dados.dataRetornoPrevisto || null
  if (dados.dataRetornoReal !== undefined) update.data_retorno_real = dados.dataRetornoReal || null
  if (dados.valorCombinado !== undefined) update.valor_combinado = dados.valorCombinado
  if (dados.valorPago !== undefined) update.valor_pago = dados.valorPago
  if (dados.status !== undefined) update.status = dados.status
  if (dados.observacoes !== undefined) update.observacoes = dados.observacoes

  const { error } = await supabase.from('terceirizadas').update(update).eq('id', id)
  if (error) throw error
}

export async function deletarTerceirizada(id: string): Promise<void> {
  const supabase = criarClienteBrowser()
  const { error } = await supabase.from('terceirizadas').delete().eq('id', id)
  if (error) throw error
}

// Clientes
export async function getClientes(): Promise<Cliente[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('data_cadastro', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapCliente)
}

export async function criarCliente(dados: Omit<Cliente, 'id' | 'dataCadastro'>): Promise<Cliente> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nome: dados.nome,
      empresa: dados.empresa,
      telefone: dados.telefone,
      email: dados.email,
      responsavel: dados.responsavel,
      endereco: dados.endereco,
      documento: dados.documento,
    })
    .select()
    .single()
  if (error) throw error
  return mapCliente(data)
}

export async function atualizarCliente(id: string, dados: Partial<Cliente>): Promise<void> {
  const supabase = criarClienteBrowser()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (dados.nome !== undefined) update.nome = dados.nome
  if (dados.empresa !== undefined) update.empresa = dados.empresa
  if (dados.telefone !== undefined) update.telefone = dados.telefone
  if (dados.email !== undefined) update.email = dados.email
  if (dados.responsavel !== undefined) update.responsavel = dados.responsavel
  if (dados.endereco !== undefined) update.endereco = dados.endereco
  if (dados.documento !== undefined) update.documento = dados.documento

  const { error } = await supabase.from('clientes').update(update).eq('id', id)
  if (error) throw error
}

export async function buscarOuCriarCliente(dados: Omit<Cliente, 'id' | 'dataCadastro'>): Promise<Cliente> {
  const supabase = criarClienteBrowser()
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
        responsavel: dados.responsavel || existente.responsavel,
        endereco: dados.endereco || existente.endereco,
        documento: dados.documento || existente.documento,
      }
      await atualizarCliente(existente.id, atualizado)
      return atualizado
    }
  }
  return criarCliente(dados)
}

/**
 * Sobe um anexo de arte da peça: imagem de qualquer formato OU PDF.
 *
 * Duas coisas mudaram quando o PDF entrou:
 *
 * - o nome original vai junto na chave (`{uuid}-arte-frente.pdf`), porque
 *   miniatura de PDF mostra nome, não imagem — sem isso a tela só teria um
 *   uuid para exibir. `sanitizarNome` tira acento e caractere que o Storage
 *   recusa;
 * - `contentType` passa a ser enviado. Sem ele o Supabase chuta pela extensão,
 *   e o PDF pode acabar servido como download em vez de abrir no navegador.
 *
 * O bucket precisa aceitar `application/pdf` em `allowed_mime_types` — se
 * estiver restrito a imagem, o upload volta como erro do Storage.
 */
export async function uploadFotoPeca(pecaId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
  const nome = sanitizarNome(file.name.replace(/\.[^.]+$/, '')) || 'arquivo'
  const path = `${pecaId}/${crypto.randomUUID()}-${nome}.${ext}`
  const { error } = await supabase.storage
    .from('pedido-fotos')
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (error) throw error
  const { data } = supabase.storage.from('pedido-fotos').getPublicUrl(path)
  return data.publicUrl
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
