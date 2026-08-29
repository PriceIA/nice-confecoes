'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPedidos } from '@/lib/store'
import { carregarEtapas } from '@/lib/etapas'
import {
  ORDENS_PRODUCAO, OrdemPedidos, STATUS_CONFIG,
  ordenarPedidos, resumoProgresso,
} from '@/lib/helpers'
import { useMembro } from '@/components/AuthProvider'
import { EntradaProgresso, EtapaProducao, Pedido, Progresso } from '@/types'
import { ArrowRight, Search } from 'lucide-react'
import ModalProntoParaEnvio from '@/components/producao/ModalProntoParaEnvio'
import FluxoEtapas from '@/components/producao/FluxoEtapas'
import clsx from 'clsx'


/** Setores (fora acabamento) ainda pendentes/em andamento — mesmo cálculo usado pra decidir se o modal "Pronto para envio?" tem o que perguntar. */
function setoresPendentesEnvio(progresso: Progresso): string[] {
  return Object.keys(progresso ?? {})
    .filter(s => s !== 'acabamento' && (progresso[s]?.status === 'pendente' || progresso[s]?.status === 'em_andamento'))
}


// ---------------------------------------------------------------------------
// Filtros da tela (Fase D1)
//
// Tudo no cliente, sobre a lista já carregada: ordenar no banco seria outra
// query, outra passada pelo RLS e outro caminho para divergir de /pedidos.
// A ordenação e o cálculo de progresso vêm de helpers.ts — a mesma conta que
// desenha a barra, para o filtro "quase prontos" nunca discordar dela.
// ---------------------------------------------------------------------------

const PREFS_CHAVE = 'nice-filtros-producao'

type Recorte = 'todos' | 'nao_iniciados' | 'em_andamento' | 'quase_prontos' | 'prontos'

const RECORTES: { value: Recorte; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'nao_iniciados', label: 'Não iniciados' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'quase_prontos', label: 'Quase prontos' },
  { value: 'prontos', label: 'Prontos' },
]

/**
 * "Não iniciado" é medido pelo que a produção fez, não pelo pedido inteiro:
 * `atendimento` nasce concluído na criação do pedido (ninguém clicou nele), e
 * contá-lo faria todo pedido novo aparecer como já iniciado.
 */
function casaRecorte(pedido: Pedido, recorte: Recorte): boolean {
  if (recorte === 'todos') return true

  const { pct } = resumoProgresso(pedido.progresso)
  const tocados = (Object.entries((pedido.progresso ?? {}) as Record<string, EntradaProgresso>))
    .filter(([setor, e]) => setor !== 'atendimento' && e.status !== 'pendente' && e.status !== 'nao_se_aplica')

  switch (recorte) {
    case 'nao_iniciados': return tocados.length === 0
    case 'prontos': return pct === 100
    case 'quase_prontos': return pct >= 75 && pct < 100
    case 'em_andamento': return tocados.length > 0 && pct < 100
  }
}

