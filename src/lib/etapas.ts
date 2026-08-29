// Catálogo de etapas de produção (Fase D3a).
//
// Até aqui os 8 setores eram chaves fixas em SETOR_LABELS (helpers.ts). Agora
// o catálogo vive no banco (`etapas_producao`, migration 014) e o Pedro pode
// criar etapa nova — bordado, lavanderia — sem deploy.
//
// A constante ETAPAS_PADRAO abaixo é SEMENTE, não fonte: ela existe para o
// caso de o banco não responder ou de a migration ainda não ter rodado. É o
// mesmo padrão que a Fase C2 usou em `tabelasPreco.ts` / `precosEscolar.ts`,
// e pelo mesmo motivo — quem roda o SQL é o Pedro, à mão, em outro momento.
//
// Client AUTENTICADO, sempre (`criarClienteBrowser`). O client anônimo de
// `./supabase` devolveria zero linhas em silêncio nesta tabela, que tem RLS.

import type { EntradaProgresso, EtapaProducao, Progresso } from '@/types'
import { criarClienteBrowser } from '@/lib/supabase/client'
import { SETOR_LABELS } from '@/lib/helpers'

// ---------------------------------------------------------------------------
// Semente
// ---------------------------------------------------------------------------

/**
 * As 8 etapas canônicas, na ordem histórica do sistema.
 *
 * Os rótulos são EXATAMENTE os de SETOR_LABELS e os da semente da migration
 * 014 — os três precisam concordar. Renomear um sem os outros reabre a mesma
 * divergência que a tabela de preços já custou uma sessão inteira.
 */
export const ETAPAS_PADRAO: EtapaProducao[] = [
  { chave: 'atendimento', rotulo: 'Atendimento', ordem: 1, ativa: true, canonica: true },
  { chave: 'compra', rotulo: 'Compra', ordem: 2, ativa: true, canonica: true },
  { chave: 'corte', rotulo: 'Corte', ordem: 3, ativa: true, canonica: true },
  { chave: 'costura', rotulo: 'Costura', ordem: 4, ativa: true, canonica: true },
  { chave: 'estamparia_silk', rotulo: 'Estamparia Silk', ordem: 5, ativa: true, canonica: true },
  { chave: 'prensa_dtf', rotulo: 'Prensa DTF', ordem: 6, ativa: true, canonica: true },
  { chave: 'prensa_sublimacao', rotulo: 'Prensa Sublimação', ordem: 7, ativa: true, canonica: true },
  { chave: 'acabamento', rotulo: 'Acabamento/Embalagem', ordem: 8, ativa: true, canonica: true },
]

export const CHAVES_CANONICAS = ETAPAS_PADRAO.map(e => e.chave)

/** Relação inexistente: a migration 014 ainda não rodou neste banco. */
const RELACAO_INEXISTENTE = '42P01'

