'use client'
// Cadastro e edição de material (Fase K2). Usado pela lista (/almoxarifado) e
// pelo detalhe (/almoxarifado/[id]) — um modal só, para os dois nunca
// divergirem nos campos.
//
// Saldo NÃO é campo (regra K-1): o material nasce com 0, e o saldo inicial
// entra pela tela de Entrada ou por ajuste (K5).

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from '@/components/kanban/Modal'
import { useMembro } from '@/components/AuthProvider'
import {
  CATEGORIAS_ATIVAS,
  CATEGORIA_LABEL,
  ErroMaterialDuplicado,
  UNIDADE_LABEL,
  UNIDADE_PADRAO,
  atualizarMaterial,
  criarMaterial,
  type DadosMaterial,
} from '@/lib/almoxarifado'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import type { CategoriaMaterial, Material, UnidadeMaterial } from '@/types'
import { lerNumero, numeroParaCampo } from './ui'

const UNIDADES = Object.keys(UNIDADE_LABEL) as UnidadeMaterial[]

/** Nome por extenso, para o seletor — o rótulo curto ("kg") fica na tabela. */
const UNIDADE_EXTENSO: Record<UnidadeMaterial, string> = {
  kg: 'kg (quilo)',
  m: 'm (metro)',
  un: 'un (unidade)',
  cone: 'cone',
  rolo: 'rolo',
  l: 'L (litro)',
}

type Form = {
  nome: string
  cor: string
  categoria: CategoriaMaterial
  unidade: UnidadeMaterial
  estoqueMinimo: string
  local: string
  custoUnitario: string
  observacoes: string
}

function formDe(m: Material | null): Form {
  if (!m) {
    return {
      nome: '', cor: '', categoria: 'malha', unidade: UNIDADE_PADRAO.malha,
      estoqueMinimo: '', local: '', custoUnitario: '', observacoes: '',
    }
  }
  return {
    nome: m.nome,
    cor: m.cor,
    categoria: m.categoria,
    unidade: m.unidade,
    estoqueMinimo: numeroParaCampo(m.estoqueMinimo),
    local: m.local ?? '',
    custoUnitario: numeroParaCampo(m.custoUnitario),
    observacoes: m.observacoes ?? '',
  }
}

function descreverFalha(err: unknown, acao: string): string {
  // A duplicata já vem com o texto pronto ("Já existe Malha PV Branco cadastrado.").
  if (err instanceof ErroMaterialDuplicado) return err.message
  const falha = classificarErro(err)
  switch (falha.tipo) {
    case 'offline':   return `Sem conexão com a internet, não deu para ${acao}. Nada foi salvo.`
    case 'rede':      return `Servidor inacessível, não deu para ${acao}. Nada foi salvo.`
    case 'permissao': return `Seu perfil não tem permissão para ${acao}. Nada foi salvo.`
    case 'validacao': return `O banco recusou os dados${sufixoCodigo(falha)}: ${falha.details || falha.message || 'valor inválido'}. Nada foi salvo.`
    default:          return `Falha ao ${acao}${sufixoCodigo(falha)}: ${falha.message || 'erro desconhecido'}. Nada foi salvo.`
  }
}

type Props = {
  aberto: boolean
  /** null = cadastrar novo. */
  material: Material | null
  onFechar: () => void
  /** Chamado depois que o banco confirmou. Recebe o material criado, quando é cadastro. */
  onSalvo: (criado?: Material) => void
}

