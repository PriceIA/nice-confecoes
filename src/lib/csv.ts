// Exporta CSV que o Excel em português abre direto, com acento e colunas certas:
// separador ';' (o Excel pt-BR usa vírgula como decimal), BOM UTF-8 (sem ele o
// Excel lê "Ã§" no lugar de "ç") e aspas em todo campo com ; " ou quebra de linha.

export type Celula = string | number | null | undefined

function celula(v: Celula): string {
  if (v === null || v === undefined) return ''
  const t = typeof v === 'number' ? String(v).replace('.', ',') : v
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function montarCsv(cabecalho: string[], linhas: Celula[][]): string {
  return [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n')
}

export function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: Celula[][]): void {
  const blob = new Blob(['﻿' + montarCsv(cabecalho, linhas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
