'use client'
import { useRef, useState } from 'react'
import { ImagePlus, X, Loader2, ZoomIn } from 'lucide-react'
import { uploadFotoPeca } from '@/lib/store'
import clsx from 'clsx'

interface Props {
  pecaId: string
  fotos: string[]
  onChange: (fotos: string[]) => void
}

export default function FotoUpload({ pecaId, fotos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  async function handleFiles(files: FileList) {
    if (!files.length) return
    setUploading(true)
    try {
      const urls = await Promise.all(
        Array.from(files).map(f => uploadFotoPeca(pecaId, f))
      )
      onChange([...fotos, ...urls])
    } catch {
      alert('Erro ao enviar foto. Verifique sua conexão e tente novamente.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remover(url: string) {
    onChange(fotos.filter(f => f !== url))
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {fotos.map((url, i) => (
          <div key={url} className="relative group">
            <img
              src={url}
              alt={`Foto ${i + 1}`}
              className="w-20 h-20 object-cover rounded-xl border border-gray-200 cursor-pointer"
              onClick={() => setLightbox(url)}
            />
            <button
              type="button"
              onClick={() => remover(url)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
              title="Remover foto"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setLightbox(url)}
              className="absolute bottom-1 right-1 w-5 h-5 bg-black/50 text-white rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Ampliar"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={clsx(
            'w-20 h-20 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 hover:border-nice-400 hover:bg-nice-50 transition-colors',
            uploading && 'opacity-50 cursor-wait'
          )}
          title="Adicionar foto"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          ) : (
            <>
              <ImagePlus className="w-5 h-5 text-gray-400" />
              <span className="text-xs text-gray-400">Foto</span>
            </>
          )}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => setLightbox(null)}
          >
            <X className="w-7 h-7" />
          </button>
          <img
            src={lightbox}
            alt="Foto ampliada"
            className="max-w-full max-h-[90vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
