'use client'
// K4 — Fechar corte (lançar sobra). Feita para o celular primeiro: é a tela do
// Marquinhos no corte. Ele NÃO pesa o que pega, só informa o que sobrou.
//   Usou do estoque → movimento `saida`
//   Sobrou          → movimento `devolucao` (aparece como "Sobra")
// Tudo num único insert (registrarMovimentos). Se falhar, o formulário NÃO é
// limpo (regra 10).

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, PlusCircle, Trash2 } from 'lucide-react'
import {
  CATEGORIAS_ATIVAS, UNIDADE_LABEL, formatarQuantidade, getMaterialDoPedido, getMateriais,
  registrarMovimentos, somarPorUnidade, textoSomaPorUnidade,
} from '@/lib/almoxarifado'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import SeletorPedido from '@/components/almoxarifado/SeletorPedido'
import { AbasAlmoxarifado, guardarAviso, lerNumero, nomeMaterial, numeroParaCampo } from '@/components/almoxarifado/ui'
import type { Material, PedidoLista } from '@/types'

type Linha = {
  chave: number
  origem: 'pedido' | 'extra'
  materialId: string
  /** Só das linhas do pedido: comprado − já saiu (informativo). */
  comprado: number | null
  usou: string
  sobrou: string
}

let proximaChave = 1

function descreverFalhaGravar(err: unknown): string {
  const f = classificarErro(err)
  const motivo =
    f.tipo === 'offline' ? 'Sem conexão com a internet' :
    f.tipo === 'rede' ? 'Servidor inacessível' :
    f.tipo === 'permissao' ? 'Seu perfil não tem permissão para fechar corte' :
    `Falha${sufixoCodigo(f)}: ${f.message || 'erro desconhecido'}`
  return `${motivo}. O corte NÃO foi registrado — o que você preencheu continua aqui, confira e tente de novo.`
}

