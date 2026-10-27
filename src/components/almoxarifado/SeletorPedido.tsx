'use client'
// Seletor de pedido com busca por número ou cliente (Fase K3 e K4). Só pedidos
// ativos: aprovado, aguardando pagamento e em produção. É só LEITURA do pedido.

import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { getPedidosLista } from '@/lib/store'
import { classificarErro } from '@/lib/erros'
import type { PedidoLista } from '@/types'

const STATUS_ATIVOS = ['aprovado', 'aguardando_pagamento', 'em_producao'] as const

export function rotuloPedido(p: Pick<PedidoLista, 'numero' | 'cliente'>): string {
  const quem = p.cliente?.empresa || p.cliente?.nome || 'sem cliente'
  return `${p.numero} · ${quem}`
}

type Props = {
  valor: PedidoLista | null
  onChange: (p: PedidoLista | null) => void
  /** Texto do botão que limpa a escolha, ex.: "Sem pedido (estoque)". */
  textoSemPedido?: string
  rotulo?: string
}

export default function SeletorPedido({ valor, onChange, textoSemPedido = 'Sem pedido', rotulo = 'Pedido' }: Props) {
  const [pedidos, setPedidos] = useState<PedidoLista[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    let vivo = true
    getPedidosLista({ status: [...STATUS_ATIVOS] })
      .then(r => { if (vivo) setPedidos(r) })
      .catch(err => {
        if (!vivo) return
        const f = classificarErro(err)
        setErro(f.tipo === 'offline' ? 'Sem conexão: não deu para carregar os pedidos.' : 'Não deu para carregar a lista de pedidos.')
      })
    return () => { vivo = false }
  }, [])

  const achados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = q
      ? pedidos.filter(p =>
          p.numero.toLowerCase().includes(q)
          || (p.cliente?.nome ?? '').toLowerCase().includes(q)
          || (p.cliente?.empresa ?? '').toLowerCase().includes(q))
      : pedidos
    return lista.slice(0, 8)
  }, [pedidos, busca])

  if (valor) {
    return (
      <div>
        <span className="label">{rotulo}</span>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-borda bg-superficie px-3 py-2.5">
          <span className="text-sm font-medium text-conteudo truncate">{rotuloPedido(valor)}</span>
          <button type="button" className="btn-icone text-suave" aria-label="Trocar pedido"
            onClick={() => { onChange(null); setBusca(''); setAberto(true) }}>
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <label className="label" htmlFor="busca-pedido">{rotulo}</label>
      <div className="relative">
        <Search className="w-4 h-4 text-fraco absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input
          id="busca-pedido"
          type="search"
          className="input pl-9"
          placeholder={textoSemPedido + ' — ou busque por número ou cliente'}
          value={busca}
          onChange={e => { setBusca(e.target.value); setAberto(true) }}
          onFocus={() => setAberto(true)}
          autoComplete="off"
        />
      </div>
      {erro && <p role="alert" className="text-xs text-red-700 mt-1">{erro}</p>}
      {aberto && (
        <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-borda bg-superficie shadow-lg">
          <li>
            <button type="button" className="w-full text-left px-3 py-2.5 text-sm text-suave hover:bg-superficie-2"
              onClick={() => { onChange(null); setAberto(false) }}>
              {textoSemPedido}
            </button>
          </li>
          {achados.map(p => (
            <li key={p.id}>
              <button type="button" className="w-full text-left px-3 py-2.5 text-sm text-conteudo hover:bg-superficie-2"
                onClick={() => { onChange(p); setAberto(false); setBusca('') }}>
                <span className="font-medium num">{p.numero}</span>
                <span className="text-suave"> · {p.cliente?.empresa || p.cliente?.nome || 'sem cliente'}</span>
              </button>
            </li>
          ))}
          {achados.length === 0 && busca.trim() !== '' && (
            <li className="px-3 py-2.5 text-sm text-suave">Nenhum pedido ativo encontrado.</li>
          )}
        </ul>
      )}
    </div>
  )
}