export default function ProducaoPage() {
  const { membro, permissoes } = useMembro()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [modalPedidoId, setModalPedidoId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [recorte, setRecorte] = useState<Recorte>('todos')
  const [ordem, setOrdem] = useState<OrdemPedidos>('entrega_asc')
  const [etapas, setEtapas] = useState<EtapaProducao[]>([])
  const [catalogoSemente, setCatalogoSemente] = useState(true)

  const carregar = async () => {
    // Catálogo e pedidos em paralelo: sem o catálogo a tela não sabe o nome
    // das etapas, então não adianta desenhar um antes do outro.
    const [data, catalogo] = await Promise.all([
      getPedidos(),
      carregarEtapas(),
    ])
    setPedidos(data.filter(p => ['aprovado', 'em_producao'].includes(p.status)))
    setEtapas(catalogo.etapas)
    setCatalogoSemente(catalogo.semente)
  }

  useEffect(() => { carregar() }, [])

  // A busca NÃO é guardada de propósito: uma busca salva esconderia pedidos
  // logo ao abrir a tela, e a pessoa acharia que sumiram.
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(PREFS_CHAVE)
      if (!bruto) return
      const prefs = JSON.parse(bruto) as { ordem?: string; recorte?: string }
      if (prefs.ordem && ORDENS_PRODUCAO.some(o => o.value === prefs.ordem)) setOrdem(prefs.ordem as OrdemPedidos)
      if (prefs.recorte && RECORTES.some(r => r.value === prefs.recorte)) setRecorte(prefs.recorte as Recorte)
    } catch {
      // localStorage corrompido ou indisponível: segue com os padrões.
    }
  }, [])

  function guardarPrefs(novos: { ordem?: OrdemPedidos; recorte?: Recorte }) {
    const ordemNova = novos.ordem ?? ordem
    const recorteNovo = novos.recorte ?? recorte
    if (novos.ordem) setOrdem(novos.ordem)
    if (novos.recorte) setRecorte(novos.recorte)
    try {
      localStorage.setItem(PREFS_CHAVE, JSON.stringify({ ordem: ordemNova, recorte: recorteNovo }))
    } catch {
      // Sem localStorage a escolha vale só nesta sessão — não é motivo de erro na tela.
    }
  }

  const visiveis = ordenarPedidos(
    pedidos.filter(p => {
      const q = busca.trim().toLowerCase()
      const casaBusca = !q
        || p.numero.toLowerCase().includes(q)
        || p.cliente.nome.toLowerCase().includes(q)
        || (p.cliente.empresa ?? '').toLowerCase().includes(q)
      return casaBusca && casaRecorte(p, recorte)
    }),
    ordem,
  )

  const filtrando = visiveis.length !== pedidos.length

  const modalPedido = pedidos.find(p => p.id === modalPedidoId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Produção</h1>
        <p className="text-sm text-suave mt-0.5">
          {filtrando
            ? `mostrando ${visiveis.length} de ${pedidos.length} pedido(s) em andamento`
            : `${pedidos.length} pedido(s) em andamento`}
        </p>
      </div>

      {/* Filtros — print:hidden como todo controle de navegação */}
      {pedidos.length > 0 && (
        <div className="card py-4 print:hidden">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fraco" />
              <input
                className="input pl-9"
                placeholder="Buscar por número, cliente ou empresa..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {RECORTES.map(r => (
                <button key={r.value} type="button" onClick={() => guardarPrefs({ recorte: r.value })}
                  className={clsx('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                    recorte === r.value
                      ? 'bg-nice-500 text-white'
                      : 'bg-superficie-3 text-suave hover:bg-superficie-3')}>
                  {r.label}
                </button>
              ))}
            </div>
            <select className="input lg:w-60" value={ordem}
              onChange={e => guardarPrefs({ ordem: e.target.value as OrdemPedidos })}>
              {ORDENS_PRODUCAO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {pedidos.length === 0 ? (
        <div className="card py-20 text-center text-fraco">
          <p className="text-sm">Nenhum pedido em produção no momento.</p>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="card py-20 text-center text-fraco space-y-3">
          <p className="text-sm">Nenhum pedido corresponde ao filtro.</p>
          <button type="button" className="btn-secondary mx-auto"
            onClick={() => { setBusca(''); guardarPrefs({ recorte: 'todos' }) }}>
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {visiveis.map(pedido => {
            const sc = STATUS_CONFIG[pedido.status]
            // Mesma conta que o filtro "quase prontos" usa (helpers.ts):
            // setor "não se aplica" sai do numerador E do denominador.
            const { total: aplicaveis, concluidos, pct: progPct } = resumoProgresso(pedido.progresso)
            // "Segunda porta": quem pulou o modal ao concluir o acabamento
            // precisa de um jeito de reabri-lo — senão sobra ciclar o setor
            // três vezes só pra ver a pergunta de novo.
            const podeLiberarEnvio = pedido.progresso.acabamento?.status === 'concluido' &&
              setoresPendentesEnvio(pedido.progresso).length > 0
            return (
              <div key={pedido.id} className="card space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-marca-texto">#{pedido.numero}</span>
                        <span className="font-medium text-conteudo text-sm">{pedido.cliente.nome}</span>
                        {pedido.cliente.empresa && <span className="text-fraco text-xs">— {pedido.cliente.empresa}</span>}
                        {pedido.tipo === 'urgente' && <span className="badge bg-red-100 text-red-600 text-xs">urgente</span>}
                      </div>
                    </div>
                  </div>
                  <Link href={`/pedidos/${pedido.id}`} className="text-marca-texto hover:text-marca-texto text-xs font-medium flex items-center gap-1">
                    Detalhe <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* Barra de progresso */}
                <div>
                  <div className="flex justify-between text-xs text-fraco mb-1.5">
                    <span>{concluidos} de {aplicaveis} setores concluídos</span>
                    <span className="font-medium text-marca-texto">{progPct}%</span>
                  </div>
                  <div className="w-full bg-superficie-3 rounded-full h-2">
                    <div className="bg-nice-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progPct}%` }} />
                  </div>
                </div>

                {/* Etapas do pedido — ordem, status, lixeira e adicionar */}
                <FluxoEtapas
                  pedidoId={pedido.id}
                  progresso={pedido.progresso}
                  etapas={etapas}
                  catalogoSemente={catalogoSemente}
                  podeEditarStatus={permissoes.editarProducao}
                  podeEditarFluxo={permissoes.editarFluxoProducao}
                  nomeMembro={membro?.nome}
                  onGravado={carregar}
                  onAcabamentoConcluido={() => setModalPedidoId(pedido.id)}
                />

                {podeLiberarEnvio && (
                  <button type="button" onClick={() => setModalPedidoId(pedido.id)}
                    className="text-marca-texto text-xs font-medium hover:underline">
                    Pronto para envio?
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalPedido && (
        <ModalProntoParaEnvio
          pedido={modalPedido}
          etapas={etapas}
          onFechar={() => setModalPedidoId(null)}
          onSalvo={carregar}
          nomeMembro={membro?.nome}
        />
      )}
    </div>
  )
}
