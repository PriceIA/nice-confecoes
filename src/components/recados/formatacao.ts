// Formatação de texto/hora específica dos Recados (Fase J).
//
// Fica aqui, não em helpers.ts, porque não é compartilhada com o resto do
// sistema — mesmo padrão de `iniciaisDe`/`tempoCurto` do dashboard: cada tela
// com essa necessidade tem a própria cópia pequena, em vez de uma dependência
// cruzada por duas linhas de função.

import { format, isToday, isYesterday } from 'date-fns'

export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const a = partes.length > 0 ? partes[0][0] : ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase() || '?'
}

/** Hora da prévia da conversa na lista: "HH:mm" hoje, "Ontem", ou "dd/MM". */
export function horaCurta(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Ontem'
  return format(d, 'dd/MM')
}

/** Rótulo do separador de dia dentro da conversa: "Hoje", "Ontem", "dd/MM/yyyy". */
export function rotuloDia(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return 'Hoje'
  if (isYesterday(d)) return 'Ontem'
  return format(d, 'dd/MM/yyyy')
}
