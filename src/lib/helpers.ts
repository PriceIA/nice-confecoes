import { Complexidade, EntradaProgresso, Personalizacao, Pedido, ProgressoSetor } from '@/types'
import { format } from 'date-fns'

export const CATALOGO = {
  Esportivo: ['Camiseta sublimada futebol', 'Short sublimado', 'Rashguard', 'Bermuda Jiu-jitsu/MMA', 'Bermuda Muay Thai'],
  Empresarial: ['Camiseta PV', 'Camiseta algodão', 'Polo PV', 'Polo algodão', 'Polo PQ', 'Camisa social slim', 'Moletom', 'Calça reta', 'Calça slim', 'Bermuda', 'Jaleco'],
  Escolar: ['Camiseta M Curta', 'Regata', 'Manga Longa', 'Camiseta Algodão', 'Jardineira Curta', 'Jardineira Longa', 'Conjunto Helança', 'Blusa Helança', 'Blusa c/ Capuz Helança', 'Calça Helança', 'Bailarina/Legging', 'Corsário', 'Conjunto Moletom', 'Blusa Moletom', 'Blusa c/ Capuz Moletom', 'Calça Moletom', 'Shorts Saia Inteira', 'Shorts Saia Meia', 'Conjunto Tactel', 'Blusa Tactel', 'Blusa c/ Capuz Tactel', 'Calça c/ Forro Tactel', 'Calça s/ Forro Tactel', 'Bermuda Helança e Tactel'],
  Acessórios: ['Ecobag', 'Sacolinha kimono', 'Avental', 'Roupa coroinha'],
}

export const PERSONALIZACOES: { value: Personalizacao; label: string }[] = [
  { value: 'bordado', label: 'Bordado' },
  { value: 'silk', label: 'Estamparia Silk' },
  { value: 'dtf', label: 'Prensa DTF' },
  { value: 'sublimacao', label: 'Sublimação' },
]

export const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'UNICO', '01', '02', '04', '06', '08', '10', '12', '14', 'SOB_MEDIDA'] as const

export function calcularComplexidade(tipo: string, personalizacoes: Personalizacao[]): Complexidade {
  const qtdPerson = personalizacoes.length
  const tipoLower = tipo.toLowerCase()

  if (tipoLower.includes('social') || (tipoLower.includes('tectel') && qtdPerson >= 2) || (tipoLower.includes('sublima') && qtdPerson >= 2)) return 'P5'
  if (tipoLower.includes('mma') || tipoLower.includes('jiu') || tipoLower.includes('conjunto') || (tipoLower.includes('sublima') && qtdPerson >= 1)) return 'P4'
  if (tipoLower.includes('polo') || tipoLower.includes('jaleco') || tipoLower.includes('hashtag') || qtdPerson >= 2) return 'P3'
  if (tipoLower.includes('reforço') || qtdPerson === 1) return 'P2'
  return 'P1'
}

