'use client'
import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Printer, TrendingUp, Package, CheckCircle2, XCircle, Download, Hourglass } from 'lucide-react'
import { getPedidos } from '@/lib/store'
import { STATUS_CONFIG, COMPLEXIDADE_CONFIG, totalPecas, dataLocal, formatarData, moeda } from '@/lib/helpers'
import {
  MOTIVO_LABEL,
  diasAguardando, estaAguardando, prontoEm, saldoEmAberto,
} from '@/lib/aguardandoCliente'
import { baixarCsv, Celula } from '@/lib/csv'
import { useMembro } from '@/components/AuthProvider'
import { Pedido, Complexidade, MotivoAguardando } from '@/types'
import clsx from 'clsx'

/** Motivo → cor da barra de "Por motivo", mesma paleta do restante do sistema. */
const COR_MOTIVO: Record<MotivoAguardando, string> = {
  pagamento: 'bg-amber-400',
  sem_tempo: 'bg-blue-400',
  outro: 'bg-gray-400',
}

export default function RelatoriosPage() {
  const { permissoes } = useMembro()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [mes, setMes] = useState(format(new Date(), 'yyyy-MM'))

  useEffect(() => { (async () => setPedidos(await getPedidos()))() }, [])

  const base = dataLocal(`${mes}-01`) ?? new Date()
  const inicio = startOfMonth(base)
  const fim = endOfMonth(base)

  const doMes = pedidos.filter(p =>
    isWithinInterval(new Date(p.dataEntrada), { start: inicio, end: fim })
  )

  const entregues = doMes.filter(p => p.status === 'entregue')
  const cancelados = doMes.filter(p => p.status === 'cancelado')
  const emAndamento = pedidos.filter(p => !['entregue', 'cancelado'].includes(p.status))

  const receitaTotal = entregues.reduce((a, p) => a + p.valorTotal, 0)
  const totalUnidades = doMes.reduce((a, p) => a + totalPecas(p), 0)

  const porComplexidade = (['P1', 'P2', 'P3', 'P4', 'P5'] as Complexidade[]).map(c => {
    const pecas = doMes.flatMap(p => p.pecas.filter(x => x.complexidade === c))
    const qtd = pecas.reduce((a, p) => a + p.tamanhos.reduce((b, t) => b + t.quantidade, 0), 0)
    return { complexidade: c, qtd, config: COMPLEXIDADE_CONFIG[c] }
  })

  const maxQtd = Math.max(...porComplexidade.map(x => x.qtd), 1)

  // ---- Aguardando o cliente (I5) --------------------------------------------
  // Quem entra: está aguardando AGORA, ou foi registrado neste mês (mesmo já
  // tendo saído — entregue/cancelado). O segundo caso é o histórico do mês.
  function registradoNoMes(p: Pedido): boolean {
    if (!p.aguardandoCliente) return false
    const d = new Date(p.aguardandoCliente.registradoEm)
    return isWithinInterval(d, { start: inicio, end: fim })
  }
  const listaAguardando = pedidos.filter(p => p.aguardandoCliente && (estaAguardando(p) || registradoNoMes(p)))
  const listaAguardandoOrdenada = [...listaAguardando].sort((a, b) => diasAguardando(b) - diasAguardando(a))

  function situacaoDe(p: Pedido): string {
    if (p.status === 'entregue') return 'Entregue'
    if (p.status === 'cancelado') return 'Cancelado'
    return 'Aguardando'
  }

  // Os 4 números do topo e "Por motivo" só contam quem está aguardando AGORA —
  // o histórico (entregue/cancelado) entra na tabela, não nesses totais.
  const aguardandoAgora = listaAguardando.filter(estaAguardando)
  const pecasParadas = aguardandoAgora.reduce((a, p) => a + totalPecas(p), 0)
  const valorParado = aguardandoAgora.reduce((a, p) => a + p.valorTotal, 0)
  const aReceberParado = aguardandoAgora.reduce((a, p) => a + saldoEmAberto(p), 0)

  const porMotivo = (Object.keys(MOTIVO_LABEL) as MotivoAguardando[]).map(motivo => {
    const doMotivo = aguardandoAgora.filter(p => p.aguardandoCliente?.motivo === motivo)
    const aReceber = doMotivo.reduce((a, p) => a + saldoEmAberto(p), 0)
    return { motivo, qtd: doMotivo.length, aReceber }
  })
  const maxPorMotivo = Math.max(...porMotivo.map(m => m.qtd), 1)

  function exportarAguardandoCliente() {
    const cabecalho = [
      'Nº', 'Cliente', 'Situação', 'Motivo', 'Observação', 'Parado há (dias)',
      'Valor', 'Falta receber', 'Registrado por', 'Registrado em', 'Confirmado por',
      'Confirmado em', 'Combinou', 'Prazo', 'Pronto desde',
    ]
    const linhas: Celula[][] = listaAguardandoOrdenada.map(p => {
      const a = p.aguardandoCliente!
      const pronto = prontoEm(p)
      return [
        p.numero, p.cliente.nome, situacaoDe(p), MOTIVO_LABEL[a.motivo], a.observacao ?? '',
        estaAguardando(p) ? diasAguardando(p) : '',
        p.valorTotal, saldoEmAberto(p),
        a.registradoPor, format(new Date(a.registradoEm), 'dd/MM/yyyy'),
        a.confirmadoPor ?? '', a.confirmadoEm ? format(new Date(a.confirmadoEm), 'dd/MM/yyyy') : '',
        a.previsaoRetirada ? formatarData(a.previsaoRetirada) : '',
        formatarData(p.dataEntrega), pronto ? format(pronto, 'dd/MM/yyyy') : '',
      ]
    })
    baixarCsv(`aguardando-cliente-${mes}.csv`, cabecalho, linhas)
  }

  function exportarPedidosDoMes() {
    const cabecalho = [
      'Nº', 'Cliente', 'Empresa', 'Peças', 'Status', 'Entrada', 'Entrega',
      'Valor total', 'Valor pago', 'Falta receber',
    ]
    const linhas: Celula[][] = doMes.map(p => [
      p.numero, p.cliente.nome, p.cliente.empresa, totalPecas(p), STATUS_CONFIG[p.status].label,
      format(new Date(p.dataEntrada), 'dd/MM/yyyy'), formatarData(p.dataEntrega),
      p.valorTotal, p.valorPago, Math.max(0, p.valorTotal - p.valorPago),
    ])
    baixarCsv(`pedidos-${mes}.csv`, cabecalho, linhas)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Relatórios</h1>
          <p className="text-sm text-suave mt-0.5 capitalize">
            {format(base, "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <div className="flex gap-3">
          <input className="input w-44" type="month" value={mes} onChange={e => setMes(e.target.value)} />
          <button onClick={() => window.print()} className="btn-secondary">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Pedidos no mês', value: doMes.length, icon: Package, color: 'text-marca-texto', bg: 'bg-marca-suave', border: 'border-marca-borda' },
          { label: 'Entregues', value: entregues.length, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
          { label: 'Cancelados', value: cancelados.length, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
          { label: 'Receita (entregues)', value: moeda(receitaTotal), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={clsx('card flex items-center gap-4 border', border)}>
            <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', bg)}>
              <Icon className={clsx('w-6 h-6', color)} />
            </div>
            <div>
              <div className="text-xl font-bold text-titulo num">{value}</div>
              <div className="text-xs text-suave">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Aguardando o cliente (Fase I5) */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-titulo flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Hourglass className="w-4 h-4" />
            </span>
            Aguardando o cliente
          </h2>
          {listaAguardando.length > 0 && (
            <button onClick={exportarAguardandoCliente} className="btn-secondary print:hidden">
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          )}
        </div>

        {listaAguardando.length === 0 ? (
          <p className="text-sm text-fraco">Nenhum pedido aguardando o cliente neste mês.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-xl bg-superficie-2 p-3">
                <div className="text-lg font-bold text-titulo num">{aguardandoAgora.length}</div>
                <div className="text-xs text-suave">pedidos</div>
              </div>
              <div className="rounded-xl bg-superficie-2 p-3">
                <div className="text-lg font-bold text-titulo num">{pecasParadas}</div>
                <div className="text-xs text-suave">peças paradas</div>
              </div>
              {permissoes.verFinanceiro && (
                <>
                  <div className="rounded-xl bg-superficie-2 p-3">
                    <div className="text-lg font-bold text-titulo num">{moeda(valorParado)}</div>
                    <div className="text-xs text-suave">valor parado</div>
                  </div>
                  <div className="rounded-xl bg-superficie-2 p-3">
                    <div className="text-lg font-bold text-amber-700 num">{moeda(aReceberParado)}</div>
                    <div className="text-xs text-suave">a receber</div>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-fraco uppercase tracking-wide">Por motivo</h3>
              {porMotivo.map(({ motivo, qtd, aReceber }) => (
                <div key={motivo}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-suave">{MOTIVO_LABEL[motivo]}</span>
                    <span className="font-semibold text-conteudo num">
                      {qtd} {qtd === 1 ? 'pedido' : 'pedidos'}
                      {permissoes.verFinanceiro && aReceber > 0 ? ` · ${moeda(aReceber)}` : ''}
                    </span>
                  </div>
                  <div className="w-full bg-superficie-3 rounded-full h-2">
                    <div className={clsx('h-2 rounded-full transition-all', COR_MOTIVO[motivo])}
                      style={{ width: `${(qtd / maxPorMotivo) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto -mx-6 -mb-6 pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                    <th className="text-left px-6 py-3 font-semibold">Nº</th>
                    <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                    <th className="text-left px-6 py-3 font-semibold">Situação</th>
                    <th className="text-left px-6 py-3 font-semibold">Motivo</th>
                    <th className="text-left px-6 py-3 font-semibold">Parado há</th>
                    {permissoes.verFinanceiro && (
                      <>
                        <th className="text-left px-6 py-3 font-semibold">Valor</th>
                        <th className="text-left px-6 py-3 font-semibold">Falta receber</th>
                      </>
                    )}
                    <th className="text-left px-6 py-3 font-semibold">Registrado</th>
                    <th className="text-left px-6 py-3 font-semibold">Combinou</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {listaAguardandoOrdenada.map(p => {
                    const a = p.aguardandoCliente!
                    const saldo = saldoEmAberto(p)
                    return (
                      <tr key={p.id}>
                        <td className="px-6 py-3 font-semibold text-marca-texto num">#{p.numero}</td>
                        <td className="px-6 py-3 text-conteudo">{p.cliente.nome}</td>
                        <td className="px-6 py-3 text-suave">{situacaoDe(p)}</td>
                        <td className="px-6 py-3">
                          <span className="text-conteudo">{MOTIVO_LABEL[a.motivo]}</span>
                          {a.observacao && <div className="text-xs text-fraco">{a.observacao}</div>}
                        </td>
                        <td className="px-6 py-3 text-suave num">
                          {estaAguardando(p) ? `${diasAguardando(p)}d` : '—'}
                        </td>
                        {permissoes.verFinanceiro && (
                          <>
                            <td className="px-6 py-3 text-conteudo num">{moeda(p.valorTotal)}</td>
                            <td className="px-6 py-3 num">
                              {saldo > 0 ? <span className="text-amber-700 font-medium">{moeda(saldo)}</span> : <span className="text-fraco">quitado</span>}
                            </td>
                          </>
                        )}
                        <td className="px-6 py-3 text-xs text-fraco">
                          {a.registradoPor}
                          {a.confirmadoEm && <div>confirmado por {a.confirmadoPor}, {format(new Date(a.confirmadoEm), 'dd/MM')}</div>}
                        </td>
                        <td className="px-6 py-3 text-xs text-fraco">
                          {a.previsaoRetirada ? formatarData(a.previsaoRetirada, 'dd/MM') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribuição por complexidade */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-titulo">Distribuição por Complexidade</h2>
          <div className="space-y-3">
            {porComplexidade.map(({ complexidade, qtd, config }) => (
              <div key={complexidade}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <span className={clsx('badge', config.bg, config.color)}>{complexidade}</span>
                    <span className="text-suave text-xs">{config.label.split('—')[1]?.trim()}</span>
                  </div>
                  <span className="font-semibold text-conteudo num">{qtd} un.</span>
                </div>
                <div className="w-full bg-superficie-3 rounded-full h-2">
                  <div className={clsx('h-2 rounded-full transition-all',
                    complexidade === 'P1' ? 'bg-gray-400' :
                    complexidade === 'P2' ? 'bg-blue-400' :
                    complexidade === 'P3' ? 'bg-yellow-400' :
                    complexidade === 'P4' ? 'bg-orange-400' : 'bg-red-400'
                  )} style={{ width: `${(qtd / maxQtd) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 text-sm text-suave">
            Total: <span className="font-semibold text-marca-texto num">{totalUnidades} peças</span>
          </div>
        </div>

        {/* Em andamento */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-titulo">Em Andamento ({emAndamento.length})</h2>
          {emAndamento.length === 0 ? (
            <p className="text-sm text-fraco">Nenhum pedido em andamento.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {emAndamento.map(p => {
                const sc = STATUS_CONFIG[p.status]
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-borda last:border-0">
                    <div>
                      <span className="font-semibold text-marca-texto text-sm num">#{p.numero}</span>
                      <span className="text-suave text-sm ml-2">{p.cliente.nome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span>
                      <span className="text-xs text-fraco num">{formatarData(p.dataEntrega, 'dd/MM')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tabela do mês */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-borda flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-titulo">Todos os Pedidos do Mês ({doMes.length})</h2>
          {doMes.length > 0 && (
            <button onClick={exportarPedidosDoMes} className="btn-secondary print:hidden">
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          )}
        </div>
        {doMes.length === 0 ? (
          <div className="py-16 text-center text-fraco text-sm">Nenhum pedido neste mês.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Nº</th>
                  <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-6 py-3 font-semibold">Peças</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="text-left px-6 py-3 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {doMes.map(p => {
                  const sc = STATUS_CONFIG[p.status]
                  return (
                    <tr key={p.id}>
                      <td className="px-6 py-3 font-semibold text-marca-texto num">#{p.numero}</td>
                      <td className="px-6 py-3 text-conteudo">{p.cliente.nome}</td>
                      <td className="px-6 py-3 text-suave num">{totalPecas(p)} un.</td>
                      <td className="px-6 py-3"><span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span></td>
                      <td className="px-6 py-3 font-medium text-conteudo num">{p.valorTotal > 0 ? moeda(p.valorTotal) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
