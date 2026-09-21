'use client'
import { startTransition, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Factory, AlertTriangle, ClipboardCheck,
  PlusCircle, ArrowRight, TrendingUp, HandCoins, Search
} from 'lucide-react'
import { getPedidos, getClientes, pedidosStats } from '@/lib/store'
import {
  STATUS_CONFIG, totalPecas, resumoProgresso, prazoTexto,
  FILTROS_DASHBOARD, FiltroDashboard, pedidoCasaComBusca, ordenarPedidos,
} from '@/lib/helpers'
import { Pedido } from '@/types'
import { excecaoPendente } from '@/lib/excecaoPagamento'
import { useMembro } from '@/components/AuthProvider'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import { useSkeletonDelay } from '@/lib/hooks'
import EsqueletoBarra from '@/components/EsqueletoBarra'
import clsx from 'clsx'

/** Mesmo padrão de /pedidos, FluxoEtapas.tsx e terceirizadas/page.tsx. */
function descreverFalhaCarregar(err: unknown): string {
  const f = classificarErro(err)
  const motivo =
    f.tipo === 'offline' ? 'Sem conexão com a internet' :
    f.tipo === 'rede' ? 'Servidor inacessível' :
    f.tipo === 'permissao' ? 'Seu perfil não tem permissão para ver os pedidos' :
    `Falha${sufixoCodigo(f)}: ${f.message || 'erro desconhecido'}`
  return `${motivo}, não deu para carregar o dashboard. Os números abaixo podem estar incompletos.`
}

