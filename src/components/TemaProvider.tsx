'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Tema claro/escuro.
//
// A classe `dark` no <html> é a única chave: o Tailwind está em darkMode:'class'
// e as variáveis de globals.css trocam junto. Este componente só liga e desliga
// essa classe e lembra da escolha.
//
// A aplicação INICIAL da classe não acontece aqui — acontece no script inline do
// <head> (ver CHAVE_TEMA e SCRIPT_TEMA abaixo, usados em src/app/layout.tsx).
// Se dependesse deste componente, a página pintaria clara e só depois viraria
// escura: o flash que se quer evitar.

export type Tema = 'claro' | 'escuro'

export const CHAVE_TEMA = 'nice-tema'

/**
 * Roda no <head>, antes de qualquer pintura.
 *
 * Ordem: escolha explícita do usuário > preferência do sistema. Tudo dentro de
 * try/catch porque localStorage pode estourar (modo privativo, cookies
 * bloqueados) — e um tema errado é muito melhor que uma tela em branco.
 */
export const SCRIPT_TEMA = `(function(){try{
var e=localStorage.getItem('${CHAVE_TEMA}');
var d=e?e==='escuro':window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark',d);
}catch(_){}})();`

type Ctx = { tema: Tema; alternar: () => void; definir: (t: Tema) => void }

const Contexto = createContext<Ctx>({ tema: 'claro', alternar: () => {}, definir: () => {} })

export function TemaProvider({ children }: { children: React.ReactNode }) {
  // Começa em 'claro' e corrige no efeito. O valor do primeiro render precisa
  // bater com o do servidor, senão o React acusa divergência de hidratação; a
  // aparência já está certa desde o script do <head>, então essa correção não
  // é visível.
  const [tema, setTema] = useState<Tema>('claro')

  useEffect(() => {
    setTema(document.documentElement.classList.contains('dark') ? 'escuro' : 'claro')
  }, [])

  // Enquanto o usuário não escolher, seguir o sistema se ele mudar (o SO alterna
  // sozinho de dia/noite). Depois da escolha explícita, parar de seguir.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const aoMudar = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(CHAVE_TEMA)) return
      const novo: Tema = e.matches ? 'escuro' : 'claro'
      document.documentElement.classList.toggle('dark', novo === 'escuro')
      setTema(novo)
    }
    mq.addEventListener('change', aoMudar)
    return () => mq.removeEventListener('change', aoMudar)
  }, [])

  const definir = useCallback((novo: Tema) => {
    document.documentElement.classList.toggle('dark', novo === 'escuro')
    setTema(novo)
    try {
      localStorage.setItem(CHAVE_TEMA, novo)
    } catch {
      // Sem persistência (modo privativo): o tema vale só nesta sessão.
    }
  }, [])

  const alternar = useCallback(() => {
    definir(document.documentElement.classList.contains('dark') ? 'claro' : 'escuro')
  }, [definir])

  return (
    <Contexto.Provider value={{ tema, alternar, definir }}>{children}</Contexto.Provider>
  )
}

export function useTema() {
  return useContext(Contexto)
}