export default function MaterialModal({ aberto, material, onFechar, onSalvo }: Props) {
  const { permissoes } = useMembro()
  const [form, setForm] = useState<Form>(() => formDe(material))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Reabrir o modal (ou trocar de material) começa do que o banco tem.
  useEffect(() => {
    if (aberto) {
      setForm(formDe(material))
      setErro(null)
    }
  }, [aberto, material])

  // Só malha e tecido entram por enquanto (CATEGORIAS_ATIVAS). Material antigo
  // de outra categoria continua editável sem ser forçado a trocar.
  const categorias: CategoriaMaterial[] =
    material && !CATEGORIAS_ATIVAS.includes(material.categoria)
      ? [...CATEGORIAS_ATIVAS, material.categoria]
      : CATEGORIAS_ATIVAS

  function mudarCategoria(categoria: CategoriaMaterial) {
    // A unidade padrão só preenche o campo — a pessoa pode trocar depois
    // (às vezes a malha é controlada em metro).
    setForm(f => ({ ...f, categoria, unidade: UNIDADE_PADRAO[categoria] }))
  }

  async function salvar() {
    const nome = form.nome.trim()
    if (!nome) return setErro('Preencha o nome do material.')
    if (nome.length > 80) return setErro('O nome pode ter no máximo 80 caracteres.')
    if (form.cor.trim().length > 40) return setErro('A cor pode ter no máximo 40 caracteres.')
    if (form.local.trim().length > 40) return setErro('O local pode ter no máximo 40 caracteres.')

    const minimo = lerNumero(form.estoqueMinimo)
    if (minimo !== null && (Number.isNaN(minimo) || minimo < 0)) {
      return setErro('Estoque mínimo precisa ser um número igual ou maior que zero (ex.: 20 ou 12,5).')
    }
    const custo = permissoes.verFinanceiro ? lerNumero(form.custoUnitario) : null
    if (custo !== null && (Number.isNaN(custo) || custo < 0)) {
      return setErro('Custo por unidade precisa ser um valor igual ou maior que zero (ex.: 38,90).')
    }

    const dados: DadosMaterial = {
      nome,
      cor: form.cor.trim(),
      categoria: form.categoria,
      unidade: form.unidade,
      estoqueMinimo: minimo,
      local: form.local,
      custoUnitario: custo,
      observacoes: form.observacoes,
    }

    setSalvando(true)
    setErro(null)
    try {
      if (material) {
        // Sem verFinanceiro o campo de custo nem aparece: não mandar, para não
        // apagar o custo que a gestão cadastrou.
        const update: Partial<DadosMaterial> = { ...dados }
        if (!permissoes.verFinanceiro) delete update.custoUnitario
        await atualizarMaterial(material.id, update)
        onSalvo()
      } else {
        const criado = await criarMaterial(dados)
        onSalvo(criado)
      }
    } catch (err) {
      setErro(descreverFalha(err, material ? 'salvar a alteração' : 'cadastrar o material'))
    } finally {
      setSalvando(false)
    }
  }

  const unidadeAtual = UNIDADE_LABEL[form.unidade]

  return (
    <Modal
      aberto={aberto}
      titulo={material ? 'Editar material' : 'Novo material'}
      onFechar={salvando ? () => {} : onFechar}
      rodape={
        <>
          <button type="button" onClick={onFechar} disabled={salvando} className="btn-secondary flex-1 justify-center">
            Cancelar
          </button>
          <button type="submit" form="form-material" disabled={salvando} className="btn-primary flex-1 justify-center">
            {salvando ? 'Salvando…' : material ? 'Salvar' : 'Cadastrar'}
          </button>
        </>
      }
    >
      <form
        id="form-material"
        onSubmit={e => { e.preventDefault(); salvar() }}
        className="space-y-4"
        noValidate
      >
        {erro && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="mat-nome" className="label">Nome</label>
            <input id="mat-nome" className="input" maxLength={80} autoFocus
              placeholder="Ex.: Malha PV" value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="mat-cor" className="label">Cor</label>
            <input id="mat-cor" className="input" maxLength={40}
              placeholder="Ex.: Branco" value={form.cor}
              onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="mat-categoria" className="label">Categoria</label>
            <select id="mat-categoria" className="input" value={form.categoria}
              onChange={e => mudarCategoria(e.target.value as CategoriaMaterial)}>
              {categorias.map(c => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mat-unidade" className="label">Unidade</label>
            <select id="mat-unidade" className="input" value={form.unidade}
              onChange={e => setForm(f => ({ ...f, unidade: e.target.value as UnidadeMaterial }))}>
              {UNIDADES.map(u => <option key={u} value={u}>{UNIDADE_EXTENSO[u]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mat-minimo" className="label">Estoque mínimo <span className="normal-case font-normal">({unidadeAtual}, opcional)</span></label>
            <input id="mat-minimo" className="input num" inputMode="decimal"
              placeholder="Sem mínimo" value={form.estoqueMinimo}
              onChange={e => setForm(f => ({ ...f, estoqueMinimo: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="mat-local" className="label">Local <span className="normal-case font-normal">(opcional)</span></label>
            <input id="mat-local" className="input" maxLength={40}
              placeholder="Ex.: A1" value={form.local}
              onChange={e => setForm(f => ({ ...f, local: e.target.value }))} />
          </div>
          {permissoes.verFinanceiro && (
            <div>
              <label htmlFor="mat-custo" className="label">Custo por {unidadeAtual} <span className="normal-case font-normal">(R$, opcional)</span></label>
              <input id="mat-custo" className="input num" inputMode="decimal"
                placeholder="Ex.: 38,90" value={form.custoUnitario}
                onChange={e => setForm(f => ({ ...f, custoUnitario: e.target.value }))} />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="mat-obs" className="label">Observações <span className="normal-case font-normal">(opcional)</span></label>
          <textarea id="mat-obs" className="input" rows={2} value={form.observacoes}
            onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
        </div>

        {!material && (
          <p className="text-xs text-suave">
            O material nasce com saldo zero. O saldo entra pela tela de Entrada ou por um ajuste de estoque.
          </p>
        )}
      </form>
    </Modal>
  )
}
