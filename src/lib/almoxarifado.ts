// Almoxarifado (migration 019, Fase K): materiais e movimentos de estoque.
// Client AUTENTICADO sempre (`criarClienteBrowser`), função por função — mesmo
// motivo de `kanban.ts` e `prestadores.ts`: o client anônimo devolveria zero
// linhas em silêncio numa tabela com RLS.
//
// As quatro regras da fase valem aqui dentro:
//   K-1. `materiais.saldo` é derivado dos movimentos. Nenhuma função deste
//        arquivo manda `saldo` — o trigger `estoque_aplicar_movimento` é quem
//        o atualiza, e `materiais_guard` recusa update direto vindo do app.
//   K-2. Movimento não se edita nem se apaga. Não existe função para isso,
//        e no banco não existe policy de update/delete.
//   K-3. Material nunca é excluído, só desativado (`ativo = false`).
//   K-4. A tela sempre pede quantidade POSITIVA; o sinal é aplicado aqui
//        (`registrarMovimentos`). Ajuste é a exceção: já chega com sinal.

import type {
  CategoriaMaterial,
  Material,
  MovimentoEstoque,
  TipoMovimento,
  UnidadeMaterial,
} from '@/types'
import { criarClienteBrowser } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Rótulos e apresentação
// ---------------------------------------------------------------------------

export const CATEGORIA_LABEL: Record<CategoriaMaterial, string> = {
  malha: 'Malha',
  tecido_plano: 'Tecido plano',
  aviamento: 'Aviamento',
  estamparia: 'Estamparia',
  embalagem: 'Embalagem',
  outro: 'Outro',
}

export const UNIDADE_LABEL: Record<UnidadeMaterial, string> = {
  kg: 'kg',
  m: 'm',
  un: 'un',
  cone: 'cone',
  rolo: 'rolo',
  l: 'L',
}

/**
 * Unidade sugerida ao escolher a categoria no cadastro. Só preenche o campo —
 * a pessoa pode trocar (decisão do Pedro: malha em kg, tecido plano em metro).
 */
export const UNIDADE_PADRAO: Record<CategoriaMaterial, UnidadeMaterial> = {
  malha: 'kg',
  tecido_plano: 'm',
  aviamento: 'un',
  estamparia: 'un',
  embalagem: 'un',
  outro: 'un',
}

/**
 * Na tela, `devolucao` se chama sempre "Sobra" — é o que o corte mede e volta
 * para a prateleira. O nome do banco ficou da 019.
 */
export const TIPO_LABEL: Record<TipoMovimento, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  devolucao: 'Sobra',
  ajuste: 'Ajuste',
}

/**
 * O que os seletores oferecem. Por enquanto só entra malha e tecido (Pedro,
 * 15/10/2026); as outras categorias continuam no banco, e material antigo de
 * outra categoria continua aparecendo na lista.
 */
export const CATEGORIAS_ATIVAS: CategoriaMaterial[] = ['malha', 'tecido_plano']

/** Casas decimais por unidade: kg até 1, m e L até 2, o resto inteiro. */
const CASAS: Record<UnidadeMaterial, number> = {
  kg: 1,
  m: 2,
  l: 2,
  un: 0,
  cone: 0,
  rolo: 0,
}

/** "64,5 kg", "2.184 kg", "12,25 m", "30 un" — sempre com a unidade no fim. */
export function formatarQuantidade(valor: number, unidade: UnidadeMaterial): string {
  const n = (valor ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: CASAS[unidade] ?? 0,
  })
  return `${n} ${UNIDADE_LABEL[unidade] ?? unidade}`
}

export type SituacaoMaterial = 'negativo' | 'abaixo' | 'ok' | 'sem_minimo'

/**
 * A situação de um material. UMA função só — a lista, o detalhe e o card de
 * resumo usam esta, para nunca discordarem.
 *
 * Negativo vem antes de tudo, inclusive de "sem mínimo": saldo negativo é
 * sempre "conferir a pesagem", tenha o material mínimo cadastrado ou não.
 */
