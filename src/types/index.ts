export type StatusPedido = 'orcamento' | 'aprovado' | 'aguardando_pagamento' | 'em_producao' | 'finalizado' | 'entregue' | 'cancelado'
export type TipoPedido = 'normal' | 'urgente' | 'grande_volume'
export type Complexidade = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
export type Personalizacao = 'bordado' | 'silk' | 'dtf' | 'sublimacao'
export type StatusSetor = 'pendente' | 'em_andamento' | 'concluido'

export type Tamanho = 'PP' | 'P' | 'M' | 'G' | 'GG' | 'XGG' | 'UNICO' | '01' | '02' | '04' | '06' | '08' | '10' | '12' | '14' | 'SOB_MEDIDA'

export interface TamanhoQuantidade {
  tamanho: Tamanho
  quantidade: number
  medidaEspecial?: string
}

export interface Peca {
  id: string
  categoria: string
  tipo: string
  cor: string
  tamanhos: TamanhoQuantidade[]
  personalizacoes: Personalizacao[]
  corPersonalizacao?: string
  complexidade: Complexidade
  valorUnitario?: number
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

export interface Parcela {
  id: string
  descricao: string
  valor: number
  dataPrevista: string
  dataPagamento?: string
  pago: boolean
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
  consultor: string
  tipo: TipoPedido
  status: StatusPedido
  pecas: Peca[]
  parcelas: Parcela[]
  dataEntrada: string
  dataEntrega: string
  progresso: ProgressoSetor
  observacoes: string
  valorTotal: number
  valorPago: number
  imagem?: string
  vetorizacao?: { necessaria: boolean; valor: number }
}

export interface Cliente {
  id: string
  nome: string
  empresa: string
  responsavelEmpresa?: string
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
