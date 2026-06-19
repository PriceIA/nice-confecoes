'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, ClipboardList, PlusCircle,
  Factory, Users, Users2, BarChart3, Scissors, Menu, X
} from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { href: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/pedidos',         label: 'Pedidos',         icon: ClipboardList },
  { href: '/clientes',        label: 'Clientes',        icon: Users2 },
  { href: '/novo-pedido',     label: 'Novo Pedido',     icon: PlusCircle },
  { href: '/producao',        label: 'Produção',        icon: Factory },
  { href: '/terceirizadas',   label: 'Terceirizadas',   icon: Users },
  { href: '/relatorios',      label: 'Relatórios',      icon: BarChart3 },
]

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {/* Logo */}
      <div className="px-5 py-6 border-b border-nice-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-nice-400 flex items-center justify-center shadow-md">
            <Scissors className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-base leading-tight">Nice</div>
            <div className="text-nice-300 text-xs font-medium">Confecções</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} onClick={onNavigate} className={clsx(
              'sidebar-link',
              active
                ? 'bg-nice-500 text-white shadow-sm'
                : 'text-nice-200 hover:bg-nice-700 hover:text-white'
            )}>
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-nice-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-nice-500 flex items-center justify-center text-white text-xs font-bold">P</div>
          <div>
            <div className="text-white text-sm font-medium">Pedro</div>
            <div className="text-nice-300 text-xs">Administrador</div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Topbar mobile */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-nice-800 flex items-center justify-between px-4 z-40 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-nice-400 flex items-center justify-center shadow-md">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <div className="text-white font-bold text-sm">Nice Confecções</div>
        </div>
        <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="text-white p-2 -mr-2">
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Sidebar fixa no desktop */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-60 bg-nice-800 flex-col z-40 shadow-xl">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative h-screen w-60 bg-nice-800 flex flex-col shadow-xl">
            <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="absolute top-5 right-4 text-white p-1">
              <X className="w-5 h-5" />
            </button>
            <SidebarContent pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  )
}
