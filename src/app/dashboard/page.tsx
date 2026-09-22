'use client'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Search, Moon, Sun, Bell, PlusCircle, Activity, PackageCheck, Printer,
  TrendingUp, Check, AlertTriangle, AlertCircle, Clock, ArrowRight, Truck, Minus, Sparkles,
  Eye, EyeOff, HandCoins,
} from 'lucide-react'
import { getPedidos, pedidosStats } from '@/lib/store'
import {
  STATUS_CONFIG, totalPecas, resumoProgresso, prazoTexto,
  FILTROS_DASHBOARD, FiltroDashboard, pedidoCasaComBusca, ordenarPedidos,
  pecasPorCategoria, atividadesRecentes, AtividadeRecente, TomPrazo,
} from '@/lib/helpers'
import { Pedido, StatusSetor } from '@/types'
import { excecaoPendente } from '@/lib/excecaoPagamento'
import { useMembro } from '@/components/AuthProvider'
import { useTema } from '@/components/TemaProvider'
import { PERFIL_LABEL, podeAcessarRota } from '@/lib/permissoes'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import { useSkeletonDelay } from '@/lib/hooks'
import clsx from 'clsx'
import './painel.css'

// ===========================================================================
// /dashboard — Fase H
//
// Porte do mockup aprovado pelo Pedro ("Painel Nice"): mesmo layout, dados
// reais. Estilos em ./painel.css (classes pn-*).
//
// O que NÃO veio igual do mockup, por falta de dado real que sustente:
//  - "+8,4% vs. semana passada": não há histórico de valor por semana. No
//    lugar, "% já recebido" (valorPago / valorTotal), que é real.
//  - Status fictícios (Recebido, Pronto, Aguardando Retirada): o funil usa os
//    status reais de STATUS_CONFIG.
//  - "Pagamento" nas ações rápidas: não existe tela própria. Virou "Entregas".
// ===========================================================================

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

function moeda(v: number): string {
  return 'R$ ' + Math.round(v).toLocaleString('pt-BR')
}

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const a = partes.length > 0 ? partes[0][0] : ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase() || '?'
}

