import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'
import { AuthProvider, type Membro } from '@/components/AuthProvider'
import { criarClienteServidor } from '@/lib/supabase/server'
import type { Perfil } from '@/lib/permissoes'

export const metadata: Metadata = {
  title: 'Nice Confecções',
  description: 'Sistema de gestão de pedidos',
}

// Resolve o usuário no servidor para a árvore inteira já montar sabendo quem
// está logado — sem piscar "carregando" nem refazer a busca no browser.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = criarClienteServidor()
  const { data: { user } } = await supabase.auth.getUser()

  let membro: Membro | null = null
  if (user) {
    const { data } = await supabase
      .from('equipe')
      .select('nome, perfil')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (data) {
      membro = { nome: data.nome, perfil: data.perfil as Perfil, email: user.email ?? '' }
    }
  }

  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider membro={membro}>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  )
}
