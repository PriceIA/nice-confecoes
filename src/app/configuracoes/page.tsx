'use client'
import { useEffect, useState } from 'react'
import { PlusCircle, Trash2, Save, ArrowDown, ArrowUp, Lock } from 'lucide-react'
import { CATALOGO, PERSONALIZACOES } from '@/lib/helpers'
import { atualizarEtapa, carregarEtapas, criarEtapa, removerEtapa } from '@/lib/etapas'
import { classificarErro } from '@/lib/erros'
import type { EtapaProducao } from '@/types'
import clsx from 'clsx'

type CatalogoMap = Record<string, string[]>
type PersonItem = { value: string; label: string }

function defaultCatalogo(): CatalogoMap {
  return Object.fromEntries(Object.entries(CATALOGO).map(([k, v]) => [k, [...v]]))
}

export default function ConfiguracoesPage() {
  const [catalogo, setCatalogo] = useState<CatalogoMap>(defaultCatalogo)
  const [personalizacoes, setPersonalizacoes] = useState<PersonItem[]>([...PERSONALIZACOES])
  const [novoTipo, setNovoTipo] = useState<Record<string, string>>({})
  const [novaPersonalizacao, setNovaPersonalizacao] = useState('')
  const [salvoCat, setSalvoCat] = useState(false)
  const [salvoPerson, setSalvoPerson] = useState(false)

  // Etapas de produção (Fase D3a). Diferente das duas seções acima, ESTA vai
  // para o banco: o fluxo de produção precisa valer em todos os PCs, e o
  // localStorage já é dívida conhecida nas outras duas.
  const [etapas, setEtapas] = useState<EtapaProducao[]>([])
  const [etapasSemente, setEtapasSemente] = useState(true)
  const [novaEtapa, setNovaEtapa] = useState('')
  const [erroEtapas, setErroEtapas] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    const savedCat = localStorage.getItem('nice_catalogo')
    if (savedCat) {
      try { setCatalogo(JSON.parse(savedCat)) } catch {}
    }
    const savedPerson = localStorage.getItem('nice_personalizacoes')
    if (savedPerson) {
      try { setPersonalizacoes(JSON.parse(savedPerson)) } catch {}
    }
  }, [])

  async function recarregarEtapas() {
    try {
      const c = await carregarEtapas()
      setEtapas(c.etapas)
      setEtapasSemente(c.semente)
    } catch (err) {
      falhaEtapas(err, 'carregar as etapas')
    }
  }

  useEffect(() => { recarregarEtapas() }, [])

  function falhaEtapas(err: unknown, acao: string) {
    const f = classificarErro(err)
    const cod = f.code ? ` (${f.code})` : ''
    const motivo =
      f.tipo === 'offline' ? 'Sem conexão com a internet' :
      f.tipo === 'rede' ? 'Servidor inacessível' :
      f.tipo === 'permissao' ? 'Seu perfil não tem permissão' :
      f.tipo === 'validacao' ? `O banco recusou os dados${cod}: ${f.details || f.message}` :
      `Falha${cod}: ${f.message || 'erro desconhecido'}`
    setErroEtapas(`${motivo}, não deu para ${acao}. Nada foi salvo.`)
  }

  /**
   * Toda escrita recarrega do banco antes de redesenhar. É mais lento que
   * atualizar o estado local, e é de propósito: esta tela nunca pode mostrar
   * uma etapa que o banco não tem (regra 10 do CLAUDE.md).
   */
  async function comGravacao(acao: string, fn: () => Promise<unknown>) {
    setOcupado(true)
    setErroEtapas(null)
    try {
      await fn()
    } catch (err) {
      falhaEtapas(err, acao)
    } finally {
      await recarregarEtapas()
      setOcupado(false)
    }
  }

  function moverEtapa(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao
    if (destino < 0 || destino >= etapas.length) return
    const a = etapas[indice]
    const b = etapas[destino]
    // Troca as ordens das duas. É a ordem PADRÃO (a de pedido novo); a ordem
    // de um pedido já criado vive no JSONB dele e não muda com isso.
    comGravacao('mudar a ordem das etapas', async () => {
      await atualizarEtapa(a.chave, { ordem: b.ordem })
      await atualizarEtapa(b.chave, { ordem: a.ordem })
    })
  }

  function addTipo(categoria: string) {
    const nome = (novoTipo[categoria] ?? '').trim()
    if (!nome || catalogo[categoria]?.includes(nome)) return
    setCatalogo(c => ({ ...c, [categoria]: [...(c[categoria] || []), nome] }))
    setNovoTipo(n => ({ ...n, [categoria]: '' }))
  }

  function removeTipo(categoria: string, tipo: string) {
    setCatalogo(c => ({ ...c, [categoria]: c[categoria].filter(t => t !== tipo) }))
  }

  function salvarCatalogo() {
    localStorage.setItem('nice_catalogo', JSON.stringify(catalogo))
    setSalvoCat(true)
    setTimeout(() => setSalvoCat(false), 2500)
  }

  function addPersonalizacao() {
    const nome = novaPersonalizacao.trim()
    if (!nome) return
    const value = nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (personalizacoes.some(p => p.value === value)) return
    setPersonalizacoes(p => [...p, { value, label: nome }])
    setNovaPersonalizacao('')
  }

  function removePersonalizacao(value: string) {
    setPersonalizacoes(p => p.filter(x => x.value !== value))
  }

  function salvarPersonalizacoes() {
    localStorage.setItem('nice_personalizacoes', JSON.stringify(personalizacoes))
    setSalvoPerson(true)
    setTimeout(() => setSalvoPerson(false), 2500)
  }

  // Um fluxo sem nenhuma etapa ativa faria pedido novo nascer vazio — e
  // `resumoProgresso` devolve 100% para progresso vazio, ou seja, o pedido
  // nasceria "pronto". A tela barra a última.
  const ativas = etapas.filter(e => e.ativa).length

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Configurações</h1>
        <p className="text-sm text-suave mt-0.5">Personalize o catálogo de peças e as personalizações disponíveis nos pedidos</p>
      </div>

      {/* Seção 0: Etapas de produção — a única que vai para o BANCO */}
      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold text-titulo">Etapas de produção</h2>
          <p className="text-xs text-suave mt-0.5">
            O fluxo que todo pedido novo recebe. Cada pedido pode ter a própria ordem
            (arrastando em Produção) sem mexer nesta lista.
          </p>
        </div>

        {erroEtapas && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-700 flex-1">{erroEtapas}</p>
            <button type="button" onClick={() => setErroEtapas(null)}
              className="text-red-600 text-xs font-semibold hover:underline">fechar</button>
          </div>
        )}

        {etapasSemente ? (
          <p className="text-sm text-suave bg-superficie-2 border border-borda rounded-xl px-3 py-2">
            Estas são as 8 etapas padrão do sistema. Para poder editá-las e criar etapas
            novas, a migration <code>014_etapas_producao.sql</code> precisa ser executada no
            Supabase.
          </p>
        ) : null}

        <div className="space-y-2">
          {etapas.map((e, i) => (
            <div key={e.chave}
              className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl border border-borda',
                e.ativa ? 'bg-superficie-2' : 'bg-superficie-3 opacity-70')}>
              <div className="flex flex-col print:hidden">
                <button type="button" disabled={i === 0 || etapasSemente || ocupado}
                  onClick={() => moverEtapa(i, -1)} aria-label="Subir"
                  className="text-fraco hover:text-conteudo disabled:opacity-30 disabled:cursor-default">
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button type="button" disabled={i === etapas.length - 1 || etapasSemente || ocupado}
                  onClick={() => moverEtapa(i, 1)} aria-label="Descer"
                  className="text-fraco hover:text-conteudo disabled:opacity-30 disabled:cursor-default">
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>

              <input
                className="input flex-1 py-1.5"
                defaultValue={e.rotulo}
                maxLength={40}
                disabled={etapasSemente || ocupado}
                onBlur={ev => {
                  const novo = ev.target.value.trim()
                  if (!novo || novo === e.rotulo) { ev.target.value = e.rotulo; return }
                  comGravacao('renomear a etapa', () => atualizarEtapa(e.chave, { rotulo: novo }))
                }}
              />

              <button type="button"
                disabled={etapasSemente || ocupado || (e.ativa && ativas <= 1)}
                title={e.ativa && ativas <= 1
                  ? 'O fluxo precisa de pelo menos uma etapa ativa'
                  : undefined}
                onClick={() => comGravacao(e.ativa ? 'desativar a etapa' : 'reativar a etapa',
                  () => atualizarEtapa(e.chave, { ativa: !e.ativa }))}
                className="text-xs font-semibold text-suave hover:text-conteudo disabled:opacity-40 whitespace-nowrap">
                {e.ativa ? 'Desativar' : 'Reativar'}
              </button>

              {e.canonica ? (
                <span title="Etapa original do sistema: não pode ser excluída" className="text-fraco">
                  <Lock className="w-3.5 h-3.5" />
                </span>
              ) : (
                <button type="button" disabled={etapasSemente || ocupado}
                  onClick={() => {
                    if (!confirm(`Excluir "${e.rotulo}" do catálogo?\n\nPedidos que já usam esta etapa continuam com ela.`)) return
                    comGravacao('excluir a etapa', () => removerEtapa(e.chave))
                  }}
                  className="text-red-400 hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Nova etapa (ex: Bordado, Lavanderia)"
            value={novaEtapa} maxLength={40} disabled={etapasSemente || ocupado}
            onChange={ev => setNovaEtapa(ev.target.value)} />
          <button type="button" className="btn-secondary"
            disabled={!novaEtapa.trim() || etapasSemente || ocupado}
            onClick={() => {
              const rotulo = novaEtapa.trim()
              const maior = etapas.reduce((a, e) => Math.max(a, e.ordem), 0)
              setNovaEtapa('')
              comGravacao('criar a etapa', () => criarEtapa(rotulo, maior + 1))
            }}>
            <PlusCircle className="w-4 h-4" /> Adicionar
          </button>
        </div>

        <p className="text-xs text-fraco">
          Desativar tira a etapa dos pedidos NOVOS e do seletor, mas continua nomeando o que
          já está gravado nos pedidos antigos — nenhum pedido existente perde etapa por causa
          disso. Use isso para tirar do fluxo padrão o que a Nice quase nunca faz (sublimação,
          por exemplo): a etapa continua disponível para adicionar num pedido específico.
          Excluir só é possível para etapas criadas aqui — as 8 originais têm cadeado, e a
          trava vale no banco, não só neste botão.
        </p>
      </div>

      {/* Seção 1: Catálogo por categoria */}
      <div className="card space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-titulo text-base">Tipos de Peça por Categoria</h2>
            <p className="text-xs text-fraco mt-0.5">Aparece no seletor de tipo ao criar um novo pedido</p>
          </div>
          <button onClick={salvarCatalogo} className="btn-primary text-sm">
            <Save className="w-4 h-4" />
            {salvoCat ? 'Salvo!' : 'Salvar catálogo'}
          </button>
        </div>

        <div className="space-y-6">
          {Object.entries(catalogo).map(([categoria, tipos]) => (
            <div key={categoria} className="space-y-3">
              <h3 className="text-sm font-semibold text-conteudo pb-1 border-b border-borda">{categoria}</h3>
              <div className="flex flex-wrap gap-2">
                {tipos.map(tipo => (
                  <span key={tipo}
                    className="flex items-center gap-1.5 bg-superficie-3 text-conteudo text-xs font-medium px-3 py-1.5 rounded-xl">
                    {tipo}
                    <button type="button" onClick={() => removeTipo(categoria, tipo)}
                      className="text-fraco hover:text-red-500 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {tipos.length === 0 && (
                  <span className="text-xs text-fraco italic">Nenhum tipo cadastrado</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder={`Novo tipo em ${categoria}...`}
                  value={novoTipo[categoria] ?? ''}
                  onChange={e => setNovoTipo(n => ({ ...n, [categoria]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addTipo(categoria)}
                />
                <button type="button" onClick={() => addTipo(categoria)} className="btn-secondary text-sm">
                  <PlusCircle className="w-4 h-4" /> Adicionar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seção 2: Personalizações */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-titulo text-base">Personalizações</h2>
            <p className="text-xs text-fraco mt-0.5">Técnicas de personalização disponíveis ao criar um pedido</p>
          </div>
          <button onClick={salvarPersonalizacoes} className="btn-primary text-sm">
            <Save className="w-4 h-4" />
            {salvoPerson ? 'Salvo!' : 'Salvar'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {personalizacoes.map(p => (
            <span key={p.value}
              className="flex items-center gap-1.5 bg-marca-suave text-marca-texto text-xs font-medium px-3 py-1.5 rounded-xl border border-marca-borda">
              {p.label}
              <button type="button" onClick={() => removePersonalizacao(p.value)}
                className="text-nice-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
          {personalizacoes.length === 0 && (
            <span className="text-xs text-fraco italic">Nenhuma personalização cadastrada</span>
          )}
        </div>

        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="Nova personalização (ex: Estampa Digital)..."
            value={novaPersonalizacao}
            onChange={e => setNovaPersonalizacao(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPersonalizacao()}
          />
          <button type="button" onClick={addPersonalizacao} className="btn-secondary text-sm">
            <PlusCircle className="w-4 h-4" /> Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}
