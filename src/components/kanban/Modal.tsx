'use client'
import { useEffect } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

// Primeiro modal reutilizável do projeto.
//
// Segue o visual dos overlays que já existem — o modal de terceirizadas/page.tsx
// e o drawer de clientes/page.tsx: fundo `bg-black/40 backdrop-blur-sm`, caixa
// branca `rounded-2xl shadow-xl`, `z-50`. Acrescenta o que falta nos dois:
// fechar no Esc e fechar clicando no fundo.
//
// Fica em components/kanban/ de propósito: adotá-lo nas telas antigas é uma
// refatoração à parte, não um efeito colateral do Kanban.

type Props = {
  aberto: boolean
  titulo: string
  onFechar: () => void
  children: React.ReactNode
  /** Rodapé fixo, fora da área que rola. Normalmente os botões de ação. */
  rodape?: React.ReactNode
  largura?: 'md' | 'lg'
}

export default function Modal({ aberto, titulo, onFechar, children, rodape, largura = 'md' }: Props) {
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    // Trava a rolagem do fundo enquanto o modal está aberto.
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onFechar} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={clsx(
          'relative bg-superficie rounded-2xl shadow-xl w-full flex flex-col max-h-[90vh]',
          largura === 'lg' ? 'max-w-2xl' : 'max-w-lg'
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-borda shrink-0">
          <h2 className="font-semibold text-titulo">{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-fraco hover:text-suave p-1 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>

        {rodape && (
          <div className="px-6 py-4 border-t border-borda flex gap-3 shrink-0">{rodape}</div>
        )}
      </div>
    </div>
  )
}
