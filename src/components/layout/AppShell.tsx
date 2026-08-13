'use client'
import { useAuth } from '@/components/AuthProvider'
import Sidebar from './Sidebar'

// Sem membro só acontece em rota pública (/login), onde a navegação do app não
// deve aparecer.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { membro } = useAuth()

  if (!membro) return <>{children}</>

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 md:ml-60 min-h-screen print:ml-0">
        <div className="p-8 pt-20 md:pt-8 print:p-0">{children}</div>
      </main>
    </div>
  )
}
