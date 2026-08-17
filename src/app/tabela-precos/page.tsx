'use client'
import { useEffect, useState } from 'react'
import { Save, Info } from 'lucide-react'
import { criarClienteBrowser } from '@/lib/supabase/client'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import { FAIXAS, GRUPOS_PRECO_ESCOLAR } from '@/lib/precosEscolar'

// Fase B: tabela_precos ganhou RLS baseada em auth.uid() — precisa do client
// autenticado (@supabase/ssr), não do singleton anônimo de '@/lib/supabase'.
// Ver CLAUDE.md, "Estado de segurança atual", e src/lib/kanban.ts pro mesmo
// padrão já em uso desde o Kanban.

type PrecoMap = Record<string, number | null>

function makeKey(grupo: string, produto: string, faixa: string) {
  return `${grupo}||${produto}||${faixa}`
}

function defaultPrecos(): PrecoMap {
  const map: PrecoMap = {}
  for (const g of GRUPOS_PRECO_ESCOLAR) {
    for (const p of g.produtos) {
      FAIXAS.forEach((f, i) => {
        const v = p.precos[i]
        if (v !== null && v !== undefined) map[makeKey(g.grupo, p.nome, f)] = v
      })
    }
  }
  return map
}

const LS_KEY = 'nice_tabela_precos'

// Constraint única esperada no banco para o upsert funcionar.
const ON_CONFLICT = 'grupo,produto,faixa_tamanho'

type StatusMsg = { tipo: 'ok' | 'err' | 'local' | 'aviso'; texto: string }

// Toda mensagem de falha deixa explícito que o rascunho ficou só no navegador
// e NÃO foi gravado no banco — salvar local não é salvar no Supabase.
const SO_LOCAL = 'As alterações ficaram só neste navegador e ainda NÃO estão no banco.'

// A classificação do erro vem de @/lib/erros (compartilhada com o Kanban); o
// texto continua aqui, porque a consequência é específica desta tela — o
// rascunho ficou no localStorage.
function descreverErro(err: unknown): StatusMsg {
  const falha = classificarErro(err)
  const cod = sufixoCodigo(falha)

  switch (falha.tipo) {
    case 'offline':
      return { tipo: 'local', texto: `Sem conexão com a internet. ${SO_LOCAL} Salve de novo quando reconectar.` }
    case 'rede':
      return { tipo: 'local', texto: `Servidor inacessível no momento. ${SO_LOCAL} Salve de novo quando a conexão voltar.` }
    // Sem a constraint única, o PostgREST rejeita o ON CONFLICT do upsert.
    case 'conflito':
      return {
        tipo: 'err',
        texto: `O banco não tem a constraint única (${ON_CONFLICT}), necessária para salvar. Nada foi gravado. ${SO_LOCAL} Avise o administrador.`,
      }
    case 'permissao':
      return { tipo: 'err', texto: `Sem permissão para gravar na tabela de preços. Nada foi gravado. ${SO_LOCAL}` }
    case 'validacao':
      return {
        tipo: 'err',
        texto: `O banco rejeitou os dados${cod}: ${falha.details || falha.message || 'valor inválido'}. Nada foi gravado. ${SO_LOCAL}`,
      }
    default:
      return { tipo: 'err', texto: `Erro ao salvar${cod}: ${falha.message || 'falha desconhecida'}. Nada foi gravado. ${SO_LOCAL}` }
  }
}

