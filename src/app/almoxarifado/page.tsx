'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Search, PackagePlus, Scissors, PlusCircle, Layers, Ruler, CircleDollarSign, ChevronRight, X,
} from 'lucide-react'
import clsx from 'clsx'
import { useMembro } from '@/components/AuthProvider'
import {
  CATEGORIAS_ATIVAS, CATEGORIA_LABEL, formatarQuantidade, getMateriais, situacaoMaterial,
  type SituacaoMaterial,
} from '@/lib/almoxarifado'
import { moeda } from '@/lib/helpers'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import { useSkeletonDelay } from '@/lib/hooks'
import EsqueletoBarra from '@/components/EsqueletoBarra'
import MaterialModal from '@/components/almoxarifado/MaterialModal'
import { AbasAlmoxarifado, BadgeSituacao, lerAviso } from '@/components/almoxarifado/ui'
import type { CategoriaMaterial, Material } from '@/types'

const PREFS_CHAVE = 'nice-filtros-almoxarifado'

/** Negativo primeiro, depois abaixo do mínimo, depois o resto — o que precisa de atenção no topo. */
const PESO_SITUACAO: Record<SituacaoMaterial, number> = { negativo: 0, abaixo: 1, ok: 2, sem_minimo: 2 }

type FiltroCategoria = 'todas' | CategoriaMaterial

/** Mesmo padrão das outras listas (/pedidos, /terceirizadas…): cópia local, não compartilhada. */
function descreverFalhaCarregar(err: unknown): string {
  const f = classificarErro(err)
  const motivo =
    f.tipo === 'offline' ? 'Sem conexão com a internet' :
    f.tipo === 'rede' ? 'Servidor inacessível' :
    f.tipo === 'permissao' ? 'Seu perfil não tem permissão para ver o almoxarifado' :
    `Falha${sufixoCodigo(f)}: ${f.message || 'erro desconhecido'}`
  return `${motivo}, não deu para carregar o estoque.`
}

/** "Malha PV · Branco" — sem o ponto quando o material não tem cor. */
function nomeCompleto(m: Pick<Material, 'nome' | 'cor'>): string {
  return m.cor ? `${m.nome} · ${m.cor}` : m.nome
}

