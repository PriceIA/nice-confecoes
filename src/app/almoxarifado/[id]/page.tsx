'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import { AlertTriangle, ArrowLeft, Pencil, Power, RotateCcw, MapPin, SlidersHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { useMembro } from '@/components/AuthProvider'
import {
  CATEGORIA_LABEL, UNIDADE_LABEL, atualizarMaterial, formatarQuantidade, getMaterial, getMovimentos, situacaoMaterial,
} from '@/lib/almoxarifado'
import { moeda } from '@/lib/helpers'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import { useSkeletonDelay } from '@/lib/hooks'
import EsqueletoBarra from '@/components/EsqueletoBarra'
import Modal from '@/components/kanban/Modal'
import MaterialModal from '@/components/almoxarifado/MaterialModal'
import AjustarModal from '@/components/almoxarifado/AjustarModal'
import { AbasAlmoxarifado, BadgeSituacao, BadgeTipo } from '@/components/almoxarifado/ui'
import type { Material, MovimentoEstoque, UnidadeMaterial } from '@/types'

const POR_PAGINA = 50

function descreverFalhaCarregar(err: unknown, oque: string): string {
  const f = classificarErro(err)
  const motivo =
    f.tipo === 'offline' ? 'Sem conexão com a internet' :
    f.tipo === 'rede' ? 'Servidor inacessível' :
    f.tipo === 'permissao' ? 'Seu perfil não tem permissão para ver o almoxarifado' :
    `Falha${sufixoCodigo(f)}: ${f.message || 'erro desconhecido'}`
  return `${motivo}, não deu para carregar ${oque}.`
}

function descreverFalhaSalvar(err: unknown, acao: string): string {
  const f = classificarErro(err)
  switch (f.tipo) {
    case 'offline':   return `Sem conexão com a internet, não deu para ${acao}. Nada foi salvo.`
    case 'rede':      return `Servidor inacessível, não deu para ${acao}. Nada foi salvo.`
    case 'permissao': return `Seu perfil não tem permissão para ${acao}. Nada foi salvo.`
    default:          return `Falha ao ${acao}${sufixoCodigo(f)}: ${f.message || 'erro desconhecido'}. Nada foi salvo.`
  }
}

/** "+10 kg" / "−2,5 kg" — com sinal, como está no banco. */
function quantidadeComSinal(q: number, unidade: UnidadeMaterial): string {
  const texto = formatarQuantidade(Math.abs(q), unidade)
  return q > 0 ? `+${texto}` : `−${texto}`
}