export function situacaoMaterial(m: Pick<Material, 'saldo' | 'estoqueMinimo'>): SituacaoMaterial {
  if (m.saldo < 0) return 'negativo'
  if (m.estoqueMinimo == null) return 'sem_minimo'
  if (m.saldo < m.estoqueMinimo) return 'abaixo'
  return 'ok'
}

// ---------------------------------------------------------------------------
// Mapeamento banco ↔ TypeScript
// ---------------------------------------------------------------------------

function numOuNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v)
}

function mapMaterial(row: any): Material {
  return {
    id: row.id,
    nome: row.nome,
    cor: row.cor ?? '',
    categoria: row.categoria,
    unidade: row.unidade,
    saldo: Number(row.saldo) || 0,
    estoqueMinimo: numOuNull(row.estoque_minimo),
    local: row.local ?? null,
    custoUnitario: numOuNull(row.custo_unitario),
    observacoes: row.observacoes ?? null,
    ativo: row.ativo !== false,
    updatedAt: row.updated_at,
  }
}

function mapMovimento(row: any): MovimentoEstoque {
  return {
    id: row.id,
    materialId: row.material_id,
    material: row.materiais
      ? { nome: row.materiais.nome, cor: row.materiais.cor ?? '', unidade: row.materiais.unidade }
      : undefined,
    tipo: row.tipo,
    quantidade: Number(row.quantidade) || 0,
    saldoDepois: numOuNull(row.saldo_depois),
    pedidoId: row.pedido_id ?? null,
    numeroPedido: row.pedidos?.numero ?? null,
    fornecedor: row.fornecedor ?? null,
    notaFiscal: row.nota_fiscal ?? null,
    custoUnitario: numOuNull(row.custo_unitario),
    observacao: row.observacao ?? null,
    feitoPor: row.equipe?.nome ?? null,
    criadoEm: row.criado_em,
  }
}

/** Texto opcional: vazio vira null, para não gravar '' onde o banco espera nulo. */
function textoOuNull(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t ? t : null
}

// ---------------------------------------------------------------------------
// Materiais
// ---------------------------------------------------------------------------

/** Campos que a tela de cadastro/edição manda. `saldo` NÃO está aqui (regra K-1). */
export type DadosMaterial = Pick<
  Material,
  'nome' | 'cor' | 'categoria' | 'unidade' | 'estoqueMinimo' | 'local' | 'custoUnitario' | 'observacoes'
>

/**
 * Nome + cor repetido (índice único `materiais_nome_cor_key`, código 23505).
 * Mantém o `code`, então `classificarErro` continua dizendo `validacao` — e a
 * `message` já é o texto que a tela pode mostrar.
 */
export class ErroMaterialDuplicado extends Error {
  code = '23505'
  constructor(nome?: string, cor?: string) {
    const quem = [nome?.trim(), cor?.trim()].filter(Boolean).join(' ')
    super(quem ? `Já existe ${quem} cadastrado.` : 'Já existe outro material com esse nome e cor.')
    this.name = 'ErroMaterialDuplicado'
  }
}

function linhaMaterial(dados: Partial<DadosMaterial>): Record<string, unknown> {
  const linha: Record<string, unknown> = {}
  if (dados.nome !== undefined) linha.nome = dados.nome.trim()
  if (dados.cor !== undefined) linha.cor = (dados.cor ?? '').trim()
  if (dados.categoria !== undefined) linha.categoria = dados.categoria
  if (dados.unidade !== undefined) linha.unidade = dados.unidade
  if (dados.estoqueMinimo !== undefined) linha.estoque_minimo = dados.estoqueMinimo
  if (dados.local !== undefined) linha.local = textoOuNull(dados.local)
  if (dados.custoUnitario !== undefined) linha.custo_unitario = dados.custoUnitario
  if (dados.observacoes !== undefined) linha.observacoes = textoOuNull(dados.observacoes)
  return linha
}

