'use client'
// K5 — Movimentações: o histórico de tudo que entrou e saiu, com filtros, totais
// do período, "Sobras da semana" e CSV. Só leitura (movimento não se edita nem
// se apaga — regra K-2). O corte também abre esta tela, sem custo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, Scissors, Search } from 'lucide-react'
import clsx from 'clsx'
import { addDays, format, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns'
import { useMembro } from '@/components/AuthProvider'
import {
  TIPO_LABEL, UNIDADE_LABEL, formatarQuantidade, getMovimentos, getTodosMovimentos,
  somarPorUnidade, textoSomaPorUnidade,
} from '@/lib/almoxarifado'
import { baixarCsv } from '@/lib/csv'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import { useSkeletonDelay } from '@/lib/hooks'
import EsqueletoBarra from '@/components/EsqueletoBarra'
import { AbasAlmoxarifado, BadgeTipo, nomeMaterial } from '@/components/almoxarifado/ui'
import type { MovimentoEstoque, TipoMovimento } from '@/types'

const POR_PAGINA = 50

type Periodo = '7dias' | 'este_mes' | 'mes_passado' | 'tudo'
const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: '7dias', rotulo: 'Últimos 7 dias' },
  { valor: 'este_mes', rotulo: 'Este mês' },
  { valor: 'mes_passado', rotulo: 'Mês passado' },
  { valor: 'tudo', rotulo: 'Tudo' },
]
const TIPOS: TipoMovimento[] = ['entrada', 'saida', 'devolucao', 'ajuste']

/** Limites em HORÁRIO LOCAL: `ate` é exclusivo (começo do dia seguinte). */
function limitesDoPeriodo(p: Periodo): { desde?: string; ate?: string } {
  const hoje = startOfDay(new Date())
  if (p === '7dias') return { desde: subDays(hoje, 6).toISOString(), ate: addDays(hoje, 1).toISOString() }
  if (p === 'este_mes') return { desde: startOfMonth(hoje).toISOString(), ate: addDays(hoje, 1).toISOString() }
  if (p === 'mes_passado') {
    const ini = startOfMonth(subMonths(hoje, 1))
    return { desde: ini.toISOString(), ate: startOfMonth(hoje).toISOString() }
  }
  return {}
}

function descreverFalhaCarregar(err: unknown): string {
  const f = classificarErro(err)
  const motivo =
    f.tipo === 'offline' ? 'Sem conexão com a internet' :
    f.tipo === 'rede' ? 'Servidor inacessível' :
    f.tipo === 'permissao' ? 'Seu perfil não tem permissão para ver as movimentações' :
    `Falha${sufixoCodigo(f)}: ${f.message || 'erro desconhecido'}`
  return `${motivo}, não deu para carregar as movimentações.`
}

function quantidadeTexto(mv: MovimentoEstoque): string {
  const un = mv.material?.unidade
  const sinal = mv.quantidade > 0 ? '+' : ''
  return un ? `${sinal}${formatarQuantidade(mv.quantidade, un)}` : `${sinal}${mv.quantidade}`
}

