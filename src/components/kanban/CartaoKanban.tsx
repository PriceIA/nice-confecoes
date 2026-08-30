'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import { Check, ExternalLink, Lock } from 'lucide-react'
import clsx from 'clsx'
import type { Cartao } from '@/types'
import { PERFIL_LABEL_CURTO } from '@/lib/permissoes'
import { badgePrazo } from '@/lib/kanban-ui'

// O cartão vem em duas peças de propósito:
//
//   CartaoVisual    — só aparência, sem nenhum hook de drag.
//   CartaoSortable  — o mesmo visual embrulhado em useSortable.
//
// É isso que permite o modo leitura ser leitura de verdade: para quem não pode
// editar, o quadro monta CartaoVisual e os hooks de arrasto nem chegam a existir
// na árvore — em vez de existirem "desabilitados".

type VisualProps = {
  cartao: Cartao
  numeroPedido?: string
  podeEditar: boolean
  onAbrir?: () => void
  onAlternarConcluido?: () => void
  /** Ligado enquanto o cartão está sendo carregado pelo DragOverlay. */
  sombra?: boolean
}

export function CartaoVisual({
  cartao, numeroPedido, podeEditar, onAbrir, onAlternarConcluido, sombra,
}: VisualProps) {
  const prazo = badgePrazo(cartao.prazo, cartao.concluido)

  return (
    <div
      onClick={onAbrir}
      className={clsx(
        'bg-superficie rounded-xl border border-borda p-3 space-y-2 text-left w-full',
        'hover:border-nice-300 transition-colors',
        onAbrir && 'cursor-pointer',
        sombra && 'shadow-lg rotate-2',
        cartao.concluido && 'bg-superficie-2'
      )}
    >
      <div className="flex items-start gap-2">
        {podeEditar && onAlternarConcluido && (
          <button
            onClick={e => { e.stopPropagation(); onAlternarConcluido() }}
            title={cartao.concluido ? 'Reabrir cartão' : 'Marcar como concluído'}
            aria-label={cartao.concluido ? 'Reabrir cartão' : 'Marcar como concluído'}
            className={clsx(
              'w-4 h-4 mt-0.5 rounded-full border shrink-0 flex items-center justify-center transition-colors',
              cartao.concluido
                ? 'bg-nice-500 border-nice-500 text-white'
                : 'border-borda-forte hover:border-nice-400'
            )}
          >
            {cartao.concluido && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
        )}
        <p className={clsx(
          'text-sm font-medium flex-1 min-w-0 break-words',
          cartao.concluido ? 'text-fraco line-through' : 'text-conteudo'
        )}>
          {cartao.titulo}
        </p>
      </div>

      {cartao.descricao && (
        <p className="text-xs text-suave line-clamp-2 whitespace-pre-line">{cartao.descricao}</p>
      )}

      {(prazo || cartao.privado || cartao.perfisVisiveis || cartao.membrosVisiveis || cartao.pedidoId) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {prazo && (
            <span className={clsx('badge', prazo.classes)} title={prazo.titulo}>{prazo.texto}</span>
          )}

          {/* Precisa dar pra notar de relance, sem abrir o cartão (Fase D2.2). */}
          {cartao.privado && (
            <span className="badge bg-red-100 text-red-700 gap-1" title="Privado — só quem criou vê este cartão">
              <Lock className="w-3 h-3" /> Privado
            </span>
          )}

          {/* perfisVisiveis nulo = público, e público não merece etiqueta. */}
          {cartao.perfisVisiveis && (
            <span
              className="badge bg-superficie-3 text-suave gap-1"
              title={`Visível só para: ${cartao.perfisVisiveis.map(p => PERFIL_LABEL_CURTO[p] ?? p).join(', ')}`}
            >
              <Lock className="w-3 h-3" />
              {cartao.perfisVisiveis.map(p => PERFIL_LABEL_CURTO[p] ?? p).join(', ')}
            </span>
          )}

          {/* Mesma lógica do perfisVisiveis, mas por pessoa (Fase D2.2). Sem
              nome aqui de propósito: resolver nome por id exigiria buscar a
              equipe inteira só pra desenhar o board — o painel do cartão já
              mostra quem, ao abrir. */}
          {cartao.membrosVisiveis && (
            <span
              className="badge bg-superficie-3 text-suave gap-1"
              title={`Visível só para ${cartao.membrosVisiveis.length} pessoa(s) específica(s)`}
            >
              <Lock className="w-3 h-3" />
              {cartao.membrosVisiveis.length} pessoa{cartao.membrosVisiveis.length > 1 ? 's' : ''}
            </span>
          )}

          {cartao.pedidoId && (
            <Link
              href={`/pedidos/${cartao.pedidoId}`}
              onClick={e => e.stopPropagation()}
              className="badge bg-marca-suave text-marca-texto gap-1 hover:bg-marca-borda"
              title="Abrir o pedido"
            >
              <ExternalLink className="w-3 h-3" />
              {numeroPedido ? `#${numeroPedido}` : 'Pedido'}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export default function CartaoSortable(props: VisualProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.cartao.id,
    data: { tipo: 'cartao', listaId: props.cartao.listaId },
  })

  const style = { transform: CSS.Translate.toString(transform), transition }

  // Enquanto arrasta, o lugar de origem vira um vazio tracejado — o cartão de
  // verdade está no DragOverlay, seguindo o dedo/cursor.
  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style}
        className="rounded-xl border-2 border-dashed border-nice-300 bg-marca-suave h-[72px]" />
    )
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-manipulation">
      <CartaoVisual {...props} />
    </div>
  )
}