function mapEtapa(row: any): EtapaProducao {
  return {
    chave: row.chave,
    rotulo: row.rotulo,
    ordem: Number(row.ordem) || 0,
    ativa: row.ativa !== false,
    canonica: row.canonica === true,
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type CatalogoEtapas = {
  etapas: EtapaProducao[]
  /**
   * true quando o catálogo veio da SEMENTE, não do banco — a migration 014
   * ainda não rodou. A tela usa isso para não oferecer "criar etapa": gravar
   * numa tabela que não existe falharia, e prometer na tela o que o banco não
   * tem é exatamente a regra 10 do CLAUDE.md ao contrário.
   */
  semente: boolean
}

export async function carregarEtapas(): Promise<CatalogoEtapas> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('etapas_producao')
    .select('*')
    .order('ordem', { ascending: true })

  if (error) {
    // Tabela ainda não existe: cai na semente em vez de quebrar a tela de
    // produção, que está em uso diário. Qualquer OUTRO erro sobe — um bloqueio
    // de RLS não pode ser confundido com "a migration não rodou".
    if ((error as { code?: string }).code === RELACAO_INEXISTENTE) {
      return { etapas: [...ETAPAS_PADRAO], semente: true }
    }
    throw error
  }

  const etapas = (data ?? []).map(mapEtapa)
  // Banco respondeu, mas vazio (alguém apagou tudo, ou a semente não rodou):
  // a tela precisa de nomes de qualquer jeito.
  if (etapas.length === 0) return { etapas: [...ETAPAS_PADRAO], semente: true }

  return { etapas, semente: false }
}

// ---------------------------------------------------------------------------
// Escrita — só gestor/recepcionista passa pelo RLS
// ---------------------------------------------------------------------------

export async function criarEtapa(rotulo: string, ordem: number): Promise<EtapaProducao> {
  const supabase = criarClienteBrowser()
  const chave = chaveNova(rotulo)
  const { data, error } = await supabase
    .from('etapas_producao')
    .insert({ chave, rotulo: rotulo.trim(), ordem, canonica: false })
    .select()
    .single()
  if (error) throw error
  return mapEtapa(data)
}

export async function atualizarEtapa(
  chave: string,
  dados: Partial<Pick<EtapaProducao, 'rotulo' | 'ordem' | 'ativa'>>,
): Promise<void> {
  const supabase = criarClienteBrowser()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (dados.rotulo !== undefined) update.rotulo = dados.rotulo.trim()
  if (dados.ordem !== undefined) update.ordem = dados.ordem
  if (dados.ativa !== undefined) update.ativa = dados.ativa
  const { error } = await supabase.from('etapas_producao').update(update).eq('chave', chave)
  if (error) throw error
}

/**
 * Remove uma etapa do CATÁLOGO. Não toca em pedido nenhum: um pedido que já
 * tem essa chave no progresso continua com ela, e passa a exibir o rótulo de
 * fallback. As 8 canônicas são barradas pela policy de delete, no banco.
 */
export async function removerEtapa(chave: string): Promise<void> {
  const supabase = criarClienteBrowser()
  const { error } = await supabase.from('etapas_producao').delete().eq('chave', chave)
  if (error) throw error
}

/**
 * Chave a partir do rótulo digitado, com sufixo aleatório.
 *
 * O sufixo não é paranoia: sem ele, "Bordado" excluído e recriado reusaria a
 * chave `extra_bordado` e herdaria em silêncio o status gravado nos pedidos
 * antigos. E o prefixo `extra_` deixa óbvio, olhando o JSONB cru no Supabase,
 * o que é etapa criada pelo Pedro e o que é setor original do sistema.
 */
export function chaveNova(rotulo: string): string {
  const base = rotulo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
  const sufixo = Math.random().toString(36).slice(2, 8)
  return `extra_${base || 'etapa'}_${sufixo}`
}

// ---------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------

/**
 * O nome de uma etapa, com três degraus de fallback:
 *   catálogo do banco → SETOR_LABELS (as 8 do código) → a própria chave, legível.
 *
 * O terceiro degrau importa: um pedido pode ter chave que o catálogo não tem
 * (etapa excluída do catálogo, ou banco sem a migration). Melhor mostrar
 * "Bordado" derivado da chave do que um card sem nome.
 */
export function rotuloEtapa(chave: string, etapas: EtapaProducao[]): string {
  const doBanco = etapas.find(e => e.chave === chave)
  if (doBanco) return doBanco.rotulo
  if (SETOR_LABELS[chave]) return SETOR_LABELS[chave]
  return chave
    .replace(/^extra_/, '')
    .replace(/_[a-z0-9]{6}$/, '')
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase())
}

export type EtapaDoPedido = {
  chave: string
  rotulo: string
  entrada: EntradaProgresso
}

/**
 * As etapas DESTE pedido, na ordem DESTE pedido.
 *
 * A ordem sai de três lugares, nesta precedência: `entrada.ordem` (arrastada
 * neste pedido) → a ordem do catálogo → a ordem canônica. Etapa sem ordem
 * nenhuma vai para o fim, e o empate é resolvido pela chave, para a lista não
 * dançar entre renders.
 *
 * Pedido gravado antes da D3 não tem `ordem` em lugar nenhum e cai inteiro no
 * segundo degrau — ou seja, continua aparecendo exatamente como aparecia.
 */
export function etapasDoPedido(progresso: Progresso | undefined, etapas: EtapaProducao[]): EtapaDoPedido[] {
  const ordemCatalogo = new Map(etapas.map(e => [e.chave, e.ordem]))
  const ordemCanonica = new Map(CHAVES_CANONICAS.map((c, i) => [c, i + 1]))

  const lista = Object.entries(progresso ?? {}).map(([chave, entrada]) => ({
    chave,
    rotulo: rotuloEtapa(chave, etapas),
    entrada: entrada as EntradaProgresso,
  }))

  const peso = (chave: string, entrada: EntradaProgresso) =>
    entrada?.ordem ?? ordemCatalogo.get(chave) ?? ordemCanonica.get(chave) ?? Number.MAX_SAFE_INTEGER

  return lista.sort((a, b) => {
    const diff = peso(a.chave, a.entrada) - peso(b.chave, b.entrada)
    return diff !== 0 ? diff : a.chave.localeCompare(b.chave)
  })
}

/**
 * Reescreve o campo `ordem` de todas as entradas a partir da ordem visual.
 *
 * Sempre reescreve TODAS, nunca só as que se moveram: o pedido pode ter
 * entradas sem `ordem` (gravadas antes da D3), e deixar as duas convenções
 * convivendo no mesmo pedido faria a lista pular ao recarregar.
 */
export function aplicarOrdem(progresso: Progresso, chavesNaOrdem: string[]): Progresso {
  const out: Progresso = { ...progresso }
  chavesNaOrdem.forEach((chave, i) => {
    if (!out[chave]) return
    out[chave] = { ...out[chave], ordem: i + 1 }
  })
  return out
}

/** Etapas do catálogo que ainda não estão neste pedido — o seletor de "adicionar". */
export function etapasDisponiveis(progresso: Progresso | undefined, etapas: EtapaProducao[]): EtapaProducao[] {
  const jaTem = new Set(Object.keys(progresso ?? {}))
  return etapas.filter(e => e.ativa && !jaTem.has(e.chave))
}
