// Acesso a dados de Recados (Fase J) — chat privado entre duas pessoas da equipe.
//
// Client AUTENTICADO, função por função, igual kanban.ts. A privacidade da
// conversa é RLS (migration 018): a policy de select só deixa remetente e
// destinatário lerem, então `getMeusRecados` já volta só o que é meu — não
// existe um "getConversa(outroId)" que filtre no client, porque filtrar no
// client seria confiar em algo que o próprio banco já garante.
//
// Número do pedido para o link do balão (J3): reusar `numerosDePedidos`, de
// `kanban.ts` — não duplicar aqui.

import { criarClienteBrowser } from '@/lib/supabase/client'
import type { Conversa, MembroEquipe, Recado } from '@/types'
import type { Perfil } from '@/lib/permissoes'

export const TEXTO_MAX = 500

export const RESPOSTAS_RAPIDAS = ['Ok', 'Já vou', 'Preciso de ajuda', 'Visto'] as const

function mapRecado(row: any): Recado {
  return {
    id: row.id,
    remetenteId: row.remetente_id,
    destinatarioId: row.destinatario_id,
    texto: row.texto ?? '',
    pedidoId: row.pedido_id ?? null,
    criadoEm: row.criado_em,
    lidoEm: row.lido_em ?? null,
  }
}

function mapMembroEquipe(row: any): MembroEquipe {
  return { id: row.id, nome: row.nome ?? '', perfil: row.perfil as Perfil }
}

/**
 * Pessoas para "Nova conversa", sem a própria pessoa.
 *
 * Via `rpc('listar_equipe')` (migration 018, security definer) — não lê
 * `equipe` direto, porque essa tabela foi criada fora do repo e não tem
 * policy de select garantida para todo perfil (ver `getEquipe` em kanban.ts).
 */
export async function getEquipeRecados(meuId: string): Promise<MembroEquipe[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase.rpc('listar_equipe')
  if (error) throw error
  return (data ?? []).map(mapMembroEquipe).filter((m: MembroEquipe) => m.id !== meuId)
}

/**
 * Todos os recados que envolvem a pessoa logada, mais antigo primeiro.
 *
 * A RLS de select já filtra por remetente/destinatário — não há `.eq` aqui
 * porque não é preciso: o banco nunca devolve recado de outro par. 30 dias é
 * pouco (limpeza automática, 018b), então não vale a pena paginar.
 */
export async function getMeusRecados(): Promise<Recado[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('recados')
    .select('*')
    .order('criado_em', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapRecado)
}

/**
 * Uma conversa por pessoa (a outra ponta de cada recado), mais recente
 * primeiro. `naoLidas` conta só o que EU recebi e ainda não vi.
 */
export function agruparConversas(
  recados: Recado[],
  meuId: string,
  equipe: MembroEquipe[]
): Conversa[] {
  const porPessoa = new Map<string, Conversa>()

  for (const r of recados) {
    const outroId = r.remetenteId === meuId ? r.destinatarioId : r.remetenteId
    const outro = equipe.find(m => m.id === outroId)
    if (!outro) continue

    const atual = porPessoa.get(outroId)
    const naoLida = r.destinatarioId === meuId && r.lidoEm === null ? 1 : 0

    if (!atual) {
      porPessoa.set(outroId, { outro, ultima: r, naoLidas: naoLida })
    } else {
      atual.naoLidas += naoLida
      if (new Date(r.criadoEm) > new Date(atual.ultima.criadoEm)) atual.ultima = r
    }
  }

  return Array.from(porPessoa.values()).sort(
    (a, b) => new Date(b.ultima.criadoEm).getTime() - new Date(a.ultima.criadoEm).getTime()
  )
}

export type DadosRecado = {
  remetenteId: string
  destinatarioId: string
  texto: string
  pedidoId?: string | null
}

/** Recusa vazio ou maior que TEXTO_MAX antes de ir ao banco — o banco também recusa (constraint), isto é só feedback rápido. */
export async function enviarRecado(dados: DadosRecado): Promise<Recado> {
  const texto = dados.texto.trim()
  if (texto.length === 0 || texto.length > TEXTO_MAX) {
    throw new Error(`O recado precisa ter entre 1 e ${TEXTO_MAX} caracteres.`)
  }

  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('recados')
    .insert({
      remetente_id: dados.remetenteId,
      destinatario_id: dados.destinatarioId,
      texto,
      pedido_id: dados.pedidoId || null,
    })
    .select()
    .single()
  if (error) throw error
  return mapRecado(data)
}

/** Marca como lidos (✓✓) todos os recados que `deId` me mandou. */
export async function marcarLidos(deId: string): Promise<void> {
  const supabase = criarClienteBrowser()
  const { error } = await supabase.rpc('marcar_recados_lidos', { p_de: deId })
  if (error) throw error
}

export type AssinaturaRecados = {
  aoInserir: (recado: Recado) => void
  aoAtualizar: (recado: Recado) => void
}

/**
 * Assina o Realtime de `recados` para a pessoa logada: um INSERT quando
 * chega recado novo para mim, um UPDATE quando o outro lado marca como visto
 * um recado meu (✓ → ✓✓). O Realtime respeita a mesma RLS da tabela, então
 * não é preciso filtrar de novo no client.
 *
 * Devolve a função de limpeza (`removeChannel`) — chamar ao desmontar.
 */
export function assinarRecados(meuId: string, { aoInserir, aoAtualizar }: AssinaturaRecados): () => void {
  const supabase = criarClienteBrowser()
  const canal = supabase
    .channel('recados-' + meuId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'recados', filter: `destinatario_id=eq.${meuId}` },
      payload => aoInserir(mapRecado(payload.new))
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'recados', filter: `remetente_id=eq.${meuId}` },
      payload => aoAtualizar(mapRecado(payload.new))
    )
    .subscribe()

  return () => {
    supabase.removeChannel(canal)
  }
}
