'use client'
import { FileText } from 'lucide-react'
import { ehPdf, nomeVisivel } from '@/lib/arquivos'
import clsx from 'clsx'

interface Props {
  url: string
  /** Posição na lista, só para o texto alternativo da imagem. */
  indice?: number
  onClick?: () => void
  className?: string
}

/**
 * Um anexo de peça em 80×80, usado no cadastro e no detalhe do pedido.
 *
 * Imagem vira miniatura; PDF vira cartão com ícone e nome. Não é enfeite:
 * `<img src="...pdf">` não renderiza o PDF, mostra o ícone de imagem
 * quebrada — foi por isso que o upload só aceitava imagem antes.
 */
export default function MiniaturaArquivo({ url, indice, onClick, className }: Props) {
  const base = clsx(
    'w-20 h-20 rounded-xl border border-borda overflow-hidden shrink-0',
    onClick && 'cursor-pointer',
    className,
  )

  if (ehPdf(url)) {
    return (
      <div
        className={clsx(base, 'bg-superficie-2 flex flex-col items-center justify-center gap-0.5 px-1 text-center')}
        onClick={onClick}
        title={nomeVisivel(url)}
      >
        <FileText className="w-6 h-6 text-marca-texto" />
        <span className="text-[9px] font-semibold text-suave leading-none">PDF</span>
        <span className="text-[8px] text-fraco leading-tight truncate max-w-full">{nomeVisivel(url)}</span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={indice !== undefined ? `Arte ${indice + 1}` : 'Arte da peça'}
      className={clsx(base, 'object-cover')}
      onClick={onClick}
    />
  )
}
