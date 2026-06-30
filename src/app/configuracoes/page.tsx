'use client'
import { useEffect, useState } from 'react'
import { PlusCircle, Trash2, Save } from 'lucide-react'
import { CATALOGO, PERSONALIZACOES } from '@/lib/helpers'

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

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-nice-800">Configurações</h1>
        <p className="text-sm text-gray-500 mt-0.5">Personalize o catálogo de peças e as personalizações disponíveis nos pedidos</p>
      </div>

      {/* Seção 1: Catálogo por categoria */}
      <div className="card space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-nice-800 text-base">Tipos de Peça por Categoria</h2>
            <p className="text-xs text-gray-400 mt-0.5">Aparece no seletor de tipo ao criar um novo pedido</p>
          </div>
          <button onClick={salvarCatalogo} className="btn-primary text-sm">
            <Save className="w-4 h-4" />
            {salvoCat ? 'Salvo!' : 'Salvar catálogo'}
          </button>
        </div>

        <div className="space-y-6">
          {Object.entries(catalogo).map(([categoria, tipos]) => (
            <div key={categoria} className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 pb-1 border-b border-gray-100">{categoria}</h3>
              <div className="flex flex-wrap gap-2">
                {tipos.map(tipo => (
                  <span key={tipo}
                    className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-xl">
                    {tipo}
                    <button type="button" onClick={() => removeTipo(categoria, tipo)}
                      className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {tipos.length === 0 && (
                  <span className="text-xs text-gray-400 italic">Nenhum tipo cadastrado</span>
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
            <h2 className="font-semibold text-nice-800 text-base">Personalizações</h2>
            <p className="text-xs text-gray-400 mt-0.5">Técnicas de personalização disponíveis ao criar um pedido</p>
          </div>
          <button onClick={salvarPersonalizacoes} className="btn-primary text-sm">
            <Save className="w-4 h-4" />
            {salvoPerson ? 'Salvo!' : 'Salvar'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {personalizacoes.map(p => (
            <span key={p.value}
              className="flex items-center gap-1.5 bg-nice-50 text-nice-700 text-xs font-medium px-3 py-1.5 rounded-xl border border-nice-200">
              {p.label}
              <button type="button" onClick={() => removePersonalizacao(p.value)}
                className="text-nice-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
          {personalizacoes.length === 0 && (
            <span className="text-xs text-gray-400 italic">Nenhuma personalização cadastrada</span>
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