export async function getMateriais(
  { incluirInativos = false }: { incluirInativos?: boolean } = {},
): Promise<Material[]> {
  const supabase = criarClienteBrowser()
  let q = supabase
    .from('materiais')
    .select('*')
    .order('categoria', { ascending: true })
    .order('nome', { ascending: true })
    .order('cor', { ascending: true })
  if (!incluirInativos) q = q.eq('ativo', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapMaterial)
}

export async function getMaterial(id: string): Promise<Material | null> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase.from('materiais').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapMaterial(data) : null
}

/** Nasce com saldo 0 — o saldo inicial entra por entrada ou ajuste. */
export async function criarMaterial(dados: DadosMaterial): Promise<Material> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('materiais')
    .insert(linhaMaterial(dados))
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new ErroMaterialDuplicado(dados.nome, dados.cor)
    throw error
  }
  return mapMaterial(data)
}

/**
 * Edita o cadastro, ou desativa/reativa (`ativo`). Nunca mexe em `saldo`.
 * `updated_at` fica com o trigger `materiais_guard`.
 */
export async function atualizarMaterial(
  id: string,
  dados: Partial<DadosMaterial> & { ativo?: boolean },
): Promise<void> {
  const supabase = criarClienteBrowser()
  const update = linhaMaterial(dados)
  if (dados.ativo !== undefined) update.ativo = dados.ativo
  const { error } = await supabase.from('materiais').update(update).eq('id', id)
  if (error) {
    if (error.code === '23505') throw new ErroMaterialDuplicado(dados.nome, dados.cor)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Movimentos
// ---------------------------------------------------------------------------

export type NovoMovimento = {
  materialId: string
  tipo: TipoMovimento
  /**
   * POSITIVA para entrada, saída e devolução — o sinal é aplicado aqui
   * (regra K-4). Ajuste é a exceção: já vem com sinal (contado − saldo).
   */
  quantidade: number
  pedidoId?: string | null
  fornecedor?: string | null
  notaFiscal?: string | null
  custoUnitario?: number | null
  observacao?: string | null
}

export type ResultadoMovimentos = {
  movimentos: MovimentoEstoque[]
  /**
   * Os movimentos ENTRARAM (o insert é uma transação só). Isto só diz se a
   * atualização do "último custo conhecido" do material, feita depois, falhou.
   * A tela não pode tratar isso como "não registrou" — repetir o envio
   * duplicaria a entrada no estoque.
   */
  falhaCusto: unknown | null
}

function quantidadeComSinal(m: NovoMovimento): number {
  const q = Number(m.quantidade)
  if (!Number.isFinite(q)) throw new Error('Quantidade inválida.')
  if (m.tipo === 'ajuste') {
    if (q === 0) throw new Error('Ajuste com diferença zero não muda o estoque.')
    return q
  }
  if (q <= 0) throw new Error('A quantidade precisa ser maior que zero.')
  return m.tipo === 'saida' ? -q : q
}

/**
 * Grava todos os movimentos num ÚNICO insert — várias linhas, uma transação:
 * ou entram todas, ou nenhuma. `feito_por` não é mandado: o trigger preenche
 * com quem está logado e a policy `estoque_mov_insert` confere.
 *
 * Em entrada com custo, depois do insert atualiza `materiais.custo_unitario`
 * para o valor novo (último custo conhecido). Com o mesmo material em duas
 * linhas, vale a última.
 */
export async function registrarMovimentos(lista: NovoMovimento[]): Promise<ResultadoMovimentos> {
  if (lista.length === 0) return { movimentos: [], falhaCusto: null }

  const linhas = lista.map(m => ({
    material_id: m.materialId,
    tipo: m.tipo,
    quantidade: quantidadeComSinal(m),
    pedido_id: m.pedidoId ?? null,
    fornecedor: textoOuNull(m.fornecedor),
    nota_fiscal: textoOuNull(m.notaFiscal),
    custo_unitario: m.custoUnitario ?? null,
    observacao: textoOuNull(m.observacao),
  }))

  const supabase = criarClienteBrowser()
  const { data, error } = await supabase.from('estoque_movimentos').insert(linhas).select('*')
  if (error) throw error

  const ultimoCusto = new Map<string, number>()
  for (const m of lista) {
    if (m.tipo === 'entrada' && m.custoUnitario != null) ultimoCusto.set(m.materialId, m.custoUnitario)
  }

  let falhaCusto: unknown | null = null
  for (const [materialId, custo] of Array.from(ultimoCusto)) {
    const { error: erroCusto } = await supabase
      .from('materiais')
      .update({ custo_unitario: custo })
      .eq('id', materialId)
    if (erroCusto && !falhaCusto) falhaCusto = erroCusto
  }

  return { movimentos: (data ?? []).map(mapMovimento), falhaCusto }
}

export type FiltroMovimentos = {
  materialId?: string
  tipo?: TipoMovimento
  /** Instante ISO, inclusivo. A tela calcula os limites do período em horário local. */
  desde?: string
  /** Instante ISO, EXCLUSIVO — "até o começo do dia seguinte". */
  ate?: string
  /** Nome ou cor do material, ou fornecedor. */
  busca?: string
  /** Começa em 1. */
  pagina?: number
  porPagina?: number
}

/** Tira o que quebraria a sintaxe do filtro `or` do PostgREST. */
function termoSeguro(busca: string): string {
  return busca.replace(/[,()*%\\]/g, ' ').trim()
}

/**
 * Movimentos paginados NO BANCO (`.range()` + `count: 'exact'`), mais recentes
 * primeiro. `total` é a contagem do filtro inteiro, não só da página.
 */
export async function getMovimentos(
  { materialId, tipo, desde, ate, busca, pagina = 1, porPagina = 50 }: FiltroMovimentos = {},
): Promise<{ movimentos: MovimentoEstoque[]; total: number }> {
  const supabase = criarClienteBrowser()

  // A busca cobre o nome/cor do material, que estão em outra tabela. Em vez de
  // filtrar pelo recurso embutido (que filtra o join, não a linha), resolve
  // antes quais materiais casam e filtra por material_id OU fornecedor.
  const termo = busca ? termoSeguro(busca) : ''
  let filtroBusca: string | null = null
  if (termo) {
    const { data: achados, error: erroBusca } = await supabase
      .from('materiais')
      .select('id')
      .or(`nome.ilike.*${termo}*,cor.ilike.*${termo}*`)
    if (erroBusca) throw erroBusca
    const ids = (achados ?? []).map((r: any) => r.id as string)
    filtroBusca = ids.length > 0
      ? `material_id.in.(${ids.join(',')}),fornecedor.ilike.*${termo}*`
      : `fornecedor.ilike.*${termo}*`
  }

  let q = supabase
    .from('estoque_movimentos')
    .select('*, materiais(nome,cor,unidade), equipe(nome), pedidos(numero)', { count: 'exact' })
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })

  if (materialId) q = q.eq('material_id', materialId)
  if (tipo) q = q.eq('tipo', tipo)
  if (desde) q = q.gte('criado_em', desde)
  if (ate) q = q.lt('criado_em', ate)
  if (filtroBusca) q = q.or(filtroBusca)

  const inicio = (Math.max(1, pagina) - 1) * porPagina
  const { data, error, count } = await q.range(inicio, inicio + porPagina - 1)
  if (error) throw error
  return { movimentos: (data ?? []).map(mapMovimento), total: count ?? 0 }
}

