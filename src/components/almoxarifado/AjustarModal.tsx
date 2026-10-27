'use client'
// Ajustar estoque (K5): "Quanto tem na prateleira agora?". Grava UM movimento
// `ajuste` com quantidade = contado − saldo (com sinal) e o motivo como
// observação. É por aqui que se lança o saldo inicial e se corrige contagem.

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import Modal from '@/components/kanban/Modal'
import { UNIDADE_LABEL, formatarQuantidade, registrarMovimentos } from '@/lib/almoxarifado'
import { classificarErro, sufixoCodigo } from '@/lib/erros'
import type { Material } from '@/types'
import { lerNumero, nomeMaterial } from './ui'

const MOTIVOS = ['Contagem', 'Saldo inicial', 'Perda', 'Outro'] as const

type Props = {
  aberto: boolean
  material: Material
  onFechar: () => void
  /** Chamado depois que o banco confirmou. */
  onSalvo: () => void
}

export default function AjustarModal({ aberto, material, onFechar, onSalvo }: Props) {
  const [contado, setContado] = useState('')
  const [motivo, setMotivo] = useState<(typeof MOTIVOS)[number]>('Contagem')
  const [detalhe, setDetalhe] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (aberto) { setContado(''); setMotivo('Contagem'); setDetalhe(''); setErro(null); setSalvando(false) }
  }, [aberto])

  const valor = lerNumero(contado)
  const numeroOk = valor != null && !Number.isNaN(valor) && valor >= 0
  // Arredonda para matar ruído de ponto flutuante (63,2 − 64 = −0,8000000000000043).
  const diferenca = numeroOk ? Math.round(((valor as number) - material.saldo) * 1000) / 1000 : null
  const motivoOk = motivo !== 'Outro' || detalhe.trim() !== ''
  const podeSalvar = numeroOk && diferenca !== 0 && motivoOk && !salvando

  async function salvar() {
    if (!podeSalvar || diferenca == null) return
    setErro(null)
    setSalvando(true)
    try {
      await registrarMovimentos([{
        materialId: material.id,
        tipo: 'ajuste',
        quantidade: diferenca,
        observacao: motivo === 'Outro' ? detalhe : detalhe.trim() ? `${motivo}: ${detalhe.trim()}` : motivo,
      }])
      onSalvo()
    } catch (err) {
      const f = classificarErro(err)
      const m =
        f.tipo === 'offline' ? 'Sem conexão com a internet' :
        f.tipo === 'rede' ? 'Servidor inacessível' :
        f.tipo === 'permissao' ? 'Seu perfil não tem permissão para ajustar o estoque' :
        `Falha${sufixoCodigo(f)}: ${f.message || 'erro desconhecido'}`
      setErro(`${m}. O ajuste NÃO foi registrado.`)
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo={`Ajustar estoque — ${nomeMaterial(material)}`}
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" className="btn-secondary" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={salvar} disabled={!podeSalvar}>
            {salvando ? 'Registrando…' : 'Registrar ajuste'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="contado">
            Quanto tem na prateleira agora? ({UNIDADE_LABEL[material.unidade]})
          </label>
          <input id="contado" className="input num text-lg" inputMode="decimal" value={contado}
            onChange={e => setContado(e.target.value)} autoFocus />
          {contado.trim() !== '' && !numeroOk && (
            <p role="alert" className="text-xs text-red-700 mt-1">Digite um número a partir de zero.</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="motivo">Motivo</label>
          <select id="motivo" className="input" value={motivo} onChange={e => setMotivo(e.target.value as (typeof MOTIVOS)[number])}>
            {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="detalhe">
            {motivo === 'Outro' ? 'Explique o motivo' : 'Detalhe'}{' '}
            {motivo !== 'Outro' && <span className="text-fraco font-normal">(opcional)</span>}
          </label>
          <input id="detalhe" className="input" value={detalhe} onChange={e => setDetalhe(e.target.value)} autoComplete="off" />
        </div>

        <div className="rounded-xl bg-superficie-2 p-3 text-sm num flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-suave">Sistema: {formatarQuantidade(material.saldo, material.unidade)}</span>
          <ArrowRight className="w-3.5 h-3.5 text-fraco" aria-hidden="true" />
          <span className="text-suave">Contado: {numeroOk ? formatarQuantidade(valor as number, material.unidade) : '—'}</span>
          <ArrowRight className="w-3.5 h-3.5 text-fraco" aria-hidden="true" />
          <strong className={diferenca == null || diferenca === 0 ? 'text-suave' : diferenca < 0 ? 'text-red-700' : 'text-green-800'}>
            Ajuste: {diferenca == null ? '—' : diferenca === 0 ? 'sem diferença' : `${diferenca > 0 ? '+' : ''}${formatarQuantidade(diferenca, material.unidade)}`}
          </strong>
        </div>

        {erro && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      </div>
    </Modal>
  )
}
