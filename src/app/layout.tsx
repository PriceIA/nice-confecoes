import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'
import { AuthProvider, type Membro } from '@/components/AuthProvider'
import { SCRIPT_TEMA, TemaProvider } from '@/components/TemaProvider'
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
      .select('id, nome, perfil')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (data) {
      membro = { id: data.id, nome: data.nome, perfil: data.perfil as Perfil, email: user.email ?? '' }
    }
  }

  return (
    // suppressHydrationWarning: o script abaixo põe a classe `dark` no <html>
    // antes da hidratação, então o HTML do servidor e o do cliente divergem
    // nesse atributo de propósito.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica o tema ANTES da primeira pintura. Se isso rodasse só no
            React, a tela apareceria clara e piscaria para escura. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <TemaProvider>
          <AuthProvider membro={membro}>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </TemaProvider>
      </body>
    </html>
  )
}
