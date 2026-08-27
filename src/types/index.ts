import type { Perfil } from '@/lib/permissoes'

export type StatusPedido = 'orcamento' | 'aprovado' | 'aguardando_pagamento' | 'em_producao' | 'finalizado' | 'entregue' | 'cancelado'
export type TipoPedido = 'normal' | 'urgente' | 'grande_volume'
export type Complexidade = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
export type Personalizacao = 'bordado' | 'silk' | 'dtf' | 'sublimacao'
export type StatusSetor = 'pendente' | 'em_andamento' | 'concluido' | 'nao_se_aplica'

/**
 * Tamanho de uma linha da grade.
 *
 * Era um union fechado ('PP' | 'P' | ... | 'SOB_MEDIDA'). Virou `string`
 * porque a Nice recebe pedido com tamanho fora da régua o tempo todo — baby
 * look, EXG, numeração de escola — e a lista fechada obrigava a jogar tudo em
 * 'SOB_MEDIDA', que some da grade impressa como "Sob Medida" e não diz qual
 * era o tamanho.
 *
 * A lista sugerida continua existindo em TAMANHOS (src/lib/helpers.ts) e é o
 * que a tela oferece primeiro; o campo livre é a saída, não o caminho normal.
 * `getFaixaTamanho` cai em 'P/M/G' para tamanho que não reconhece, então um
 * valor digitado nunca quebra o cálculo automático — só não acerta a faixa
 * sozinho, e o valor unitário fica editável como sempre.
 */
export type Tamanho = string

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

/**
 * Status de um setor, mais quem mexeu por último e quando.
 *
 * `atualizadoPor`/`atualizadoEm` só existem a partir de um CLIQUE — nunca são
 * inventados. Pedido novo nasce com `atendimento: 'concluido'` sem autor
 * (é o sistema criando, não alguém clicando), e pedidos gravados antes desta
 * mudança não têm o campo nenhum. `normalizarProgresso` (store.ts) garante que
 * todo pedido lido do banco chega aqui com os dois campos ausentes nesses
 * casos, nunca com valor inventado.
 */
export interface EntradaProgresso {
  status: StatusSetor
  atualizadoPor?: string
  /** ISO 8601. */
  atualizadoEm?: string
}

export interface ProgressoSetor {
  atendimento: EntradaProgresso
  compra: EntradaProgresso
  corte: EntradaProgresso
  costura: EntradaProgresso
  estamparia_silk: EntradaProgresso
  prensa_dtf: EntradaProgresso
  prensa_sublimacao: EntradaProgresso
  acabamento: EntradaProgresso
}

/**
 * Liberação para o cliente pagar só na retirada.
 *
 * A regra 1 do sistema é que pedido não avança para produção sem pagamento
 * registrado. Cliente fiel é a exceção que o Pedro abre de vez em quando — e
 * até agora ela era feita por fora, lançando um pagamento que não existiu.
 * Isto dá um lugar para a exceção existir de forma explícita e rastreável.
 *
 * Quem pode o quê:
 *  - gestor: libera direto (nasce 'aprovada');
 *  - recepcionista: solicita (nasce 'pendente') e espera o gestor decidir;
 *  - enquanto está 'pendente' ou 'recusada', o pedido continua barrado.
 *
 * Guardado como JSONB numa coluna própria de `pedidos` (migration 013), no
 * mesmo espírito de `parcelas` e `progresso`.
 */
export type StatusExcecao = 'pendente' | 'aprovada' | 'recusada'

export interface ExcecaoPagamento {
  status: StatusExcecao
  /** Por que a exceção foi pedida. Obrigatório: é o que o gestor lê para decidir. */
  motivo: string
  solicitadoPor: string
  /** ISO 8601. */
  solicitadoEm: string
  /** Preenchidos na decisão. Gestor que libera direto já nasce com os dois. */
  decididoPor?: string
  decididoEm?: string
  /** Observação do gestor ao recusar — some da tela se vazia. */
  decisaoObservacao?: string
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
  /**
   * Qual lista de preços foi usada para calcular este pedido.
   *
   * `undefined` em pedido gravado antes das múltiplas tabelas: ninguém
   * escolheu, e preencher 'Escolar 1' retroativamente afirmaria uma coisa que
   * não aconteceu. A tela mostra "não registrado" nesse caso.
   */
  tabelaPreco?: string
  /**
   * Liberação de "pagar só na retirada". `undefined` = nunca foi pedida, que é
   * o caso da esmagadora maioria dos pedidos.
   */
  excecaoPagamento?: ExcecaoPagamento
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
