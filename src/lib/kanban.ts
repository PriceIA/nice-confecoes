// Acesso a dados do Kanban (quadros / listas / cards).
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE SEPARADO DO store.ts
//
// As três tabelas do Kanban são as únicas do sistema com RLS LIGADO, e as
// policies decidem tudo a partir de auth.uid() (via a função security definer
// public.meu_perfil()).
//
// O store.ts usa o client de src/lib/supabase.ts, que é anônimo e NÃO carrega
// sessão. Com ele, auth.uid() é null dentro do banco: toda policy falha e as
// queries voltam ZERO LINHAS — sem erro, sem aviso, sem nada na tela. Um bug
// invisível.
//
// Por isso aqui, e só aqui, usamos criarClienteBrowser() (@supabase/ssr, sessão
// em cookies). Não importe `supabase` de '@/lib/supabase' neste arquivo.
//
// Isso é dívida técnica conhecida e assumida: o sistema passa a ter dois
// clients com semânticas diferentes até a Fase B ligar RLS nas tabelas antigas.
// Ver CLAUDE.md, seção "Estado de segurança atual".
// ============================================================================

import { criarClienteBrowser } from '@/lib/supabase/client'
import type { Cartao, CorLista, Lista, Quadro } from '@/types'
import type { Perfil } from '@/lib/permissoes'

// ---------------------------------------------------------------------------
// Posições
// ---------------------------------------------------------------------------

/**
 * Distância padrão entre dois itens vizinhos.
 *
 * `posicao` é numeric de propósito: mover um item é gravar UMA linha com a
 * média dos vizinhos, em vez de reindexar a lista inteira. Com 1024 de folga
 * cabem ~10 inserções sucessivas no mesmo ponto antes de a folga apertar.
 */
export const ESPACO_POSICAO = 1024

/**
 * Abaixo disto, dividir de novo começa a perder precisão de float64 e duas
 * posições diferentes viram o mesmo número — a ordem passaria a depender do
 * desempate do banco.
 */
const FOLGA_MINIMA = 0.0001

/**
 * Posição para um item solto entre `antes` e `depois` (undefined = ponta).
 *
 * Devolve `null` quando os vizinhos estão perto demais: aí o chamador precisa
 * renormalizar a lista antes de gravar. É raro, mas sem esse retorno o quadro
 * se corromperia em silêncio depois de muitos meses de arrastos no mesmo ponto.
 */
export function posicaoEntre(antes?: number, depois?: number): number | null {
  if (antes === undefined && depois === undefined) return ESPACO_POSICAO
  if (depois === undefined) return antes! + ESPACO_POSICAO
  if (antes === undefined) {
    return depois / 2 < FOLGA_MINIMA ? null : depois / 2
  }
  if (depois - antes < FOLGA_MINIMA) return null
  return (antes + depois) / 2
}

/** Posições limpas para uma lista inteira: 1024, 2048, 3072… */
export function posicoesRenormalizadas(quantidade: number): number[] {
  return Array.from({ length: quantidade }, (_, i) => (i + 1) * ESPACO_POSICAO)
}

// ---------------------------------------------------------------------------
// Mapeamento snake_case (banco) → camelCase (TypeScript)
// ---------------------------------------------------------------------------

function mapQuadro(row: any): Quadro {
  return {
    id: row.id,
    titulo: row.titulo ?? '',
    descricao: row.descricao ?? '',
    arquivado: row.arquivado ?? false,
    criadoEm: row.created_at,
  }
}

function mapLista(row: any): Lista {
  return {
    id: row.id,
    quadroId: row.quadro_id,
    titulo: row.titulo ?? '',
    posicao: Number(row.posicao) || 0,
    cor: (row.cor ?? 'verde') as CorLista,
  }
}

function mapCartao(row: any): Cartao {
  return {
    id: row.id,
    listaId: row.lista_id,
    titulo: row.titulo ?? '',
    descricao: row.descricao ?? '',
    posicao: Number(row.posicao) || 0,
    // Array vazio no banco significaria "ninguém vê"; tratamos como público,
    // igual a null, porque um cartão invisível para todos é sempre engano.
    perfisVisiveis: row.perfis_visiveis?.length ? (row.perfis_visiveis as Perfil[]) : null,
    pedidoId: row.pedido_id ?? null,
    prazo: row.prazo ?? null,
    concluido: row.concluido ?? false,
  }
}

// ---------------------------------------------------------------------------
// Quadros
// ---------------------------------------------------------------------------

export async function getQuadros(incluirArquivados = false): Promise<Quadro[]> {
  const supabase = criarClienteBrowser()
  let query = supabase.from('quadros').select('*').order('created_at', { ascending: true })
  if (!incluirArquivados) query = query.eq('arquivado', false)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapQuadro)
}

export type ContagemQuadro = { listas: number; cartoes: number }