export default function MaterialDetalhePage() {
  const params = useParams()
  const id = String(params.id)
  const { permissoes } = useMembro()

  const [material, setMaterial] = useState<Material | null>(null)
  const [naoEncontrado, setNaoEncontrado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const mostrarSkeleton = useSkeletonDelay(carregando)

  const [movimentos, setMovimentos] = useState<MovimentoEstoque[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [carregandoMov, setCarregandoMov] = useState(true)
  const [erroMov, setErroMov] = useState<string | null>(null)
  const mostrarSkeletonMov = useSkeletonDelay(carregandoMov)

  const [editando, setEditando] = useState(false)
  const [ajustando, setAjustando] = useState(false)
  const [confirmarDesativar, setConfirmarDesativar] = useState(false)
  const [salvandoAtivo, setSalvandoAtivo] = useState(false)
  const [erroAtivo, setErroAtivo] = useState<string | null>(null)

  const carregarMaterial = useCallback(async () => {
    setErro(null)
    try {
      const m = await getMaterial(id)
      setMaterial(m)
      setNaoEncontrado(!m)
    } catch (err) {
      setErro(descreverFalhaCarregar(err, 'o material'))
    } finally {
      setCarregando(false)
    }
  }, [id])

  const carregarMovimentos = useCallback(async (p: number) => {
    setCarregandoMov(true)
    setErroMov(null)
    try {
      const r = await getMovimentos({ materialId: id, pagina: p, porPagina: POR_PAGINA })
      setMovimentos(r.movimentos)
      setTotal(r.total)
    } catch (err) {
      setErroMov(descreverFalhaCarregar(err, 'os movimentos'))
    } finally {
      setCarregandoMov(false)
    }
  }, [id])

  useEffect(() => { carregarMaterial() }, [carregarMaterial])
  useEffect(() => { carregarMovimentos(pagina) }, [carregarMovimentos, pagina])

  async function mudarAtivo(ativo: boolean) {
    if (!material) return
    setSalvandoAtivo(true)
    setErroAtivo(null)
    try {
      await atualizarMaterial(material.id, { ativo })
      setConfirmarDesativar(false)
    } catch (err) {
      setErroAtivo(descreverFalhaSalvar(err, ativo ? 'reativar o material' : 'desativar o material'))
    } finally {
      setSalvandoAtivo(false)
      // Recarrega sempre: a tela mostra o que o banco tem, não o que pediu.
      await carregarMaterial()
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  // ── Carregando / erro / não encontrado ─────────────────────────────────────

  if (carregando || erro || naoEncontrado || !material) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Link href="/almoxarifado" className="btn-ghost px-2 -ml-2 w-fit text-sm">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Almoxarifado
        </Link>
        {carregando ? (
          mostrarSkeleton && (
            <div aria-busy="true" className="space-y-4">
              <span role="status" className="sr-only">Carregando material</span>
              <EsqueletoBarra className="h-7 w-64" />
              <EsqueletoBarra className="h-4 w-40" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {Array.from({ length: 4 }).map((_, i) => <EsqueletoBarra key={i} className="h-20 rounded-2xl" />)}
              </div>
            </div>
          )
        ) : erro ? (
          <div role="alert" className="card border-red-200 bg-red-50 flex items-start gap-3 py-3">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm text-red-700 flex-1">{erro}</p>
            <button type="button" onClick={() => { setCarregando(true); carregarMaterial() }}
              className="text-red-700 text-xs font-semibold hover:underline shrink-0">
              Tentar de novo
            </button>
          </div>
        ) : (
          <div className="card text-center py-14">
            <p className="font-semibold text-titulo">Material não encontrado</p>
            <p className="text-sm text-suave mt-1">O link pode estar errado. Material não se exclui, então ele não sumiu do estoque.</p>
            <Link href="/almoxarifado" className="btn-secondary mx-auto mt-4 w-fit">Voltar para o estoque</Link>
          </div>
        )}
      </div>
    )
  }

  const situacao = situacaoMaterial(material)

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Cabeçalho */}
      <div className="space-y-3">
        <Link href="/almoxarifado" className="btn-ghost px-2 -ml-2 w-fit text-sm">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Almoxarifado
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-titulo break-words">
                {material.nome}
                {material.cor && <span className="text-suave font-semibold"> · {material.cor}</span>}
              </h1>
              {!material.ativo && <span className="badge bg-superficie-3 text-suave">Desativado</span>}
            </div>
            <div className="text-sm text-suave mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{CATEGORIA_LABEL[material.categoria]}</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-fraco" aria-hidden="true" />
                {material.local || 'Sem local'}
              </span>
            </div>
          </div>
          {(permissoes.editarAlmoxarifado || permissoes.movimentarEstoque) && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {permissoes.movimentarEstoque && material.ativo && (
                <button type="button" onClick={() => setAjustando(true)} className="btn-primary">
                  <SlidersHorizontal className="w-4 h-4" aria-hidden="true" /> Ajustar estoque
                </button>
              )}
              {permissoes.editarAlmoxarifado && (<>
              <button type="button" onClick={() => setEditando(true)} className="btn-secondary">
                <Pencil className="w-4 h-4" aria-hidden="true" /> Editar
              </button>
              {material.ativo ? (
                <button type="button" onClick={() => { setErroAtivo(null); setConfirmarDesativar(true) }} className="btn-secondary">
                  <Power className="w-4 h-4" aria-hidden="true" /> Desativar
                </button>
              ) : (
                <button type="button" onClick={() => mudarAtivo(true)} disabled={salvandoAtivo} className="btn-secondary">
                  <RotateCcw className="w-4 h-4" aria-hidden="true" /> {salvandoAtivo ? 'Reativando…' : 'Reativar'}
                </button>
              )}
              </>)}
            </div>
          )}
        </div>
      </div>

      <AbasAlmoxarifado />

      {erroAtivo && !confirmarDesativar && (
        <div role="alert" className="card border-red-200 bg-red-50 flex items-start gap-3 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-700 flex-1">{erroAtivo}</p>
          <button type="button" onClick={() => setErroAtivo(null)} className="text-red-700 text-xs font-semibold hover:underline">fechar</button>
        </div>
      )}

      {situacao === 'negativo' && (
        <div className="card border-red-200 bg-red-50 flex items-start gap-3 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-700">
            O saldo ficou negativo: saiu mais do que o sistema tinha registrado. Confira na prateleira e corrija com um ajuste de estoque.
          </p>
        </div>
      )}

      {/* Cards */}
      <div className={clsx('grid grid-cols-2 gap-3 md:gap-4', permissoes.verFinanceiro ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        <div className="card p-4 md:p-5">
          <div className="text-xs text-suave">Saldo</div>
          <div className={clsx('text-2xl font-bold num mt-1', material.saldo < 0 ? 'text-red-700' : 'text-titulo')}>
            {formatarQuantidade(material.saldo, material.unidade)}
          </div>
        </div>
        <div className="card p-4 md:p-5">
          <div className="text-xs text-suave">Mínimo</div>
          <div className="text-2xl font-bold num mt-1 text-titulo">
            {material.estoqueMinimo != null ? formatarQuantidade(material.estoqueMinimo, material.unidade) : <span className="text-base font-medium text-suave">Sem mínimo</span>}
          </div>
        </div>
        <div className="card p-4 md:p-5">
          <div className="text-xs text-suave">Situação</div>
          <div className="mt-2">
            {situacao === 'sem_minimo'
              ? <span className="text-sm text-suave">Sem mínimo cadastrado</span>
              : <BadgeSituacao situacao={situacao} />}
          </div>
        </div>
        {permissoes.verFinanceiro && (
          <div className="card p-4 md:p-5">
            <div className="text-xs text-suave">Custo por {UNIDADE_LABEL[material.unidade]}</div>
            <div className="text-2xl font-bold num mt-1 text-titulo">
              {material.custoUnitario != null ? moeda(material.custoUnitario) : <span className="text-base font-medium text-suave">Não informado</span>}
            </div>
          </div>
        )}
      </div>

      {material.observacoes && (
        <div className="card p-4 md:p-5">
          <div className="text-xs text-suave mb-1">Observações</div>
          <p className="text-sm text-conteudo whitespace-pre-line">{material.observacoes}</p>
        </div>
      )}

      {/* Movimentos */}
      <section className="card p-0 overflow-hidden" aria-busy={carregandoMov} aria-labelledby="titulo-movimentos">
        <div className="px-4 md:px-6 py-4 border-b border-borda flex items-baseline justify-between gap-3">
          <h2 id="titulo-movimentos" className="font-semibold text-titulo">Movimentos</h2>
          {total > 0 && <span className="text-xs text-suave num">{total} {total === 1 ? 'movimento' : 'movimentos'}</span>}
        </div>

        {erroMov ? (
          <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 flex items-start gap-3 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm text-red-700 flex-1">{erroMov}</p>
            <button type="button" onClick={() => carregarMovimentos(pagina)} className="text-red-700 text-xs font-semibold hover:underline shrink-0">
              Tentar de novo
            </button>
          </div>
        ) : mostrarSkeletonMov ? (
          <>
          <span role="status" className="sr-only">Carregando movimentos</span>
          <ul className="divide-y divide-borda" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 px-4 md:px-6 py-4">
                <EsqueletoBarra className="h-4 w-24" />
                <EsqueletoBarra className="h-4 w-16" />
                <EsqueletoBarra className="h-4 w-16 ml-auto" />
              </li>
            ))}
          </ul>
          </>
        ) : carregandoMov && movimentos.length === 0 ? null : movimentos.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-suave">
            Nenhum movimento ainda. O saldo começa a contar na primeira entrada.
          </p>
        ) : (
          <>
            {/* Celular */}
            <ul className="md:hidden divide-y divide-borda">
              {movimentos.map(mv => (
                <li key={mv.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <BadgeTipo tipo={mv.tipo} />
                    <span className={clsx('font-semibold num', mv.quantidade > 0 ? 'text-green-800' : 'text-red-700')}>
                      {quantidadeComSinal(mv.quantidade, material.unidade)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-suave">
                    <span className="num">{format(new Date(mv.criadoEm), 'dd/MM/yyyy HH:mm')} · {mv.feitoPor ?? '—'}</span>
                    {mv.saldoDepois != null && <span className="num">saldo {formatarQuantidade(mv.saldoDepois, material.unidade)}</span>}
                  </div>
                  <ReferenciaMovimento mv={mv} />
                  {mv.observacao && <p className="text-xs text-suave">{mv.observacao}</p>}
                </li>
              ))}
            </ul>

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                    <th scope="col" className="text-left px-6 py-3 font-semibold">Quando</th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold">Tipo</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold">Quantidade</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold">Saldo depois</th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold">Pedido/NF</th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold">Quem</th>
                    <th scope="col" className="text-left px-6 py-3 font-semibold">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {movimentos.map(mv => (
                    <tr key={mv.id}>
                      <td className="px-6 py-3 text-suave num whitespace-nowrap">{format(new Date(mv.criadoEm), 'dd/MM/yyyy HH:mm')}</td>
                      <td className="px-4 py-3"><BadgeTipo tipo={mv.tipo} /></td>
                      <td className={clsx('px-4 py-3 text-right font-semibold num whitespace-nowrap', mv.quantidade > 0 ? 'text-green-800' : 'text-red-700')}>
                        {quantidadeComSinal(mv.quantidade, material.unidade)}
                      </td>
                      <td className="px-4 py-3 text-right text-suave num whitespace-nowrap">
                        {mv.saldoDepois != null ? formatarQuantidade(mv.saldoDepois, material.unidade) : '—'}
                      </td>
                      <td className="px-4 py-3"><ReferenciaMovimento mv={mv} /></td>
                      <td className="px-4 py-3 text-suave">{mv.feitoPor ?? '—'}</td>
                      <td className="px-6 py-3 text-suave max-w-xs">{mv.observacao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-t border-borda">
                <button type="button" className="btn-secondary text-sm" disabled={pagina <= 1 || carregandoMov}
                  onClick={() => setPagina(p => p - 1)}>
                  Anterior
                </button>
                <span className="text-xs text-suave num">Página {pagina} de {totalPaginas}</span>
                <button type="button" className="btn-secondary text-sm" disabled={pagina >= totalPaginas || carregandoMov}
                  onClick={() => setPagina(p => p + 1)}>
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <AjustarModal
        aberto={ajustando}
        material={material}
        onFechar={() => setAjustando(false)}
        onSalvo={() => { setAjustando(false); carregarMaterial(); setPagina(1); carregarMovimentos(1) }}
      />

      <MaterialModal
        aberto={editando}
        material={material}
        onFechar={() => setEditando(false)}
        onSalvo={() => { setEditando(false); carregarMaterial() }}
      />

      <Modal
        aberto={confirmarDesativar}
        titulo="Desativar material"
        onFechar={() => { if (!salvandoAtivo) setConfirmarDesativar(false) }}
        rodape={
          <>
            <button type="button" className="btn-secondary flex-1 justify-center" disabled={salvandoAtivo}
              onClick={() => setConfirmarDesativar(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-primary flex-1 justify-center" disabled={salvandoAtivo}
              onClick={() => mudarAtivo(false)}>
              {salvandoAtivo ? 'Desativando…' : 'Desativar'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-conteudo">
          <p>
            <strong>{material.nome}{material.cor ? ` ${material.cor}` : ''}</strong> some da lista de estoque e dos
            seletores de entrada e corte.
          </p>
          <p className="text-suave">
            O histórico continua: os movimentos já registrados não se apagam, e dá para reativar depois
            marcando “Mostrar desativados” no estoque.
          </p>
          {erroAtivo && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">{erroAtivo}</p>
          )}
        </div>
      </Modal>
    </div>
  )
}

/** Número do pedido (link) e/ou nota fiscal. */
function ReferenciaMovimento({ mv }: { mv: MovimentoEstoque }) {
  if (!mv.pedidoId && !mv.notaFiscal) return <span className="text-fraco">—</span>
  return (
    <span className="flex flex-wrap gap-x-2 text-xs md:text-sm">
      {mv.pedidoId && (
        <Link href={`/pedidos/${mv.pedidoId}`} className="text-marca-texto font-medium hover:underline num">
          #{mv.numeroPedido ?? 'pedido'}
        </Link>
      )}
      {mv.notaFiscal && <span className="text-suave num">NF {mv.notaFiscal}</span>}
    </span>
  )
}
