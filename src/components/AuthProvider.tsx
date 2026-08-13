'use client'
import { createContext, useContext, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { criarClienteBrowser } from '@/lib/supabase/client'
import { permissoesDe, type Perfil } from '@/lib/permissoes'

export type Membro = {
  nome: string
  perfil: Perfil
  email: string
}

type AuthCtx = {
  /** null apenas em rotas públicas (/login). */
  membro: Membro | null
  sair: () => Promise<void>
}

const Contexto = createContext<AuthCtx>({ membro: null, sair: async () => {} })

export function AuthProvider({ membro, children }: { membro: Membro | null; children: React.ReactNode }) {
  const router = useRouter()

  const valor = useMemo<AuthCtx>(() => ({
    membro,
    async sair() {
      await criarClienteBrowser().auth.signOut()
      router.replace('/login')
      router.refresh()
    },
  }), [membro, router])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAuth() {
  return useContext(Contexto)
}

/**
 * Para telas atrás do login, onde o middleware já garantiu que existe membro.
 * Devolve também as permissões do perfil, evitando que a tela releia a matriz.
 */
export function useMembro() {
  const { membro, sair } = useAuth()
  const permissoes = permissoesDe(membro?.perfil ?? 'costureira')
  return { membro, permissoes, sair }
}