export default function TabelaPrecosPage() {
  const [precos, setPrecos] = useState<PrecoMap>(defaultPrecos)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<StatusMsg | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      try {
        const supabase = criarClienteBrowser()
        const { data, error } = await supabase.from('tabela_precos').select('grupo, produto, faixa_tamanho, valor')
        if (!error && data && data.length > 0) {
          const map: PrecoMap = defaultPrecos()
          for (const row of data) {
            const key = makeKey(row.grupo, row.produto, row.faixa_tamanho)
            // null aqui é intencional: linha existe no banco sem preço definido.
            map[key] = row.valor != null ? Number(row.valor) : null
          }
          setPrecos(map)
          localStorage.setItem(LS_KEY, JSON.stringify(map))
        } else {
          throw new Error('vazio')
        }
      } catch {
        const saved = localStorage.getItem(LS_KEY)
        if (saved) {
          try { setPrecos(JSON.parse(saved)) } catch {}
        }
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [])

  function updatePreco(key: string, raw: string) {
    const num = parseFloat(raw)
    setPrecos(p => ({ ...p, [key]: isNaN(num) ? null : Math.round(num * 100) / 100 }))
  }

  async function salvar() {
    setSaving(true)
    setStatusMsg(null)
    // Rascunho local primeiro, para não perder digitação se a gravação falhar.
    localStorage.setItem(LS_KEY, JSON.stringify(precos))

    const linhas: { grupo: string; produto: string; faixa_tamanho: string; valor: number; updated_at: string }[] = []
    const puladas: string[] = []
    const now = new Date().toISOString()

    for (const g of GRUPOS_PRECO_ESCOLAR) {
      for (const p of g.produtos) {
        FAIXAS.forEach((f, i) => {
          // Combinação que não existe no catálogo: nunca teve célula editável.
          if (p.precos[i] === null) return
          const val = precos[makeKey(g.grupo, p.nome, f)]
          if (val == null) {
            // Preço vazio não é instrução de apagar: a linha fica intocada no
            // banco (sem insert e sem delete) e o usuário é avisado.
            puladas.push(`${p.nome} (${f})`)
            return
          }
          linhas.push({ grupo: g.grupo, produto: p.nome, faixa_tamanho: f, valor: val, updated_at: now })
        })
      }
    }

    try {
      if (linhas.length > 0) {
        const supabase = criarClienteBrowser()
        const { error } = await supabase
          .from('tabela_precos')
          .upsert(linhas, { onConflict: ON_CONFLICT })
        if (error) throw error
      }

      if (puladas.length === 0) {
        setStatusMsg({ tipo: 'ok', texto: `${linhas.length} preço(s) salvos no banco.` })
      } else {
        const amostra = puladas.slice(0, 3).join(', ')
        const resto = puladas.length > 3 ? ` e mais ${puladas.length - 3}` : ''
        setStatusMsg({
          tipo: 'aviso',
          texto: `${linhas.length} preço(s) salvos. ${puladas.length} linha(s) não foram alteradas por estarem com o preço vazio — o valor que já estava no banco foi mantido: ${amostra}${resto}.`,
        })
      }
    } catch (err) {
      setStatusMsg(descreverErro(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-fraco text-sm p-8">Carregando tabela de preços...</div>
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Tabela de Preços</h1>
        <p className="text-sm text-suave mt-0.5">Preços de confecção por produto e faixa de tamanho</p>
      </div>

      {/* Nota de escopo */}
      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-yellow-600" />
        <span>
          <strong>Tabela de preços — Escolar.</strong>{' '}
          As categorias Empresarial, Esportivo e Acessórios ainda não têm preço cadastrado;
          terão tabelas próprias quando os valores forem definidos.
        </span>
      </div>

      {/* Cards por grupo */}
      {GRUPOS_PRECO_ESCOLAR.map(grupo => (
        <div key={grupo.grupo} className="card p-0 overflow-hidden">
          <div className="bg-nice-600 px-5 py-3">
            <h2 className="text-white font-bold text-sm tracking-wide uppercase">{grupo.grupo}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                  <th className="text-left px-5 py-2.5 font-semibold min-w-48">Produto</th>
                  {FAIXAS.map(f => (
                    <th key={f} className="text-center px-3 py-2.5 font-semibold whitespace-nowrap">{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {grupo.produtos.map(prod => (
                  <tr key={prod.nome} className="hover:bg-superficie-2 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-conteudo whitespace-nowrap">{prod.nome}</td>
                    {FAIXAS.map((f, fi) => {
                      if (prod.precos[fi] === null) {
                        return (
                          <td key={f} className="px-3 py-2 text-center">
                            <span className="text-fraco text-sm">—</span>
                          </td>
                        )
                      }
                      const key = makeKey(grupo.grupo, prod.nome, f)
                      return (
                        <td key={f} className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="w-20 text-center border border-borda rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-nice-400 focus:border-nice-400 bg-superficie"
                            value={precos[key] ?? ''}
                            onChange={e => updatePreco(key, e.target.value)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Botão salvar fixo */}
      <div className="fixed bottom-0 left-0 md:left-60 right-0 bg-superficie border-t border-borda px-6 py-4 flex items-start justify-between gap-4 z-30">
        <div className="text-sm flex-1 min-w-0" role="status" aria-live="polite">
          {statusMsg?.tipo === 'ok'    && <span className="text-green-600 font-medium">{statusMsg.texto}</span>}
          {statusMsg?.tipo === 'aviso' && <span className="text-yellow-700 font-medium">{statusMsg.texto}</span>}
          {statusMsg?.tipo === 'local' && <span className="text-orange-500 font-medium">{statusMsg.texto}</span>}
          {statusMsg?.tipo === 'err'   && <span className="text-red-600 font-medium">{statusMsg.texto}</span>}
        </div>
        <button onClick={salvar} disabled={saving} className="btn-primary shrink-0">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
