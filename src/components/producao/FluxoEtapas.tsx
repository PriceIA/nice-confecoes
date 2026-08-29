'use client'
import { useMemo, useState } from 'react'
import {
  DndContext, DragEndEvent, PointerSensor, KeyboardSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckCircle2, Circle, GripVertical, Loader2, MinusCircle, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/kanban/Modal'
import { atualizarPedido } from '@/lib/store'
import { aplicarOrdem, criarEtapa, etapasDisponiveis, etapasDoPedido } from '@/lib/etapas'
import { autorSetorTexto } from '@/lib/helpers'
import { classificarErro } from '@/lib/erros'
import type { EntradaProgresso, EtapaProducao, Progresso, StatusSetor } from '@/types'

// Fluxo de etapas de um pedido (Fase D3b).
//
// COMPARTILHADO por /producao e por /pedidos/[id] de propósito. Duas cópias
// desta tela divergiriam no dia em que alguém corrigisse só uma — é a mesma
// razão pela qual `pedidoConcluido` e `resumoProgresso` moram em lib/.
//
// Três regras que vêm de decisões anteriores e não podem ser afrouxadas aqui:
//
// 1. O CICLO DE CLIQUE não mudou: pendente → em_andamento → concluido →
//    pendente. Quem está no chão de fábrica com o celular na mão não pode cair
//    em `nao_se_aplica` por um toque a mais (Fase C0).
// 2. MARCAR "NÃO SE APLICA" é de todos os perfis com editarProducao — quem
//    está trabalhando no pedido é quem sabe se ele passa por ali. REORDENAR,
//    RENOMEAR e CRIAR etapa é só da gestão (editarFluxoProducao): quem define
//    a sequência de produção é quem gerencia a produção.
// 3. A TELA NUNCA MOSTRA O QUE O BANCO NÃO TEM. O arrasto é otimista, mas se a
//    gravação falhar a ordem VOLTA e uma faixa diz que não salvou. Regra 10 do
//    CLAUDE.md — este projeto já teve exatamente esse bug na tela de preços.

type Props = {
  pedidoId: string
  progresso: Progresso
  /** Catálogo vindo de `carregarEtapas()`. */
  etapas: EtapaProducao[]
  /** true = catálogo veio da semente (migration 014 não rodou): não oferece criar etapa. */
  catalogoSemente: boolean
  /** `permissoes.editarProducao` — clicar no status e marcar "não se aplica". */
  podeEditarStatus: boolean
  /** `permissoes.editarFluxoProducao` — arrastar, criar e remover etapa do pedido. */
  podeEditarFluxo: boolean
  nomeMembro?: string
  /** Chamado depois de cada gravação bem-sucedida, para o pai recarregar do banco. */
  onGravado: () => void | Promise<void>
  /** Chamado ao concluir `acabamento` restando etapa pendente (modal da Fase C0). */
  onAcabamentoConcluido?: () => void
  /** 'grid' = 4 colunas (/producao). 'lista' = uma coluna (/pedidos/[id]). */
  variante?: 'grid' | 'lista'
}

const CICLO: StatusSetor[] = ['pendente', 'em_andamento', 'concluido']

function iconeStatus(s: StatusSetor) {
  if (s === 'concluido') return <CheckCircle2 className="w-4 h-4 text-nice-500" />
  if (s === 'em_andamento') return <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
  if (s === 'nao_se_aplica') return <MinusCircle className="w-4 h-4 text-fraco" />
  return <Circle className="w-4 h-4 text-fraco" />
}

function classesCard(status: StatusSetor) {
  if (status === 'concluido') return 'bg-marca-suave border-marca-borda text-marca-texto'
  if (status === 'em_andamento') return 'bg-orange-50 border-orange-200 text-orange-600'
  if (status === 'nao_se_aplica') return 'bg-superficie-3 border-borda text-fraco'
  return 'bg-superficie-2 border-borda text-fraco'
}

// ---------------------------------------------------------------------------
// Um card
// ---------------------------------------------------------------------------

type CardProps = {
  chave: string
  rotulo: string
  entrada: EntradaProgresso
  arrastavel: boolean
  podeEditarStatus: boolean
  podeMarcarNaoSeAplica: boolean
  onCiclar: () => void
  onNaoSeAplica: () => void
}

function CardEtapa({
  chave, rotulo, entrada, arrastavel, podeEditarStatus, podeMarcarNaoSeAplica,
  onCiclar, onNaoSeAplica,
}: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: chave, disabled: !arrastavel })

  const status = entrada.status
  const autor = autorSetorTexto(entrada)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'relative flex flex-col gap-1 px-3 py-2 rounded-xl border text-xs font-medium transition-colors',
        classesCard(status),
        isDragging && 'opacity-50 z-10',
      )}
    >
      <div className="flex items-start gap-1.5">
        {arrastavel && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            title="Arrastar para mudar a ordem"
            aria-label={`Mover ${rotulo}`}
            className="cursor-grab active:cursor-grabbing text-fraco hover:text-conteudo touch-none -ml-1 mt-px print:hidden"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={podeEditarStatus ? onCiclar : undefined}
          disabled={!podeEditarStatus}
          className="flex-1 text-left min-w-0 disabled:cursor-default"
        >
          <span className="flex items-center gap-2">
            {iconeStatus(status)}
            <span className="truncate">{rotulo}</span>
          </span>
        </button>

        {podeMarcarNaoSeAplica && status !== 'nao_se_aplica' && (
          <button
            type="button"
            onClick={onNaoSeAplica}
            title="Marcar como não aplicável a este pedido"
            aria-label={`Marcar ${rotulo} como não aplicável`}
            className="text-fraco hover:text-red-600 transition-colors shrink-0 print:hidden"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {status === 'nao_se_aplica' && (
        <span className="text-[10px] font-normal opacity-70 pl-1">
          não se aplica — clique para desfazer
        </span>
      )}
      {autor && <span className="text-[10px] font-normal opacity-70 truncate pl-1">{autor}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// O fluxo
// ---------------------------------------------------------------------------

export default function FluxoEtapas({
  pedidoId, progresso, etapas, catalogoSemente,
  podeEditarStatus, podeEditarFluxo, nomeMembro,
  onGravado, onAcabamentoConcluido, variante = 'grid',
}: Props) {
  // Cópia local só para o arrasto ser otimista. Fora do arrasto, a verdade é
  // sempre a prop — o pai recarrega do banco depois de cada gravação.
  const [ordemOtimista, setOrdemOtimista] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [modalAdicionar, setModalAdicionar] = useState(false)
  const [novaEtapa, setNovaEtapa] = useState('')
  const [salvando, setSalvando] = useState(false)

  const sensors = useSensors(
    // Um toque não pode virar arrasto: sem a distância mínima, tocar no card
    // no celular ficaria ambíguo entre ciclar o status e mover a etapa.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const lista = useMemo(() => {
    const base = etapasDoPedido(progresso, etapas)
    if (!ordemOtimista) return base
    const porChave = new Map(base.map(e => [e.chave, e]))
    const reordenada = ordemOtimista.map(c => porChave.get(c)).filter(Boolean) as typeof base
    // Etapa que apareceu no banco entre o arrasto e o recarregamento não pode sumir.
    const faltando = base.filter(e => !ordemOtimista.includes(e.chave))
    return [...reordenada, ...faltando]
  }, [progresso, etapas, ordemOtimista])

  const disponiveis = useMemo(() => etapasDisponiveis(progresso, etapas), [progresso, etapas])

  function falha(err: unknown, acao: string, revertido: boolean) {
    const f = classificarErro(err)
    const cod = f.code ? ` (${f.code})` : ''
    const fim = revertido
      ? 'A alteração NÃO foi salva e a tela voltou ao que está no banco.'
      : 'Nada foi salvo.'
    const motivo =
      f.tipo === 'offline' ? 'Sem conexão com a internet' :
      f.tipo === 'rede' ? 'Servidor inacessível' :
      f.tipo === 'permissao' ? 'Seu perfil não tem permissão' :
      `Falha${cod}: ${f.message || 'erro desconhecido'}`
    setErro(`${motivo}, não deu para ${acao}. ${fim}`)
  }

  async function gravar(novo: Progresso, acao: string, revertendo?: () => void) {
    setErro(null)
    try {
      await atualizarPedido(pedidoId, { progresso: novo })
      await onGravado()
      return true
    } catch (err) {
      revertendo?.()
      falha(err, acao, !!revertendo)
      return false
    }
  }

  async function ciclar(chave: string) {
    const entrada = progresso[chave]
    if (!entrada) return

    // "não se aplica" sai pelo mesmo clique que entra em qualquer outro
    // estado: volta para pendente. É o desfazer, e ele precisa existir —
    // alguém vai marcar errado.
    const proximo: StatusSetor = entrada.status === 'nao_se_aplica'
      ? 'pendente'
      : CICLO[(CICLO.indexOf(entrada.status) + 1) % CICLO.length]

    const novo: Progresso = {
      ...progresso,
      [chave]: {
        ...entrada,
        status: proximo,
        atualizadoPor: nomeMembro,
        atualizadoEm: new Date().toISOString(),
      },
    }

    const ok = await gravar(novo, 'mudar o status desta etapa')

    // Modal "Pronto para envio?" (Fase C0): só DEPOIS de a gravação voltar OK.
    // O modal nunca segura o progresso.
    if (ok && chave === 'acabamento' && proximo === 'concluido') {
      const sobra = Object.entries(novo).some(([c, e]) =>
        c !== 'acabamento' && (e.status === 'pendente' || e.status === 'em_andamento'))
      if (sobra) onAcabamentoConcluido?.()
    }
  }

  async function marcarNaoSeAplica(chave: string) {
    const entrada = progresso[chave]
    if (!entrada) return
    const novo: Progresso = {
      ...progresso,
      [chave]: {
        ...entrada,
        status: 'nao_se_aplica',
        atualizadoPor: nomeMembro,
        atualizadoEm: new Date().toISOString(),
      },
    }
    await gravar(novo, 'marcar esta etapa como não aplicável')
  }

  async function aoSoltar(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return

    const chaves = lista.map(x => x.chave)
    const de = chaves.indexOf(String(active.id))
    const para = chaves.indexOf(String(over.id))
    if (de < 0 || para < 0) return

    const nova = [...chaves]
    nova.splice(para, 0, ...nova.splice(de, 1))

    setOrdemOtimista(nova)
    const ok = await gravar(
      aplicarOrdem(progresso, nova),
      'mudar a ordem das etapas',
      () => setOrdemOtimista(null),
    )
    // Deu certo: o pai já recarregou do banco, e a ordem gravada é a mesma —
    // largar o otimismo evita a lista ficar presa a um estado antigo.
    if (ok) setOrdemOtimista(null)
  }

  async function adicionar(chave: string) {
    if (progresso[chave]) return
    const novo: Progresso = {
      ...progresso,
      [chave]: { status: 'pendente', ordem: lista.length + 1 },
    }
    const ok = await gravar(novo, 'adicionar a etapa a este pedido')
    if (ok) setModalAdicionar(false)
  }

  async function criarEAdicionar() {
    const rotulo = novaEtapa.trim()
    if (!rotulo) return
    setSalvando(true)
    setErro(null)
    try {
      // Entra no fim do catálogo, para não empurrar a ordem padrão das outras.
      const maiorOrdem = etapas.reduce((a, e) => Math.max(a, e.ordem), 0)
      const etapa = await criarEtapa(rotulo, maiorOrdem + 1)
      setNovaEtapa('')
      await adicionar(etapa.chave)
    } catch (err) {
      falha(err, 'criar a etapa', false)
    } finally {
      setSalvando(false)
    }
  }

  const chaves = lista.map(x => x.chave)

  return (
    <div className="space-y-2">
      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 print:hidden">
          <p className="text-xs text-red-700 flex-1">{erro}</p>
          <button type="button" onClick={() => setErro(null)}
            className="text-red-600 text-xs font-semibold hover:underline">fechar</button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
        <SortableContext items={chaves} strategy={rectSortingStrategy}>
          <div className={clsx(
            'gap-2',
            variante === 'grid' ? 'grid grid-cols-2 sm:grid-cols-4' : 'grid grid-cols-1 sm:grid-cols-2',
          )}>
            {lista.map(item => (
              <CardEtapa
                key={item.chave}
                chave={item.chave}
                rotulo={item.rotulo}
                entrada={item.entrada}
                arrastavel={podeEditarFluxo}
                podeEditarStatus={podeEditarStatus}
                podeMarcarNaoSeAplica={podeEditarStatus}
                onCiclar={() => ciclar(item.chave)}
                onNaoSeAplica={() => marcarNaoSeAplica(item.chave)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {podeEditarFluxo && (
        <div className="print:hidden">
          <button type="button" onClick={() => { setModalAdicionar(true); setErro(null) }}
            className="text-marca-texto text-xs font-medium hover:underline inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> Adicionar etapa
          </button>
        </div>
      )}

      {modalAdicionar && (
        <Modal aberto titulo="Adicionar etapa a este pedido" onFechar={() => setModalAdicionar(false)}
          rodape={
            <button onClick={() => setModalAdicionar(false)} className="btn-secondary flex-1 justify-center">
              Fechar
            </button>
          }>
          <div className="space-y-4">
            {disponiveis.length > 0 ? (
              <div>
                <p className="label">Do catálogo</p>
                <div className="space-y-1.5">
                  {disponiveis.map(e => (
                    <button key={e.chave} type="button" onClick={() => adicionar(e.chave)}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-borda hover:bg-superficie-2 text-sm text-conteudo">
                      {e.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-suave">
                Este pedido já tem todas as etapas do catálogo.
              </p>
            )}

            {catalogoSemente ? (
              <p className="text-xs text-fraco border-t border-borda pt-3">
                Para criar uma etapa nova, a migration <code>014_etapas_producao.sql</code>
                {' '}precisa ter sido executada no Supabase. Enquanto isso, o sistema está
                usando a lista padrão de 8 etapas.
              </p>
            ) : (
              <div className="border-t border-borda pt-3">
                <label className="label">Criar uma etapa nova</label>
                <p className="text-xs text-fraco mb-2">
                  Ela entra no catálogo e fica disponível para os próximos pedidos.
                </p>
                <div className="flex gap-2">
                  <input className="input flex-1" placeholder="Ex: Bordado, Lavanderia..."
                    value={novaEtapa} maxLength={40}
                    onChange={ev => setNovaEtapa(ev.target.value)}
                    onKeyDown={ev => { if (ev.key === 'Enter') criarEAdicionar() }} />
                  <button type="button" className="btn-primary" disabled={!novaEtapa.trim() || salvando}
                    onClick={criarEAdicionar}>
                    {salvando ? '...' : 'Criar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
