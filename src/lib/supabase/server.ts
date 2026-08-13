import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Client de AUTENTICAÇÃO para server components e route handlers.
// Lê a sessão dos cookies da requisição.
export function criarClienteServidor() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components não podem escrever cookies. O refresh de sessão
            // acontece no middleware, então ignorar aqui é seguro.
          }
        },
      },
    }
  )
}
