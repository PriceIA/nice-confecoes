'use client'
// A gaveta de Recados (Fase J): shell fixo + tela "lista" (as telas "nova" e
// "conversa" são NovaConversa.tsx e Conversa.tsx, cada uma com seu próprio
// cabeçalho).

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, CheckCheck, Plus, Search, X } from 'lucide-react'
import { useMembro } from '@/components/AuthProvider'
import { useRecados } from './RecadosProvider'
import { horaCurta, iniciaisDe } from './formatacao'
import NovaConversa from './NovaConversa'
import Conversa from './Conversa'

export default function PainelRecados() {
  const { membro } = useMembro()
  const { aberto, tela, conversas, abrir, abrirNova, abrirConversa, fechar } = useRecados()
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (!aberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, fechar])

  // Zera a busca sempre que a gaveta fecha, pra não reabrir filtrada sem querer.
  useEffect(() => {
    if (!aberto) setBusca('')
  }, [aberto])

  if (!aberto) return null

  const termo = busca.trim().toLowerCase()
  const conversasFiltradas = termo
    ? conversas.filter(c => c.outro.nome.toLowerCase().includes(termo))
    : conversas

  return (
    <div className="fixed inset-0 z-50 print:hidden">
      <div className="md:hidden absolute inset-0 bg-black/50" onClick={fechar} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Recados"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-superficie border-l border-borda shadow-xl flex flex-col"
      >
        {tela === 'conversa' && <Conversa />}

        {tela === 'nova' && (
          <>
            <div className="flex items-center gap-2 px-5 py-4 border-b border-borda shrink-0">
              <button onClick={abrir} aria-label="Voltar" className="btn-icone text-fraco hover:text-suave">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-semibold text-titulo flex-1">Nova conversa</h2>
              <button onClick={fechar} aria-label="Fechar" className="btn-icone text-fraco hover:text-suave">
                <X className="w-5 h-5" />
              </button>
            </div>
            <NovaConversa />
          </>
        )}

        {tela === 'lista' && (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-borda shrink-0">
              <h2 className="text-lg font-semibold text-titulo">Recados</h2>
              <button onClick={fechar} aria-label="Fechar" className="btn-icone text-fraco hover:text-suave">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 pt-4 pb-3 space-y-3 shrink-0">
              <button onClick={() => abrirNova()} className="btn-secondary w-full justify-center gap-2">
                <Plus className="w-4 h-4" /> Nova conversa
              </button>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fraco" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por nome"
                  className="input pl-9"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {conversasFiltradas.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-suave">
                  {conversas.length === 0
                    ? <>Nenhum recado ainda. Toque em <strong>Nova conversa</strong>.</>
                    : 'Nenhuma conversa com esse nome.'}
                </p>
              ) : (
                <ul>
                  {conversasFiltradas.map(c => {
                    const minhaUltima = c.ultima.remetenteId === membro?.id
                    return (
                      <li key={c.outro.id}>
                        <button
                          onClick={() => abrirConversa(c.outro.id)}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-superficie-2 text-left transition-colors"
                        >
                          <div className="w-10 h-10 rounded-full bg-marca-suave text-marca-texto flex items-center justify-center text-sm font-semibold shrink-0">
                            {iniciaisDe(c.outro.nome)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-conteudo truncate">{c.outro.nome}</span>
                              <span className="text-xs text-fraco shrink-0">{horaCurta(c.ultima.criadoEm)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-suave">
                              {minhaUltima && (
                                c.ultima.lidoEm
                                  ? <CheckCheck className="w-3.5 h-3.5 text-marca-texto shrink-0" />
                                  : <Check className="w-3.5 h-3.5 text-fraco shrink-0" />
                              )}
                              <span className="truncate">
                                {minhaUltima ? 'Você: ' : ''}{c.ultima.texto}
                              </span>
                            </div>
                          </div>
                          {c.naoLidas > 0 && (
                            <span className="w-5 h-5 rounded-full bg-marca text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                              {c.naoLidas}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="px-5 py-3 border-t border-borda text-xs text-fraco shrink-0">
              Mensagens com mais de 30 dias somem sozinhas.
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
