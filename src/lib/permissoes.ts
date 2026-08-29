// FONTE ÚNICA de regras de perfil.
//
// Toda decisão de "quem pode ver/fazer o quê" sai daqui — middleware, sidebar e
// telas. Não espalhe `if (perfil === 'costureira')` por componente: adicionar um
// perfil novo deve ser mexer só neste arquivo.
//
// Os valores de Perfil espelham o CHECK da tabela `equipe` no banco:
//   check (perfil in ('gestor', 'recepcionista', 'designer', 'corte',
//                     'costureira', 'estamparia_serigrafia',
//                     'estamparia_sublimacao', 'acabamento'))
//
// O mesmo conjunto é lido no banco pela função `public.meu_perfil()`, usada pelas
// policies de RLS do Kanban. Ao mexer no CHECK, mexa nos dois lados.

export type Perfil =
  | 'gestor'
  | 'recepcionista'
  | 'designer'
  | 'corte'
  | 'costureira'
  | 'estamparia_serigrafia'
  | 'estamparia_sublimacao'
  | 'acabamento'

export const PERFIS: Perfil[] = [
  'gestor',
  'recepcionista',
  'designer',
  'corte',
  'costureira',
  'estamparia_serigrafia',
  'estamparia_sublimacao',
  'acabamento',
]

export const PERFIL_LABEL: Record<Perfil, string> = {
  gestor: 'Gestor',
  recepcionista: 'Recepcionista',
  designer: 'Designer',
  corte: 'Corte',
  costureira: 'Costureira',
  estamparia_serigrafia: 'Estamparia Serigrafia',
  estamparia_sublimacao: 'Estamparia Sublimação',
  acabamento: 'Acabamento/Embalagem',
}

/** Rótulo curto, para caber em etiqueta de cartão do Kanban. */
export const PERFIL_LABEL_CURTO: Record<Perfil, string> = {
  gestor: 'Gestor',
  recepcionista: 'Recepção',
  designer: 'Designer',
  corte: 'Corte',
  costureira: 'Costura',
  estamparia_serigrafia: 'Serigrafia',
  estamparia_sublimacao: 'Sublimação',
  acabamento: 'Acabamento',
}

type Permissoes = {
  /** Prefixos de rota liberados, ou 'todas' para acesso irrestrito. */
  rotas: string[] | 'todas'
  /** Para onde mandar o usuário ao entrar ou ao tentar uma rota proibida. */
  rotaInicial: string
  criarPedido: boolean
  editarPedido: boolean
  excluirPedido: boolean
  /** Marcar avanço de setor na tela de produção. */
  editarProducao: boolean
  /**
   * Ver QUALQUER valor em dinheiro de um pedido: parcelas, total, pago,
   * restante, valor unitário de peça, vetorização.
   *
   * Os perfis de chão de fábrica precisam saber o QUE produzir, não por quanto
   * foi vendido. Já era a intenção quando `/dashboard`, `/relatorios` e
   * `/tabela-precos` ficaram fora das rotas deles — mas o detalhe do pedido
   * continuava mostrando a seção de Pagamentos, porque não havia flag para
   * consultar. Esta é a flag.
   *
   * Vale também para o que sai na IMPRESSÃO: a ficha A4 do pedido tem uma
   * página final de resumo e pagamento, e ela só existe para quem pode ver
   * dinheiro — senão o vazamento só muda de suporte.
   */
  verFinanceiro: boolean
  /**
   * Criar, editar, mover e excluir quadros, listas e cartões do Kanban.
   * Sem isso, /quadros abre em modo leitura: sem drag e sem botões.
   *
   * Espelha a RLS: no banco, as policies de escrita em quadros/listas/cards só
   * aceitam gestor e recepcionista. Isto aqui é a mesma regra na interface — a
   * tela não oferece o que o banco recusaria.
   */
  editarKanban: boolean
  /**
   * Pedir que um pedido possa ir para produção sem pagamento registrado
   * ("pagar na retirada", para cliente fiel).
   *
   * Pedir não libera nada: a solicitação nasce pendente e o pedido segue
   * barrado até alguém com `aprovarExcecaoPagamento` decidir.
   */
  solicitarExcecaoPagamento: boolean
  /**
   * Decidir (aprovar ou recusar) essa liberação.
   *
   * É a ÚNICA permissão em que gestor e recepcionista divergem — por isso
   * `RECEPCIONISTA` deixou de ser o mesmo objeto que `ACESSO_TOTAL`. O Pedro
   * quis que a Kalomira pudesse pedir, mas que a decisão fosse dele.
   *
   * A checagem existe também no BANCO, num trigger sobre `pedidos`
   * (migration 013): aqui a tela não oferece o botão, lá a gravação é
   * recusada. Diferente de `verFinanceiro`, que é só interface.
   */
  aprovarExcecaoPagamento: boolean
  /**
   * Excluir um lançamento de terceirizada.
   *
   * Editar é de gestor e recepcionista (as duas únicas com a rota); excluir
   * é só do gestor, porque um envio apagado leva junto o histórico de
   * pagamento daquele prestador e não tem desfazer.
   */
  excluirTerceirizada: boolean
}

