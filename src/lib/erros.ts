// Classificação de erro do Supabase, compartilhada pelas telas.
//
// Só CLASSIFICA — não escreve a mensagem final. A consequência de uma falha
// muda por tela ("o rascunho ficou no navegador" em /tabela-precos, "a tela foi
// revertida" no Kanban), então quem monta o texto é a tela. O que se repete, e
// portanto mora aqui, é a leitura dos códigos do PostgREST/Postgres.
//
// Extraído de src/app/tabela-precos/page.tsx, preservando a ordem original dos
// testes — a ordem importa: offline tem que ser checado antes de rede, e código
// específico antes das faixas 22xxx/23xxx.

export type TipoFalha =
  /** Navegador sabe que está sem internet. */
  | 'offline'
  /** A requisição não chegou ao servidor. */
  | 'rede'
  /** Upsert sem a constraint única correspondente (42P10). */
  | 'conflito'
  /** Negado por permissão ou por policy de RLS. */
  | 'permissao'
  /** O banco recusou os dados (constraint 23xxx, tipo/formato 22xxx). */
  | 'validacao'
  | 'desconhecido'

export type Falha = {
  tipo: TipoFalha
  /** Código do Postgres/PostgREST, ou '' quando não veio. */
  code: string
  message: string
  details: string
}

export function classificarErro(err: unknown): Falha {
  const e = err as { code?: string; message?: string; details?: string } | null
  const code = e?.code ?? ''
  const message = e?.message ?? ''
  const details = e?.details ?? ''
  const base = { code, message, details }

  // Falha de rede: o supabase-js devolve code vazio e prefixa a mensagem com FetchError.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ...base, tipo: 'offline' }
  }
  if (message.startsWith('FetchError') || (!code && /fetch|network|failed to fetch/i.test(message))) {
    return { ...base, tipo: 'rede' }
  }

  if (code === '42P10' || /on conflict/i.test(message)) {
    return { ...base, tipo: 'conflito' }
  }

  if (
    code === '42501' || code === 'PGRST301' || code === '401' || code === '403' ||
    /permission|row-level security|not authorized/i.test(message)
  ) {
    return { ...base, tipo: 'permissao' }
  }

  if (code.startsWith('23') || code.startsWith('22')) {
    return { ...base, tipo: 'validacao' }
  }

  return { ...base, tipo: 'desconhecido' }
}

/** Sufixo " (42501)" para colar numa mensagem, ou '' se não houver código. */
export function sufixoCodigo(falha: Falha): string {
  return falha.code ? ` (${falha.code})` : ''
}
