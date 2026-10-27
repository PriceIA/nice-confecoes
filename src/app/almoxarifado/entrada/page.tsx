'use client'
// K3 — Entrada (compra recebida). Registra uma compra inteira num único insert:
// ou entram todas as linhas, ou nenhuma. Se falhar, o formulário NÃO é limpo
// (regra 10: a tela nunca mostra o que o banco não tem).

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, PlusCircle, Trash2 } from 'lucide-react'
import { useMembro } from '@/components/AuthProvider'
import {
  CATEGORIAS_ATIVAS, UNIDADE_LABEL, formatarQuantidade, getFornecedores, getMateriais,
  registrarMovimentos, situacaoMaterial,
} from '@/lib/almoxarifado'
import { moeda } from '@/lib/helpers'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import MaterialModal from '@/components/almoxarifado/MaterialModal'
import SeletorPedido from '@/components/almoxarifado/SeletorPedido'
import { AbasAlmoxarifado, guardarAviso, lerNumero, nomeMaterial } from '@/components/almoxarifado/ui'
import type { Material, PedidoLista } from '@/types'

type Linha = { chave: number; materialId: string; quantidade: string; custo: string }

let proximaChave = 1
const linhaVazia = (): Linha => ({ chave: proximaChave++, materialId: '', quantidade: '', custo: '' })

function descreverFalhaGravar(err: unknown): string {
  const f = classificarErro(err)
  const motivo =
    f.tipo === 'offline' ? 'Sem conexão com a internet' :
    f.tipo === 'rede' ? 'Servidor inacessível' :
    f.tipo === 'permissao' ? 'Seu perfil não tem permissão para registrar entrada' :
    `Falha${sufixoCodigo(f)}: ${f.message || 'erro desconhecido'}`
  return `${motivo}. A entrada NÃO foi registrada — o que você preencheu continua aqui, confira e tente de novo.`
}

