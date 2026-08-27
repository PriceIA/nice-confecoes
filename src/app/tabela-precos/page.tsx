'use client'
import { useEffect, useMemo, useState } from 'react'
import { Save, Info, Plus, Pencil, Trash2, Table2 } from 'lucide-react'
import { criarClienteBrowser } from '@/lib/supabase/client'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import { FAIXAS, TABELA_PADRAO } from '@/lib/precosEscolar'
import {
  Estrutura, MapaPrecos, ON_CONFLICT, carregarPrecos, chavePreco,
  estruturaSemente, removerGrupo, removerProduto, renomearTabela,
} from '@/lib/tabelasPreco'
import Modal from '@/components/kanban/Modal'

// Fase B: tabela_precos tem RLS baseada em auth.uid() — precisa do client
// autenticado (@supabase/ssr), não do singleton anônimo de '@/lib/supabase'.
//
// Mudança da Fase C2: a GRADE agora vem do banco. Antes, grupo e produto eram
// a constante GRUPOS_PRECO_ESCOLAR e só os valores vinham do Supabase, então
// não havia como cadastrar peça nova sem deploy — e a Nice recebe peça nova
// (dryfit, um modelo que a escola pediu) no meio do atendimento. A constante
// virou semente: só aparece se o banco não devolver nada.
//
// O Modal vem de components/kanban/ — ele foi escrito como reutilizável e o
// comentário de lá previa que outras telas o adotassem. Esta é a primeira.

const LS_KEY = 'nice_tabela_precos_v2'

type StatusMsg = { tipo: 'ok' | 'err' | 'local' | 'aviso'; texto: string }

const SO_LOCAL = 'As alterações ficaram só neste navegador e ainda NÃO estão no banco.'