export type MaterialDoPedido = {
  materialId: string
  material: Pick<Material, 'nome' | 'cor' | 'unidade'> | null
  /** Σ entradas ligadas ao pedido. */
  comprado: number
  /** Σ |saídas| ligadas ao pedido — o corte pode ser fechado em partes. */
  jaSaiu: number
  /** Σ sobras (`devolucao`) ligadas ao pedido. */
  sobrou: number
}

/**
 * Por material, o que já se movimentou para um pedido: comprado, já saiu e
 * sobrou. É o que a tela de Fechar corte (K4) usa para pré-preencher "Usou do
 * estoque" com comprado − já saiu. Ajuste não entra: não é ligado a pedido.
 * Ordem: a do primeiro movimento de cada material.
 */
export async function getMaterialDoPedido(pedidoId: string): Promise<MaterialDoPedido[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('estoque_movimentos')
    .select('material_id, tipo, quantidade, materiais(nome,cor,unidade)')
    .eq('pedido_id', pedidoId)
    .order('criado_em', { ascending: true })
  if (error) throw error

  const porMaterial = new Map<string, MaterialDoPedido>()
  for (const row of (data ?? []) as any[]) {
    let item = porMaterial.get(row.material_id)
    if (!item) {
      item = {
        materialId: row.material_id,
        material: row.materiais
          ? { nome: row.materiais.nome, cor: row.materiais.cor ?? '', unidade: row.materiais.unidade }
          : null,
        comprado: 0,
        jaSaiu: 0,
        sobrou: 0,
      }
      porMaterial.set(row.material_id, item)
    }
    const q = Number(row.quantidade) || 0
    if (row.tipo === 'entrada') item.comprado += q
    else if (row.tipo === 'saida') item.jaSaiu += Math.abs(q)
    else if (row.tipo === 'devolucao') item.sobrou += q
  }
  return Array.from(porMaterial.values())
}

