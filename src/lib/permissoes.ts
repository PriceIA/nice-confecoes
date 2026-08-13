// FONTE ÚNICA de regras de perfil.
//
// Toda decisão de "quem pode ver/fazer o quê" sai daqui — middleware, sidebar e
// telas. Não espalhe `if (perfil === 'costureira')` por componente: adicionar um
// perfil novo deve ser mexer só neste arquivo.
//
// Os valores de Perfil espelham o CHECK da tabela `equipe` no banco:
//   check (perfil in ('gestor', 'recepcionista', 'costureira'))

export type Perfil = 'gestor' | 'recepcionista' | 'costureira'

export const PERFIS: Perfil[] = ['gestor', 'recepcionista', 'costureira']

export const PERFIL_LABEL: Record<Perfil, string> = {
  gestor: 'Gestor',
  recepcionista: 'Recepcionista',
  costureira: 'Costureira',
}

type Permissoes = {
  /** Prefixos de rota liberados, ou 'todas' para acesso irrestrito. */
  rotas: string[] | 'todas'
  /** Para onde mandar o usuário ao entrar ou ao tentar uma rota proibida. */
  rotaInicial: string
  criarPedido: boolean
  editarPedido: boolean
  excluirPedido: boolean
  /** Marcar avanço de setor no Kanban de produção. */
  editarProducao: boolean
}

const ACESSO_TOTAL: Permissoes = {
  rotas: 'todas',
  rotaInicial: '/dashboard',
  criarPedido: true,
  editarPedido: true,
  excluirPedido: true,
  editarProducao: true,
}

export const PERMISSOES: Record<Perfil, Permissoes> = {
  // Gestor e recepcionista mantêm exatamente o comportamento anterior ao login.
  gestor: ACESSO_TOTAL,
  recepcionista: ACESSO_TOTAL,

  // Costureira: lê pedidos, opera o Kanban de produção, e nada além disso.
  // Sem /dashboard — ele expõe faturamento e total de clientes.
  costureira: {
    rotas: ['/pedidos', '/producao', '/perfil'],
    rotaInicial: '/producao',
    criarPedido: false,
    editarPedido: false,
    excluirPedido: false,
    editarProducao: true,
  },
}

/** Rotas que não exigem sessão. */
export const ROTAS_PUBLICAS = ['/login']

export function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some(r => pathname === r || pathname.startsWith(r + '/'))
}

export function permissoesDe(perfil: Perfil): Permissoes {
  return PERMISSOES[perfil] ?? PERMISSOES.costureira
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
