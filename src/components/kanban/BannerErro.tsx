'use client'
import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react'
import clsx from 'clsx'
import type { MsgKanban } from '@/lib/kanban-ui'

// Banner de status do Kanban.
//
// Fica FIXO no rodapé e só some por ação do usuário. Deliberadamente não é
// `alert()` (o padrão do resto do repo) nem um toast que se apaga sozinho: o
// caso que importa aqui é "seu arrasto não foi salvo", e essa informação não
// pode passar despercebida no meio de um turno na fábrica.

type Props = {
  msg: MsgKanban | null
  onFechar: () => void
  /** Quando presente, oferece reler o quadro do banco. */
  onRecarregar?: () => void
}

export default function BannerErro({ msg, onFechar, onRecarregar }: Props) {
  if (!msg) return null
  const erro = msg.tipo === 'erro'

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 print:hidden">
      <div
        role="status"
        aria-live="assertive"
        className={clsx(
          'rounded-2xl shadow-xl border px-4 py-3 flex items-start gap-3',
          erro ? 'bg-red-50 border-red-200' : 'bg-marca-suave border-marca-borda'
        )}
      >
        {erro
          ? <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          : <CheckCircle2 className="w-5 h-5 text-marca-texto shrink-0 mt-0.5" />}

        <div className="flex-1 min-w-0">
          <p className={clsx('text-sm font-medium', erro ? 'text-red-800' : 'text-titulo')}>
            {msg.texto}
          </p>
          {erro && onRecarregar && (
            <button
              onClick={onRecarregar}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-900"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Recarregar do banco
            </button>
          )}
        </div>

        <button
          onClick={onFechar}
          aria-label="Fechar aviso"
          className={clsx('p-1 -mr-1 -mt-0.5 shrink-0', erro ? 'text-red-400 hover:text-red-700' : 'text-nice-500 hover:text-marca-texto')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
