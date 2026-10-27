'use client'
// Peças de apresentação compartilhadas pelas telas do almoxarifado (Fase K):
// a barra de abas, o badge de situação e o de tipo de movimento. A REGRA da
// situação mora em `situacaoMaterial` (almoxarifado.ts); aqui é só a cor.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { useMembro } from '@/components/AuthProvider'
import { TIPO_LABEL, type SituacaoMaterial } from '@/lib/almoxarifado'
import type { TipoMovimento } from '@/types'

/**
 * Estoque · Entrada · Corte · Movimentações. Cada aba só aparece para quem
 * pode usá-la: Entrada e Corte pedem `movimentarEstoque`; Estoque e
 * Movimentações são de todo mundo que abre /almoxarifado (o corte vê
 * movimentações só para ler, sem custo — K5).
 */
const ABAS = [
  { href: '/almoxarifado',               label: 'Estoque',       precisaMovimentar: false },
  { href: '/almoxarifado/entrada',       label: 'Entrada',       precisaMovimentar: true },
  { href: '/almoxarifado/corte',         label: 'Corte',         precisaMovimentar: true },
  { href: '/almoxarifado/movimentacoes', label: 'Movimentações', precisaMovimentar: false },
]

export function AbasAlmoxarifado() {
  const pathname = usePathname()
  const { permissoes } = useMembro()
  const abas = ABAS.filter(a => !a.precisaMovimentar || permissoes.movimentarEstoque)

  // O detalhe de um material (/almoxarifado/[id]) conta como "Estoque": é de
  // lá que se chega nele.
  const ativa = abas.find(a => a.href !== '/almoxarifado' && pathname.startsWith(a.href))?.href ?? '/almoxarifado'

  return (
    <nav aria-label="Seções do almoxarifado" className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
      <ul className="flex gap-1 border-b border-borda min-w-max">
        {abas.map(a => {
          const atual = a.href === ativa
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                aria-current={atual ? 'page' : undefined}
                className={clsx(
                  'block px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                  atual
                    ? 'border-marca text-marca-texto'
                    : 'border-transparent text-suave hover:text-conteudo hover:border-borda-forte',
                )}
              >
                {a.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const SITUACAO_BADGE: Record<Exclude<SituacaoMaterial, 'sem_minimo'>, { label: string; classe: string }> = {
  negativo: { label: 'Negativo — conferir', classe: 'bg-red-100 text-red-700' },
  abaixo:   { label: 'Abaixo do mínimo',    classe: 'bg-amber-100 text-amber-800' },
  ok:       { label: 'Ok',                  classe: 'bg-green-100 text-green-800' },
}

/** Nada quando o material não tem mínimo cadastrado (e o saldo não é negativo). */
export function BadgeSituacao({ situacao }: { situacao: SituacaoMaterial }) {
  if (situacao === 'sem_minimo') return null
  const s = SITUACAO_BADGE[situacao]
  return <span className={clsx('badge whitespace-nowrap', s.classe)}>{s.label}</span>
}

const TIPO_BADGE: Record<TipoMovimento, string> = {
  entrada:   'bg-green-100 text-green-800',
  saida:     'bg-red-100 text-red-700',
  devolucao: 'bg-blue-100 text-blue-700',
  ajuste:    'bg-amber-100 text-amber-800',
}

/** Entrada verde, Saída vermelho, Sobra azul, Ajuste amarelo (K5). */
export function BadgeTipo({ tipo }: { tipo: TipoMovimento }) {
  return <span className={clsx('badge', TIPO_BADGE[tipo])}>{TIPO_LABEL[tipo]}</span>
}

/**
 * Lê um número digitado em pt-BR ("12,5" ou "12.5"). Vazio → null. Texto que
 * não é número → NaN, para a tela avisar em vez de gravar zero em silêncio.
 */
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '')
  if (!t) return null
  // "1.234,5" → "1234.5"; "12,5" → "12.5"; "12.5" continua.
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN
}

/** O inverso de `lerNumero`, para preencher o campo na edição. */
export function numeroParaCampo(v: number | null): string {
  return v == null ? '' : String(v).replace('.', ',')
}

// Aviso de "feito" que atravessa a navegação (entrada registrada → volta para
// o estoque). sessionStorage porque some sozinho ao fechar a aba.
const CHAVE_AVISO = 'nice-aviso-almoxarifado'

export function guardarAviso(texto: string): void {
  try { sessionStorage.setItem(CHAVE_AVISO, texto) } catch { /* sem storage: só não mostra o aviso */ }
}

/** Lê e apaga: o aviso aparece uma vez só. */
export function lerAviso(): string | null {
  try {
    const t = sessionStorage.getItem(CHAVE_AVISO)
    if (t) sessionStorage.removeItem(CHAVE_AVISO)
    return t
  } catch {
    return null
  }
}

/** Nome + cor: "PV · Branco", sem o ponto quando não tem cor. */
export function nomeMaterial(m: { nome: string; cor?: string | null }): string {
  return m.cor ? `${m.nome} · ${m.cor}` : m.nome
}
