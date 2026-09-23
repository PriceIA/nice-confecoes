'use client'
import { useState } from 'react'
import { format } from 'date-fns'
import Modal from '@/components/kanban/Modal'
import { atualizarPedido } from '@/lib/store'
import {
  MOTIVO_LABEL, OBSERVACAO_MAX,
  atualizarMotivo, motivoSugerido, registrar, saldoEmAberto, validar,
} from '@/lib/aguardandoCliente'
import { moeda } from '@/lib/helpers'
import { AguardandoCliente, MotivoAguardando, Pedido } from '@/types'

// Modal "O cliente ainda não retirou" (Fase I2b). Registra ou muda o motivo de
// `aguardandoCliente` — a única gravação desta etapa, e ela passa inteira por
// `src/lib/aguardandoCliente.ts` (registrar/atualizarMotivo/validar). Nunca
// reimplemente a regra aqui.

type Props = {
  pedido: Pick<Pedido, 'id' | 'numero' | 'valorTotal' | 'valorPago' | 'aguardandoCliente'> & {
    cliente: Pick<Pedido['cliente'], 'nome'>
  }
  aberto: boolean
  modo: 'registrar' | 'mudar'
  onFechar: () => void
  onGravado: () => void
  nomeMembro?: string
}

export default function ModalNaoRetirou({ pedido, aberto, modo, onFechar, onGravado, nomeMembro }: Props) {
  const sugerido = modo === 'registrar' ? motivoSugerido(pedido) : null
  const inicial: MotivoAguardando | null =
    modo === 'mudar' ? (pedido.aguardandoCliente?.motivo ?? null) : sugerido

  const [motivo, setMotivo] = useState<MotivoAguardando | null>(inicial)
  const [observacao, setObservacao] = useState(
    modo === 'mudar' ? (pedido.aguardandoCliente?.observacao ?? '') : ''
  )
  const [previsaoRetirada, setPrevisaoRetirada] = useState(
    modo === 'mudar' ? (pedido.aguardandoCliente?.previsaoRetirada ?? '') : ''
  )
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const saldo = saldoEmAberto(pedido)
  const hoje = format(new Date(), 'yyyy-MM-dd')

  async function confirmar() {
    const msg = validar(motivo, observacao)
    if (msg) {
      setErro(msg)
      return
    }
    setErro(null)
    setSalvando(true)
    const quem = nomeMembro ?? 'desconhecido'
    const novo: AguardandoCliente =
      modo === 'registrar'
        ? registrar(quem, motivo!, observacao, previsaoRetirada || undefined)
        : atualizarMotivo(pedido.aguardandoCliente!, quem, motivo!, observacao, previsaoRetirada || undefined)
    try {
      await atualizarPedido(pedido.id, { aguardandoCliente: novo })
      onGravado()
      onFechar()
    } catch {
      setErro('Não foi possível gravar. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo={modo === 'mudar' ? 'Mudar motivo' : 'O cliente ainda não retirou'}
      onFechar={onFechar}
      rodape={
        <>
          <button onClick={onFechar} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={confirmar} disabled={salvando} className="btn-primary flex-1 justify-center">
            {salvando ? 'Salvando...' : 'Confirmar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          {(Object.keys(MOTIVO_LABEL) as MotivoAguardando[]).map(m => (
            <label key={m}
              className="flex items-center gap-3 px-3 py-3 rounded-xl border border-borda hover:bg-superficie-2 cursor-pointer">
              <input type="radio" name="motivo" checked={motivo === m}
                onChange={() => setMotivo(m)} className="w-4 h-4 accent-nice-500 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-conteudo font-medium">{MOTIVO_LABEL[m]}</span>
                  {sugerido === m && (
                    <span className="badge bg-marca-suave text-marca-texto text-[10px]">sugerido</span>
                  )}
                </div>
                {sugerido === m && saldo > 0 && (
                  <p className="text-xs text-fraco mt-0.5">
                    Falta {moeda(saldo)} — pago {moeda(pedido.valorPago)} de {moeda(pedido.valorTotal)}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="label">Observação</label>
            <span className="text-xs text-fraco">{observacao.length}/{OBSERVACAO_MAX}</span>
          </div>
          <textarea
            className="input min-h-[70px] resize-y"
            maxLength={OBSERVACAO_MAX}
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            placeholder="(opcional — obrigatória em Outro)"
          />
        </div>

        <div>
          <label className="label">Combinou de buscar em</label>
          <input
            type="date"
            className="input"
            min={hoje}
            value={previsaoRetirada}
            onChange={e => setPrevisaoRetirada(e.target.value)}
          />
          <p className="text-xs text-fraco mt-1">Até esse dia o sistema não pergunta de novo.</p>
        </div>

        <div className="px-3 py-2.5 rounded-xl bg-blue-100 text-blue-700 text-xs">
          O pedido sai de Atrasados e vai para Aguardando o cliente. O sistema pergunta de novo
          todo dia (ou a partir do dia combinado).
        </div>

        {erro && <p className="text-xs text-red-700 font-medium">{erro}</p>}
      </div>
    </Modal>
  )
}
