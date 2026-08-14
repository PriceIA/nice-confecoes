import type { Perfil } from '@/lib/permissoes'

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
  fotos: string[]
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
    responsavel: string
    endereco: string
    documento: string
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
  vetorizacao?: { necessaria: boolean; valor: number }
}

export interface Cliente {
  id: string
  nome: string
  empresa: string
  telefone: string
  email: string
  responsavel: string
  endereco: string
  documento: string
  dataCadastro: string
}

// ---------------------------------------------------------------------------
// Kanban de quadros livres (quadros → listas → cartões).
//
// Diferente de `ProgressoSetor`, que é o progresso REAL de um pedido pelos 8
// setores: aqui são tarefas livres, e as colunas são o que o usuário quiser.
//
// Estas três tabelas são as únicas do sistema com RLS LIGADO. Todo acesso passa
// por src/lib/kanban.ts, que usa o client AUTENTICADO — o client anônimo do
// store.ts devolveria zero linhas em silêncio. Ver CLAUDE.md.
// ---------------------------------------------------------------------------

/** Chave de cor da lista. O hex nunca vai ao banco — só esta chave. */
export type CorLista = 'verde' | 'verde_claro' | 'cinza' | 'azul' | 'ambar' | 'roxo' | 'vermelho'

export interface Quadro {
  id: string
  titulo: string
  descricao: string
  arquivado: boolean
  criadoEm: string
}

export interface Lista {
  id: string
  quadroId: string
  titulo: string
  /** numeric no banco: mover é calcular a média entre os vizinhos. */
  posicao: number
  cor: CorLista
}

export interface Cartao {
  id: string
  listaId: string
  titulo: string
  descricao: string
  posicao: number
  /** null = público (todos os perfis veem). Não-nulo = só os perfis listados. */
  perfisVisiveis: Perfil[] | null
  /** Vínculo opcional com um pedido; o cartão mostra link para ele. */
  pedidoId: string | null
  /** 'AAAA-MM-DD' ou null. */
  prazo: string | null
  concluido: boolean
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
