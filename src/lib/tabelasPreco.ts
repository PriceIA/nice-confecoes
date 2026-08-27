import { criarClienteBrowser } from './supabase/client'
import { FAIXAS, GRUPOS_PRECO_ESCOLAR, TABELA_PADRAO } from './precosEscolar'

// Leitura e escrita das listas de preço.
//
// Antes, /tabela-precos desenhava a grade a partir da constante
// GRUPOS_PRECO_ESCOLAR e o banco só fornecia os VALORES: grupo e produto eram
// código, não dado, e por isso não dava para cadastrar peça nova sem um deploy.
// Agora a estrutura (que tabelas existem, que grupos cada uma tem, que
// produtos cada grupo tem) vem do banco. A constante virou só a semente da
// primeira tabela, para o caso de o banco estar vazio.
//
// Chave de um preço: tabela || grupo || produto || faixa — exatamente a
// constraint única criada pela migration 012.

export type LinhaPreco = {
  tabela: string
  grupo: string
  produto: string
  faixa_tamanho: string
  valor: number | null
}

/** tabela -> grupo -> produtos, na ordem em que devem aparecer na tela. */
export type Estrutura = Record<string, { grupo: string; produtos: string[] }[]>

/** Mapa de preços indexado por `chavePreco`. */
export type MapaPrecos = Record<string, number | null>

export function chavePreco(tabela: string, grupo: string, produto: string, faixa: string): string {
  return `${tabela}||${grupo}||${produto}||${faixa}`
}

/** Constraint única esperada no banco (migration 012) — usada no upsert. */
export const ON_CONFLICT = 'tabela,grupo,produto,faixa_tamanho'

/**
 * Estrutura inicial quando o banco não devolve nada: a tabela do PDF 2025.
 *
 * Não é "preço padrão" no sentido de valor sugerido — é a mesma lista que a
 * migration 006 gravou, mantida aqui para a tela não abrir vazia se o banco
 * estiver fora do ar.
 */
export function estruturaSemente(): { estrutura: Estrutura; precos: MapaPrecos } {
  const estrutura: Estrutura = {
    [TABELA_PADRAO]: GRUPOS_PRECO_ESCOLAR.map(g => ({
      grupo: g.grupo,
      produtos: g.produtos.map(p => p.nome),
    })),
  }
  const precos: MapaPrecos = {}
  for (const g of GRUPOS_PRECO_ESCOLAR) {
    for (const p of g.produtos) {
      FAIXAS.forEach((f, i) => {
        const v = p.precos[i]
        precos[chavePreco(TABELA_PADRAO, g.grupo, p.nome, f)] = v ?? null
      })
    }
  }
  return { estrutura, precos }
}

/**
 * Lê todas as listas de preço.
 *
 * Devolve também `existentes`: as chaves que JÁ estão gravadas no banco. A
 * tela usa isso para distinguir "célula que já tem linha e foi esvaziada"
 * (não mexe — apagar preço por engano seria destrutivo) de "célula que nunca
 * existiu" (grava, mesmo em branco, para a peça ou tabela nova passar a
 * existir).
 */