export const COMPLEXIDADE_CONFIG: Record<Complexidade, { label: string; color: string; bg: string }> = {
  P1: { label: 'P1 — Básica', color: 'text-suave', bg: 'bg-superficie-3' },
  P2: { label: 'P2 — Simples', color: 'text-blue-700', bg: 'bg-blue-100' },
  P3: { label: 'P3 — Média', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  P4: { label: 'P4 — Complexa', color: 'text-orange-700', bg: 'bg-orange-100' },
  P5: { label: 'P5 — Premium', color: 'text-red-700', bg: 'bg-red-100' },
}

export const STATUS_CONFIG = {
  orcamento:            { label: 'Orçamento',           color: 'text-suave',    bg: 'bg-superficie-3' },
  aprovado:             { label: 'Aprovado',            color: 'text-blue-700',    bg: 'bg-blue-100' },
  aguardando_pagamento: { label: 'Aguardando Pagamento', color: 'text-yellow-700',  bg: 'bg-yellow-100' },
  em_producao:          { label: 'Em Produção',         color: 'text-marca-texto',    bg: 'bg-marca-suave' },
  finalizado:           { label: 'Finalizado',          color: 'text-purple-700',  bg: 'bg-purple-100' },
  entregue:             { label: 'Entregue',            color: 'text-green-800',   bg: 'bg-green-100' },
  cancelado:            { label: 'Cancelado',           color: 'text-red-700',     bg: 'bg-red-100' },
}

export const SETOR_LABELS: Record<string, string> = {
  atendimento:        'Atendimento',
  compra:             'Compra',
  corte:              'Corte',
  costura:            'Costura',
  estamparia_silk:    'Estamparia Silk',
  prensa_dtf:         'Prensa DTF',
  prensa_sublimacao:  'Prensa Sublimação',
  acabamento:         'Acabamento/Embalagem',
}

export function totalPecas(pedido: { pecas: { tamanhos: { quantidade: number }[] }[] }) {
  return pedido.pecas.reduce((acc, p) => acc + p.tamanhos.reduce((a, t) => a + t.quantidade, 0), 0)
}

export function formatarTelefone(v: string) {
  return v.replace(/\D/g, '').replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3')
}

/**
 * "Vera, 14/08 14:30" para um setor já tocado; `null` para setor intocado ou
 * pedido antigo sem esse registro — o chamador simplesmente não desenha nada.
 */
export function autorSetorTexto(entrada: EntradaProgresso): string | null {
  if (!entrada.atualizadoPor || !entrada.atualizadoEm) return null
  return `${entrada.atualizadoPor}, ${format(new Date(entrada.atualizadoEm), 'dd/MM HH:mm')}`
}

// ---------------------------------------------------------------------------
// Progresso de produção — uma conta só
//
// /producao, /pedidos/[id] e o filtro "quase prontos" precisam da MESMA
// resposta para "quanto deste pedido está pronto?". Duas contas separadas é
// como porcentagens começam a divergir entre telas.
// ---------------------------------------------------------------------------

/**
 * O progresso lido de um pedido. Hoje `ProgressoSetor` tem as 8 chaves fixas,
 * mas o JSONB do banco não tem schema — a forma aberta está aqui para que
 * etapas por pedido (Fase D3) não obriguem a reescrever estas funções.
 */
export type ProgressoLido = ProgressoSetor | Record<string, EntradaProgresso>

export type ResumoProgresso = {
  /** Setores que se aplicam a este pedido (nao_se_aplica sai da conta). */
  total: number
  concluidos: number
  /** 0–100, já arredondado. Sem setor aplicável = 100 (nada a fazer = pronto). */
  pct: number
}

/**
 * Setor `nao_se_aplica` sai do numerador E do denominador (Fase C0): 6 de 6
 * concluídos é 100%, não 75%. O denominador zero é tratado explicitamente —
 * pelo fluxo do modal isso não deveria acontecer, mas `NaN%` na tela não pode
 * depender de sorte.
 */
export function resumoProgresso(progresso: ProgressoLido | undefined): ResumoProgresso {
  const entradas = Object.values((progresso ?? {}) as Record<string, EntradaProgresso>)
  const aplicaveis = entradas.filter(e => e?.status !== 'nao_se_aplica')
  const concluidos = aplicaveis.filter(e => e?.status === 'concluido').length
  const pct = aplicaveis.length === 0 ? 100 : Math.round((concluidos / aplicaveis.length) * 100)
  return { total: aplicaveis.length, concluidos, pct }
}

// ---------------------------------------------------------------------------
// Ordenação de pedidos — compartilhada por /pedidos e /producao
// ---------------------------------------------------------------------------

export type OrdemPedidos =
  | 'entrada_desc' | 'entrada_asc'
  | 'entrega_asc'  | 'entrega_desc'
  | 'progresso_desc' | 'progresso_asc'

export const ORDENS_DATA: { value: OrdemPedidos; label: string }[] = [
  { value: 'entrada_desc', label: 'Mais recentes primeiro' },
  { value: 'entrada_asc',  label: 'Mais antigos primeiro' },
  { value: 'entrega_asc',  label: 'Entrega mais próxima' },
  { value: 'entrega_desc', label: 'Entrega mais distante' },
]

export const ORDENS_PRODUCAO: { value: OrdemPedidos; label: string }[] = [
  ...ORDENS_DATA,
  { value: 'progresso_desc', label: 'Mais completos primeiro' },
  { value: 'progresso_asc',  label: 'Menos completos primeiro' },
]

/**
 * Ordena SEM mutar (`Array.sort` ordena no lugar, e mutar o array do useState
 * dá bug de render que só aparece depois).
 *
 * Duas regras que valem para todas as ordens:
 *  - data ausente vai sempre para o FIM, nas duas direções. Pedido sem data
 *    não é "o mais urgente do mundo" nem "o mais distante" — é um pedido sem
 *    data, e o lugar dele é no fim da fila.
 *  - empate é desempatado por `numero` desc, para a lista não dançar entre
 *    renders.
 */
export function ordenarPedidos<T extends Pick<Pedido, 'numero' | 'dataEntrada' | 'dataEntrega' | 'progresso'>>(
  pedidos: T[],
  ordem: OrdemPedidos,
): T[] {
  const desempate = (a: T, b: T) => b.numero.localeCompare(a.numero)

  if (ordem === 'progresso_desc' || ordem === 'progresso_asc') {
    const asc = ordem === 'progresso_asc'
    return [...pedidos].sort((a, b) => {
      const diff = resumoProgresso(a.progresso).pct - resumoProgresso(b.progresso).pct
      if (diff !== 0) return asc ? diff : -diff
      return desempate(a, b)
    })
  }

  const campo = ordem.startsWith('entrada') ? 'dataEntrada' : 'dataEntrega'
  const asc = ordem.endsWith('_asc')

  return [...pedidos].sort((a, b) => {
    const va = a[campo]
    const vb = b[campo]
    if (!va && !vb) return desempate(a, b)
    if (!va) return 1
    if (!vb) return -1
    const diff = new Date(va).getTime() - new Date(vb).getTime()
    if (diff !== 0) return asc ? diff : -diff
    return desempate(a, b)
  })
}
