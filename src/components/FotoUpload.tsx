'use client'
import { useRef, useState } from 'react'
import { FilePlus2, X, Loader2, ZoomIn, ExternalLink } from 'lucide-react'
import { uploadFotoPeca } from '@/lib/store'
import { TIPOS_ACEITOS, TAMANHO_MAXIMO_MB, ehPdf } from '@/lib/arquivos'
import MiniaturaArquivo from './MiniaturaArquivo'
import clsx from 'clsx'

interface Props {
  pecaId: string
  /** URLs dos anexos. O nome do campo é histórico: hoje guarda imagem E PDF. */
  fotos: string[]
  onChange: (fotos: string[]) => void
}

/**
 * Anexos da arte de uma peça: imagem de qualquer formato ou PDF.
 *
 * O PDF entrou porque é o formato em que a arte costuma chegar do designer —
 * antes o seletor era `accept="image/*"` e o PDF simplesmente não aparecia na
 * janela de arquivos. Como PDF não renderiza dentro de `<img>`, a miniatura
 * dele é um cartão (ver MiniaturaArquivo) e o clique abre em outra aba, em vez
 * de tentar ampliar num lightbox que ficaria vazio.
 */
export default function FotoUpload({ pecaId, fotos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function handleFiles(files: FileList) {
    if (!files.length) return
    setErro(null)

    // Barrar aqui o arquivo grande demais dá uma mensagem em português; deixar
    // subir devolveria a falha crua do Storage, que ninguém na fábrica lê.
    const grande = Array.from(files).find(f => f.size > TAMANHO_MAXIMO_MB * 1024 * 1024)
    if (grande) {
      setErro(`"${grande.name}" tem mais de ${TAMANHO_MAXIMO_MB} MB e não pode ser enviado.`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const urls = await Promise.all(
        Array.from(files).map(f => uploadFotoPeca(pecaId, f))
      )
      onChange([...fotos, ...urls])
    } catch {
      setErro('Não foi possível enviar o arquivo. Verifique a conexão e tente novamente.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remover(url: string) {
    onChange(fotos.filter(f => f !== url))
  }

  function abrir(url: string) {
    if (ehPdf(url)) window.open(url, '_blank', 'noopener,noreferrer')
    else setLightbox(url)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {fotos.map((url, i) => (
          <div key={url} className="relative group">
            <MiniaturaArquivo url={url} indice={i} onClick={() => abrir(url)} />
            <button
              type="button"
              onClick={() => remover(url)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
              title="Remover arquivo"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => abrir(url)}
              className="absolute bottom-1 right-1 w-5 h-5 bg-black/50 text-white rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title={ehPdf(url) ? 'Abrir PDF em outra aba' : 'Ampliar'}
            >
              {ehPdf(url) ? <ExternalLink className="w-3 h-3" /> : <ZoomIn className="w-3 h-3" />}
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={clsx(
            'w-20 h-20 border-2 border-dashed border-borda rounded-xl flex flex-col items-center justify-center gap-1 hover:border-nice-400 hover:bg-marca-suave transition-colors',
            uploading && 'opacity-50 cursor-wait'
          )}
          title="Adicionar imagem ou PDF"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-fraco animate-spin" />
          ) : (
            <>
              <FilePlus2 className="w-5 h-5 text-fraco" />
              <span className="text-xs text-fraco">Arte</span>
            </>
          )}
        </button>
      </div>

      {erro && <p className="text-xs text-red-600 mt-1.5">{erro}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_ACEITOS}
        multiple
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-fraco"
            onClick={() => setLightbox(null)}
          >
            <X className="w-7 h-7" />
          </button>
          <img
            src={lightbox}
            alt="Arte ampliada"
            className="max-w-full max-h-[90vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
