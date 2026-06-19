import { Cliente, Pedido, Terceirizada } from '@/types'
import { addBusinessDays, format } from 'date-fns'

const PEDIDOS_KEY = 'nice_pedidos'
const TERCEIRIZADAS_KEY = 'nice_terceirizadas'
const CLIENTES_KEY = 'nice_clientes'

function gerarNumero(): string {
  const ano = new Date().getFullYear()
  const pedidos = getPedidos()
  const seq = String(pedidos.length + 1).padStart(4, '0')
  return `${ano}-${seq}`
}

export function getPedidos(): Pedido[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(PEDIDOS_KEY)
  return raw ? JSON.parse(raw) : []
}

export function savePedidos(pedidos: Pedido[]) {
  localStorage.setItem(PEDIDOS_KEY, JSON.stringify(pedidos))
}

export function getPedidoById(id: string): Pedido | undefined {
  return getPedidos().find(p => p.id === id)
}

export function criarPedido(dados: Omit<Pedido, 'id' | 'numero' | 'dataEntrada' | 'progresso'>): Pedido {
  const pedidos = getPedidos()
  const novo: Pedido = {
    ...dados,
    id: crypto.randomUUID(),
    numero: gerarNumero(),
    dataEntrada: new Date().toISOString(),
    progresso: {
      atendimento: 'concluido',
      compra: 'pendente',
      corte: 'pendente',
      costura: 'pendente',
      estamparia_silk: 'pendente',
      prensa_dtf: 'pendente',
      prensa_sublimacao: 'pendente',
      acabamento: 'pendente',
    }
  }
  savePedidos([...pedidos, novo])
  buscarOuCriarCliente(dados.cliente)
  return novo
}

export function atualizarPedido(id: string, dados: Partial<Pedido>) {
  const pedidos = getPedidos()
  const idx = pedidos.findIndex(p => p.id === id)
  if (idx >= 0) {
    pedidos[idx] = { ...pedidos[idx], ...dados }
    savePedidos(pedidos)
  }
}

export function deletarPedido(id: string) {
  const pedidos = getPedidos().filter(p => p.id !== id)
  savePedidos(pedidos)
}

// Terceirizadas
export function getTerceirizadas(): Terceirizada[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(TERCEIRIZADAS_KEY)
  return raw ? JSON.parse(raw) : []
}

export function saveTerceirizadas(lista: Terceirizada[]) {
  localStorage.setItem(TERCEIRIZADAS_KEY, JSON.stringify(lista))
}

export function criarTerceirizada(dados: Omit<Terceirizada, 'id'>): Terceirizada {
  const lista = getTerceirizadas()
  const nova: Terceirizada = { ...dados, id: crypto.randomUUID() }
  saveTerceirizadas([...lista, nova])
  return nova
}

export function atualizarTerceirizada(id: string, dados: Partial<Terceirizada>) {
  const lista = getTerceirizadas()
  const idx = lista.findIndex(t => t.id === id)
  if (idx >= 0) {
    lista[idx] = { ...lista[idx], ...dados }
    saveTerceirizadas(lista)
  }
}

// Clientes
export function getClientes(): Cliente[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(CLIENTES_KEY)
  return raw ? JSON.parse(raw) : []
}

export function saveClientes(clientes: Cliente[]) {
  localStorage.setItem(CLIENTES_KEY, JSON.stringify(clientes))
}

export function criarCliente(dados: Omit<Cliente, 'id' | 'dataCadastro'>): Cliente {
  const clientes = getClientes()
  const novo: Cliente = {
    ...dados,
    id: crypto.randomUUID(),
    dataCadastro: new Date().toISOString(),
  }
  saveClientes([...clientes, novo])
  return novo
}

export function atualizarCliente(id: string, dados: Partial<Cliente>) {
  const clientes = getClientes()
  const idx = clientes.findIndex(c => c.id === id)
  if (idx >= 0) {
    clientes[idx] = { ...clientes[idx], ...dados }
    saveClientes(clientes)
  }
}

export function buscarOuCriarCliente(dados: Omit<Cliente, 'id' | 'dataCadastro'>): Cliente {
  const clientes = getClientes()
  const existente = dados.telefone ? clientes.find(c => c.telefone === dados.telefone) : undefined
  if (existente) {
    const atualizado: Cliente = {
      ...existente,
      nome: dados.nome || existente.nome,
      empresa: dados.empresa || existente.empresa,
      email: dados.email || existente.email,
    }
    atualizarCliente(existente.id, atualizado)
    return atualizado
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
