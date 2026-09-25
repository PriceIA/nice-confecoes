'use client'
// A conversa em si (Fase J), dentro da gaveta de Recados: cabeçalho, balões,
// respostas prontas e o campo de escrever. O clipe para ligar um pedido pelo
// número fica para a J3 — aqui só existe o chip de leitura de um pedido já
// anexado (vindo de `abrirNova(pedidoId)`, ainda sem tela que o dispare).

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Check, CheckCheck, RotateCw, Send, X } from 'lucide-react'
import { useMembro } from '@/components/AuthProvider'
import { useRecados } from './RecadosProvider'
import { iniciaisDe, rotuloDia } from './formatacao'
import { RESPOSTAS_RAPIDAS, TEXTO_MAX } from '@/lib/recados'
import { numerosDePedidos } from '@/lib/kanban'
import { PERFIL_LABEL } from '@/lib/permissoes'

/** Altura máxima do textarea — cerca de 4 linhas de texto-sm mais padding. */
const ALTURA_MAX_TEXTAREA = 112

export default function Conversa() {
  const { membro } = useMembro()
  const {
    equipe, conversaCom, recadosCom, pedidoAnexado, enviar, reenviar, removerPedidoAnexado, abrir, fechar,
  } = useRecados()

  const outro = equipe.find(m => m.id === conversaCom)
  const recados = useMemo(() => (conversaCom ? recadosCom(conversaCom) : []), [conversaCom, recadosCom])

  const [texto, setTexto] = useState('')
  const [numeros, setNumeros] = useState<Map<string, string>>(new Map())
  const fimRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // String estável para não refazer a consulta a cada re-render — `recados`
  // é um array novo em toda chamada de `recadosCom`, mesmo com o mesmo conteúdo.
  const assinaturaIds = useMemo(() => {
    const ids = new Set(recados.map(r => r.pedidoId).filter((id): id is string => !!id))
    if (pedidoAnexado) ids.add(pedidoAnexado)
    return Array.from(ids).sort().join(',')
  }, [recados, pedidoAnexado])

  useEffect(() => {
    if (!assinaturaIds) { setNumeros(new Map()); return }
    let cancelado = false
    numerosDePedidos(assinaturaIds.split(',')).then(mapa => {
      if (!cancelado) setNumeros(mapa)
    }).catch(() => {})
    return () => { cancelado = true }
  }, [assinaturaIds])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [recados.length, conversaCom])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = '0px'
    const necessaria = el.scrollHeight
    el.style.height = Math.min(necessaria, ALTURA_MAX_TEXTAREA) + 'px'
    // Setinha de rolagem só depois de bater na altura máxima (~4 linhas) —
    // antes disso, o textarea cresce sozinho e não tem o que rolar.
    el.style.overflowY = necessaria > ALTURA_MAX_TEXTAREA ? 'auto' : 'hidden'
  }, [texto])

  if (!outro) return null

  function enviarTexto(t: string) {
    const limpo = t.trim()
    if (!limpo) return
    enviar(limpo)
    setTexto('')
    areaRef.current?.focus()
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviarTexto(texto)
    }
  }

  let diaAnterior = ''

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-borda shrink-0">
        <button onClick={abrir} aria-label="Voltar" className="btn-icone text-fraco hover:text-suave">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-full bg-marca-suave text-marca-texto flex items-center justify-center text-sm font-semibold shrink-0">
          {iniciaisDe(outro.nome)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-conteudo truncate">{outro.nome}</div>
          <div className="text-xs text-fraco">{PERFIL_LABEL[outro.perfil]}</div>
        </div>
        <button onClick={fechar} aria-label="Fechar" className="btn-icone text-fraco hover:text-suave">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {recados.map(r => {
          const minha = r.remetenteId === membro?.id
          const dia = rotuloDia(r.criadoEm)
          const mostrarDia = dia !== diaAnterior
          diaAnterior = dia
          const numeroPedido = r.pedidoId ? numeros.get(r.pedidoId) : undefined

          return (
            <div key={r.id}>
              {mostrarDia && (
                <div className="flex justify-center my-3">
                  <span className="text-xs font-medium text-fraco bg-superficie-2 rounded-full px-3 py-1">{dia}</span>
                </div>
              )}
              <div className={minha ? 'flex justify-end mb-1.5' : 'flex justify-start mb-1.5'}>
                <div
                  className={
                    'max-w-[80%] rounded-2xl px-3 py-2 border ' +
                    (minha ? 'bg-marca-suave border-marca-borda' : 'bg-superficie border-borda')
                  }
                >
                  {r.pedidoId && numeroPedido && (
                    <Link
                      href={`/pedidos/${r.pedidoId}`}
                      className="block text-xs font-semibold text-marca-texto mb-1 hover:underline"
                    >
                      #{numeroPedido}
                    </Link>
                  )}
                  <p className="text-sm text-conteudo whitespace-pre-wrap break-words">{r.texto}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[11px] text-fraco">{format(new Date(r.criadoEm), 'HH:mm')}</span>
                    {minha && r.pendente === 'enviando' && (
                      <span className="text-[11px] text-fraco">enviando…</span>
                    )}
                    {minha && !r.pendente && (
                      r.lidoEm
                        ? <CheckCheck className="w-3.5 h-3.5 text-marca-texto shrink-0" />
                        : <Check className="w-3.5 h-3.5 text-fraco shrink-0" />
                    )}
                  </div>
                  {minha && r.pendente === 'erro' && (
                    <button
                      onClick={() => reenviar(r.id)}
                      className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:text-red-900"
                    >
                      <RotateCw className="w-3 h-3" /> Não enviado — tentar de novo
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={fimRef} />
      </div>

      <div className="border-t border-borda px-4 py-3 shrink-0 space-y-2">
        {pedidoAnexado && (
          <div className="flex">
            <span className="inline-flex items-center gap-1.5 bg-marca-suave text-marca-texto text-xs font-semibold rounded-full pl-3 pr-1.5 py-1">
              #{numeros.get(pedidoAnexado) ?? '…'}
              <button onClick={removerPedidoAnexado} aria-label="Remover pedido anexado" className="hover:opacity-70 p-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {RESPOSTAS_RAPIDAS.map(resposta => (
            <button key={resposta} onClick={() => enviarTexto(resposta)} className="btn-secondary py-1.5 px-3 text-xs">
              {resposta}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={areaRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
            maxLength={TEXTO_MAX}
            rows={1}
            placeholder="Escreva um recado…"
            className="input resize-none overflow-hidden"
            style={{ maxHeight: ALTURA_MAX_TEXTAREA }}
          />
          <button
            onClick={() => enviarTexto(texto)}
            disabled={!texto.trim()}
            aria-label="Enviar"
            className="w-10 h-10 rounded-full bg-marca text-white flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {texto.length > 400 && (
          <p className="text-right text-xs text-fraco">{texto.length}/{TEXTO_MAX}</p>
        )}
      </div>
    </div>
  )
}