/**
 * Contagem de listas e cartões por quadro, em duas queries.
 *
 * Os cartões já vêm filtrados pela RLS, então a contagem mostra o que ESTE
 * usuário pode ver — que é justamente o número certo para ele.
 */
export async function getContagens(): Promise<Record<string, ContagemQuadro>> {
  const supabase = criarClienteBrowser()

  const { data: listas, error: erroListas } = await supabase.from('listas').select('id, quadro_id')
  if (erroListas) throw erroListas

  const { data: cartoes, error: erroCartoes } = await supabase.from('cards').select('id, lista_id')
  if (erroCartoes) throw erroCartoes

  const quadroDaLista = new Map<string, string>()
  const contagens: Record<string, ContagemQuadro> = {}

  for (const l of listas ?? []) {
    quadroDaLista.set(l.id, l.quadro_id)
    contagens[l.quadro_id] ??= { listas: 0, cartoes: 0 }
    contagens[l.quadro_id].listas++
  }
  for (const c of cartoes ?? []) {
    const quadroId = quadroDaLista.get(c.lista_id)
    if (!quadroId) continue
    contagens[quadroId] ??= { listas: 0, cartoes: 0 }
    contagens[quadroId].cartoes++
  }
  return contagens
}

export async function criarQuadro(titulo: string, descricao = ''): Promise<Quadro> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('quadros')
    .insert({ titulo, descricao })
    .select()
    .single()
  if (error) throw error
  return mapQuadro(data)
}

export async function atualizarQuadro(
  id: string,
  dados: Partial<Pick<Quadro, 'titulo' | 'descricao' | 'arquivado'>>
): Promise<void> {
  const supabase = criarClienteBrowser()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (dados.titulo !== undefined) update.titulo = dados.titulo
  if (dados.descricao !== undefined) update.descricao = dados.descricao
  if (dados.arquivado !== undefined) update.arquivado = dados.arquivado

  const { error } = await supabase.from('quadros').update(update).eq('id', id)
  if (error) throw error
}

/**
 * Exclui o quadro inteiro, de baixo para cima.
 *
 * Apagar cartões e listas explicitamente funciona com OU sem ON DELETE CASCADE:
 * se houver cascade, os deletes de baixo só não encontram nada depois. Sem isso,
 * um schema sem cascade estouraria erro de chave estrangeira na hora de excluir.
 */
export async function excluirQuadro(id: string): Promise<void> {
  const supabase = criarClienteBrowser()

  const { data: listas, error: erroListas } = await supabase
    .from('listas').select('id').eq('quadro_id', id)
  if (erroListas) throw erroListas

  const ids = (listas ?? []).map(l => l.id)
  if (ids.length > 0) {
    const { error } = await supabase.from('cards').delete().in('lista_id', ids)
    if (error) throw error
  }

  const { error: erroApagarListas } = await supabase.from('listas').delete().eq('quadro_id', id)
  if (erroApagarListas) throw erroApagarListas

  const { error } = await supabase.from('quadros').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Quadro completo
// ---------------------------------------------------------------------------

export type QuadroCompleto = {
  quadro: Quadro
  listas: Lista[]
  cartoes: Cartao[]
}

export async function getQuadro(id: string): Promise<QuadroCompleto | null> {
  const supabase = criarClienteBrowser()

  const { data: quadro, error: erroQuadro } = await supabase
    .from('quadros').select('*').eq('id', id).maybeSingle()
  if (erroQuadro) throw erroQuadro
  if (!quadro) return null

  const { data: listas, error: erroListas } = await supabase
    .from('listas').select('*').eq('quadro_id', id).order('posicao', { ascending: true })
  if (erroListas) throw erroListas

  const idsListas = (listas ?? []).map(l => l.id)
  let cartoes: Cartao[] = []
  if (idsListas.length > 0) {
    const { data, error } = await supabase
      .from('cards').select('*').in('lista_id', idsListas).order('posicao', { ascending: true })
    if (error) throw error
    cartoes = (data ?? []).map(mapCartao)
  }

  return { quadro: mapQuadro(quadro), listas: (listas ?? []).map(mapLista), cartoes }
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------

export async function getListas(quadroId: string): Promise<Lista[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('listas').select('*').eq('quadro_id', quadroId).order('posicao', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapLista)
}

export async function criarLista(
  quadroId: string, titulo: string, posicao: number, cor: CorLista = 'verde'
): Promise<Lista> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('listas')
    .insert({ quadro_id: quadroId, titulo, posicao, cor })
    .select()
    .single()
  if (error) throw error
  return mapLista(data)
}

export async function atualizarLista(
  id: string,
  dados: Partial<Pick<Lista, 'titulo' | 'posicao' | 'cor'>>
): Promise<void> {
  const supabase = criarClienteBrowser()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (dados.titulo !== undefined) update.titulo = dados.titulo
  if (dados.posicao !== undefined) update.posicao = dados.posicao
  if (dados.cor !== undefined) update.cor = dados.cor

  const { error } = await supabase.from('listas').update(update).eq('id', id)
  if (error) throw error
}

/** Apaga os cartões antes da lista — mesmo motivo de excluirQuadro. */
export async function excluirLista(id: string): Promise<void> {
  const supabase = criarClienteBrowser()
  const { error: erroCartoes } = await supabase.from('cards').delete().eq('lista_id', id)
  if (erroCartoes) throw erroCartoes
  const { error } = await supabase.from('listas').delete().eq('id', id)
  if (error) throw error
}

/** Reescreve as posições das listas na ordem dada. Caminho raro (folga esgotada). */
export async function renormalizarListas(idsEmOrdem: string[]): Promise<void> {
  const posicoes = posicoesRenormalizadas(idsEmOrdem.length)
  await Promise.all(idsEmOrdem.map((id, i) => atualizarLista(id, { posicao: posicoes[i] })))
}

// ---------------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------------

export type DadosCartao = {
  listaId: string
  titulo: string
  descricao?: string
  posicao: number
  perfisVisiveis?: Perfil[] | null
  pedidoId?: string | null
  prazo?: string | null
}

export async function criarCartao(dados: DadosCartao): Promise<Cartao> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('cards')
    .insert({
      lista_id: dados.listaId,
      titulo: dados.titulo,
      descricao: dados.descricao ?? '',
      posicao: dados.posicao,
      perfis_visiveis: dados.perfisVisiveis?.length ? dados.perfisVisiveis : null,
      pedido_id: dados.pedidoId || null,
      prazo: dados.prazo || null,
    })
    .select()
    .single()
  if (error) throw error
  return mapCartao(data)
}

