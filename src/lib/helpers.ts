import { Complexidade, EntradaProgresso, Personalizacao, Pedido, ProgressoSetor, StatusPedido, StatusSetor } from '@/types'
import { differenceInCalendarDays, format } from 'date-fns'

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

// ---------------------------------------------------------------------------
// Busca de pedidos — compartilhada por /pedidos e /dashboard
// ---------------------------------------------------------------------------

/**
 * O predicado de busca de pedido, compartilhado por /pedidos e /dashboard.
 * Procura em nome do cliente, empresa e número do pedido. Busca vazia casa com tudo.
 */
// Estrutural, não Pick<Pedido, ...> (Fase G4): `cliente` de PedidoLista
// (getPedidosLista) tem só 3 campos, não os 7 de Pedido['cliente'] — Pick
// exigiria o formato completo. Pedido continua satisfazendo isto sem mudar
// nenhum chamador existente.
export function pedidoCasaComBusca(
  pedido: { numero: string; cliente: { nome: string; empresa?: string } },
  busca: string,
): boolean {
  const q = busca.trim().toLowerCase()
  if (!q) return true
  return pedido.cliente.nome.toLowerCase().includes(q)
    || pedido.numero.toLowerCase().includes(q)
    || (pedido.cliente.empresa?.toLowerCase().includes(q) ?? false)
}

// ---------------------------------------------------------------------------
// Prazo de entrega em dias — compartilhado pela tabela e pela faixa de
// urgentes do /dashboard
// ---------------------------------------------------------------------------

export type TomPrazo = 'atrasado' | 'proximo' | 'normal' | 'sem_data'

/**
 * Lê uma data do banco no fuso LOCAL.
 *
 * Coluna `date` chega como 'AAAA-MM-DD', e `new Date('AAAA-MM-DD')` é meia-noite
 * UTC — em Brasília, 21h do DIA ANTERIOR. Foi o que fazia /relatorios calcular o
 * mês anterior e o dashboard chamar de "atrasado" o pedido que vence hoje (Fase I0).
 * Valor com hora (timestamptz, ISO completo) já traz fuso e passa direto.
 */
export function dataLocal(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `dataLocal` + `format`. Data ausente ou inválida vira '—', nunca "Invalid Date". */
export function formatarData(valor: string | null | undefined, padrao = 'dd/MM/yyyy'): string {
  const d = dataLocal(valor)
  return d ? format(d, padrao) : '—'
}

/** Valor em reais no formato brasileiro: 4688 → "R$ 4.688,00". */
export function moeda(v: number): string {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * O prazo de entrega como a pessoa lê: "em 4 dias", "atrasado 1 dia", "amanhã".
 * `tom` é a severidade, para a tela escolher a cor — a função não escolhe classe
 * nenhuma, porque /dashboard e uma futura tela podem pintar isso diferente.
 */
export function prazoTexto(dataEntrega: string | null | undefined): {
  texto: string
  tom: TomPrazo
  data: string | null
  /** Dias de calendário até a entrega; negativo = atrasado. `null` sem data. */
  dias: number | null
} {
  const d = dataLocal(dataEntrega)
  if (!d) return { texto: 'sem data', tom: 'sem_data', data: null, dias: null }

  const dias = differenceInCalendarDays(d, new Date())
  const data = format(d, 'dd/MM/yyyy')

  if (dias < 0) {
    const n = Math.abs(dias)
    return { texto: `atrasado ${n} ${n === 1 ? 'dia' : 'dias'}`, tom: 'atrasado', data, dias }
  }
  if (dias === 0) return { texto: 'entrega hoje', tom: 'atrasado', data, dias }
  if (dias === 1) return { texto: 'amanhã', tom: 'proximo', data, dias }
  if (dias <= 7) return { texto: `em ${dias} dias`, tom: 'proximo', data, dias }
  return { texto: `em ${dias} dias`, tom: 'normal', data, dias }
}

// ---------------------------------------------------------------------------
// Chips do /dashboard
// ---------------------------------------------------------------------------

export type FiltroDashboard = StatusPedido | 'todos' | 'urgentes'

/**
 * Os chips do /dashboard. Sete, não oito: `entregue` e `cancelado` não entram
 * porque a tela só lista pedido ativo, e entraria um chip que nunca acha nada.
 *
 * `urgentes` não é um status — é `pedido.tipo`. Ele está na mesma fileira de
 * propósito: é o recorte mais usado, e é o que o botão da faixa de alerta aciona.
 * Consequência aceita: um filtro por vez. "Urgentes" + "Em Produção" ao mesmo
 * tempo exigiria dois estados independentes, e essa tela não precisa disso.
 */
export const FILTROS_DASHBOARD: { value: FiltroDashboard; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'urgentes', label: 'Urgentes' },
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'aguardando_pagamento', label: 'Ag. Pagamento' },
  { value: 'em_producao', label: 'Em Produção' },
  { value: 'finalizado', label: 'Finalizado' },
]

