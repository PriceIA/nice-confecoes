'use client'
// O clipe da conversa (Fase J3): liga o próximo recado a um pedido. Busca por
// número ou cliente numa lista carregada uma vez (não recarrega a cada
// abertura) — a permissão de usar isto (`podeAcessarRota(..., '/pedidos')`)
// é decidida por quem chama, não por este componente.

import { useEffect, useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { getPedidosLista } from '@/lib/store'
import type { PedidoLista } from '@/types'

export default function ClipePedido({ onEscolher }: { onEscolher: (pedidoId: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const [pedidos, setPedidos] = useState<PedidoLista[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [busca, setBusca] = useState('')
  const botaoRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  function fechar() {
    setAberto(false)
    botaoRef.current?.focus()
  }

  async function abrir() {
    setAberto(true)
    setBusca('')
    if (pedidos === null && !carregando) {
      setCarregando(true)
      try {
        const lista = await getPedidosLista({ statusExcluir: ['cancelado', 'entregue'] })
        setPedidos(lista)
      } catch {
        setPedidos([])
      } finally {
        setCarregando(false)
      }
    }
  }

  useEffect(() => {
    if (!aberto) return
    // Fase de CAPTURA, antes do listener de Esc do PainelRecados: sem isso,
    // o mesmo Esc fecha o popover E a gaveta inteira (achado no teste da J3,
    // item 4b). `preventDefault()` é o sinal que o painel confere antes de
    // fechar sozinho.
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
      }
    }
    function aoClicarFora(e: MouseEvent) {
      const alvo = e.target as Node
      if (popoverRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return
      fechar()
    }
    window.addEventListener('keydown', aoTeclar, true)
    document.addEventListener('mousedown', aoClicarFora)
    return () => {
      window.removeEventListener('keydown', aoTeclar, true)
      document.removeEventListener('mousedown', aoClicarFora)
    }
  }, [aberto])

  const termo = busca.trim().toLowerCase()
  const filtrados = (pedidos ?? [])
    .filter(p =>
      !termo ||
      p.numero.toLowerCase().includes(termo) ||
      p.cliente.nome.toLowerCase().includes(termo) ||
      p.cliente.empresa.toLowerCase().includes(termo)
    )
    .slice(0, 8)

  function escolher(id: string) {
    onEscolher(id)
    fechar()
  }

  return (
    <div className="relative">
      <button
        ref={botaoRef}
        onClick={() => (aberto ? fechar() : abrir())}
        aria-label="Ligar a um pedido"
        aria-expanded={aberto}
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-fraco hover:bg-superficie-2 hover:text-suave transition-colors"
      >
        <Paperclip className="w-4 h-4" />
      </button>

      {aberto && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Ligar a um pedido"
          className="absolute bottom-full left-0 mb-2 w-72 bg-superficie border border-borda rounded-2xl shadow-xl p-3 z-10"
        >
          <input
            autoFocus
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por número ou cliente"
            className="input mb-2"
          />
          <div className="max-h-56 overflow-y-auto">
            {carregando ? (
              <p className="px-2 py-3 text-sm text-suave">Carregando…</p>
            ) : filtrados.length === 0 ? (
              <p className="px-2 py-3 text-sm text-suave">Nenhum pedido encontrado.</p>
            ) : (
              filtrados.map(p => (
                <button
                  key={p.id}
                  onClick={() => escolher(p.id)}
                  className="w-full text-left px-2 py-2 rounded-xl hover:bg-superficie-2 text-sm"
                >
                  <span className="font-semibold text-conteudo">#{p.numero}</span>
                  <span className="text-suave"> — {p.cliente.nome || p.cliente.empresa}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