export default function DashboardPage() {
  const { permissoes } = useMembro()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [totalClientes, setTotalClientes] = useState(0)
  const [stats, setStats] = useState({ emProducao: 0, urgentes: 0, entregaEm7dias: 0, aguardandoProducao: 0 })
  const [filtro, setFiltro] = useState<FiltroDashboard>('todos')
  // Mesmo padrão de /pedidos (Fase G3): `busca` acompanha o input sem atraso,
  // `buscaAplicada` é quem entra no useMemo e chega via startTransition.
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const mostrarSkeleton = useSkeletonDelay(carregando)

  useEffect(() => {
    (async () => {
      setErro(null)
      try {
        const [data, clientes] = await Promise.all([getPedidos(), getClientes()])
        setPedidos(data)
        setStats(pedidosStats(data))
        setTotalClientes(clientes.length)
      } catch (err) {
        setErro(descreverFalhaCarregar(err))
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  // useMemo (Fase G3): estas seis derivações rodavam de novo em todo render —
  // inclusive um render disparado por algo que não muda pedidos/filtro/busca
  // nenhum. Deps primitivas onde possível.
  const ativos = useMemo(
    () => pedidos.filter(p => !['entregue', 'cancelado'].includes(p.status)),
    [pedidos],
  )
  const urgentes = useMemo(
    () => pedidos.filter(p => p.tipo === 'urgente' && !['entregue', 'cancelado'].includes(p.status)),
    [pedidos],
  )

  // A "notificação" do gestor. Não é push nem e-mail: é a lista aparecendo no
  // lugar em que ele já entra todo dia. Enquanto o pedido estiver aqui, ele
  // está PARADO — não avança para produção sem a decisão.
  const aguardandoAprovacao = useMemo(
    () => pedidos.filter(p => excecaoPendente(p) && !['entregue', 'cancelado'].includes(p.status)),
    [pedidos],
  )

  const filtrando = filtro !== 'todos' || busca.trim() !== ''

  const visiveis = useMemo(() => ordenarPedidos(
    ativos.filter(p => {
      const matchFiltro =
        filtro === 'todos' ? true
        : filtro === 'urgentes' ? p.tipo === 'urgente'
        : p.status === filtro
      return matchFiltro && pedidoCasaComBusca(p, buscaAplicada)
    }),
    'entrega_asc',
  ), [ativos, filtro, buscaAplicada])

  const linhas = filtrando ? visiveis : visiveis.slice(0, 10)

  const pecasEmProducao = useMemo(() => pedidos
    .filter(p => p.status === 'em_producao')
    .reduce((acc, p) => acc + totalPecas(p), 0), [pedidos])

  const urgentesVencidos = useMemo(() => urgentes.filter(p => {
    const { dias } = prazoTexto(p.dataEntrega)
    return dias !== null && dias < 0
  }).length, [urgentes])

  const urgentesResumo = ordenarPedidos(urgentes, 'entrega_asc').slice(0, 2)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Dashboard</h1>
          <p className="text-sm text-suave mt-0.5">
            {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            <span className="text-fraco"> · {totalClientes} clientes na base</span>
          </p>
        </div>
        <Link href="/novo-pedido" className="btn-primary">
          <PlusCircle className="w-4 h-4" />
          Novo Pedido
        </Link>
      </div>

      {erro && (
        <div className="flex items-center gap-2 rounded-xl bg-red-100 text-red-700 px-4 py-3 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* KPI Cards — cor só quando o valor pede atenção. "Em produção" é o
          cartão dominante (a pergunta que o Pedro faz todo dia); Urgentes e
          Entrega em 7 dias ficam neutros quando zeram, para não treinar o
          olho a ignorar vermelho/laranja. */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card bg-marca-suave border-marca-borda">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-marca-texto">Em produção</span>
            <Factory className="w-4 h-4 text-marca-texto" />
          </div>
          <div className="text-4xl font-bold leading-none text-marca-texto mt-2">{stats.emProducao}</div>
          <div className="text-xs text-marca-texto mt-1">{pecasEmProducao} peças na fábrica</div>
        </div>

        <div className={clsx('card', stats.urgentes > 0 ? 'border-red-200' : 'border-borda')}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-suave">Urgentes</span>
            {stats.urgentes > 0 && <span className="w-2 h-2 rounded-full bg-red-500" />}
          </div>
          <div className={clsx('text-3xl font-bold leading-none mt-2', stats.urgentes > 0 ? 'text-red-700' : 'text-titulo')}>
            {stats.urgentes}
          </div>
          {urgentesVencidos > 0 && (
            <div className="text-xs text-red-700 mt-1">
              {urgentesVencidos === 1 ? '1 já venceu' : `${urgentesVencidos} já venceram`}
            </div>
          )}
        </div>

        <div className={clsx('card', stats.entregaEm7dias > 0 ? 'border-orange-200' : 'border-borda')}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-suave">Entrega em 7 dias</span>
            {stats.entregaEm7dias > 0 && <span className="w-2 h-2 rounded-full bg-orange-500" />}
          </div>
          <div className={clsx('text-3xl font-bold leading-none mt-2', stats.entregaEm7dias > 0 ? 'text-orange-700' : 'text-titulo')}>
            {stats.entregaEm7dias}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-suave">Aguardando Produção</span>
            <ClipboardCheck className="w-4 h-4 text-fraco" />
          </div>
          <div className="text-3xl font-bold text-titulo mt-2">{stats.aguardandoProducao}</div>
        </div>
      </div>

      {/* As duas faixas de alerta, uma linha cada — a lista de 3 linhas de
          urgentes saiu daqui porque a tabela "Pedidos Ativos" logo abaixo já
          mostra todos. */}
      <div className="space-y-2.5">
        {urgentes.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl border px-4 py-3 bg-red-50 border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-sm font-semibold text-red-700 whitespace-nowrap">
              {urgentes.length === 1 ? '1 pedido urgente' : `${urgentes.length} pedidos urgentes`}
            </span>
            <span className="text-sm text-suave truncate min-w-0">
              {urgentesResumo.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link href={`/pedidos/${p.id}`} className="hover:underline">#{p.numero}</Link>
                  {' '}{prazoTexto(p.dataEntrega).texto}
                </span>
              ))}
            </span>
            <button onClick={() => setFiltro('urgentes')} className="ml-auto text-xs font-semibold text-red-700 whitespace-nowrap">
              Filtrar urgentes →
            </button>
          </div>
        )}

        {permissoes.aprovarExcecaoPagamento && aguardandoAprovacao.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl border px-4 py-3 bg-yellow-50 border-yellow-200">
            <HandCoins className="w-4 h-4 text-yellow-600 shrink-0" />
            <span className="text-sm font-semibold text-yellow-800 whitespace-nowrap">
              {aguardandoAprovacao.length === 1
                ? '1 pedido aguardando sua aprovação'
                : `${aguardandoAprovacao.length} pedidos aguardando sua aprovação`}
            </span>
            <span className="text-sm text-suave truncate min-w-0">
              {aguardandoAprovacao.slice(0, 2).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link href={`/pedidos/${p.id}`} className="hover:underline">#{p.numero}</Link>
                  {' '}— {p.excecaoPagamento?.solicitadoPor}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Tabela de pedidos ativos */}
      <div className="card p-0 overflow-hidden" aria-busy={carregando}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-borda">
          <h2 className="font-semibold text-titulo flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-nice-500" />
            Pedidos Ativos
          </h2>
          <Link href="/pedidos" className="text-marca-texto text-sm font-medium hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {(filtrando || ativos.length > 0) && (
          <div className="bg-superficie-2 border-b border-borda px-6 py-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fraco" />
              <input
                className="input pl-9"
                placeholder="Buscar por cliente, empresa ou número..."
                value={busca}
                onChange={e => {
                  setBusca(e.target.value)
                  startTransition(() => setBuscaAplicada(e.target.value))
                }}
              />
            </div>
            {FILTROS_DASHBOARD.map(f => (
              <button key={f.value} onClick={() => setFiltro(f.value)}
                className={clsx('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                  filtro === f.value
                    ? 'bg-nice-500 text-white'
                    : 'bg-superficie-3 text-suave hover:bg-superficie-3')}>
                {f.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-fraco whitespace-nowrap">
              {linhas.length} de {ativos.length} pedidos ativos
            </span>
          </div>
        )}

        {mostrarSkeleton && <span role="status" className="sr-only">Carregando pedidos</span>}
        {mostrarSkeleton ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Pedido</th>
                  <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-6 py-3 font-semibold">Peças</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="text-left px-6 py-3 font-semibold">Produção</th>
                  <th className="text-left px-6 py-3 font-semibold">Entrega</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-16" /></td>
                    <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-32" /></td>
                    <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-10" /></td>
                    <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-16" /></td>
                    <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-20" /></td>
                    <td className="px-6 py-4"><EsqueletoBarra className="h-4 w-20" /></td>
                    <td className="px-6 py-4" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : carregando ? null : linhas.length === 0 ? (
          filtrando ? (
            <div className="py-16 text-center text-fraco">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum pedido ativo casa com esse filtro.</p>
              <button
                onClick={() => { setFiltro('todos'); setBusca(''); setBuscaAplicada('') }}
                className="text-marca-texto text-sm font-medium mt-2 inline-block hover:underline"
              >
                Limpar filtro
              </button>
            </div>
          ) : (
            <div className="py-16 text-center text-fraco">
              <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum pedido ativo no momento.</p>
              <Link href="/novo-pedido" className="text-marca-texto text-sm font-medium mt-2 inline-block hover:underline">Criar primeiro pedido →</Link>
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Pedido</th>
                  <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-6 py-3 font-semibold">Peças</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="text-left px-6 py-3 font-semibold">Produção</th>
                  <th className="text-left px-6 py-3 font-semibold">Entrega</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {linhas.map(p => {
                  const sc = STATUS_CONFIG[p.status]
                  const r = resumoProgresso(p.progresso)
                  const prazo = prazoTexto(p.dataEntrega)
                  const corBarra =
                    prazo.tom === 'atrasado' ? 'bg-red-500'
                    : prazo.tom === 'proximo' && r.pct < 70 ? 'bg-orange-500'
                    : 'bg-nice-400'
                  return (
                    <tr key={p.id} className="hover:bg-superficie-2 transition-colors">
                      <td className={clsx('px-6 py-4 border-l-[3px]', p.tipo === 'urgente' ? 'border-red-500' : 'border-transparent')}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-marca-texto num">#{p.numero}</span>
                          {p.tipo === 'urgente' && <span className="badge bg-red-100 text-red-600">urgente</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-conteudo">{p.cliente.nome}</div>
                        {p.cliente.empresa && <div className="text-xs text-fraco">{p.cliente.empresa}</div>}
                      </td>
                      <td className="px-6 py-4 text-suave num">{totalPecas(p)} un.</td>
                      <td className="px-6 py-4">
                        <span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-[76px] h-1.5 rounded-full bg-superficie-3 overflow-hidden shrink-0">
                            {r.total > 0 && <div className={clsx('h-full rounded-full', corBarra)} style={{ width: `${r.pct}%` }} />}
                          </div>
                          <span className="text-xs text-suave num">
                            {r.total === 0 ? '—' : `${r.concluidos}/${r.total}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={clsx('text-sm font-semibold',
                          prazo.tom === 'atrasado' ? 'text-red-700'
                          : prazo.tom === 'proximo' ? 'text-orange-700'
                          : prazo.tom === 'normal' ? 'text-conteudo'
                          : 'text-fraco')}>
                          {prazo.texto}
                        </div>
                        {prazo.tom !== 'sem_data' && (
                          <div className="text-xs text-fraco num">{prazo.data}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Link href={`/pedidos/${p.id}`} className="text-marca-texto hover:text-marca-texto font-medium text-xs flex items-center gap-1">
                          Ver <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
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
