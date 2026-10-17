'use client'
// Cartão de "chegou recado" (Fase J3): só para o que chega pelo Realtime
// enquanto a conversa daquela pessoa não está aberta — nunca para os não
// lidos que já estavam lá ao carregar a página. Estado vem de
// `RecadosProvider` (`avisos`), renderizado ao lado do `PainelRecados`.

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useRecados } from './RecadosProvider'
import { iniciaisDe } from './formatacao'
import { numerosDePedidos } from '@/lib/kanban'
import type { Recado } from '@/types'

const DURACAO_MS = 8000

export default function AvisoRecado() {
  const { avisos, equipe, abrirConversa, responderRapido, fecharAviso } = useRecados()

  // Mesma técnica de Conversa.tsx: assinatura em string pra não refazer a
  // consulta a cada render, só quando os ids realmente mudam.
  const assinaturaIds = useMemo(
    () => Array.from(new Set(avisos.map(a => a.pedidoId).filter((id): id is string => !!id))).sort().join(','),
    [avisos]
  )
  const [numeros, setNumeros] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!assinaturaIds) { setNumeros(new Map()); return }
    let cancelado = false
    numerosDePedidos(assinaturaIds.split(',')).then(mapa => {
      if (!cancelado) setNumeros(mapa)
    }).catch(() => {})
    return () => { cancelado = true }
  }, [assinaturaIds])

  return (
    // Sempre montado — mesmo vazio — pra região `role="status"` já existir
    // quando o primeiro aviso chegar (achado no teste da J3, item 4c: sem
    // isso, o leitor de tela podia não anunciar o cartão). Sem avisos, o
    // `flex-col` sem filhos não tem altura nem padding, então não bloqueia
    // clique em nada por baixo.
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[340px] z-40 flex flex-col gap-2 print:hidden"
    >
      {avisos.map(aviso => {
        const remetente = equipe.find(m => m.id === aviso.remetenteId)
        if (!remetente) return null
        return (
          <CartaoAviso
            key={aviso.remetenteId}
            aviso={aviso}
            nome={remetente.nome}
            numeroPedido={aviso.pedidoId ? numeros.get(aviso.pedidoId) : undefined}
            onResponder={() => abrirConversa(aviso.remetenteId)}
            onOk={() => responderRapido(aviso.remetenteId, 'Ok')}
            onFechar={() => fecharAviso(aviso.remetenteId)}
          />
        )
      })}
    </div>
  )
}

function CartaoAviso({
  aviso, nome, numeroPedido, onResponder, onOk, onFechar,
}: {
  aviso: Recado
  nome: string
  numeroPedido?: string
  onResponder: () => void
  onOk: () => void
  onFechar: () => void
}) {
  const [hover, setHover] = useState(false)
  const [foco, setFoco] = useState(false)
  const pausado = hover || foco

  // Some sozinho em 8s, mas o relógio pausa com o mouse ou o foco em cima.
  // Depende de `aviso.id`: quando a MESMA pessoa manda de novo, o provider
  // troca o conteúdo deste cartão (novo id) e o efeito reinicia a contagem.
  useEffect(() => {
    if (pausado) return
    const t = setTimeout(onFechar, DURACAO_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausado, aviso.id])

  return (
    <div
      className="bg-superficie border border-borda rounded-2xl shadow-xl p-3 flex gap-3"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFoco(true)}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFoco(false)
      }}
    >
      <div className="w-9 h-9 rounded-full bg-marca-suave text-marca-texto flex items-center justify-center text-sm font-semibold shrink-0">
        {iniciaisDe(nome)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-conteudo truncate">{nome}</p>
          <button
            onClick={onFechar}
            aria-label="Fechar aviso"
            className="btn-icone text-fraco hover:text-suave -mt-1 -mr-1 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {numeroPedido && (
          <p className="text-xs font-semibold text-marca-texto">Pedido #{numeroPedido}</p>
        )}
        <p className="text-sm text-suave line-clamp-2">{aviso.texto}</p>
        <div className="flex gap-2 mt-2">
          <button onClick={onResponder} className="btn-secondary py-1 px-2.5 text-xs">Responder</button>
          <button onClick={onOk} className="btn-ghost py-1 px-2.5 text-xs">Ok</button>
        </div>
      </div>
    </div>
  )
}