// ---------------------------------------------------------------------------
// Widgets novos do /dashboard (redesign) — só leitura, nada de RLS ou
// migração envolvida: os dois agregam campos que já existem em `Pedido`.
// ---------------------------------------------------------------------------

export type CategoriaResumo = { categoria: string; quantidade: number }

/**
 * Quantidade de peças por categoria (as chaves de `CATALOGO`: Esportivo,
 * Empresarial, Escolar, Acessórios) entre os pedidos passados. Alimenta o
 * widget "Top Categorias" do /dashboard.
 *
 * Filtra `entregue`/`cancelado` por conta própria — mas o chamador típico já
 * passa só pedidos ativos (mesmo recorte da tabela principal), então na
 * prática o filtro abaixo raramente descarta algo.
 */
export function pecasPorCategoria(pedidos: Pick<Pedido, 'status' | 'pecas'>[]): CategoriaResumo[] {
  const mapa = new Map<string, number>()
  for (const p of pedidos) {
    if (p.status === 'entregue' || p.status === 'cancelado') continue
    for (const peca of p.pecas) {
      const qtd = peca.tamanhos.reduce((a, t) => a + t.quantidade, 0)
      mapa.set(peca.categoria, (mapa.get(peca.categoria) ?? 0) + qtd)
    }
  }
  return Array.from(mapa.entries())
    .map(([categoria, quantidade]) => ({ categoria, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
}

export type AtividadeRecente = {
  pedidoId: string
  pedidoNumero: string
  cliente: string
  setorLabel: string
  /** Estado do setor no momento desta atualização — não usado na tela hoje, mas fica disponível para quem quiser diferenciar "concluiu" de "reabriu" depois. */
  status: StatusSetor
  atualizadoPor: string
  atualizadoEm: string
}

/**
 * Aproximação de "atividade recente" — não existe uma tabela de auditoria no
 * sistema hoje, então isto deriva do que já existe: cada etapa tocada em
 * `progresso` guarda quem mexeu e quando (`EntradaProgresso.atualizadoPor`/
 * `atualizadoEm`, só presentes a partir de um clique — nunca inventados,
 * ver o comentário em `types/index.ts`).
 *
 * Consequência aceita: pedido cujas etapas nunca foram clicadas manualmente
 * (só nasceu e ainda não andou) não aparece aqui. Se um dia existir uma
 * tabela de auditoria de verdade, é só trocar a implementação — a assinatura
 * desta função pode continuar igual.
 */
export function atividadesRecentes(
  pedidos: Pick<Pedido, 'id' | 'numero' | 'cliente' | 'progresso'>[],
  limite = 8,
): AtividadeRecente[] {
  const itens: AtividadeRecente[] = []
  for (const p of pedidos) {
    for (const [setor, entrada] of Object.entries(p.progresso)) {
      if (entrada?.atualizadoEm && entrada.atualizadoPor) {
        itens.push({
          pedidoId: p.id,
          pedidoNumero: p.numero,
          cliente: p.cliente.nome,
          setorLabel: SETOR_LABELS[setor] ?? setor,
          status: entrada.status,
          atualizadoPor: entrada.atualizadoPor,
          atualizadoEm: entrada.atualizadoEm,
        })
      }
    }
  }
  return itens
    .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
    .slice(0, limite)
}