export default function AlmoxarifadoPage() {
  const router = useRouter()
  const { permissoes } = useMembro()

  const [materiais, setMateriais] = useState<Material[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const mostrarSkeleton = useSkeletonDelay(carregando)

  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<FiltroCategoria>('todas')
  const [soAbaixo, setSoAbaixo] = useState(false)
  const [mostrarDesativados, setMostrarDesativados] = useState(false)

  const [modalAberto, setModalAberto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  // Aviso deixado por Entrada/Corte ao voltar para cá. Lê e apaga: aparece uma vez.
  // `if (a)`: no modo de desenvolvimento o React roda o efeito duas vezes, e a
  // segunda leitura (já vazia) apagaria o aviso que a primeira acabou de mostrar.
  useEffect(() => {
    const a = lerAviso()
    if (a) setAviso(a)
  }, [])

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      // Sempre com os desativados: o checkbox filtra aqui na tela, sem ir ao
      // banco de novo. A lista é pequena (um registro por tecido + cor).
      setMateriais(await getMateriais({ incluirInativos: true }))
    } catch (err) {
      setErro(descreverFalhaCarregar(err))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Filtros guardados como em /producao. A busca NÃO é guardada: uma busca
  // salva esconderia material logo ao abrir a tela.
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(PREFS_CHAVE)
      if (!bruto) return
      const p = JSON.parse(bruto) as { categoria?: string; soAbaixo?: boolean; mostrarDesativados?: boolean }
      if (p.categoria && (p.categoria === 'todas' || (CATEGORIAS_ATIVAS as string[]).includes(p.categoria))) {
        setCategoria(p.categoria as FiltroCategoria)
      }
      if (typeof p.soAbaixo === 'boolean') setSoAbaixo(p.soAbaixo)
      if (typeof p.mostrarDesativados === 'boolean') setMostrarDesativados(p.mostrarDesativados)
    } catch {
      // localStorage corrompido ou indisponível: segue com os padrões.
    }
  }, [])

  function guardarPrefs(novos: { categoria?: FiltroCategoria; soAbaixo?: boolean; mostrarDesativados?: boolean }) {
    const prefs = {
      categoria: novos.categoria ?? categoria,
      soAbaixo: novos.soAbaixo ?? soAbaixo,
      mostrarDesativados: novos.mostrarDesativados ?? mostrarDesativados,
    }
    setCategoria(prefs.categoria)
    setSoAbaixo(prefs.soAbaixo)
    setMostrarDesativados(prefs.mostrarDesativados)
    try {
      localStorage.setItem(PREFS_CHAVE, JSON.stringify(prefs))
    } catch {
      // Sem localStorage a escolha vale só nesta sessão — não é motivo de erro na tela.
    }
  }

  // Os cards olham o estoque inteiro (só ativos), não o filtro: são o resumo do almoxarifado.
  const resumo = useMemo(() => {
    const ativos = materiais.filter(m => m.ativo)
    let malhaKg = 0
    let tecidoM = 0
    let atencao = 0
    let valor = 0
    for (const m of ativos) {
      if (m.categoria === 'malha' && m.unidade === 'kg') malhaKg += m.saldo
      if (m.categoria === 'tecido_plano' && m.unidade === 'm') tecidoM += m.saldo
      const s = situacaoMaterial(m)
      if (s === 'abaixo' || s === 'negativo') atencao++
      if (m.custoUnitario != null && m.saldo > 0) valor += m.saldo * m.custoUnitario
    }
    return { malhaKg, tecidoM, atencao, valor }
  }, [materiais])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return materiais
      .filter(m => mostrarDesativados || m.ativo)
      .filter(m => categoria === 'todas' || m.categoria === categoria)
      .filter(m => {
        if (!soAbaixo) return true
        const s = situacaoMaterial(m)
        return s === 'abaixo' || s === 'negativo'
      })
      .filter(m => !q
        || m.nome.toLowerCase().includes(q)
        || m.cor.toLowerCase().includes(q)
        || (m.local ?? '').toLowerCase().includes(q))
      .sort((a, b) =>
        PESO_SITUACAO[situacaoMaterial(a)] - PESO_SITUACAO[situacaoMaterial(b)]
        || a.nome.localeCompare(b.nome, 'pt-BR')
        || a.cor.localeCompare(b.cor, 'pt-BR'))
  }, [materiais, busca, categoria, soAbaixo, mostrarDesativados])

  const filtrando = busca.trim() !== '' || categoria !== 'todas' || soAbaixo
  const nenhumCadastrado = !carregando && !erro && materiais.length === 0

  function limparFiltros() {
    setBusca('')
    guardarPrefs({ categoria: 'todas', soAbaixo: false })
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Almoxarifado</h1>
          <p className="text-sm text-suave mt-0.5">Estoque de malha e tecido</p>
        </div>
        {permissoes.movimentarEstoque && (
          <div className="flex flex-wrap gap-2">
            <Link href="/almoxarifado/entrada" className="btn-primary">
              <PackagePlus className="w-4 h-4" aria-hidden="true" /> Registrar entrada
            </Link>
            <Link href="/almoxarifado/corte" className="btn-secondary">
              <Scissors className="w-4 h-4" aria-hidden="true" /> Fechar corte
            </Link>
          </div>
        )}
      </div>

      <AbasAlmoxarifado />

      {aviso && (
        <div role="status" className="card border-green-200 bg-green-50 flex items-start gap-3 py-3">
          <p className="text-sm text-green-800 flex-1">{aviso}</p>
          <button type="button" onClick={() => setAviso(null)} className="text-green-800 text-xs font-semibold hover:underline shrink-0">fechar</button>
        </div>
      )}

      {erro && (
        <div role="alert" className="card border-red-200 bg-red-50 flex items-start gap-3 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-700 flex-1">{erro}</p>
          <button type="button" onClick={() => { setCarregando(true); carregar() }}
            className="text-red-700 text-xs font-semibold hover:underline shrink-0">
            Tentar de novo
          </button>
        </div>
      )}

      {/* Resumo */}
      {!erro && (
        <div
          className={clsx('grid grid-cols-2 gap-3 md:gap-4', permissoes.verFinanceiro ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}
          aria-busy={carregando}
        >
          <CardResumo
            icone={<Layers className="w-5 h-5 text-marca-texto" aria-hidden="true" />}
            fundoIcone="bg-marca-suave"
            valor={formatarQuantidade(resumo.malhaKg, 'kg')}
            rotulo="Malha em estoque"
            carregando={carregando}
              esqueleto={mostrarSkeleton}
          />
          <CardResumo
            icone={<Ruler className="w-5 h-5 text-marca-texto" aria-hidden="true" />}
            fundoIcone="bg-marca-suave"
            valor={formatarQuantidade(resumo.tecidoM, 'm')}
            rotulo="Tecido plano em estoque"
            carregando={carregando}
              esqueleto={mostrarSkeleton}
          />
          <CardResumo
            icone={<AlertTriangle className={clsx('w-5 h-5', resumo.atencao > 0 ? 'text-red-600' : 'text-fraco')} aria-hidden="true" />}
            fundoIcone={resumo.atencao > 0 ? 'bg-red-50' : 'bg-superficie-3'}
            valor={String(resumo.atencao)}
            rotulo={resumo.atencao === 1 ? 'Material abaixo do mínimo' : 'Materiais abaixo do mínimo'}
            destaque={resumo.atencao > 0}
            carregando={carregando}
              esqueleto={mostrarSkeleton}
            acao={resumo.atencao > 0 && !soAbaixo ? () => guardarPrefs({ soAbaixo: true }) : undefined}
            rotuloAcao="Ver só estes"
          />
          {permissoes.verFinanceiro && (
            <CardResumo
              icone={<CircleDollarSign className="w-5 h-5 text-marca-texto" aria-hidden="true" />}
              fundoIcone="bg-marca-suave"
              valor={moeda(resumo.valor)}
              rotulo="Valor em estoque"
              carregando={carregando}
              esqueleto={mostrarSkeleton}
            />
          )}
        </div>
      )}

      {/* Lista */}
      {!erro && (
        <div className="card p-0 overflow-hidden" aria-busy={carregando}>
          {/* Filtros */}
          {!nenhumCadastrado && (
            <div className="p-4 border-b border-borda space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-fraco absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Buscar material"
                    className="input pl-9"
                    placeholder="Buscar por nome, cor ou local…"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                  />
                </div>
                {permissoes.editarAlmoxarifado && (
                  <button type="button" onClick={() => setModalAberto(true)} className="btn-secondary justify-center shrink-0">
                    <PlusCircle className="w-4 h-4" aria-hidden="true" /> Novo material
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(['todas', ...CATEGORIAS_ATIVAS] as FiltroCategoria[]).map(c => (
                  <Chip key={c} ativo={categoria === c} onClick={() => guardarPrefs({ categoria: c })}>
                    {c === 'todas' ? 'Todas' : CATEGORIA_LABEL[c]}
                  </Chip>
                ))}
                <span className="w-px h-5 bg-borda mx-1" aria-hidden="true" />
                <Chip ativo={soAbaixo} onClick={() => guardarPrefs({ soAbaixo: !soAbaixo })}>
                  Abaixo do mínimo
                </Chip>
                <label className="flex items-center gap-2 text-xs font-medium text-suave ml-auto cursor-pointer select-none py-1.5">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-nice-500"
                    checked={mostrarDesativados}
                    onChange={e => guardarPrefs({ mostrarDesativados: e.target.checked })}
                  />
                  Mostrar desativados
                </label>
              </div>
            </div>
          )}

          {mostrarSkeleton && <span role="status" className="sr-only">Carregando estoque</span>}
          {mostrarSkeleton ? (
            <ul className="divide-y divide-borda">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center gap-4 px-4 md:px-6 py-4">
                  <EsqueletoBarra className="h-4 w-40" />
                  <EsqueletoBarra className="h-4 w-16 ml-auto" />
                  <EsqueletoBarra className="h-4 w-20 hidden md:block" />
                </li>
              ))}
            </ul>
          ) : carregando ? null : nenhumCadastrado ? (
            <div className="py-16 px-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-superficie-3 flex items-center justify-center mb-3">
                <Layers className="w-6 h-6 text-fraco" aria-hidden="true" />
              </div>
              <p className="font-semibold text-titulo">Nenhum material cadastrado</p>
              {permissoes.editarAlmoxarifado ? (
                <>
                  <p className="text-sm text-suave mt-1 max-w-sm mx-auto">
                    Cadastre cada malha e tecido uma vez, com a cor. O saldo entra depois, pela tela de Entrada.
                  </p>
                  <button type="button" onClick={() => setModalAberto(true)} className="btn-primary mx-auto mt-4">
                    <PlusCircle className="w-4 h-4" aria-hidden="true" /> Cadastrar material
                  </button>
                </>
              ) : (
                <p className="text-sm text-suave mt-1 max-w-sm mx-auto">
                  Peça para o Pedro ou a Kalomira cadastrar os tecidos.
                </p>
              )}
            </div>
          ) : visiveis.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <p className="text-sm text-suave">
                {filtrando ? 'Nenhum material com esse filtro.' : 'Nenhum material ativo. Marque “Mostrar desativados” para ver os outros.'}
              </p>
              {filtrando && (
                <button type="button" onClick={limparFiltros} className="btn-ghost mx-auto mt-2 text-sm">
                  <X className="w-4 h-4" aria-hidden="true" /> Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Celular: lista de cartões */}
              <ul className="md:hidden divide-y divide-borda">
                {visiveis.map(m => (
                  <li key={m.id}>
                    <Link
                      href={`/almoxarifado/${m.id}`}
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-superficie-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marca"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-conteudo truncate">
                          {nomeCompleto(m)}
                          {!m.ativo && <span className="badge bg-superficie-3 text-suave ml-2">Desativado</span>}
                        </div>
                        <div className="text-xs text-suave mt-0.5 flex flex-wrap gap-x-2">
                          <span>{CATEGORIA_LABEL[m.categoria]}</span>
                          {m.local && <span>· {m.local}</span>}
                          {m.estoqueMinimo != null && <span className="num">· mín. {formatarQuantidade(m.estoqueMinimo, m.unidade)}</span>}
                        </div>
                        <div className="mt-1.5"><BadgeSituacao situacao={situacaoMaterial(m)} /></div>
                      </div>
                      <div className={clsx('text-right font-semibold num shrink-0', m.saldo < 0 ? 'text-red-700' : 'text-titulo')}>
                        {formatarQuantidade(m.saldo, m.unidade)}
                      </div>
                      <ChevronRight className="w-4 h-4 text-fraco shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Desktop: tabela */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                      <th scope="col" className="text-left px-6 py-3 font-semibold">Material</th>
                      <th scope="col" className="text-left px-4 py-3 font-semibold">Cor</th>
                      <th scope="col" className="text-right px-4 py-3 font-semibold">Saldo</th>
                      <th scope="col" className="text-right px-4 py-3 font-semibold">Mínimo</th>
                      <th scope="col" className="text-left px-4 py-3 font-semibold">Local</th>
                      {permissoes.verFinanceiro && <th scope="col" className="text-right px-4 py-3 font-semibold">Custo/un.</th>}
                      <th scope="col" className="text-left px-6 py-3 font-semibold">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {visiveis.map(m => (
                      <tr
                        key={m.id}
                        onClick={() => router.push(`/almoxarifado/${m.id}`)}
                        className="hover:bg-superficie-2 cursor-pointer"
                      >
                        <td className="px-6 py-3.5">
                          {/* O link é o alvo de teclado e de leitor de tela; o clique na linha é só atalho de mouse. */}
                          <Link href={`/almoxarifado/${m.id}`} onClick={e => e.stopPropagation()}
                            className="font-medium text-conteudo hover:text-marca-texto rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
                            {m.nome}
                          </Link>
                          <div className="text-xs text-fraco">
                            {CATEGORIA_LABEL[m.categoria]}
                            {!m.ativo && <span className="badge bg-superficie-3 text-suave ml-2">Desativado</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-suave">{m.cor || '—'}</td>
                        <td className={clsx('px-4 py-3.5 text-right font-semibold num whitespace-nowrap', m.saldo < 0 ? 'text-red-700' : 'text-titulo')}>
                          {formatarQuantidade(m.saldo, m.unidade)}
                        </td>
                        <td className="px-4 py-3.5 text-right text-suave num whitespace-nowrap">
                          {m.estoqueMinimo != null ? formatarQuantidade(m.estoqueMinimo, m.unidade) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-suave">{m.local || '—'}</td>
                        {permissoes.verFinanceiro && (
                          <td className="px-4 py-3.5 text-right text-suave num whitespace-nowrap">
                            {m.custoUnitario != null ? moeda(m.custoUnitario) : '—'}
                          </td>
                        )}
                        <td className="px-6 py-3.5"><BadgeSituacao situacao={situacaoMaterial(m)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <MaterialModal
        aberto={modalAberto}
        material={null}
        onFechar={() => setModalAberto(false)}
        onSalvo={criado => {
          setModalAberto(false)
          if (criado) router.push(`/almoxarifado/${criado.id}`)
          else carregar()
        }}
      />
    </div>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={clsx(
        'px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
        ativo ? 'bg-nice-500 text-white' : 'bg-superficie-3 text-suave hover:text-conteudo',
      )}
    >
      {children}
    </button>
  )
}

function CardResumo({
  icone, fundoIcone, valor, rotulo, destaque, carregando, esqueleto, acao, rotuloAcao,
}: {
  icone: React.ReactNode
  fundoIcone: string
  valor: string
  rotulo: string
  destaque?: boolean
  carregando: boolean
  /** Só depois de ~200ms carregando (useSkeletonDelay); antes disso, espaço vazio. */
  esqueleto: boolean
  acao?: () => void
  rotuloAcao?: string
}) {
  return (
    <div className={clsx('card p-4 md:p-5 flex items-center gap-3 md:gap-4 min-w-0', destaque && 'border-red-200')}>
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', fundoIcone)}>{icone}</div>
      <div className="min-w-0">
        {carregando ? (
          esqueleto ? <EsqueletoBarra className="h-6 w-20 mb-1" /> : <div className="h-6 mb-1" aria-hidden="true" />
        ) : (
          <div className={clsx('text-lg md:text-xl font-bold num truncate', destaque ? 'text-red-700' : 'text-titulo')}>{valor}</div>
        )}
        <div className="text-xs text-suave">{rotulo}</div>
        {acao && (
          <button type="button" onClick={acao} className="text-xs font-semibold text-marca-texto hover:underline py-1 -my-0.5">
            {rotuloAcao}
          </button>
        )}
      </div>
    </div>
  )
}
