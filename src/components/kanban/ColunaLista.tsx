'use client'
import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, Palette, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { CorLista, Lista } from '@/types'
import { CORES_LISTA, CORES_LISTA_KEYS, corDaLista } from '@/lib/kanban-ui'

// Mesma divisão do cartão: ColunaVisual não conhece drag nenhum, ColunaSortable
// embrulha. Ver o comentário em CartaoKanban.tsx.

type VisualProps = {
  lista: Lista
  quantidade: number
  podeEditar: boolean
  /** Os cartões, já montados por quem chama (com ou sem SortableContext). */
  children: React.ReactNode
  onAdicionarCartao?: () => void
  onRenomear?: (titulo: string) => void
  onMudarCor?: (cor: CorLista) => void
  onExcluir?: () => void
  /** Props do punho de arrasto. Ausente = coluna não arrasta. */
  punho?: React.HTMLAttributes<HTMLButtonElement> & { ref?: (n: HTMLElement | null) => void }
  arrastando?: boolean
}

export function ColunaVisual({
  lista, quantidade, podeEditar, children,
  onAdicionarCartao, onRenomear, onMudarCor, onExcluir, punho, arrastando,
}: VisualProps) {
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [rascunho, setRascunho] = useState(lista.titulo)
  const [paletaAberta, setPaletaAberta] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cor = corDaLista(lista.cor)

  useEffect(() => { setRascunho(lista.titulo) }, [lista.titulo])
  useEffect(() => { if (editandoTitulo) inputRef.current?.select() }, [editandoTitulo])

  function confirmarTitulo() {
    setEditandoTitulo(false)
    const novo = rascunho.trim()
    if (!novo || novo === lista.titulo) {
      setRascunho(lista.titulo)
      return
    }
    onRenomear?.(novo)
  }

  return (
    <div className={clsx(
      // Mobile: 80vw deixa ~20% da próxima coluna à mostra — a pista de que há
      // mais à direita. snap-start faz o deslize assentar numa coluna por vez.
      'snap-start shrink-0 w-[80vw] max-w-[19rem] sm:w-72',
      'bg-superficie-2 rounded-2xl border border-borda flex flex-col max-h-full overflow-hidden',
      arrastando && 'opacity-40'
    )}>
      <div className={clsx('h-1 shrink-0', cor.barra)} />

      <div className="px-3 py-2.5 flex items-center gap-1.5 shrink-0">
        {punho && (
          <button
            {...punho}
            aria-label={`Reordenar a lista ${lista.titulo}`}
            className="p-1 -ml-1 text-fraco hover:text-suave cursor-grab active:cursor-grabbing touch-none shrink-0"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <span className={clsx('w-2 h-2 rounded-full shrink-0', cor.ponto)} />

        {editandoTitulo ? (
          <input
            ref={inputRef}
            className="input py-1 px-2 text-sm font-semibold flex-1 min-w-0"
            value={rascunho}
            onChange={e => setRascunho(e.target.value)}
            onBlur={confirmarTitulo}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmarTitulo()
              if (e.key === 'Escape') { setRascunho(lista.titulo); setEditandoTitulo(false) }
            }}
          />
        ) : (
          <button
            onClick={() => podeEditar && onRenomear && setEditandoTitulo(true)}
            disabled={!podeEditar || !onRenomear}
            title={podeEditar ? 'Clique para renomear' : undefined}
            className={clsx(
              'text-sm font-semibold text-titulo flex-1 min-w-0 text-left truncate rounded px-1 -mx-1 py-0.5',
              podeEditar && onRenomear && 'hover:bg-superficie-3 cursor-text'
            )}
          >
            {lista.titulo}
          </button>
        )}

        <span className="text-xs font-medium text-fraco tabular-nums shrink-0">{quantidade}</span>

        {podeEditar && onMudarCor && (
          <div className="relative shrink-0">
            <button onClick={() => setPaletaAberta(v => !v)} aria-label="Cor da lista"
              className="p-1 text-fraco hover:text-suave">
              <Palette className="w-4 h-4" />
            </button>
            {paletaAberta && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPaletaAberta(false)} />
                <div className="absolute right-0 top-7 z-20 bg-superficie rounded-xl shadow-xl border border-borda p-2 grid grid-cols-4 gap-1.5">
                  {CORES_LISTA_KEYS.map(k => (
                    <button key={k} title={CORES_LISTA[k].label}
                      onClick={() => { onMudarCor(k); setPaletaAberta(false) }}
                      className={clsx(
                        'w-6 h-6 rounded-full flex items-center justify-center',
                        CORES_LISTA[k].ponto
                      )}>
                      {lista.cor === k && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {podeEditar && onExcluir && (
          <button onClick={onExcluir} aria-label="Excluir lista"
            className="p-1 text-fraco hover:text-red-500 shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-2 pb-2 space-y-2 overflow-y-auto flex-1 min-h-[60px]">
        {children}
      </div>

      {podeEditar && onAdicionarCartao && (
        <button onClick={onAdicionarCartao}
          className="shrink-0 flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-suave hover:text-marca-texto hover:bg-superficie-3 border-t border-borda transition-colors">
          <Plus className="w-4 h-4" /> Adicionar cartão
        </button>
      )}
    </div>
  )
}

type SortableProps = Omit<VisualProps, 'punho' | 'arrastando'>

export default function ColunaSortable(props: SortableProps) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: props.lista.id, data: { tipo: 'lista' } })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="flex max-h-full"
    >
      <ColunaVisual
        {...props}
        arrastando={isDragging}
        // Só o punho arrasta a coluna. Sem isso, arrastar um cartão de dentro
        // dela — ou clicar no título para renomear — disputaria com o arrasto
        // da própria coluna.
        punho={{ ref: setActivatorNodeRef, ...listeners, ...attributes }}
      />
    </div>
  )
}