// ---------------------------------------------------------------------------
// Fase K3–K5: apoio das telas de Entrada, Corte e Movimentações
// ---------------------------------------------------------------------------

/**
 * Fornecedores já usados nas entradas (sugestão do campo "Fornecedor" na K3).
 * Sem `distinct` no PostgREST: busca os mais recentes e tira o repetido aqui.
 */
export async function getFornecedores(): Promise<string[]> {
  const supabase = criarClienteBrowser()
  const { data, error } = await supabase
    .from('estoque_movimentos')
    .select('fornecedor')
    .not('fornecedor', 'is', null)
    .order('criado_em', { ascending: false })
    .limit(500)
  if (error) throw error
  const vistos = new Set<string>()
  for (const r of (data ?? []) as any[]) {
    const f = String(r.fornecedor ?? '').trim()
    if (f) vistos.add(f)
  }
  return Array.from(vistos).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/**
 * TODOS os movimentos de um filtro, não só a página — é o que o CSV e os cards
 * de total da K5 precisam. Busca em blocos de 1000 (o teto do PostgREST).
 */
export async function getTodosMovimentos(
  filtro: Omit<FiltroMovimentos, 'pagina' | 'porPagina'> = {},
): Promise<MovimentoEstoque[]> {
  const BLOCO = 1000
  const todos: MovimentoEstoque[] = []
  for (let pagina = 1; ; pagina++) {
    const { movimentos, total } = await getMovimentos({ ...filtro, pagina, porPagina: BLOCO })
    todos.push(...movimentos)
    if (todos.length >= total || movimentos.length < BLOCO) break
  }
  return todos
}

/** Soma por unidade: nunca mistura kg com m. Ex.: { kg: 1240, m: 85 }. */
export function somarPorUnidade(
  movimentos: Pick<MovimentoEstoque, 'quantidade' | 'material'>[],
): Partial<Record<UnidadeMaterial, number>> {
  const soma: Partial<Record<UnidadeMaterial, number>> = {}
  for (const m of movimentos) {
    const un = m.material?.unidade
    if (!un) continue
    soma[un] = (soma[un] ?? 0) + m.quantidade
  }
  return soma
}

/** "+1.240 kg · +85 m" (com sinal) ou "—" quando vazio. */
export function textoSomaPorUnidade(
  soma: Partial<Record<UnidadeMaterial, number>>,
  comSinal = true,
): string {
  const partes = (Object.keys(soma) as UnidadeMaterial[])
    .filter(un => soma[un] !== undefined && soma[un] !== 0)
    .map(un => {
      const v = soma[un] as number
      const sinal = comSinal && v > 0 ? '+' : ''
      return `${sinal}${formatarQuantidade(v, un)}`
    })
  return partes.length ? partes.join(' · ') : '—'
}
