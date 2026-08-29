// Catálogo de prestadores terceirizados e preço por serviço (migration 015,
// Fase D2.1). Client AUTENTICADO sempre (`criarClienteBrowser`) — mesmo
// motivo de `etapas.ts` e `tabelasPreco.ts`: o client anônimo devolveria
// zero linhas em silêncio numa tabela com RLS.
//
// Nunca excluído pela tela — só desativado. `ativo=false` some dos
// seletores de novo lançamento em /terceirizadas, mas o prestador e os
// serviços continuam existindo para o histórico que já os referencia.

import type { Prestador, PrestadorServico, UnidadeServico } from '@/types'
import { criarClienteBrowser } from '@/lib/supabase/client'

function mapPrestador(row: any): Prestador {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone ?? '',
    documento: row.documento ?? '',
    observacoes: row.observacoes ?? '',
    ativo: row.ativo !== false,
  }
}

function mapServico(row: any): PrestadorServico {
  return {
    id: row.id,
    prestadorId: row.prestador_id,
    servico: row.servico,
    valor: Number(row.valor) || 0,
    unidade: (row.unidade === 'fixo' ? 'fixo' : 'peca') as UnidadeServico,
    ativo: row.ativo !== false,
  }
}

// ---------------------------------------------------------------------------
// Prestadores
// ---------------------------------------------------------------------------

export async function getPrestadores(): Promise<Prestador[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('prestadores')
    .select('*')
    .order('nome', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapPrestador)
}

export async function criarPrestador(dados: Omit<Prestador, 'id' | 'ativo'>): Promise<Prestador> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('prestadores')
    .insert({
      nome: dados.nome.trim(),
      telefone: dados.telefone || null,
      documento: dados.documento || null,
      observacoes: dados.observacoes || null,
    })
    .select()
    .single()
  if (error) throw error
  return mapPrestador(data)
}

export async function atualizarPrestador(
  id: string,
  dados: Partial<Pick<Prestador, 'nome' | 'telefone' | 'documento' | 'observacoes' | 'ativo'>>,
): Promise<void> {
  const supabase = criarClienteBrowser()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (dados.nome !== undefined) update.nome = dados.nome.trim()
  if (dados.telefone !== undefined) update.telefone = dados.telefone || null
  if (dados.documento !== undefined) update.documento = dados.documento || null
  if (dados.observacoes !== undefined) update.observacoes = dados.observacoes || null
  if (dados.ativo !== undefined) update.ativo = dados.ativo
  const { error } = await supabase.from('prestadores').update(update).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Serviços — todos de uma vez (a tela filtra por prestador no cliente; é uma
// tabela pequena, não justifica uma query por prestador toda vez que o
// seletor de lançamento muda de prestadora)
// ---------------------------------------------------------------------------

export async function getServicos(): Promise<PrestadorServico[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('prestador_servicos')
    .select('*')
    .order('servico', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapServico)
}

export async function criarServico(
  prestadorId: string,
  servico: string,
  valor: number,
  unidade: UnidadeServico,
): Promise<PrestadorServico> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('prestador_servicos')
    .insert({ prestador_id: prestadorId, servico: servico.trim(), valor, unidade })
    .select()
    .single()
  if (error) throw error
  return mapServico(data)
}

export async function atualizarServico(
  id: string,
  dados: Partial<Pick<PrestadorServico, 'servico' | 'valor' | 'unidade' | 'ativo'>>,
): Promise<void> {
  const supabase = criarClienteBrowser()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (dados.servico !== undefined) update.servico = dados.servico.trim()
  if (dados.valor !== undefined) update.valor = dados.valor
  if (dados.unidade !== undefined) update.unidade = dados.unidade
  if (dados.ativo !== undefined) update.ativo = dados.ativo
  const { error } = await supabase.from('prestador_servicos').update(update).eq('id', id)
  if (error) throw error
}