export async function atualizarCartao(
  id: string,
  dados: Partial<Pick<Cartao, 'titulo' | 'descricao' | 'prazo' | 'perfisVisiveis' | 'pedidoId' | 'concluido' | 'listaId' | 'posicao'>>
): Promise<void> {
  const supabase = criarClienteBrowser()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (dados.titulo !== undefined) update.titulo = dados.titulo
  if (dados.descricao !== undefined) update.descricao = dados.descricao
  if (dados.prazo !== undefined) update.prazo = dados.prazo || null
  if (dados.perfisVisiveis !== undefined) {
    update.perfis_visiveis = dados.perfisVisiveis?.length ? dados.perfisVisiveis : null
  }
  if (dados.pedidoId !== undefined) update.pedido_id = dados.pedidoId || null
  if (dados.concluido !== undefined) update.concluido = dados.concluido
  if (dados.listaId !== undefined) update.lista_id = dados.listaId
  if (dados.posicao !== undefined) update.posicao = dados.posicao

  const { error } = await supabase.from('cards').update(update).eq('id', id)
  if (error) throw error
}

/**
 * Maior `posicao` já usada na lista, ou 0 se estiver vazia.
 *
 * Para quem vai inserir um cartão sem ter o quadro carregado na tela (é o caso
 * do "criar cartão a partir do pedido"): sem isso, o cartão novo entraria na
 * frente dos que já estavam lá.
 */
export async function ultimaPosicaoDaLista(listaId: string): Promise<number> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('cards').select('posicao').eq('lista_id', listaId)
    .order('posicao', { ascending: false }).limit(1)
  if (error) throw error
  return Number(data?.[0]?.posicao) || 0
}

export async function excluirCartao(id: string): Promise<void> {
  const supabase = criarClienteBrowser()
  const { error } = await supabase.from('cards').delete().eq('id', id)
  if (error) throw error
}

/** Reescreve as posições dos cartões de uma lista na ordem dada. */
export async function renormalizarCartoes(listaId: string, idsEmOrdem: string[]): Promise<void> {
  const posicoes = posicoesRenormalizadas(idsEmOrdem.length)
  await Promise.all(
    idsEmOrdem.map((id, i) => atualizarCartao(id, { listaId, posicao: posicoes[i] }))
  )
}

// ---------------------------------------------------------------------------
// Ponte com os pedidos
// ---------------------------------------------------------------------------

/**
 * Número do pedido de cada id, para o cartão mostrar "#2025-0042" em vez do uuid.
 *
 * Lê `pedidos` pelo client autenticado. Funciona porque `pedidos` está com RLS
 * DESLIGADO — se a Fase B ligar RLS lá, esta query precisa de uma policy de
 * leitura, senão os links somem dos cartões.
 */
export async function numerosDePedidos(ids: string[]): Promise<Map<string, string>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)))
  if (unicos.length === 0) return new Map()

  const supabase = criarClienteBrowser()
  const { data, error } = await supabase.from('pedidos').select('id, numero').in('id', unicos)
  if (error) throw error
  return new Map((data ?? []).map(p => [p.id as string, p.numero as string]))
}