export default function MovimentacoesPage() {
  const { permissoes } = useMembro()

  const [tipo, setTipo] = useState<TipoMovimento | ''>('')
  const [periodo, setPeriodo] = useState<Periodo>('este_mes')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [pagina, setPagina] = useState(1)

  const [movimentos, setMovimentos] = useState<MovimentoEstoque[]>([])
  const [total, setTotal] = useState(0)
  const [todos, setTodos] = useState<MovimentoEstoque[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const mostrarSkeleton = useSkeletonDelay(carregando)

  // A busca só vai ao banco depois que a pessoa para de digitar.
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca); setPagina(1) }, 350)
    return () => clearTimeout(t)
  }, [busca])

  const filtro = useMemo(
    () => ({ tipo: tipo || undefined, busca: buscaAplicada || undefined, ...limitesDoPeriodo(periodo) }),
    [tipo, buscaAplicada, periodo],
  )

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [pag, tudo] = await Promise.all([
        getMovimentos({ ...filtro, pagina, porPagina: POR_PAGINA }),
        getTodosMovimentos(filtro),
      ])
      setMovimentos(pag.movimentos)
      setTotal(pag.total)
      setTodos(tudo)
    } catch (err) {
      setErro(descreverFalhaCarregar(err))
    } finally {
      setCarregando(false)
    }
  }, [filtro, pagina])

  useEffect(() => { carregar() }, [carregar])

  const totais = useMemo(() => {
    const por = (t: TipoMovimento) => todos.filter(m => m.tipo === t)
    return {
      entrada: textoSomaPorUnidade(somarPorUnidade(por('entrada'))),
      saida: textoSomaPorUnidade(somarPorUnidade(por('saida'))),
      devolucao: textoSomaPorUnidade(somarPorUnidade(por('devolucao'))),
      ajuste: textoSomaPorUnidade(somarPorUnidade(por('ajuste'))),
    }
  }, [todos])

  // "Sobras da semana": só aparece com o filtro de sobra, e soma por material.
  const sobrasPorMaterial = useMemo(() => {
    if (tipo !== 'devolucao') return []
    const mapa = new Map<string, { nome: string; unidade: keyof typeof UNIDADE_LABEL; soma: number }>()
    for (const m of todos) {
      if (!m.material) continue
      const atual = mapa.get(m.materialId) ?? { nome: nomeMaterial(m.material), unidade: m.material.unidade, soma: 0 }
      atual.soma += m.quantidade
      mapa.set(m.materialId, atual)
    }
    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [todos, tipo])

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  function sobrasDaSemana() {
    setTipo('devolucao')
    setPeriodo('7dias')
    setPagina(1)
  }

  async function exportar() {
    setExportando(true)
    try {
      const tudo = await getTodosMovimentos(filtro)
      const cab = ['Quando', 'Tipo', 'Material', 'Cor', 'Quantidade', 'Unidade', 'Saldo depois',
        'Pedido', 'Fornecedor', 'Nota fiscal', ...(permissoes.verFinanceiro ? ['Custo/un.'] : []), 'Quem', 'Observação']
      const linhas = tudo.map(m => [
        format(new Date(m.criadoEm), 'dd/MM/yyyy HH:mm'),
        TIPO_LABEL[m.tipo],
        m.material?.nome ?? '',
        m.material?.cor ?? '',
        m.quantidade,
        m.material ? UNIDADE_LABEL[m.material.unidade] : '',
        m.saldoDepois,
        m.numeroPedido ?? '',
        m.fornecedor ?? '',
        m.notaFiscal ?? '',
        ...(permissoes.verFinanceiro ? [m.custoUnitario] : []),
        m.feitoPor ?? '',
        m.observacao ?? '',
      ])
      baixarCsv(`movimentacoes-almoxarifado-${format(new Date(), 'yyyy-MM-dd')}.csv`, cab, linhas)
    } catch (err) {
      setErro(descreverFalhaCarregar(err).replace('carregar as movimentações', 'exportar'))
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Movimentações</h1>
          <p className="text-sm text-suave mt-0.5">Tudo que entrou e saiu do almoxarifado</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={sobrasDaSemana}>
            <Scissors className="w-4 h-4" aria-hidden="true" /> Sobras da semana
          </button>
          <button type="button" className="btn-secondary" onClick={exportar} disabled={exportando || total === 0}>
            <Download className="w-4 h-4" aria-hidden="true" /> {exportando ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      <AbasAlmoxarifado />

      {erro && (
        <div role="alert" className="card border-red-200 bg-red-50 flex items-start gap-3 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-700 flex-1">{erro}</p>
          <button type="button" onClick={carregar} className="text-red-700 text-xs font-semibold hover:underline shrink-0">
            Tentar de novo
          </button>
        </div>
      )}

      {/* Totais do período filtrado, separados por unidade */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" aria-busy={carregando}>
        {([['Entradas', totais.entrada], ['Saídas', totais.saida], ['Sobras', totais.devolucao], ['Ajustes', totais.ajuste]] as const).map(([rotulo, valor]) => (
          <div key={rotulo} className="card p-4">
            <div className="text-xs text-suave">{rotulo}</div>
            {carregando && mostrarSkeleton
              ? <EsqueletoBarra className="h-6 w-24 mt-2" />
              : <div className="text-lg font-bold num text-titulo mt-1">{valor}</div>}
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-fraco absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input type="search" className="input pl-9" placeholder="Buscar por material, cor ou fornecedor…"
            aria-label="Buscar movimentações" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div role="group" aria-label="Tipo" className="flex flex-wrap gap-2">
            <Chip ativo={tipo === ''} onClick={() => { setTipo(''); setPagina(1) }}>Todos</Chip>
            {TIPOS.map(t => (
              <Chip key={t} ativo={tipo === t} onClick={() => { setTipo(t); setPagina(1) }}>{TIPO_LABEL[t]}</Chip>
            ))}
          </div>
          <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
            {PERIODOS.map(p => (
              <Chip key={p.valor} ativo={periodo === p.valor} onClick={() => { setPeriodo(p.valor); setPagina(1) }}>{p.rotulo}</Chip>
            ))}
          </div>
        </div>
      </div>

      {sobrasPorMaterial.length > 0 && (
        <section className="card space-y-2" aria-labelledby="t-sobras">
          <h2 id="t-sobras" className="font-semibold text-titulo">Sobras por material</h2>
          <p className="text-sm text-conteudo num">
            {sobrasPorMaterial.map(s => `${s.nome}: ${formatarQuantidade(s.soma, s.unidade)}`).join(' · ')}
          </p>
        </section>
      )}

      {/* Lista */}
      <section className="card p-0 overflow-hidden" aria-busy={carregando}>
        {!carregando && !erro && movimentos.length === 0 ? (
          <p className="p-8 text-center text-sm text-suave">Nenhuma movimentação neste filtro.</p>
        ) : carregando && mostrarSkeleton && movimentos.length === 0 ? (
          <div className="p-4 space-y-3">{[0, 1, 2, 3].map(i => <EsqueletoBarra key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            {/* Celular: cartões */}
            <ul className="md:hidden divide-y divide-borda">
              {movimentos.map(mv => (
                <li key={mv.id} className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <BadgeTipo tipo={mv.tipo} />
                    <span className="text-xs text-suave num">{format(new Date(mv.criadoEm), 'dd/MM/yyyy HH:mm')}</span>
                  </div>
                  <div className="text-sm font-medium text-conteudo">{mv.material ? nomeMaterial(mv.material) : '—'}</div>
                  <div className="flex items-center justify-between text-sm">
                    <span className={clsx('font-semibold num', mv.quantidade < 0 ? 'text-red-700' : 'text-green-800')}>{quantidadeTexto(mv)}</span>
                    <span className="text-suave num">
                      saldo {mv.saldoDepois != null && mv.material ? formatarQuantidade(mv.saldoDepois, mv.material.unidade) : '—'}
                    </span>
                  </div>
                  <Detalhes mv={mv} />
                </li>
              ))}
            </ul>

            {/* Desktop: tabela */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-suave bg-superficie-2">
                    <th className="px-4 py-3 font-semibold">Quando</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Material</th>
                    <th className="px-4 py-3 font-semibold text-right">Quantidade</th>
                    <th className="px-4 py-3 font-semibold text-right">Saldo depois</th>
                    <th className="px-4 py-3 font-semibold">Pedido / NF</th>
                    <th className="px-4 py-3 font-semibold">Quem</th>
                    <th className="px-4 py-3 font-semibold">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {movimentos.map(mv => (
                    <tr key={mv.id}>
                      <td className="px-4 py-3 num text-suave whitespace-nowrap">{format(new Date(mv.criadoEm), 'dd/MM/yyyy HH:mm')}</td>
                      <td className="px-4 py-3"><BadgeTipo tipo={mv.tipo} /></td>
                      <td className="px-4 py-3 text-conteudo">{mv.material ? nomeMaterial(mv.material) : '—'}</td>
                      <td className={clsx('px-4 py-3 text-right font-semibold num whitespace-nowrap', mv.quantidade < 0 ? 'text-red-700' : 'text-green-800')}>
                        {quantidadeTexto(mv)}
                      </td>
                      <td className="px-4 py-3 text-right num text-conteudo whitespace-nowrap">
                        {mv.saldoDepois != null && mv.material ? formatarQuantidade(mv.saldoDepois, mv.material.unidade) : '—'}
                      </td>
                      <td className="px-4 py-3 text-suave">
                        {mv.pedidoId && mv.numeroPedido
                          ? <Link href={`/pedidos/${mv.pedidoId}`} className="text-marca-texto hover:underline num">{mv.numeroPedido}</Link>
                          : null}
                        {mv.notaFiscal && <span className="num">{mv.pedidoId ? ' · ' : ''}NF {mv.notaFiscal}</span>}
                        {mv.fornecedor && <div className="text-xs">{mv.fornecedor}</div>}
                        {!mv.pedidoId && !mv.notaFiscal && !mv.fornecedor && '—'}
                      </td>
                      <td className="px-4 py-3 text-suave">{mv.feitoPor ?? '—'}</td>
                      <td className="px-4 py-3 text-suave max-w-[16rem] truncate" title={mv.observacao ?? undefined}>{mv.observacao ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-borda">
                <button type="button" className="btn-secondary text-sm" disabled={pagina <= 1 || carregando}
                  onClick={() => setPagina(p => p - 1)}>Anterior</button>
                <span className="text-xs text-suave num">Página {pagina} de {totalPaginas} · {total} movimentos</span>
                <button type="button" className="btn-secondary text-sm" disabled={pagina >= totalPaginas || carregando}
                  onClick={() => setPagina(p => p + 1)}>Próxima</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={clsx(
        'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
        ativo ? 'bg-marca text-white' : 'bg-superficie-3 text-suave hover:text-conteudo',
      )}>
      {children}
    </button>
  )
}

/** Linhas de apoio do cartão de celular: pedido, NF, fornecedor, quem e observação. */
function Detalhes({ mv }: { mv: MovimentoEstoque }) {
  const partes: React.ReactNode[] = []
  if (mv.pedidoId && mv.numeroPedido) {
    partes.push(<Link key="p" href={`/pedidos/${mv.pedidoId}`} className="text-marca-texto hover:underline num">Pedido {mv.numeroPedido}</Link>)
  }
  if (mv.notaFiscal) partes.push(<span key="nf" className="num">NF {mv.notaFiscal}</span>)
  if (mv.fornecedor) partes.push(<span key="f">{mv.fornecedor}</span>)
  if (mv.feitoPor) partes.push(<span key="q">por {mv.feitoPor}</span>)
  return (
    <>
      {partes.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-suave">{partes}</div>
      )}
      {mv.observacao && <p className="text-xs text-suave">{mv.observacao}</p>}
    </>
  )
}
