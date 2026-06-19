export type StatusPedido = 'orcamento' | 'aprovado' | 'em_producao' | 'finalizado' | 'entregue' | 'cancelado'
export type TipoPedido = 'normal' | 'urgente' | 'grande_volume'
export type Complexidade = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
export type Personalizacao = 'bordado' | 'silk' | 'dtf' | 'sublimacao'
export type StatusSetor = 'pendente' | 'em_andamento' | 'concluido'

export type Tamanho = 'PP' | 'P' | 'M' | 'G' | 'GG' | 'XGG' | 'UNICO'

export interface TamanhoQuantidade {
  tamanho: Tamanho
  quantidade: number
}

export interface Peca {
  id: string
  categoria: string
  tipo: string
  cor: string
  tamanhos: TamanhoQuantidade[]
  personalizacoes: Personalizacao[]
  complexidade: Complexidade
  observacoes: string
}

export interface ProgressoSetor {
  atendimento: StatusSetor
  compra: StatusSetor
  corte: StatusSetor
  costura: StatusSetor
  estamparia_silk: StatusSetor
  prensa_dtf: StatusSetor
  prensa_sublimacao: StatusSetor
  acabamento: StatusSetor
}

export interface Pedido {
  id: string
  numero: string
  cliente: {
    nome: string
    empresa: string
    telefone: string
    email: string
  }
  tipo: TipoPedido
  status: StatusPedido
  pecas: Peca[]
  dataEntrada: string
  dataEntrega: string
  progresso: ProgressoSetor
  observacoes: string
  valorTotal: number
  valorPago: number
}

export interface Cliente {
  id: string
  nome: string
  empresa: string
  telefone: string
  email: string
  dataCadastro: string
}

export interface Terceirizada {
  id: string
  nome: string
  tipo: 'costura' | 'dtf' | 'sublimacao' | 'bordado'
  pedidoId: string
  numeroPedido: string
  itens: string
  dataEnvio: string
  dataRetornoPrevisto: string
  dataRetornoReal?: string
  valorCombinado: number
  valorPago: number
  status: 'enviado' | 'retornado' | 'pago'
  observacoes: string
}
