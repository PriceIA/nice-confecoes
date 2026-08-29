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
  /**
   * Posição desta etapa NESTE pedido (Fase D3b), 1-based.
   *
   * `undefined` em pedido gravado antes da D3 — e continua assim até alguém
   * arrastar. `etapasDoPedido` (src/lib/etapas.ts) trata a ausência caindo na
   * ordem do catálogo e depois na ordem canônica, então pedido antigo aparece
   * exatamente como sempre apareceu, sem migração de dado nenhuma.
   */
  ordem?: number
}

/**
 * O progresso de um pedido, como ele realmente é no banco: um JSONB sem
 * schema, cujas chaves são etapas.
 *
 * Virou aberto na Fase D3: os 8 setores deixaram de ser fixos, e o Pedro pode
 * acrescentar etapas próprias (bordado, lavanderia) pelo catálogo
 * `etapas_producao`. As chaves criadas por ele levam o prefixo `extra_`.
 *
 * A "lixeira" da tela marca `nao_se_aplica` e NUNCA apaga a chave, então uma
 * canônica não some de um pedido que já a tem. Mas ela pode nunca ter entrado:
 * se o Pedro desativar `prensa_sublimacao` no catálogo, os pedidos criados
 * depois disso simplesmente não a terão.
 *
 * **Por isso: nunca assuma que uma canônica existe.** Use
 * `progresso.acabamento?.status`, não `progresso.acabamento.status`.
 */
export type Progresso = Record<string, EntradaProgresso>

/**
 * As 8 chaves canônicas do sistema. **Não descreve mais o progresso de um
 * pedido** — serve como referência do vocabulário original (semente do
 * catálogo, rótulos de fallback). Um pedido pode ter menos que estas, ou mais.
 */
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
  progresso: Progresso
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

/**
 * Uma etapa do catálogo de produção (tabela `etapas_producao`, migration 014).
 *
 * `chave` é o que vai para dentro de `pedidos.progresso` — é ela que
 * identifica a etapa, não o rótulo. Renomear não pode perder status gravado.
 *
 * `canonica` marca as 8 originais do sistema: elas não podem ser excluídas do
 * catálogo, e a trava vale no banco (policy de delete da migration 014), não
 * só no botão escondido da tela.
 */
export interface EtapaProducao {
  chave: string
  rotulo: string
  /** Ordem PADRÃO, usada para semear pedido novo e listar o catálogo. */
  ordem: number
  ativa: boolean
  canonica: boolean
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
  /**
   * Fase D2.1. `prestadorId` vazio = lançamento "outro/avulso": `nome` foi
   * digitado à mão, sem prestador do catálogo por trás. Quando preenchido,
   * `nome` veio de `prestadores.nome` no momento do lançamento — texto
   * copiado, não uma junção ao vivo (ver `src/lib/prestadores.ts`).
   */
  prestadorId?: string
  /** Nome do serviço no momento do lançamento — texto solto, não FK. */
  servico?: string
  quantidade?: number
  /**
   * Copiado de `prestador_servicos.valor` no momento do lançamento. Nunca
   * muda sozinho depois: editar o preço do serviço no cadastro não altera
   * lançamentos já gravados.
   */
  valorUnitario?: number
}

/** O catálogo de um prestador terceirizado (migration 015, Fase D2.1). */
export interface Prestador {
  id: string
  nome: string
  telefone: string
  documento: string
  observacoes: string
  /** Nunca excluído pela tela — só desativado. Ver `prestador_servicos`. */
  ativo: boolean
}

/** 'peca': valor × quantidade. 'fixo': valor não escala com quantidade. */
export type UnidadeServico = 'peca' | 'fixo'

/**
 * Um serviço com preço, de um prestador específico (ex.: "Bordado ponto
 * cheio" da Vera, R$ 3,50/peça). `servico` é único por prestador — é o que
 * permite identificar sem ambiguidade o texto gravado em
 * `Terceirizada.servico` no momento do lançamento.
 */
export interface PrestadorServico {
  id: string
  prestadorId: string
  servico: string
  valor: number
  unidade: UnidadeServico
  /** Nunca excluído pela tela — só desativado. Some dos seletores, fica no histórico. */
  ativo: boolean
}