function descreverErro(err: unknown): StatusMsg {
  const falha = classificarErro(err)
  const cod = sufixoCodigo(falha)

  switch (falha.tipo) {
    case 'offline':
      return { tipo: 'local', texto: `Sem conexão com a internet. ${SO_LOCAL} Salve de novo quando reconectar.` }
    case 'rede':
      return { tipo: 'local', texto: `Servidor inacessível no momento. ${SO_LOCAL} Salve de novo quando a conexão voltar.` }
    case 'conflito':
      return {
        tipo: 'err',
        texto: `O banco não tem a constraint única (${ON_CONFLICT}), necessária para salvar. Rode a migration 012. Nada foi gravado. ${SO_LOCAL}`,
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

/** Estado do modal de texto. `campo2` só é usado ao criar grupo (grupo + 1ª peça). */
type ModalEstado =
  | { tipo: 'nova-tabela' }
  | { tipo: 'renomear-tabela' }
  | { tipo: 'novo-grupo' }
  | { tipo: 'nova-peca'; grupo: string }
  | null

export default function TabelaPrecosPage() {
  const [estrutura, setEstrutura] = useState<Estrutura>({})
  const [precos, setPrecos] = useState<MapaPrecos>({})
  const [existentes, setExistentes] = useState<Set<string>>(new Set())
  const [tabelaAtiva, setTabelaAtiva] = useState<string>(TABELA_PADRAO)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<StatusMsg | null>(null)
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState<ModalEstado>(null)
  const [campo1, setCampo1] = useState('')
  const [campo2, setCampo2] = useState('')
  const [erroModal, setErroModal] = useState<string | null>(null)

  const tabelas = useMemo(() => Object.keys(estrutura).sort(), [estrutura])
  const grupos = estrutura[tabelaAtiva] ?? []

  useEffect(() => {
    (async () => {
      try {
        const r = await carregarPrecos()
        setEstrutura(r.estrutura)
        setPrecos(r.precos)
        setExistentes(r.existentes)
        const nomes = Object.keys(r.estrutura)
        setTabelaAtiva(nomes.includes(TABELA_PADRAO) ? TABELA_PADRAO : (nomes[0] ?? TABELA_PADRAO))
        localStorage.setItem(LS_KEY, JSON.stringify({ estrutura: r.estrutura, precos: r.precos }))
      } catch {
        // Rascunho local é melhor do que tela vazia, mas nunca é o banco: o
        // aviso deixa isso explícito antes de alguém digitar em cima.
        const saved = localStorage.getItem(LS_KEY)
        if (saved) {
          try {
            const j = JSON.parse(saved)
            setEstrutura(j.estrutura ?? {})
            setPrecos(j.precos ?? {})
            setTabelaAtiva(Object.keys(j.estrutura ?? {})[0] ?? TABELA_PADRAO)
          } catch {
            const s = estruturaSemente(); setEstrutura(s.estrutura); setPrecos(s.precos)
          }
        } else {
          const s = estruturaSemente(); setEstrutura(s.estrutura); setPrecos(s.precos)
        }
        setStatusMsg({ tipo: 'local', texto: `Não foi possível ler o banco. Mostrando o último rascunho deste navegador. ${SO_LOCAL}` })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function updatePreco(key: string, raw: string) {
    const num = parseFloat(raw)
    setPrecos(p => ({ ...p, [key]: isNaN(num) ? null : Math.round(num * 100) / 100 }))
  }

  // --- Criação e remoção de estrutura ---

  function abrir(m: ModalEstado, valorInicial = '') {
    setCampo1(valorInicial); setCampo2(''); setErroModal(null); setModal(m)
  }

  function confirmarModal() {
    const nome = campo1.trim()
    if (!nome) { setErroModal('Digite um nome.'); return }

    if (modal?.tipo === 'nova-tabela') {
      if (tabelas.includes(nome)) { setErroModal(`Já existe uma tabela chamada "${nome}".`); return }
      // Copia a ESTRUTURA da tabela ativa com os preços em branco: as tabelas
      // escolares têm o mesmo catálogo e variam só no valor, então começar do
      // zero seria redigitar dezenas de nomes de peça.
      const base = estrutura[tabelaAtiva] ?? []
      setEstrutura(e => ({ ...e, [nome]: base.map(g => ({ grupo: g.grupo, produtos: [...g.produtos] })) }))
      setPrecos(p => {
        const novo = { ...p }
        for (const g of base) for (const prod of g.produtos) for (const f of FAIXAS) {
          novo[chavePreco(nome, g.grupo, prod, f)] = null
        }
        return novo
      })
      setTabelaAtiva(nome)
      setStatusMsg({ tipo: 'aviso', texto: `Tabela "${nome}" criada com as peças de "${tabelaAtiva}" e preços em branco. Digite os valores e clique em Salvar — ela só existe no banco depois disso.` })
      setModal(null)
      return
    }

    if (modal?.tipo === 'renomear-tabela') {
      if (nome === tabelaAtiva) { setModal(null); return }
      if (tabelas.includes(nome)) { setErroModal(`Já existe uma tabela chamada "${nome}".`); return }
      const de = tabelaAtiva
      ;(async () => {
        try {
          await renomearTabela(de, nome)
          await recarregar()
          setTabelaAtiva(nome)
          setStatusMsg({ tipo: 'ok', texto: `Tabela "${de}" renomeada para "${nome}".` })
        } catch (err) { setStatusMsg(descreverErro(err)) }
      })()
      setModal(null)
      return
    }

    if (modal?.tipo === 'novo-grupo') {
      if (grupos.some(g => g.grupo === nome)) { setErroModal(`Já existe um grupo "${nome}" nesta tabela.`); return }
      const primeiraPeca = campo2.trim()
      if (!primeiraPeca) { setErroModal('Informe também a primeira peça do grupo — um grupo vazio não teria o que salvar.'); return }
      setEstrutura(e => ({ ...e, [tabelaAtiva]: [...(e[tabelaAtiva] ?? []), { grupo: nome, produtos: [primeiraPeca] }] }))
      setPrecos(p => {
        const novo = { ...p }
        for (const f of FAIXAS) novo[chavePreco(tabelaAtiva, nome, primeiraPeca, f)] = null
        return novo
      })
      setModal(null)
      return
    }

    if (modal?.tipo === 'nova-peca') {
      const g = grupos.find(x => x.grupo === modal.grupo)
      if (g?.produtos.includes(nome)) { setErroModal(`"${nome}" já existe no grupo ${modal.grupo}.`); return }
      setEstrutura(e => ({
        ...e,
        [tabelaAtiva]: (e[tabelaAtiva] ?? []).map(x =>
          x.grupo === modal.grupo ? { ...x, produtos: [...x.produtos, nome] } : x),
      }))
      setPrecos(p => {
        const novo = { ...p }
        for (const f of FAIXAS) novo[chavePreco(tabelaAtiva, modal.grupo, nome, f)] = null
        return novo
      })
      setModal(null)
      return
    }
  }

  async function recarregar() {
    const r = await carregarPrecos()
    setEstrutura(r.estrutura); setPrecos(r.precos); setExistentes(r.existentes)
  }

  async function excluirPeca(grupo: string, produto: string) {
    if (!confirm(`Remover "${produto}" da tabela ${tabelaAtiva}? Os preços dela nesta tabela são apagados.`)) return
    try {
      await removerProduto(tabelaAtiva, grupo, produto)
      await recarregar()
      setStatusMsg({ tipo: 'ok', texto: `"${produto}" removida de ${tabelaAtiva}.` })
    } catch (err) { setStatusMsg(descreverErro(err)) }
  }

  async function excluirGrupo(grupo: string) {
    if (!confirm(`Remover o grupo "${grupo}" inteiro da tabela ${tabelaAtiva}, com todas as peças e preços dele?`)) return
    try {
      await removerGrupo(tabelaAtiva, grupo)
      await recarregar()
      setStatusMsg({ tipo: 'ok', texto: `Grupo "${grupo}" removido de ${tabelaAtiva}.` })
    } catch (err) { setStatusMsg(descreverErro(err)) }
  }

  // --- Gravação ---

  async function salvar() {
    setSaving(true)
    setStatusMsg(null)
    localStorage.setItem(LS_KEY, JSON.stringify({ estrutura, precos }))

    const linhas: { tabela: string; grupo: string; produto: string; faixa_tamanho: string; valor: number | null; updated_at: string }[] = []
    const puladas: string[] = []
    const now = new Date().toISOString()

    // Percorre TODAS as tabelas, não só a que está na tela: criar uma tabela
    // nova e trocar de aba antes de salvar não pode perder o trabalho.
    for (const [tabela, gs] of Object.entries(estrutura)) {
      for (const g of gs) {
        for (const prod of g.produtos) {
          for (const f of FAIXAS) {
            const k = chavePreco(tabela, g.grupo, prod, f)
            const val = precos[k]
            if (val == null && existentes.has(k)) {
              // A linha já existe no banco e o campo foi esvaziado. Vazio não é
              // ordem de apagar: mantém o que está lá e avisa.
              puladas.push(`${prod} (${f}) em ${tabela}`)
              continue
            }
            linhas.push({ tabela, grupo: g.grupo, produto: prod, faixa_tamanho: f, valor: val ?? null, updated_at: now })
          }
        }
      }
    }

    try {
      if (linhas.length > 0) {
        const supabase = criarClienteBrowser()
        const { error } = await supabase.from('tabela_precos').upsert(linhas, { onConflict: ON_CONFLICT })
        if (error) throw error
      }
      await recarregar()

      if (puladas.length === 0) {
        setStatusMsg({ tipo: 'ok', texto: `${linhas.length} linha(s) salvas no banco.` })
      } else {
        const amostra = puladas.slice(0, 3).join(', ')
        const resto = puladas.length > 3 ? ` e mais ${puladas.length - 3}` : ''
        setStatusMsg({
          tipo: 'aviso',
          texto: `${linhas.length} linha(s) salvas. ${puladas.length} não foram alteradas por estarem com o preço vazio — o valor que já estava no banco foi mantido: ${amostra}${resto}.`,
        })
      }
    } catch (err) {
      setStatusMsg(descreverErro(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-fraco text-sm p-8">Carregando tabelas de preço...</div>
  }

  const tituloModal =
    modal?.tipo === 'nova-tabela' ? 'Nova tabela de preços' :
    modal?.tipo === 'renomear-tabela' ? 'Renomear tabela' :
    modal?.tipo === 'novo-grupo' ? 'Novo grupo' :
    modal?.tipo === 'nova-peca' ? `Nova peça em ${modal.grupo}` : ''

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Tabelas de Preço</h1>
        <p className="text-sm text-suave mt-0.5">Preços por peça e faixa de tamanho, uma tabela por grupo de clientes</p>
      </div>

      {/* Seletor de tabela */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="min-w-56">
          <label className="label flex items-center gap-1.5"><Table2 className="w-3.5 h-3.5" /> Tabela</label>
          <select className="input" value={tabelaAtiva} onChange={e => setTabelaAtiva(e.target.value)}>
            {tabelas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button onClick={() => abrir({ tipo: 'nova-tabela' })} className="btn-secondary">
          <Plus className="w-4 h-4" /> Nova tabela
        </button>
        <button onClick={() => abrir({ tipo: 'renomear-tabela' }, tabelaAtiva)} className="btn-ghost">
          <Pencil className="w-4 h-4" /> Renomear
        </button>
        <button onClick={() => abrir({ tipo: 'novo-grupo' })} className="btn-ghost">
          <Plus className="w-4 h-4" /> Novo grupo
        </button>
      </div>

      <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-yellow-600" />
        <span>
          As tabelas escolares têm as mesmas peças e mudam só no valor — por isso
          <strong> Nova tabela</strong> copia as peças da tabela aberta e deixa os preços em branco.
          Peça sem preço continua podendo ser usada no pedido: o valor unitário é digitado na hora.
        </span>
      </div>

      {grupos.length === 0 && (
        <div className="card text-sm text-suave">
          A tabela <strong>{tabelaAtiva}</strong> ainda não tem nenhum grupo. Use <strong>Novo grupo</strong> acima.
        </div>
      )}

      {grupos.map(grupo => (
        <div key={grupo.grupo} className="card p-0 overflow-hidden">
          <div className="bg-nice-600 px-5 py-3 flex items-center justify-between gap-3">
            <h2 className="text-white font-bold text-sm tracking-wide uppercase">{grupo.grupo}</h2>
            <div className="flex items-center gap-1">
              <button onClick={() => abrir({ tipo: 'nova-peca', grupo: grupo.grupo })}
                className="text-white/80 hover:text-white text-xs flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/10"
                title={`Adicionar peça em ${grupo.grupo}`}>
                <Plus className="w-3.5 h-3.5" /> Peça
              </button>
              <button onClick={() => excluirGrupo(grupo.grupo)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10"
                title={`Remover o grupo ${grupo.grupo}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                  <th className="text-left px-5 py-2.5 font-semibold min-w-48">Peça</th>
                  {FAIXAS.map(f => (
                    <th key={f} className="text-center px-3 py-2.5 font-semibold whitespace-nowrap">{f}</th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {grupo.produtos.map(prod => (
                  <tr key={prod} className="hover:bg-superficie-2 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-conteudo whitespace-nowrap">{prod}</td>
                    {FAIXAS.map(f => {
                      const key = chavePreco(tabelaAtiva, grupo.grupo, prod, f)
                      return (
                        <td key={f} className="px-2 py-1.5 text-center">
                          <input
                            type="number" min={0} step={0.01}
                            placeholder="—"
                            className="w-20 text-center border border-borda rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-nice-400 focus:border-nice-400 bg-superficie"
                            value={precos[key] ?? ''}
                            onChange={e => updatePreco(key, e.target.value)}
                          />
                        </td>
                      )
                    })}
                    <td className="px-2 text-center">
                      <button onClick={() => excluirPeca(grupo.grupo, prod)}
                        className="text-fraco hover:text-red-600 p-1" title={`Remover ${prod}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <Modal
        aberto={modal !== null}
        titulo={tituloModal}
        onFechar={() => setModal(null)}
        rodape={
          <>
            <button onClick={() => setModal(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
            <button onClick={confirmarModal} className="btn-primary flex-1 justify-center">Confirmar</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">
              {modal?.tipo === 'nova-tabela' ? 'Nome da tabela (ex: Escolar 2)'
                : modal?.tipo === 'renomear-tabela' ? 'Novo nome'
                : modal?.tipo === 'novo-grupo' ? 'Nome do grupo (ex: Conjunto Tactel)'
                : 'Nome da peça (ex: Camiseta Dry Fit)'}
            </label>
            <input className="input" autoFocus value={campo1}
              onChange={e => setCampo1(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmarModal() }} />
          </div>
          {modal?.tipo === 'novo-grupo' && (
            <div>
              <label className="label">Primeira peça do grupo</label>
              <input className="input" value={campo2}
                onChange={e => setCampo2(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmarModal() }} />
            </div>
          )}
          {modal?.tipo === 'nova-tabela' && (
            <p className="text-xs text-suave">
              As peças e grupos de <strong>{tabelaAtiva}</strong> serão copiados com os preços em branco.
            </p>
          )}
          {erroModal && <p className="text-sm text-red-600">{erroModal}</p>}
        </div>
      </Modal>

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
