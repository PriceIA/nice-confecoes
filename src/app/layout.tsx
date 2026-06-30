import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: 'Nice Confecções',
  description: 'Sistema de gestão de pedidos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 md:ml-60 min-h-screen print:ml-0">
            <div className="p-8 pt-20 md:pt-8 print:p-0">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}
