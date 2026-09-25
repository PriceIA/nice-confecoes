'use client'
// Tela "Nova conversa" da gaveta de Recados (Fase J): busca + pessoas
// agrupadas em Gestão/Produção. O cabeçalho (voltar/título/fechar) é
// responsabilidade de PainelRecados.tsx.

import { useState } from 'react'
import { Search } from 'lucide-react'
import { useRecados } from './RecadosProvider'
import { iniciaisDe } from './formatacao'
import { PERFIL_LABEL } from '@/lib/permissoes'
import type { MembroEquipe } from '@/types'

const PERFIS_GESTAO = new Set(['gestor', 'recepcionista'])

function GrupoPessoas({
  titulo, pessoas, onEscolher,
}: {
  titulo: string
  pessoas: MembroEquipe[]
  onEscolher: (id: string) => void
}) {
  if (pessoas.length === 0) return null
  return (
    <div>
      <p className="px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-fraco">{titulo}</p>
      <ul>
        {pessoas.map(m => (
          <li key={m.id}>
            <button
              onClick={() => onEscolher(m.id)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-superficie-2 text-left transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-marca-suave text-marca-texto flex items-center justify-center text-sm font-semibold shrink-0">
                {iniciaisDe(m.nome)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-conteudo truncate">{m.nome}</div>
                <div className="text-xs text-fraco">{PERFIL_LABEL[m.perfil]}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function NovaConversa() {
  const { equipe, abrirConversa } = useRecados()
  const [busca, setBusca] = useState('')

  const termo = busca.trim().toLowerCase()
  const filtrada = termo ? equipe.filter(m => m.nome.toLowerCase().includes(termo)) : equipe
  const gestao = filtrada.filter(m => PERFIS_GESTAO.has(m.perfil))
  const producao = filtrada.filter(m => !PERFIS_GESTAO.has(m.perfil))

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="px-5 pt-4 pb-2 shrink-0">
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

      {filtrada.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-suave">Nenhuma pessoa com esse nome.</p>
      ) : (
        <>
          <GrupoPessoas titulo="Gestão" pessoas={gestao} onEscolher={abrirConversa} />
          <GrupoPessoas titulo="Produção" pessoas={producao} onEscolher={abrirConversa} />
        </>
      )}
    </div>
  )
}
