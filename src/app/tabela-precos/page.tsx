'use client'
import { useEffect, useState } from 'react'
import { Save, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const FAIXAS = ['0-02', '04-06', '08-10', '12-14', 'P/M/G', 'GG']

type ProdutoPreco = { nome: string; precos: (number | null)[] }
type GrupoTabela = { grupo: string; produtos: ProdutoPreco[] }

const DADOS_PADRAO: GrupoTabela[] = [
  {
    grupo: 'CAMISETA/REGATA',
    produtos: [
      { nome: 'M Curta',            precos: [26.40, 29.70, 32.30, 34.00, 38.30,  41.80] },
      { nome: 'Regata',             precos: [29.10, 33.70, 39.70, 42.70, 50.40,  52.00] },
      { nome: 'Manga Longa',        precos: [29.80, 32.90, 35.80, 37.50, 42.20,  47.20] },
      { nome: 'Camiseta Algodão',   precos: [48.40, 54.50, 66.60, 71.70, 90.80,  null] },
      { nome: 'Jardineira Curta',   precos: [49.30, 67.80, 76.60, 88.10, 102.90, null] },
    ],
  },
  {
    grupo: 'CONJUNTO HELANÇA',
    produtos: [
      { nome: 'Conjunto Helança',   precos: [94.60,  107.20, 124.60, 145.50, 176.80, 195.00] },
      { nome: 'Blusa',              precos: [57.00,  61.40,  72.30,  82.80,  96.10,  108.50] },
      { nome: 'Blusa c/ Capuz',     precos: [62.00,  71.00,  86.30,  96.10,  108.50, 127.20] },
      { nome: 'Calça',              precos: [37.30,  45.90,  52.10,  62.60,  81.00,  86.30]  },
      { nome: 'Bailarina/Legging',  precos: [37.30,  45.90,  52.10,  62.60,  81.00,  86.30]  },
      { nome: 'Corsário',           precos: [34.40,  36.90,  41.70,  45.70,  53.60,  57.00]  },
    ],
  },
  {
    grupo: 'CONJUNTO MOLETOM',
    produtos: [
      { nome: 'Conjunto Moletom',    precos: [117.00, 140.50, 160.10, 179.60, 214.30, 243.70] },
      { nome: 'Blusa',               precos: [65.40,  80.80,  87.80,  102.50, 121.00, 140.50] },
      { nome: 'Blusa c/ Capuz',      precos: [76.60,  86.40,  97.10,  117.00, 132.30, 158.80] },
      { nome: 'Calça',               precos: [51.50,  59.90,  72.40,  76.60,  93.30,  103.00] },
      { nome: 'Shorts Saia Inteira', precos: [38.00,  41.00,  48.50,  52.50,  58.50,  68.00]  },
      { nome: 'Shorts Saia Meia',    precos: [34.50,  37.50,  44.50,  48.50,  53.00,  62.50]  },
    ],
  },
  {
    grupo: 'CONJUNTO TACTEL',
    produtos: [
      { nome: 'Conjunto Tactel',          precos: [118.25, 142.00, 162.10, 173.80, 215.00, 245.00] },
      { nome: 'Blusa',                    precos: [58.90,  63.30,  89.20,  105.70, 124.00, 145.00] },
      { nome: 'Blusa c/ Capuz',           precos: [77.90,  85.30,  92.40,  115.40, 125.30, 151.90] },
      { nome: 'Calça c/ Forro',           precos: [48.90,  57.40,  71.60,  75.40,  88.70,  98.40]  },
      { nome: 'Calça s/ Forro',           precos: [37.60,  45.80,  52.00,  62.50,  80.60,  86.20]  },
      { nome: 'Bermuda Helança e Tactel', precos: [27.10,  36.20,  39.20,  41.80,  48.00,  58.00]  },
    ],
  },
]

type PrecoMap = Record<string, number | null>

function makeKey(grupo: string, produto: string, faixa: string) {
  return `${grupo}||${produto}||${faixa}`
}

function defaultPrecos(): PrecoMap {
  const map: PrecoMap = {}
  for (const g of DADOS_PADRAO) {
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

export default function TabelaPrecosPage() {
  const [precos, setPrecos] = useState<PrecoMap>(defaultPrecos)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ tipo: 'ok' | 'err' | 'local'; texto: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      try {
        const { data, error } = await supabase.from('tabela_precos').select('grupo, produto, faixa_tamanho, valor')
        if (!error && data && data.length > 0) {
          const map: PrecoMap = defaultPrecos()
          for (const row of data) {
            const v = row.valor != null ? Number(row.valor) : null
            if (v !== null) map[makeKey(row.grupo, row.produto, row.faixa_tamanho)] = v
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
    localStorage.setItem(LS_KEY, JSON.stringify(precos))

    const rows: { grupo: string; produto: string; faixa_tamanho: string; valor: number; updated_at: string }[] = []
    const now = new Date().toISOString()
    for (const g of DADOS_PADRAO) {
      for (const p of g.produtos) {
        FAIXAS.forEach((f, i) => {
          if (p.precos[i] === null) return
          const val = precos[makeKey(g.grupo, p.nome, f)]
          rows.push({ grupo: g.grupo, produto: p.nome, faixa_tamanho: f, valor: val ?? 0, updated_at: now })
        })
      }
    }

    try {
      const { error: delErr } = await supabase.from('tabela_precos').delete().not('grupo', 'is', null)
      if (delErr) throw delErr
      const { error: insErr } = await supabase.from('tabela_precos').insert(rows)
      if (insErr) throw insErr
      setStatusMsg({ tipo: 'ok', texto: 'Alterações salvas com sucesso.' })
    } catch {
      setStatusMsg({ tipo: 'local', texto: 'Supabase indisponível — salvo localmente.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-gray-400 text-sm p-8">Carregando tabela de preços...</div>
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-nice-800">Tabela de Preços</h1>
        <p className="text-sm text-gray-500 mt-0.5">Preços de confecção por produto e faixa de tamanho</p>
      </div>

      {/* Nota de escopo */}
      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-yellow-600" />
        <span>
          <strong>Tabela de preços — Escolar e Empresarial.</strong>{' '}
          As categorias Esportivo e Acessórios terão tabelas próprias em breve.
        </span>
      </div>

      {/* Cards por grupo */}
      {DADOS_PADRAO.map(grupo => (
        <div key={grupo.grupo} className="card p-0 overflow-hidden">
          <div className="bg-nice-600 px-5 py-3">
            <h2 className="text-white font-bold text-sm tracking-wide">{grupo.grupo}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-2.5 font-semibold min-w-48">Produto</th>
                  {FAIXAS.map(f => (
                    <th key={f} className="text-center px-3 py-2.5 font-semibold whitespace-nowrap">{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {grupo.produtos.map(prod => (
                  <tr key={prod.nome} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-gray-700 whitespace-nowrap">{prod.nome}</td>
                    {FAIXAS.map((f, fi) => {
                      if (prod.precos[fi] === null) {
                        return (
                          <td key={f} className="px-3 py-2 text-center">
                            <span className="text-gray-300 text-sm">—</span>
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
                            className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-nice-400 focus:border-nice-400 bg-white"
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
      <div className="fixed bottom-0 left-0 md:left-60 right-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between z-30">
        <div className="text-sm">
          {statusMsg?.tipo === 'ok'    && <span className="text-green-600 font-medium">{statusMsg.texto}</span>}
          {statusMsg?.tipo === 'local' && <span className="text-orange-500 font-medium">{statusMsg.texto}</span>}
          {statusMsg?.tipo === 'err'   && <span className="text-red-600 font-medium">{statusMsg.texto}</span>}
        </div>
        <button onClick={salvar} disabled={saving} className="btn-primary">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