export default function CortePage() {
  const router = useRouter()

  const [materiais, setMateriais] = useState<Material[]>([])
  const [erroCarregar, setErroCarregar] = useState<string | null>(null)

  const [pedido, setPedido] = useState<PedidoLista | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregandoPedido, setCarregandoPedido] = useState(false)
  const [erroPedido, setErroPedido] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    getMateriais()
      .then(r => setMateriais(r.filter(m => (CATEGORIAS_ATIVAS as string[]).includes(m.categoria))))
      .catch(() => setErroCarregar('Não deu para carregar os materiais. Recarregue a página.'))
  }, [])

  const porId = useMemo(() => new Map(materiais.map(m => [m.id, m])), [materiais])

  // Trocou o pedido: refaz as linhas vindas das compras dele e MANTÉM as de "outro material".
  useEffect(() => {
    let vivo = true
    setErroPedido(null)
    if (!pedido) {
      setLinhas(ls => ls.filter(l => l.origem === 'extra'))
      return
    }
    setCarregandoPedido(true)
    getMaterialDoPedido(pedido.id)
      .then(itens => {
        if (!vivo) return
        const doPedido: Linha[] = itens.map(it => {
          const resta = Math.max(it.comprado - it.jaSaiu, 0)
          return {
            chave: proximaChave++, origem: 'pedido', materialId: it.materialId,
            comprado: resta, usou: resta > 0 ? numeroParaCampo(resta) : '0', sobrou: '0',
          }
        })
        setLinhas(ls => [...doPedido, ...ls.filter(l => l.origem === 'extra')])
      })
      .catch(() => { if (vivo) setErroPedido('Não deu para carregar as compras deste pedido. Escolha o pedido de novo.') })
      .finally(() => { if (vivo) setCarregandoPedido(false) })
    return () => { vivo = false }
  }, [pedido])

  function mudar(chave: number, campo: 'materialId' | 'usou' | 'sobrou', valor: string) {
    setLinhas(ls => ls.map(l => (l.chave === chave ? { ...l, [campo]: valor } : l)))
  }

  const calculo = linhas.map(l => {
    const m = porId.get(l.materialId)
    const usou = lerNumero(l.usou)
    const sobrou = lerNumero(l.sobrou)
    const u = usou == null ? 0 : usou
    const s = sobrou == null ? 0 : sobrou
    return {
      linha: l, material: m, usou: u, sobrou: s,
      invalido: Number.isNaN(u) || Number.isNaN(s) || u < 0 || s < 0,
      ficaNegativo: m != null && u > 0 && m.saldo - u < 0,
    }
  })

  const resumoUsou = textoSomaPorUnidade(
    somarPorUnidade(calculo.filter(c => c.material && !c.invalido).map(c => ({ quantidade: c.usou, material: c.material }))), false)
  const resumoSobrou = textoSomaPorUnidade(
    somarPorUnidade(calculo.filter(c => c.material && !c.invalido).map(c => ({ quantidade: c.sobrou, material: c.material }))), false)

  function validar(): string | null {
    if (!pedido && observacao.trim() === '') {
      return 'Sem pedido, escreva em Observação para que foi usado (amostra, teste, conserto…).'
    }
    const ativas = calculo.filter(c => c.usou !== 0 || c.sobrou !== 0 || c.invalido)
    if (ativas.length === 0) return 'Nada para registrar: preencha o que usou ou o que sobrou de pelo menos um material.'
    for (const c of ativas) {
      if (!c.linha.materialId) return 'Tem uma linha com quantidade mas sem material escolhido.'
      if (c.invalido) return `Confira os números de ${nomeMaterial(c.material!)}: use só valores a partir de zero.`
    }
    return null
  }

  async function confirmar() {
    const problema = validar()
    if (problema) { setErro(problema); return }
    setErro(null)
    setSalvando(true)
    try {
      const lista = calculo.flatMap(c => {
        const base = { materialId: c.linha.materialId, pedidoId: pedido?.id ?? null, observacao }
        const itens = []
        if (c.usou > 0) itens.push({ ...base, tipo: 'saida' as const, quantidade: c.usou })
        if (c.sobrou > 0) itens.push({ ...base, tipo: 'devolucao' as const, quantidade: c.sobrou })
        return itens
      })
      await registrarMovimentos(lista)
      guardarAviso(`Corte fechado: usou ${resumoUsou}, sobrou ${resumoSobrou}.`)
      router.push('/almoxarifado')
    } catch (err) {
      setErro(descreverFalhaGravar(err))
      setSalvando(false)
    }
  }

  function adicionarOutro() {
    setLinhas(ls => [...ls, { chave: proximaChave++, origem: 'extra', materialId: '', comprado: null, usou: '', sobrou: '' }])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Fechar corte</h1>
        <p className="text-sm text-suave mt-0.5">Diga o que usou do estoque e o que sobrou.</p>
      </div>

      <AbasAlmoxarifado />

      {erroCarregar && (
        <div role="alert" className="card border-red-200 bg-red-50 flex items-start gap-3 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-700">{erroCarregar}</p>
        </div>
      )}

      <section className="card space-y-4">
        <SeletorPedido valor={pedido} onChange={setPedido} rotulo="Pedido" textoSemPedido="Sem pedido (uso interno)" />
        {erroPedido && <p role="alert" className="text-sm text-red-700">{erroPedido}</p>}
        <div>
          <label className="label" htmlFor="obs">
            Observação {pedido ? <span className="text-fraco font-normal">(opcional)</span> : <span className="text-red-700">(obrigatória sem pedido)</span>}
          </label>
          <input id="obs" className="input" value={observacao} onChange={e => setObservacao(e.target.value)}
            placeholder={pedido ? '' : 'Amostra, teste, conserto…'} autoComplete="off" />
        </div>
      </section>

      {carregandoPedido && <p role="status" className="text-sm text-suave">Carregando as compras do pedido…</p>}

      {pedido && !carregandoPedido && !erroPedido && linhas.filter(l => l.origem === 'pedido').length === 0 && (
        <p className="text-sm text-suave">
          Nenhuma compra ligada a este pedido. Se o tecido saiu da prateleira, use “Outro material do estoque”.
        </p>
      )}

      <ul className="space-y-4">
        {calculo.map(({ linha, material, ficaNegativo }) => (
          <li key={linha.chave} className="card space-y-4">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                {linha.origem === 'pedido' && material ? (
                  <>
                    <div className="text-base font-semibold text-titulo">{nomeMaterial(material)}</div>
                    <div className="text-sm text-suave num">
                      Comprado para este pedido: {formatarQuantidade(linha.comprado ?? 0, material.unidade)}
                    </div>
                  </>
                ) : (
                  <>
                    <label className="label" htmlFor={`mat-${linha.chave}`}>Material</label>
                    <select id={`mat-${linha.chave}`} className="input text-base py-3" value={linha.materialId}
                      onChange={e => mudar(linha.chave, 'materialId', e.target.value)}>
                      <option value="">Escolha o material…</option>
                      {materiais.map(m => (
                        <option key={m.id} value={m.id}>{nomeMaterial(m)} ({UNIDADE_LABEL[m.unidade]})</option>
                      ))}
                    </select>
                  </>
                )}
                {material && (
                  <div className="text-xs text-suave num mt-1">
                    No sistema agora: {formatarQuantidade(material.saldo, material.unidade)}
                  </div>
                )}
              </div>
              {linha.origem === 'extra' && (
                <button type="button" className="btn-icone text-suave" aria-label="Remover este material"
                  onClick={() => setLinhas(ls => ls.filter(l => l.chave !== linha.chave))}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor={`usou-${linha.chave}`}>
                  Usou do estoque{material ? ` (${UNIDADE_LABEL[material.unidade]})` : ''}
                </label>
                <input id={`usou-${linha.chave}`} className="input num text-lg py-3" inputMode="decimal"
                  value={linha.usou} onChange={e => mudar(linha.chave, 'usou', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={`sobrou-${linha.chave}`}>
                  Sobrou{material ? ` (${UNIDADE_LABEL[material.unidade]})` : ''}
                </label>
                <input id={`sobrou-${linha.chave}`} className="input num text-lg py-3" inputMode="decimal"
                  value={linha.sobrou} onChange={e => mudar(linha.chave, 'sobrou', e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-suave">Só lance sobra que dá pelo menos 1 peça (80 cm). Retalho menor não entra.</p>

            {ficaNegativo && material && (
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>O sistema tem só {formatarQuantidade(material.saldo, material.unidade)}. Confira — vai ficar negativo.</span>
              </div>
            )}
          </li>
        ))}
      </ul>

      <button type="button" className="btn-secondary" onClick={adicionarOutro}>
        <PlusCircle className="w-4 h-4" aria-hidden="true" /> Outro material do estoque
      </button>

      <section className="card space-y-3" aria-labelledby="t-resumo">
        <h2 id="t-resumo" className="font-semibold text-titulo">Resumo</h2>
        <p className="text-sm text-conteudo">
          Usou <strong className="num">{resumoUsou}</strong> · Sobrou <strong className="num">{resumoSobrou}</strong> volta para o estoque
        </p>
        {erro && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
        <button type="button" className="btn-primary w-full justify-center py-3 text-base" onClick={confirmar} disabled={salvando}>
          {salvando ? 'Registrando…' : 'Confirmar corte'}
        </button>
      </section>
    </div>
  )
}
