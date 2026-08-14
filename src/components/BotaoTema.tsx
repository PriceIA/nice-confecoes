'use client'
import { Moon, Sun } from 'lucide-react'
import clsx from 'clsx'
import { useTema } from '@/components/TemaProvider'

// Botão de alternar tema. Duas variantes, porque a sidebar é verde escura nos
// dois temas (identidade da marca) e o topbar mobile também — ali o contraste
// se resolve com os tons de nice-*, não com as variáveis de superfície.

export default function BotaoTema({ variante = 'sidebar' }: { variante?: 'sidebar' | 'icone' | 'avulso' }) {
  const { tema, alternar } = useTema()
  const escuro = tema === 'escuro'
  const Icone = escuro ? Sun : Moon
  const rotulo = escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'

  // Fora da sidebar (ex.: /login), onde o fundo é o do tema e não o verde.
  if (variante === 'avulso') {
    return (
      <button onClick={alternar} aria-label={rotulo} title={rotulo}
        className="text-suave hover:text-conteudo p-2 rounded-lg hover:bg-superficie-2 transition-colors">
        <Icone className="w-5 h-5" />
      </button>
    )
  }

  if (variante === 'icone') {
    return (
      <button onClick={alternar} aria-label={rotulo} title={rotulo}
        className="text-white p-2 rounded-lg hover:bg-nice-700 transition-colors">
        <Icone className="w-5 h-5" />
      </button>
    )
  }

  return (
    <button
      onClick={alternar}
      aria-label={rotulo}
      className={clsx(
        'flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium',
        'text-nice-200 hover:bg-nice-700 hover:text-white transition-colors'
      )}
    >
      <Icone className="w-4 h-4 shrink-0" />
      {escuro ? 'Tema claro' : 'Tema escuro'}
    </button>
  )
}