export async function carregarPrecos(): Promise<{
  estrutura: Estrutura
  precos: MapaPrecos
  existentes: Set<string>
}> {
  const supabase = criarClienteBrowser()

  let { data, error } = await supabase
    .from('tabela_precos')
    .select('tabela, grupo, produto, faixa_tamanho, valor')
    .order('tabela')
    .order('grupo')
    .order('produto')

  // Banco ainda sem a migration 012: a coluna `tabela` não existe e o
  // PostgREST devolve 42703. Sem este retorno, subir o código antes de rodar o
  // SQL faria os preços sumirem do cálculo do pedido — uma regressão silenciosa
  // justamente porque quem roda o SQL é o dono, à mão, em outro momento.
  // Nesse caso lê-se o formato antigo e tudo cai na tabela padrão.
  if (error && (error.code === '42703' || /column .*tabela/i.test(error.message ?? ''))) {
    const legado = await supabase
      .from('tabela_precos')
      .select('grupo, produto, faixa_tamanho, valor')
      .order('grupo')
      .order('produto')
    if (legado.error) throw legado.error
    data = (legado.data ?? []).map(r => ({ ...r, tabela: TABELA_PADRAO }))
    error = null
  }

  if (error) throw error
  if (!data || data.length === 0) {
    const semente = estruturaSemente()
    return { ...semente, existentes: new Set() }
  }

  const estrutura: Estrutura = {}
  const precos: MapaPrecos = {}
  const existentes = new Set<string>()

  for (const row of data as LinhaPreco[]) {
    // Banco anterior à migration 012 não tem a coluna; cai na tabela padrão.
    const tabela = row.tabela || TABELA_PADRAO
    if (!estrutura[tabela]) estrutura[tabela] = []

    let grupo = estrutura[tabela].find(g => g.grupo === row.grupo)
    if (!grupo) {
      grupo = { grupo: row.grupo, produtos: [] }
      estrutura[tabela].push(grupo)
    }
    if (!grupo.produtos.includes(row.produto)) grupo.produtos.push(row.produto)

    const k = chavePreco(tabela, row.grupo, row.produto, row.faixa_tamanho)
    precos[k] = row.valor != null ? Number(row.valor) : null
    existentes.add(k)
  }

  return { estrutura, precos, existentes }
}

/**
 * Preços de UMA tabela no formato que o cálculo do pedido usa:
 * `produto -> faixa -> valor`.
 *
 * Produto sem valor definido some do mapa em vez de entrar como null: quem
 * consulta faz `mapa[produto]?.[faixa] ?? fallback`, e uma chave presente
 * valendo null passaria pelo `?.` mas seria pega pelo `??` do mesmo jeito —
 * omitir deixa a intenção explícita.
 */
export function precosDaTabela(precos: MapaPrecos, tabela: string): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  const prefixo = `${tabela}||`
  for (const [k, v] of Object.entries(precos)) {
    if (v == null || !k.startsWith(prefixo)) continue
    const [, , produto, faixa] = k.split('||')
    if (!out[produto]) out[produto] = {}
    out[produto][faixa] = v
  }
  return out
}

/** Renomeia uma lista inteira. Todas as linhas dela mudam de nome de uma vez. */
export async function renomearTabela(de: string, para: string): Promise<void> {
  const supabase = criarClienteBrowser()
  const { error } = await supabase.from('tabela_precos').update({ tabela: para }).eq('tabela', de)
  if (error) throw error
}

/** Remove um produto de uma tabela (todas as faixas de tamanho dele). */
export async function removerProduto(tabela: string, grupo: string, produto: string): Promise<void> {
  const supabase = criarClienteBrowser()
  const { error } = await supabase
    .from('tabela_precos')
    .delete()
    .eq('tabela', tabela).eq('grupo', grupo).eq('produto', produto)
  if (error) throw error
}

/** Remove um grupo inteiro de uma tabela. */
export async function removerGrupo(tabela: string, grupo: string): Promise<void> {
  const supabase = criarClienteBrowser()
  const { error } = await supabase
    .from('tabela_precos')
    .delete()
    .eq('tabela', tabela).eq('grupo', grupo)
  if (error) throw error
}

/**
 * Cadastra um produto numa tabela/grupo, com os preços informados.
 *
 * É o que roda quando o usuário cria uma peça pelo /novo-pedido e escolhe
 * "registrar no sistema". Faixa sem valor entra como linha com valor nulo — a
 * peça passa a EXISTIR na lista mesmo antes de alguém definir o preço dela,
 * que é justamente o caso de uso: a peça apareceu na hora do pedido e o preço
 * ainda vai ser combinado.
 */
export async function registrarProduto(
  tabela: string,
  grupo: string,
  produto: string,
  valores: Record<string, number | null>,
): Promise<void> {
  const supabase = criarClienteBrowser()
  const agora = new Date().toISOString()
  const linhas = FAIXAS.map(f => ({
    tabela,
    grupo,
    produto,
    faixa_tamanho: f,
    valor: valores[f] ?? null,
    updated_at: agora,
  }))
  const { error } = await supabase.from('tabela_precos').upsert(linhas, { onConflict: ON_CONFLICT })
  if (error) throw error
}