/** Gestor: tudo, inclusive decidir sobre a exceção de pagamento. */
const ACESSO_TOTAL: Permissoes = {
  rotas: 'todas',
  rotaInicial: '/dashboard',
  criarPedido: true,
  editarPedido: true,
  excluirPedido: true,
  editarProducao: true,
  editarKanban: true,
  verFinanceiro: true,
  solicitarExcecaoPagamento: true,
  aprovarExcecaoPagamento: true,
  excluirTerceirizada: true,
}

/**
 * Recepcionista: o mesmo acesso do gestor, MENOS a decisão sobre pagar na
 * retirada (ela pede, ele decide) e MENOS excluir lançamento de terceirizada.
 *
 * Até aqui os dois perfis compartilhavam literalmente o mesmo objeto. O
 * spread deixa explícito quais campos divergem: cada divergência nova aparece
 * nesta lista em vez de se esconder numa cópia inteira do objeto.
 */
const RECEPCIONISTA: Permissoes = {
  ...ACESSO_TOTAL,
  aprovarExcecaoPagamento: false,
  excluirTerceirizada: false,
}

/**
 * Chão de fábrica: lê pedidos, opera a tela de produção, lê o Kanban, e nada
 * além disso. Sem /dashboard — ele expõe faturamento e total de clientes.
 * Sem /entregas também, de propósito: marcar como entregue muda o status do
 * pedido, mesma ação que já é exclusiva de quem tem `editarPedido`.
 *
 * Um objeto compartilhado, e não seis cópias: enquanto os perfis de produção
 * tiverem o mesmo acesso, isso fica dito uma vez só. Quando um deles precisar
 * divergir, ele ganha o próprio objeto.
 */
const LEITURA_PRODUCAO: Permissoes = {
  rotas: ['/pedidos', '/producao', '/quadros', '/perfil'],
  rotaInicial: '/producao',
  criarPedido: false,
  editarPedido: false,
  excluirPedido: false,
  editarProducao: true,
  editarKanban: false,
  verFinanceiro: false,
  solicitarExcecaoPagamento: false,
  aprovarExcecaoPagamento: false,
  excluirTerceirizada: false,
}

export const PERMISSOES: Record<Perfil, Permissoes> = {
  // Gestor e recepcionista continuam com acesso total às telas; a única
  // diferença entre os dois é quem decide a exceção de pagamento.
  gestor: ACESSO_TOTAL,
  recepcionista: RECEPCIONISTA,

  designer: LEITURA_PRODUCAO,
  corte: LEITURA_PRODUCAO,
  costureira: LEITURA_PRODUCAO,
  estamparia_serigrafia: LEITURA_PRODUCAO,
  estamparia_sublimacao: LEITURA_PRODUCAO,
  acabamento: LEITURA_PRODUCAO,
}

/** Rotas que não exigem sessão. */
export const ROTAS_PUBLICAS = ['/login']

export function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some(r => pathname === r || pathname.startsWith(r + '/'))
}

export function permissoesDe(perfil: Perfil): Permissoes {
  // O fallback é o acesso mais restrito, nunca o mais amplo: perfil
  // desconhecido (linha nova em `equipe` sem código correspondente aqui) entra
  // como chão de fábrica, não como gestor.
  return PERMISSOES[perfil] ?? LEITURA_PRODUCAO
}

/**
 * O perfil pode abrir esta rota? Compara por prefixo, então '/pedidos' libera
 * também '/pedidos/[id]'.
 */
export function podeAcessarRota(perfil: Perfil, pathname: string): boolean {
  const { rotas } = permissoesDe(perfil)
  if (rotas === 'todas') return true
  return rotas.some(r => pathname === r || pathname.startsWith(r + '/'))
}

export function rotaInicialDe(perfil: Perfil): string {
  return permissoesDe(perfil).rotaInicial
}
