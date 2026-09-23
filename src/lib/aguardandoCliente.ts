import { differenceInCalendarDays } from 'date-fns'
import { AguardandoCliente, MotivoAguardando, Pedido } from '@/types'
import { dataLocal, prazoTexto } from '@/lib/helpers'
import { pedidoConcluido } from '@/lib/kanban-ui'

// Fase I — "Aguardando o cliente".
//
// Pedido pronto que o cliente não vem buscar aparecia como ATRASADO, mas o
// atraso não é da Nice. Tudo o que decide isso mora aqui; /pedidos/[id],
// /entregas, /dashboard e /relatorios só perguntam. Não escreva uma segunda
// versão destas regras numa tela.

/** O que as funções daqui precisam. `Pedido` e `PedidoLista` servem os dois. */
type Base = Pick<Pedido, 'status' | 'dataEntrega' | 'progresso' | 'valorTotal' | 'valorPago' | 'aguardandoCliente'>

/** Lembrete "Ainda aguardando o cliente?" a cada quantos dias (decisão do Pedro: todo dia). */
export const DIAS_LEMBRETE = 1
export const OBSERVACAO_MAX = 120

export const MOTIVO_LABEL: Record<MotivoAguardando, string> = {
  pagamento: 'Falta de pagamento',
  sem_tempo: 'Sem tempo / não veio buscar',
  outro: 'Outro',
}

function ativo(p: Pick<Pedido, 'status'>): boolean {
  return p.status !== 'entregue' && p.status !== 'cancelado'
}

function vencido(p: Pick<Pedido, 'dataEntrega'>): boolean {
  const { dias } = prazoTexto(p.dataEntrega)
  return dias !== null && dias < 0
}

/**
 * Pronto para o cliente retirar: status `finalizado` (clique manual em "Alterar
 * Status") OU todas as etapas concluídas/não aplicáveis (`pedidoConcluido`, o
 * critério que /entregas sempre usou). Os dois sentidos de "finalizado" que o
 * sistema tem hoje valem igual.
 */
export function prontoParaRetirada(p: Pick<Pedido, 'status' | 'progresso'>): boolean {
  return ativo(p) && (p.status === 'finalizado' || pedidoConcluido(p))
}

/** Está no grupo "Aguardando o cliente". */
export function estaAguardando(p: Pick<Pedido, 'status' | 'aguardandoCliente'>): boolean {
  return ativo(p) && !!p.aguardandoCliente
}

/** Pronto, vencido e ninguém respondeu ainda: o sistema pergunta "Já foi entregue?". */
export function perguntarEntrega(p: Base): boolean {
  return prontoParaRetirada(p) && vencido(p) && !p.aguardandoCliente
}

/**
 * Atraso DA NICE: ativo, vencido e ainda não pronto. É o que o /dashboard chama
 * de "atrasado". Pronto + vencido sem resposta vai para `perguntarEntrega`, não
 * para cá.
 */
export function atrasoDaNice(p: Base): boolean {
  return ativo(p) && vencido(p) && !prontoParaRetirada(p) && !p.aguardandoCliente
}

/** Quando o pedido ficou pronto: o último `atualizadoEm` das etapas. `null` se nunca houve clique. */
export function prontoEm(p: Pick<Pedido, 'progresso'>): Date | null {
  let maior: Date | null = null
  for (const e of Object.values(p.progresso ?? {})) {
    if (!e?.atualizadoEm) continue
    const d = new Date(e.atualizadoEm)
    if (!Number.isNaN(d.getTime()) && (!maior || d > maior)) maior = d
  }
  return maior
}

/**
 * Há quantos dias o pedido está parado por conta do cliente: desde o que vier
 * DEPOIS entre o prazo e o dia em que ficou pronto. Se ficou pronto depois do
 * prazo, a espera do cliente só começa quando ficou pronto.
 */
export function diasAguardando(p: Pick<Pedido, 'dataEntrega' | 'progresso'>, hoje = new Date()): number {
  const prazo = dataLocal(p.dataEntrega)
  const pronto = prontoEm(p)
  const inicio = prazo && pronto ? (pronto > prazo ? pronto : prazo) : (prazo ?? pronto)
  if (!inicio) return 0
  return Math.max(0, differenceInCalendarDays(hoje, inicio))
}

export function saldoEmAberto(p: Pick<Pedido, 'valorTotal' | 'valorPago'>): number {
  return Math.max(0, (p.valorTotal ?? 0) - (p.valorPago ?? 0))
}

/** Tem saldo? Sugere "falta de pagamento". Sem saldo, não sugere nada. */
export function motivoSugerido(p: Pick<Pedido, 'valorTotal' | 'valorPago'>): MotivoAguardando | null {
  return saldoEmAberto(p) > 0 ? 'pagamento' : null
}

/**
 * Hora de perguntar de novo "Ainda aguardando o cliente?"
 * - com `previsaoRetirada` no futuro: não pergunta até esse dia;
 * - senão: pergunta se a última confirmação (ou o registro) foi há
 *   `DIAS_LEMBRETE` dia(s) de calendário ou mais.
 */
export function lembreteDevido(p: Pick<Pedido, 'status' | 'aguardandoCliente'>, hoje = new Date()): boolean {
  const a = p.aguardandoCliente
  if (!a || !ativo(p)) return false
  const previsao = dataLocal(a.previsaoRetirada)
  if (previsao && differenceInCalendarDays(previsao, hoje) > 0) return false
  const ultima = new Date(a.confirmadoEm ?? a.registradoEm)
  if (Number.isNaN(ultima.getTime())) return true
  return differenceInCalendarDays(hoje, ultima) >= DIAS_LEMBRETE
}

/** Mensagem de erro do formulário, ou `null` se está ok. */
export function validar(motivo: MotivoAguardando | null, observacao: string): string | null {
  if (!motivo) return 'Escolha o motivo.'
  const obs = observacao.trim()
  if (motivo === 'outro' && !obs) return 'Em "Outro", escreva o motivo — é o que fica registrado no pedido.'
  if (obs.length > OBSERVACAO_MAX) return `A observação passa de ${OBSERVACAO_MAX} caracteres.`
  return null
}

/** Primeiro registro ("Não, o cliente não retirou"). */
export function registrar(
  quem: string,
  motivo: MotivoAguardando,
  observacao?: string,
  previsaoRetirada?: string,
): AguardandoCliente {
  const obs = observacao?.trim()
  return {
    motivo,
    ...(obs ? { observacao: obs } : {}),
    ...(previsaoRetirada ? { previsaoRetirada } : {}),
    registradoPor: quem,
    registradoEm: new Date().toISOString(),
  }
}

/**
 * "Mudar motivo": troca motivo/observação/previsão e conta como confirmação de
 * hoje. Preserva quem registrou e quando — "dias parado" não zera.
 */
export function atualizarMotivo(
  atual: AguardandoCliente,
  quem: string,
  motivo: MotivoAguardando,
  observacao?: string,
  previsaoRetirada?: string,
): AguardandoCliente {
  const obs = observacao?.trim()
  const { observacao: _o, previsaoRetirada: _p, ...resto } = atual
  return {
    ...resto,
    motivo,
    ...(obs ? { observacao: obs } : {}),
    ...(previsaoRetirada ? { previsaoRetirada } : {}),
    confirmadoPor: quem,
    confirmadoEm: new Date().toISOString(),
  }
}

/** "Sim, ainda aguardando": só registra a confirmação de hoje. */
export function confirmar(atual: AguardandoCliente, quem: string): AguardandoCliente {
  return { ...atual, confirmadoPor: quem, confirmadoEm: new Date().toISOString() }
}