function capitalizar(t: string): string {
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

/** "agora", "há 20 min", "há 3 h", "ontem", "18/09". */
function tempoCurto(iso: string): string {
  const d = new Date(iso)
  const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (Number.isNaN(min)) return ''
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  if (h < 48) return 'ontem'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Cores do "tom" de prazo, pra faixa, rail e tabela falarem a mesma língua. */
const COR_TOM: Record<TomPrazo, { bg: string; fg: string }> = {
  atrasado: { bg: 'var(--pn-vermelho-fundo)', fg: 'var(--pn-vermelho-texto)' },
  proximo:  { bg: 'var(--pn-laranja-fundo)',  fg: 'var(--pn-laranja-texto)' },
  normal:   { bg: 'var(--superficie-3)',      fg: 'var(--texto-suave)' },
  sem_data: { bg: 'var(--superficie-3)',      fg: 'var(--texto-fraco)' },
}

/** As 5 etapas "em fluxo", na ordem do funil. Entregue/cancelado não são ativos. */
const ETAPAS_FUNIL: Array<Exclude<Pedido['status'], 'entregue' | 'cancelado'>> = [
  'orcamento', 'aprovado', 'aguardando_pagamento', 'em_producao', 'finalizado',
]

const ATIVIDADE_VISUAL: Record<StatusSetor, { texto: string; bg: string; fg: string; Icone: typeof Check }> = {
  concluido:     { texto: 'Concluído',                  bg: 'var(--pn-verde-fundo)', fg: 'var(--pn-verde-texto)', Icone: Check },
  em_andamento:  { texto: 'Em andamento',               bg: 'var(--pn-azul-fundo)',  fg: 'var(--pn-azul-texto)',  Icone: Activity },
  pendente:      { texto: 'Voltou para pendente',       bg: 'var(--pn-ambar-fundo)', fg: 'var(--pn-ambar-texto)', Icone: Clock },
  nao_se_aplica: { texto: 'Marcado como não se aplica', bg: 'var(--superficie-3)',   fg: 'var(--texto-suave)',    Icone: Minus },
}

/** O carretel decorativo do mockup (hero, CTA e citação). */
function DecoFio() {
  return (
    <svg className="pn-deco" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
      <ellipse cx="50" cy="16" rx="28" ry="8" />
      <ellipse cx="50" cy="84" rx="28" ry="8" />
      <path d="M22 16v68M78 16v68" />
      <path d="M30 38c13 9 27-9 40 0s-6 22 10 13" />
      <path d="M28 62c13 9 27-9 40 0" />
    </svg>
  )
}

/** Preferência "esconder valores" (olho do hero). Só deste navegador — é
 * conveniência de quem está na tela, não dado do sistema. */
const CHAVE_OCULTAR = 'nice-ocultar-valores'
const OCULTO = 'R$ ••••••'

type Dica = { x: number; y: number; valor: string; rotulo: string } | null
type Acao = { rotulo: string; Icone: typeof Check; href?: string; onClick?: () => void }

export default function DashboardPage() {
  const { membro, permissoes } = useMembro()
  const { tema, alternar } = useTema()
  const primeiroNome = membro?.nome?.split(' ')[0] ?? ''

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [stats, setStats] = useState({ emProducao: 0, urgentes: 0, entregaEm7dias: 0, aguardandoProducao: 0 })
  const [filtro, setFiltro] = useState<FiltroDashboard>('todos')
  // Mesmo padrão de /pedidos (Fase G3): `busca` acompanha o input sem atraso,
  // `buscaAplicada` é quem entra no useMemo e chega via startTransition.
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [buscaTopo, setBuscaTopo] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [dica, setDica] = useState<Dica>(null)
  const [avisosAberto, setAvisosAberto] = useState(false)
  const [ocultarValores, setOcultarValores] = useState(false)
  const mostrarSkeleton = useSkeletonDelay(carregando)

  const tabelaRef = useRef<HTMLDivElement>(null)
  const avisosRef = useRef<HTMLDivElement>(null)
  const buscaRef = useRef<HTMLInputElement>(null)

  // Lido no efeito, não no useState inicial: o primeiro render tem que bater
  // com o do servidor (mesmo cuidado do TemaProvider).
  useEffect(() => {
    try { setOcultarValores(localStorage.getItem(CHAVE_OCULTAR) === '1') } catch { /* sem storage */ }
  }, [])

  function alternarValores() {
    setOcultarValores(v => {
      const novo = !v
      try { localStorage.setItem(CHAVE_OCULTAR, novo ? '1' : '0') } catch { /* sem storage */ }
      return novo
    })
  }

  // Popover do sino: fecha com clique fora e com Esc.
  useEffect(() => {
    if (!avisosAberto) return
    const aoClicar = (e: MouseEvent) => {
      if (avisosRef.current && !avisosRef.current.contains(e.target as Node)) setAvisosAberto(false)
    }
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAvisosAberto(false) }
    document.addEventListener('mousedown', aoClicar)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicar)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [avisosAberto])

  useEffect(() => {
    (async () => {
      setErro(null)
      try {
        const data = await getPedidos()
        setPedidos(data)
        setStats(pedidosStats(data))
      } catch (err) {
        setErro(descreverFalhaCarregar(err))
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  const pode = (href: string) => (membro ? podeAcessarRota(membro.perfil, href) : false)

  // ---- Recortes ------------------------------------------------------------

  const ativos = useMemo(
    () => pedidos.filter(p => p.status !== 'entregue' && p.status !== 'cancelado'),
    [pedidos],
  )
  const urgentes = useMemo(() => ativos.filter(p => p.tipo === 'urgente'), [ativos])
  const atrasados = useMemo(() => ativos.filter(p => {
    const { dias } = prazoTexto(p.dataEntrega)
    return dias !== null && dias < 0
  }), [ativos])
  // A "notificação" do gestor: enquanto o pedido estiver aqui, está PARADO.
  const aguardandoAprovacao = useMemo(() => ativos.filter(p => excecaoPendente(p)), [ativos])
  const mostrarAprovacao = permissoes.aprovarExcecaoPagamento && aguardandoAprovacao.length > 0

  // ---- Tabela ----------------------------------------------------------------

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

  function aplicarBusca(valor: string) {
    setBusca(valor)
    startTransition(() => setBuscaAplicada(valor))
  }
  function irParaTabela() {
    tabelaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  function limparFiltros() {
    setFiltro('todos')
    aplicarBusca('')
    setBuscaTopo('')
  }

  // ---- Hero ------------------------------------------------------------------

  // Orçamento ainda não é venda: fica fora do valor em carteira.
  const carteira = useMemo(() => ativos.filter(p => p.status !== 'orcamento'), [ativos])
  const valorCarteira = useMemo(() => carteira.reduce((a, p) => a + p.valorTotal, 0), [carteira])
  const valorRecebido = useMemo(() => carteira.reduce((a, p) => a + p.valorPago, 0), [carteira])
  const pctRecebido = valorCarteira > 0 ? Math.round((valorRecebido / valorCarteira) * 100) : 0

  // ---- Donut -----------------------------------------------------------------

  const etapas = useMemo(() => {
    const contagem: Record<string, number> = {}
    for (const p of ativos) contagem[p.status] = (contagem[p.status] ?? 0) + 1
    return ETAPAS_FUNIL.map((status, i) => ({
      status,
      rotulo: STATUS_CONFIG[status].label,
      valor: contagem[status] ?? 0,
      cor: `var(--pn-etapa-${i + 1})`,
    }))
  }, [ativos])

  // ---- Carga de entregas (hoje + 14 dias) -------------------------------------

  const carga = useMemo(() => {
    const dias: number[] = []
    for (let i = 0; i < 15; i++) dias.push(0)
    for (const p of ativos) {
      const d = prazoTexto(p.dataEntrega).dias
      if (d !== null && d >= 0 && d < 15) dias[d]++
    }
    const max = Math.max(0, ...dias)
    const passo = max <= 5 ? 1 : Math.ceil(max / 4)
    const teto = Math.max(passo, passo * Math.ceil(max / passo))
    const marcas: number[] = []
    for (let v = 0; v <= teto; v += passo) marcas.push(v)
    return { dias, max, teto, marcas }
  }, [ativos])

  // ---- Produção geral ----------------------------------------------------------

  const emProducao = useMemo(() => ativos.filter(p => p.status === 'em_producao'), [ativos])
  const progressoMedio = useMemo(() => {
    if (emProducao.length === 0) return 0
    const soma = emProducao.reduce((a, p) => a + resumoProgresso(p.progresso).pct, 0)
    return Math.round(soma / emProducao.length)
  }, [emProducao])

  // ---- Categorias, próximas entregas, atividade -----------------------------

  const categorias = useMemo(() => pecasPorCategoria(ativos), [ativos])
  const totalCategorias = categorias.reduce((a, c) => a + c.quantidade, 0)
  const maxCategoria = categorias.length > 0 ? Math.max(categorias[0].quantidade, 1) : 1

  const proximasEntregas = useMemo(() => ordenarPedidos(
    ativos.filter(p => {
      const { dias } = prazoTexto(p.dataEntrega)
      return dias !== null && dias >= 0
    }),
    'entrega_asc',
  ).slice(0, 4), [ativos])

  const atividades = useMemo(() => atividadesRecentes(pedidos, 4), [pedidos])

  const avisos = atrasados.length + (mostrarAprovacao ? aguardandoAprovacao.length : 0)

  function mostrarDica(el: Element, valor: string, rotulo: string) {
    const r = el.getBoundingClientRect()
    setDica({ x: r.left + r.width / 2, y: r.top, valor, rotulo })
  }
  const esconderDica = () => setDica(null)

  // ---- Ações rápidas (só o que o perfil pode abrir) ---------------------------

  const acoes: Acao[] = [
    { rotulo: 'Novo Pedido', Icone: PlusCircle, href: '/novo-pedido' },
    { rotulo: 'Entregas', Icone: PackageCheck, href: '/entregas' },
    { rotulo: 'Produção', Icone: Activity, href: '/producao' },
    { rotulo: 'Buscar', Icone: Search, onClick: () => { irParaTabela(); buscaRef.current?.focus({ preventScroll: true }) } },
    { rotulo: 'Imprimir', Icone: Printer, onClick: () => window.print() },
  ]
  const acoesVisiveis = acoes.filter(a => !a.href || pode(a.href))

  return (
    <div className="pn-painel">
      <div className="pn-corpo">
        <div className="pn-main">
          {/* ---------- Topbar ---------- */}
          <header className="pn-topbar">
            <form
              className="pn-busca-topo"
              role="search"
              onSubmit={e => { e.preventDefault(); aplicarBusca(buscaTopo); if (buscaTopo.trim()) irParaTabela() }}
            >
              <Search aria-hidden="true" />
              <input
                type="search"
                value={buscaTopo}
                onChange={e => setBuscaTopo(e.target.value)}
                onBlur={() => { if (buscaTopo !== busca) aplicarBusca(buscaTopo) }}
                placeholder="Buscar pedido, cliente ou empresa…"
                aria-label="Buscar pedido, cliente ou empresa"
              />
            </form>
            <div className="pn-topbar-acoes">
              <button
                type="button"
                className="pn-icone-botao"
                onClick={alternar}
                aria-label={tema === 'escuro' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                title={tema === 'escuro' ? 'Tema claro' : 'Tema escuro'}
              >
                {tema === 'escuro' ? <Sun /> : <Moon />}
              </button>
              <div className="pn-avisos" ref={avisosRef}>
                <button
                  type="button"
                  className="pn-icone-botao"
                  onClick={() => setAvisosAberto(a => !a)}
                  aria-expanded={avisosAberto}
                  aria-haspopup="dialog"
                  aria-label={avisos > 0 ? `${avisos} avisos` : 'Sem avisos'}
                  title={avisos > 0 ? `${avisos} avisos` : 'Sem avisos'}
                >
                  <Bell />
                  {avisos > 0 && <span className="pn-badge-sino">{avisos}</span>}
                </button>

                {avisosAberto && (
                  <div className="pn-popover" role="dialog" aria-label="Avisos">
                    <div className="pn-popover-topo">
                      <h3>Avisos</h3>
                      <span className="pn-contador">{avisos === 0 ? 'nenhum' : avisos === 1 ? '1 aviso' : `${avisos} avisos`}</span>
                    </div>

                    {avisos === 0 ? (
                      <div className="pn-popover-vazio">
                        <Check aria-hidden="true" />
                        Nenhum aviso agora. Nada atrasado e nenhuma liberação esperando você.
                      </div>
                    ) : (
                      <>
                        {mostrarAprovacao && (
                          <>
                            <div className="pn-popover-grupo">Aguardando sua aprovação</div>
                            {aguardandoAprovacao.slice(0, 4).map(p => (
                              <Link key={p.id} href={`/pedidos/${p.id}`} className="pn-rail-item" onClick={() => setAvisosAberto(false)}>
                                <span className="pn-rail-icone" style={{ background: 'var(--pn-ambar-fundo)', color: 'var(--pn-ambar-texto)' }}><HandCoins aria-hidden="true" /></span>
                                <div className="pn-rail-corpo">
                                  <div className="pn-rail-titulo">#{p.numero} {p.cliente.nome}</div>
                                  <div className="pn-rail-sub">
                                    Pagar na retirada{p.excecaoPagamento?.solicitadoPor ? ` · pedido por ${p.excecaoPagamento.solicitadoPor}` : ''}
                                  </div>
                                </div>
                                <div className="pn-rail-direita" style={{ color: 'var(--pn-ambar-texto)' }}>Revisar</div>
                              </Link>
                            ))}
                            {aguardandoAprovacao.length > 4 && (
                              <div className="pn-popover-mais">+ {aguardandoAprovacao.length - 4} aguardando</div>
                            )}
                          </>
                        )}

                        {atrasados.length > 0 && (
                          <>
                            <div className="pn-popover-grupo">Prazo vencido</div>
                            {ordenarPedidos(atrasados, 'entrega_asc').slice(0, 5).map(p => (
                              <Link key={p.id} href={`/pedidos/${p.id}`} className="pn-rail-item" onClick={() => setAvisosAberto(false)}>
                                <span className="pn-rail-icone" style={{ background: 'var(--pn-vermelho-fundo)', color: 'var(--pn-vermelho-texto)' }}><AlertTriangle aria-hidden="true" /></span>
                                <div className="pn-rail-corpo">
                                  <div className="pn-rail-titulo">#{p.numero} {p.cliente.nome}</div>
                                  <div className="pn-rail-sub">{STATUS_CONFIG[p.status].label} · {totalPecas(p)} peças</div>
                                </div>
                                <div className="pn-rail-direita" style={{ color: 'var(--pn-vermelho-texto)' }}>{capitalizar(prazoTexto(p.dataEntrega).texto)}</div>
                              </Link>
                            ))}
                            {atrasados.length > 5 && (
                              <div className="pn-popover-mais">+ {atrasados.length - 5} atrasados — veja todos na tabela abaixo</div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              {membro && (
                <div className="pn-perfil-topo">
                  <div className="pn-avatar">{iniciaisDe(membro.nome)}</div>
                  <div className="pn-quem">
                    <div className="pn-nome">{membro.nome}</div>
                    <div className="pn-cargo">{PERFIL_LABEL[membro.perfil]}</div>
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* ---------- Resumo rápido ---------- */}
          <div className="pn-resumo">
            <span className="pn-pilula"><span className="pn-ponto" style={{ background: 'var(--marca)' }} /><strong>{ativos.length}</strong> pedidos ativos</span>
            <span className="pn-pilula"><span className="pn-ponto" style={{ background: 'var(--pn-laranja-texto)' }} /><strong>{stats.emProducao}</strong> em produção</span>
            <span className="pn-pilula"><span className="pn-ponto" style={{ background: 'var(--pn-ambar-texto)' }} /><strong>{stats.entregaEm7dias}</strong> entregam em 7 dias</span>
            <span className="pn-pilula"><span className="pn-ponto" style={{ background: 'var(--pn-vermelho-texto)' }} /><strong>{stats.urgentes}</strong> {stats.urgentes === 1 ? 'urgente' : 'urgentes'}</span>
          </div>

          {erro && (
            <div className="pn-faixa urgente" role="alert">
              <div className="pn-icone"><AlertTriangle aria-hidden="true" /></div>
              <div className="pn-faixa-texto"><strong>{erro}</strong></div>
            </div>
          )}

          {/* ---------- Linha 1: hero + donut ---------- */}
          <section className="pn-linha-topo">
            <div className="pn-hero">
              <DecoFio />
              <div className="pn-hero-topo">
                <div>
                  <div className="pn-hero-saudacao">
                    {saudacao()}{primeiroNome ? `, ${primeiroNome}` : ''} <span aria-hidden="true">👋</span>
                  </div>
                  <div className="pn-hero-sub">
                    {carregando ? 'Carregando os pedidos…'
                      : atrasados.length === 0 ? 'Nenhum pedido atrasado — a produção está em dia.'
                      : `${atrasados.length} ${atrasados.length === 1 ? 'pedido precisa' : 'pedidos precisam'} de atenção hoje.`}
                  </div>
                </div>
                {!carregando && (
                  atrasados.length === 0 ? (
                    <span className="pn-selo ok"><Check aria-hidden="true" /> Tudo em dia</span>
                  ) : (
                    <span className="pn-selo alerta"><AlertCircle aria-hidden="true" /> {atrasados.length} {atrasados.length === 1 ? 'atrasado' : 'atrasados'}</span>
                  )
                )}
              </div>

              <div className="pn-hero-metrica">
                <div className="pn-rotulo">Valor em carteira (pedidos ativos, sem orçamentos)</div>
                <div className="pn-valor-linha">
                  <div className="pn-valor">{carregando ? '…' : ocultarValores ? OCULTO : moeda(valorCarteira)}</div>
                  <button
                    type="button"
                    className="pn-olho"
                    onClick={alternarValores}
                    aria-pressed={ocultarValores}
                    aria-label={ocultarValores ? 'Mostrar valores' : 'Esconder valores'}
                    title={ocultarValores ? 'Mostrar valores' : 'Esconder valores'}
                  >
                    {ocultarValores ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                {!carregando && valorCarteira > 0 && (
                  <div className="pn-tendencia">
                    <TrendingUp aria-hidden="true" />
                    {ocultarValores ? `Recebido: ${OCULTO}` : `${pctRecebido}% já recebido · ${moeda(valorRecebido)}`}
                  </div>
                )}
              </div>

              <nav className="pn-hero-acoes" aria-label="Ações rápidas">
                {acoesVisiveis.map(({ rotulo, Icone, href, onClick }) => (
                  href ? (
                    <Link key={rotulo} href={href} className="pn-acao">
                      <span className="pn-circulo"><Icone aria-hidden="true" /></span>
                      {rotulo}
                    </Link>
                  ) : (
                    <button key={rotulo} type="button" className="pn-acao" onClick={onClick}>
                      <span className="pn-circulo"><Icone aria-hidden="true" /></span>
                      {rotulo}
                    </button>
                  )
                ))}
              </nav>
            </div>

            <div className="pn-cartao pn-donut-card">
              <div className="pn-cartao-cabecalho">
                <h3>Pedidos por Etapa</h3>
              </div>
              <div className="pn-donut-corpo">
                <Donut etapas={etapas} total={ativos.length} aoPassar={mostrarDica} aoSair={esconderDica} />
                <div className="pn-donut-legenda">
                  {etapas.map(e => {
                    const pct = ativos.length === 0 ? 0 : Math.round((e.valor / ativos.length) * 100)
                    return (
                      <div key={e.status} className="pn-legenda-item">
                        <span className="pn-ponto" style={{ background: e.cor }} />
                        <span className="pn-nome">{e.rotulo}</span>
                        <span className="pn-pct">{pct}%</span>
                        <span className="pn-qtd">{e.valor}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ---------- Linha 2: carga + produção geral ---------- */}
          <section className="pn-linha-meio">
            <div className="pn-cartao">
              <div className="pn-cartao-cabecalho">
                <h3>Carga de Entregas</h3>
                <span className="pn-contador">Próximos 14 dias</span>
              </div>
              <div className="pn-carga-wrap">
                <div className="pn-carga-plot">
                  <div className="pn-carga-grade" aria-hidden="true">
                    {carga.marcas.map(v => (
                      <div key={v} className="pn-linha" style={{ bottom: `${(v / carga.teto) * 100}%` }}>
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pn-carga-colunas">
                    {carga.dias.map((valor, dia) => {
                      const rotulo = dia === 0 ? 'Hoje' : `+${dia}`
                      const quando = dia === 0 ? 'Hoje' : dia === 1 ? 'Amanhã' : `Em ${dia} dias`
                      const qtdTexto = `${valor} ${valor === 1 ? 'entrega' : 'entregas'}`
                      const pico = valor > 0 && valor === carga.max
                      return (
                        <button
                          key={dia}
                          type="button"
                          className={clsx('pn-carga-col', dia === 0 && 'hoje')}
                          aria-label={`${quando}: ${qtdTexto}`}
                          onMouseEnter={e => mostrarDica(e.currentTarget, qtdTexto, quando)}
                          onMouseLeave={esconderDica}
                          onFocus={e => mostrarDica(e.currentTarget, qtdTexto, quando)}
                          onBlur={esconderDica}
                        >
                          <span className="pn-carga-barra-area">
                            <span className="pn-haste" style={{ height: `${valor > 0 ? Math.max((valor / carga.teto) * 100, 4) : 0}%` }}>
                              {pico && <span className="pn-carga-pico">{valor}</span>}
                            </span>
                          </span>
                          <span className="pn-carga-rotulo">{rotulo}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="pn-cartao pn-ring-card">
              <div className="pn-cartao-cabecalho" style={{ width: '100%' }}>
                <h3>Produção Geral</h3>
                <span className="pn-contador">{emProducao.length} em produção</span>
              </div>
              <Anel pct={progressoMedio} />
              {!carregando && (
                <div className={clsx('pn-faixa-conquista', progressoMedio < 60 && stats.entregaEm7dias > 0 && 'atencao')}>
                  <Sparkles aria-hidden="true" />
                  <span>
                    {ativos.length === 0
                      ? 'Nenhum pedido ativo agora.'
                      : `${progressoMedio >= 60 ? 'No ritmo certo' : 'Atenção ao ritmo'} — ${stats.entregaEm7dias} de ${ativos.length} pedidos entregam em 7 dias.`}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* ---------- Faixas de alerta ---------- */}
          {(urgentes.length > 0 || mostrarAprovacao) && (
            <div className="pn-alertas">
              {urgentes.length > 0 && (
                <div className="pn-faixa urgente">
                  <div className="pn-icone"><AlertTriangle aria-hidden="true" /></div>
                  <div className="pn-faixa-texto">
                    <strong>{urgentes.length === 1 ? '1 pedido urgente.' : `${urgentes.length} pedidos urgentes.`}</strong>
                    <span className="pn-faixa-resumo">
                      {ordenarPedidos(urgentes, 'entrega_asc').slice(0, 2).map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && ' · '}
                          <Link href={`/pedidos/${p.id}`}>#{p.numero}</Link> {p.cliente.nome} — {prazoTexto(p.dataEntrega).texto}
                        </span>
                      ))}
                    </span>
                  </div>
                  <button type="button" className="pn-faixa-btn" onClick={() => { setFiltro('urgentes'); irParaTabela() }}>
                    Filtrar urgentes <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              )}

              {mostrarAprovacao && (
                <div className="pn-faixa pendente">
                  <div className="pn-icone"><Clock aria-hidden="true" /></div>
                  <div className="pn-faixa-texto">
                    <strong>
                      {aguardandoAprovacao.length === 1
                        ? '1 liberação de "pagar na retirada" aguardando você.'
                        : `${aguardandoAprovacao.length} liberações de "pagar na retirada" aguardando você.`}
                    </strong>
                    <span className="pn-faixa-resumo">
                      {aguardandoAprovacao.slice(0, 2).map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && ' · '}
                          <Link href={`/pedidos/${p.id}`}>#{p.numero}</Link> {p.cliente.nome}
                          {p.excecaoPagamento?.solicitadoPor ? ` — pedido por ${p.excecaoPagamento.solicitadoPor}` : ''}
                        </span>
                      ))}
                    </span>
                  </div>
                  <Link href={`/pedidos/${aguardandoAprovacao[0].id}`} className="pn-faixa-btn">
                    Revisar <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ---------- Linha 3: tabela + categorias ---------- */}
          <section className="pn-linha-baixo">
            <div className="pn-cartao-tabela" ref={tabelaRef} aria-busy={carregando}>
              <div className="pn-tabela-cabecalho">
                <h2>Pedidos Ativos</h2>
                <span className="pn-contador">{linhas.length} de {ativos.length} pedidos ativos</span>
              </div>

              <div className="pn-filtros">
                <div className="pn-busca">
                  <Search aria-hidden="true" />
                  <input
                    ref={buscaRef}
                    type="text"
                    value={busca}
                    onChange={e => aplicarBusca(e.target.value)}
                    placeholder="Buscar por cliente, empresa ou número…"
                    aria-label="Buscar pedidos ativos"
                  />
                </div>
                <div className="pn-chips">
                  {FILTROS_DASHBOARD.map(f => (
                    <button
                      key={f.value}
                      type="button"
                      className={clsx('pn-chip', filtro === f.value && 'ativo')}
                      aria-pressed={filtro === f.value}
                      onClick={() => setFiltro(f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {mostrarSkeleton && <span role="status" className="sr-only">Carregando pedidos</span>}
              {mostrarSkeleton ? (
                <div className="pn-tabela-scroll">
                  <table className="pn-tabela">
                    <CabecalhoTabela />
                    <tbody>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          <td><div className="pn-esqueleto" style={{ width: 140 }} /></td>
                          <td><div className="pn-esqueleto" style={{ width: 110 }} /></td>
                          <td><div className="pn-esqueleto" style={{ width: 100 }} /></td>
                          <td><div className="pn-esqueleto" style={{ width: 80 }} /></td>
                          <td><div className="pn-esqueleto" style={{ width: 70 }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : carregando ? null : linhas.length === 0 ? (
                <div className="pn-estado-vazio">
                  <Search aria-hidden="true" />
                  {filtrando ? (
                    <>
                      <p>Nenhum pedido ativo casa com esse filtro.</p>
                      <button type="button" onClick={limparFiltros}>Limpar filtro</button>
                    </>
                  ) : (
                    <>
                      <p>Nenhum pedido ativo no momento.</p>
                      <Link href="/novo-pedido">Criar pedido</Link>
                    </>
                  )}
                </div>
              ) : (
                <div className="pn-tabela-scroll">
                  <table className="pn-tabela">
                    <CabecalhoTabela />
                    <tbody>
                      {linhas.map(p => {
                        const sc = STATUS_CONFIG[p.status]
                        const r = resumoProgresso(p.progresso)
                        const prazo = prazoTexto(p.dataEntrega)
                        const corBarra =
                          prazo.tom === 'atrasado' ? 'var(--pn-barra-vermelha)'
                          : prazo.tom === 'proximo' && r.pct < 70 ? 'var(--pn-barra-laranja)'
                          : 'var(--pn-barra-verde)'
                        const tipos: string[] = []
                        for (const pc of p.pecas) if (pc.tipo && tipos.indexOf(pc.tipo) === -1) tipos.push(pc.tipo)
                        const descricao = tipos.length === 0 ? '—'
                          : tipos.length === 1 ? tipos[0]
                          : `${tipos[0]} +${tipos.length - 1}`
                        return (
                          <tr key={p.id} className={clsx(p.tipo === 'urgente' && 'urgente')}>
                            <td className="pn-col-pedido">
                              <div className="pn-pedido-cliente-wrap">
                                <span className="pn-iniciais" aria-hidden="true">{iniciaisDe(p.cliente.nome)}</span>
                                <div style={{ minWidth: 0 }}>
                                  <div className="pn-pedido-num">
                                    <Link href={`/pedidos/${p.id}`}>#{p.numero}</Link>
                                  </div>
                                  <div className="pn-pedido-cliente" title={p.cliente.empresa || p.cliente.nome}>
                                    {p.cliente.nome}{p.cliente.empresa ? ` · ${p.cliente.empresa}` : ''}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="pn-peca" title={tipos.join(', ')}>{descricao}</div>
                              <div className="pn-peca-qtd">{totalPecas(p)} peças</div>
                            </td>
                            <td>
                              <div className="pn-progresso-wrap">
                                <div className="pn-progresso-trilha">
                                  {r.total > 0 && <div className="pn-progresso-preenchido" style={{ width: `${r.pct}%`, background: corBarra }} />}
                                </div>
                                <span className="pn-progresso-pct" title={r.total > 0 ? `${r.concluidos} de ${r.total} etapas` : undefined}>
                                  {r.total === 0 ? '—' : `${r.pct}%`}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className={clsx('pn-prazo', `tom-${prazo.tom}`)}>
                                <strong>{capitalizar(prazo.texto)}</strong>
                                {prazo.data && <span className="pn-data">{prazo.data}</span>}
                              </div>
                            </td>
                            <td>
                              <span className={clsx('badge', sc.bg, sc.color)} title={sc.label}>
                                {p.status === 'aguardando_pagamento' ? 'Ag. Pagamento' : sc.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!carregando && !filtrando && visiveis.length > 10 && (
                <div className="pn-rodape-tabela">
                  Mostrando os 10 pedidos mais próximos da entrega. Busque ou filtre para ver os demais.
                </div>
              )}
            </div>

            <div className="pn-cartao">
              <div className="pn-cartao-cabecalho">
                <h3>Top Categorias</h3>
                <span className="pn-contador">por peças</span>
              </div>
              {categorias.length === 0 ? (
                <p className="pn-vazio-curto">{carregando ? 'Carregando…' : 'Nenhuma peça em pedidos ativos.'}</p>
              ) : (
                <div className="pn-categorias">
                  {categorias.map(c => (
                    <div key={c.categoria} className="pn-categoria">
                      <div className="pn-categoria-topo">
                        <span className="pn-nome">{c.categoria || 'Sem categoria'}</span>
                        <span className="pn-valores">
                          {c.quantidade} pçs · {totalCategorias > 0 ? Math.round((c.quantidade / totalCategorias) * 100) : 0}%
                        </span>
                      </div>
                      <div className="pn-categoria-trilha">
                        <div className="pn-categoria-fill" style={{ width: `${Math.round((c.quantidade / maxCategoria) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ---------- Rail direita ---------- */}
        <aside className="pn-rail">
          <div className="pn-rail-cta">
            <DecoFio />
            <h3>Aumente sua Produção</h3>
            <p>Acompanhe o ritmo da fábrica, entregas e faturamento nos relatórios.</p>
            {pode('/relatorios') && (
              <Link href="/relatorios">
                Ver Relatórios <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </div>

          <div className="pn-cartao">
            <div className="pn-cartao-cabecalho">
              <h3>Próximas Entregas</h3>
              <Link className="pn-ver-tudo" href={pode('/entregas') ? '/entregas' : '/pedidos'}>Ver todas</Link>
            </div>
            {proximasEntregas.length === 0 ? (
              <p className="pn-vazio-curto">{carregando ? 'Carregando…' : 'Nenhuma entrega programada.'}</p>
            ) : (
              <div className="pn-rail-lista">
                {proximasEntregas.map(p => {
                  const prazo = prazoTexto(p.dataEntrega)
                  const cor = COR_TOM[prazo.tom]
                  const categoria = p.pecas.length > 0 ? p.pecas[0].categoria : ''
                  return (
                    <Link key={p.id} href={`/pedidos/${p.id}`} className="pn-rail-item">
                      <span className="pn-rail-icone" style={{ background: cor.bg, color: cor.fg }}><Truck aria-hidden="true" /></span>
                      <div className="pn-rail-corpo">
                        <div className="pn-rail-titulo">#{p.numero} {p.cliente.nome}</div>
                        <div className="pn-rail-sub">{totalPecas(p)} peças{categoria ? ` · ${categoria}` : ''}</div>
                      </div>
                      <div className="pn-rail-direita" style={{ color: cor.fg }}>{capitalizar(prazo.texto)}</div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="pn-cartao">
            <div className="pn-cartao-cabecalho">
              <h3>Atividade Recente</h3>
              {pode('/producao') && <Link className="pn-ver-tudo" href="/producao">Ver produção</Link>}
            </div>
            {atividades.length === 0 ? (
              <p className="pn-vazio-curto">{carregando ? 'Carregando…' : 'Nenhuma etapa atualizada ainda.'}</p>
            ) : (
              <div className="pn-rail-lista">
                {atividades.map((a: AtividadeRecente, i) => {
                  const v = ATIVIDADE_VISUAL[a.status]
                  const Icone = v.Icone
                  return (
                    <Link key={`${a.pedidoId}-${a.setorLabel}-${i}`} href={`/pedidos/${a.pedidoId}`} className="pn-rail-item">
                      <span className="pn-rail-icone" style={{ background: v.bg, color: v.fg }}><Icone aria-hidden="true" /></span>
                      <div className="pn-rail-corpo">
                        <div className="pn-rail-titulo">#{a.pedidoNumero} · {a.setorLabel}</div>
                        <div className="pn-rail-sub">{v.texto} por {a.atualizadoPor}</div>
                      </div>
                      <div className="pn-rail-direita" style={{ color: 'var(--texto-fraco)', fontWeight: 600 }}>{tempoCurto(a.atualizadoEm)}</div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="pn-quote">
            <DecoFio />
            <p>&ldquo;Cada ponto é um compromisso com quem confia na gente.&rdquo;</p>
            <span>Nice Confecções</span>
          </div>
        </aside>
      </div>

      {dica && (
        <div className="pn-tooltip" style={{ left: dica.x, top: dica.y }} role="status">
          <strong>{dica.valor}</strong> — {dica.rotulo}
        </div>
      )}
    </div>
  )
}

function CabecalhoTabela() {
  return (
    <thead>
      <tr>
        <th>Pedido</th>
        <th>Peças</th>
        <th>Produção</th>
        <th>Entrega</th>
        <th>Status</th>
      </tr>
    </thead>
  )
}

type EtapaDonut = { status: string; rotulo: string; valor: number; cor: string }

/** Donut do funil: rampa de uma hue só (ordinal), 5px de respiro entre fatias. */
function Donut({ etapas, total, aoPassar, aoSair }: {
  etapas: EtapaDonut[]
  total: number
  aoPassar: (el: Element, valor: string, rotulo: string) => void
  aoSair: () => void
}) {
  const r = 62
  const cx = 80
  const cy = 80
  const largura = 18
  const comValor = etapas.filter(e => e.valor > 0)
  const gap = comValor.length > 1 ? 5 : 0
  const circ = 2 * Math.PI * r
  const disponivel = circ - gap * comValor.length
  let acumulado = 0

  return (
    <svg viewBox="0 0 160 160" width={128} height={128} role="img" aria-label={`${total} pedidos ativos por etapa`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--superficie-3)" strokeWidth={largura} />
      {total > 0 && comValor.map(e => {
        const seg = disponivel * (e.valor / total)
        const offset = -acumulado
        acumulado += seg + gap
        const texto = `${e.valor} ${e.valor === 1 ? 'pedido' : 'pedidos'}`
        return (
          <circle
            key={e.status}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={e.cor}
            strokeWidth={largura}
            strokeLinecap={gap > 0 ? 'round' : 'butt'}
            strokeDasharray={`${seg} ${circ - seg}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            onMouseEnter={ev => aoPassar(ev.currentTarget, texto, e.rotulo)}
            onMouseLeave={aoSair}
          />
        )
      })}
      <text x={cx} y={cy - 3} textAnchor="middle" fill="var(--titulo)" style={{ fontSize: 22, fontWeight: 800 }}>{total}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--texto-fraco)" style={{ fontSize: 8.6 }}>pedidos ativos</text>
    </svg>
  )
}

/** Anel de progresso médio dos pedidos em produção. */
function Anel({ pct }: { pct: number }) {
  const r = 58
  const cx = 70
  const cy = 70
  const largura = 14
  const circ = 2 * Math.PI * r
  const seg = circ * (pct / 100)
  return (
    <div className="pn-ring">
      <svg viewBox="0 0 140 140" width={140} height={140} aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--pn-trilha)" strokeWidth={largura} />
        {pct > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--marca)"
            strokeWidth={largura}
            strokeLinecap="round"
            strokeDasharray={`${seg} ${circ}`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )}
      </svg>
      <div className="pn-ring-valor">
        <span className="pn-num">{pct}%</span>
        <span className="pn-rot">progresso médio</span>
      </div>
    </div>
  )
}
