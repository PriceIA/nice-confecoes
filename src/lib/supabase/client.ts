import { createBrowserClient } from '@supabase/ssr'

// Client de AUTENTICAÇÃO para client components.
//
// Difere do singleton em src/lib/supabase.ts: este guarda a sessão em COOKIES,
// que é o que o middleware consegue ler no servidor. O singleton antigo continua
// existindo e sendo usado pelo store.ts para ler/gravar dados de negócio.
export function criarClienteBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