export default function EntradaPage() {
  const router = useRouter()
  const { permissoes } = useMembro()

  const [materiais, setMateriais] = useState<Material[]>([])
  const [fornecedores, setFornecedores] = useState<string[]>([])
  const [erroCarregar, setErroCarregar] = useState<string | null>(null)

  const [fornecedor, setFornecedor] = useState('')
  const [nota, setNota] = useState('')
  const [pedido, setPedido] = useState<PedidoLista | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()])

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [cadastrando, setCadastrando] = useState<number | null>(null) // chave da linha que abriu o cadastro

  useEffect(() => {
    getMateriais()
      .then(r => setMateriais(r.filter(m => (CATEGORIAS_ATIVAS as string[]).includes(m.categoria))))
      .catch(() => setErroCarregar('Não deu para carregar os materiais. Recarregue a página.'))
    // Sugestão de fornecedor é conforto: se falhar, o campo continua livre.
    getFornecedores().then(setFornecedores).catch(() => {})
  }, [])

  const porId = useMemo(() => new Map(materiais.map(m => [m.id, m])), [materiais])

  function mudar(chave: number, campo: keyof Omit<Linha, 'chave'>, valor: string) {
    setLinhas(ls => ls.map(l => (l.chave === chave ? { ...l, [campo]: valor } : l)))
  }

  // Cálculo de cada linha: quantidade lida, saldo depois, subtotal.
  const calculo = linhas.map(l => {
    const m = porId.get(l.materialId)
    const q = lerNumero(l.quantidade)
    const c = lerNumero(l.custo)
    const qOk = q != null && !Number.isNaN(q) && q > 0
    return {
      linha: l, material: m, q, c, qOk,
      saldoDepois: m && qOk ? m.saldo + (q as number) : null,
      subtotal: qOk && c != null && !Number.isNaN(c) ? (q as number) * c : null,
    }
  })
  const totalCompra = calculo.reduce((s, c) => s + (c.subtotal ?? 0), 0)

  function validar(): string | null {
    const preenchidas = calculo.filter(c => c.linha.materialId || c.linha.quantidade.trim())
    if (preenchidas.length === 0) return 'Adicione pelo menos um material com a quantidade recebida.'
    const vistos = new Set<string>()
    for (const c of preenchidas) {
      if (!c.linha.materialId) return 'Tem uma linha sem material escolhido.'
      if (!c.qOk) return `Confira a quantidade de ${nomeMaterial(c.material!)}: precisa ser um número maior que zero.`
      if (c.c != null && Number.isNaN(c.c)) return `Confira o custo de ${nomeMaterial(c.material!)}: não é um número.`
      if (vistos.has(c.linha.materialId)) {
        return `${nomeMaterial(c.material!)} aparece em duas linhas. Junte numa linha só.`
      }
      vistos.add(c.linha.materialId)
    }
    return null
  }

  async function confirmar() {
    const problema = validar()
    if (problema) { setErro(problema); return }
    setErro(null)
    setSalvando(true)
    try {
      const validas = calculo.filter(c => c.linha.materialId && c.qOk)
      const r = await registrarMovimentos(validas.map(c => ({
        materialId: c.linha.materialId,
        tipo: 'entrada' as const,
        quantidade: c.q as number,
        pedidoId: pedido?.id ?? null,
        fornecedor,
        notaFiscal: nota,
        // Quem não vê R$ nunca manda custo (e o banco descarta se vier, migration 020).
        custoUnitario: permissoes.verFinanceiro && c.c != null && !Number.isNaN(c.c) ? c.c : null,
      })))
      const n = validas.length
      guardarAviso(
        `Entrada registrada: ${n} ${n === 1 ? 'item' : 'itens'}` +
        (r.falhaCusto ? '. Atenção: o último custo do material não foi atualizado.' : '.'),
      )
      router.push('/almoxarifado')
    } catch (err) {
      setErro(descreverFalhaGravar(err))
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Registrar entrada</h1>
        <p className="text-sm text-suave mt-0.5">Compra recebida: o que chegou, em quilos ou metros.</p>
      </div>

      <AbasAlmoxarifado />

      {erroCarregar && (
        <div role="alert" className="card border-red-200 bg-red-50 flex items-start gap-3 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-700">{erroCarregar}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-6">
          {/* Cabeçalho da compra */}
          <section className="card space-y-4" aria-labelledby="t-compra">
            <h2 id="t-compra" className="font-semibold text-titulo">Dados da compra</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="fornecedor">Fornecedor</label>
                <input id="fornecedor" className="input" list="lista-fornecedores" value={fornecedor}
                  onChange={e => setFornecedor(e.target.value)} autoComplete="off" />
                <datalist id="lista-fornecedores">
                  {fornecedores.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="nota">Nota fiscal <span className="text-fraco font-normal">(opcional)</span></label>
                <input id="nota" className="input" value={nota} onChange={e => setNota(e.target.value)} autoComplete="off" />
              </div>
            </div>
            <SeletorPedido
              valor={pedido}
              onChange={setPedido}
              rotulo="Comprado para o pedido (opcional)"
              textoSemPedido="Sem pedido (compra para estoque)"
            />
            <p className="text-xs text-suave">
              Escolhendo o pedido, a tela de Fechar corte já vem com este material preenchido.
            </p>
          </section>

          {/* Itens */}
          <section className="card space-y-4" aria-labelledby="t-itens">
            <h2 id="t-itens" className="font-semibold text-titulo">Itens recebidos</h2>

            <ul className="space-y-4">
              {calculo.map(({ linha, material, subtotal }, i) => (
                <li key={linha.chave} className="rounded-xl border border-borda p-3 md:p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <label className="label" htmlFor={`mat-${linha.chave}`}>Material</label>
                      <select id={`mat-${linha.chave}`} className="input" value={linha.materialId}
                        onChange={e => mudar(linha.chave, 'materialId', e.target.value)}>
                        <option value="">Escolha o material…</option>
                        {materiais.map(m => (
                          <option key={m.id} value={m.id}>{nomeMaterial(m)} ({UNIDADE_LABEL[m.unidade]})</option>
                        ))}
                      </select>
                    </div>
                    {linhas.length > 1 && (
                      <button type="button" className="btn-icone text-suave mt-6"
                        aria-label={`Remover o item ${i + 1}`}
                        onClick={() => setLinhas(ls => ls.filter(l => l.chave !== linha.chave))}>
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className={permissoes.verFinanceiro ? 'grid gap-3 sm:grid-cols-3' : 'grid gap-3 sm:grid-cols-1'}>
                    <div>
                      <label className="label" htmlFor={`qtd-${linha.chave}`}>
                        Quantidade{material ? ` (${UNIDADE_LABEL[material.unidade]})` : ''}
                      </label>
                      <input id={`qtd-${linha.chave}`} className="input num" inputMode="decimal"
                        value={linha.quantidade} onChange={e => mudar(linha.chave, 'quantidade', e.target.value)} />
                    </div>
                    {permissoes.verFinanceiro && (
                      <>
                        <div>
                          <label className="label" htmlFor={`custo-${linha.chave}`}>
                            Custo{material ? ` por ${UNIDADE_LABEL[material.unidade]}` : ''} <span className="text-fraco font-normal">(opcional)</span>
                          </label>
                          <input id={`custo-${linha.chave}`} className="input num" inputMode="decimal"
                            value={linha.custo} onChange={e => mudar(linha.chave, 'custo', e.target.value)} />
                        </div>
                        <div>
                          <span className="label">Subtotal</span>
                          <div className="input num flex items-center bg-superficie-2 text-suave">
                            {subtotal != null ? moeda(subtotal) : '—'}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn-secondary" onClick={() => setLinhas(ls => [...ls, linhaVazia()])}>
                <PlusCircle className="w-4 h-4" aria-hidden="true" /> Adicionar item
              </button>
              {permissoes.editarAlmoxarifado ? (
                <button type="button" className="text-sm font-medium text-marca-texto hover:underline"
                  onClick={() => setCadastrando(linhas[linhas.length - 1]?.chave ?? 0)}>
                  Material não está na lista? Cadastrar
                </button>
              ) : (
                <span className="text-sm text-suave">Não achou o tecido? Peça para o Pedro ou a Kalomira cadastrar.</span>
              )}
            </div>
          </section>
        </div>

        {/* Resumo lateral */}
        <aside className="card space-y-4 lg:sticky lg:top-6" aria-labelledby="t-resumo">
          <h2 id="t-resumo" className="font-semibold text-titulo">Como o estoque fica</h2>
          {calculo.filter(c => c.material && c.qOk).length === 0 ? (
            <p className="text-sm text-suave">Preencha material e quantidade para ver o saldo depois da entrada.</p>
          ) : (
            <ul className="space-y-3">
              {calculo.filter(c => c.material && c.qOk).map(c => {
                const m = c.material!
                const saiuDoMinimo =
                  situacaoMaterial(m) !== 'ok' && situacaoMaterial(m) !== 'sem_minimo' &&
                  situacaoMaterial({ saldo: c.saldoDepois!, estoqueMinimo: m.estoqueMinimo }) === 'ok'
                return (
                  <li key={c.linha.chave} className="text-sm">
                    <div className="font-medium text-conteudo">{nomeMaterial(m)}</div>
                    <div className="flex items-center gap-1.5 text-suave num">
                      {formatarQuantidade(m.saldo, m.unidade)}
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="text-conteudo font-semibold">{formatarQuantidade(c.saldoDepois!, m.unidade)}</span>
                    </div>
                    {saiuDoMinimo && <div className="text-xs text-green-800 mt-0.5">Sai de “abaixo do mínimo”.</div>}
                  </li>
                )
              })}
            </ul>
          )}
          {permissoes.verFinanceiro && totalCompra > 0 && (
            <div className="border-t border-borda pt-3 flex justify-between text-sm">
              <span className="text-suave">Total da compra</span>
              <span className="font-semibold text-titulo num">{moeda(totalCompra)}</span>
            </div>
          )}
          {erro && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>
          )}
          <button type="button" className="btn-primary w-full justify-center" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Registrando…' : 'Confirmar entrada'}
          </button>
        </aside>
      </div>

      <MaterialModal
        aberto={cadastrando != null}
        material={null}
        onFechar={() => setCadastrando(null)}
        onSalvo={criado => {
          if (criado) {
            setMateriais(ms => [...ms, criado].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
            // Seleciona o novo na última linha que ainda está sem material (ou na última).
            setLinhas(ls => {
              const alvo = ls.find(l => !l.materialId) ?? ls[ls.length - 1]
              return ls.map(l => (l.chave === alvo.chave ? { ...l, materialId: criado.id } : l))
            })
          }
          setCadastrando(null)
        }}
      />
    </div>
  )
}
