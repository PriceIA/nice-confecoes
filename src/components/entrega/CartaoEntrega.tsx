'use client'
import { useState } from 'react'
import { format } from 'date-fns'
import { CircleHelp, Hourglass, Bell, Check, RotateCcw } from 'lucide-react'
import { useMembro } from '@/components/AuthProvider'
import { atualizarPedido } from '@/lib/store'
import { formatarData, moeda, prazoTexto } from '@/lib/helpers'
import {
  MOTIVO_LABEL,
  confirmar as confirmarAguardando,
  diasAguardando, estaAguardando, lembreteDevido, perguntarEntrega,
  prontoEm, saldoEmAberto,
} from '@/lib/aguardandoCliente'
import { Pedido } from '@/types'
import ModalNaoRetirou from './ModalNaoRetirou'

// Cartão "Este pedido já foi entregue?" / "Aguardando o cliente" (Fase I2b).
// Toda a decisão de QUANDO aparecer e o que mostrar vem de
// src/lib/aguardandoCliente.ts — este componente só monta a tela em cima
// dela. Marcar entregue NUNCA apaga `aguardandoCliente`: fica de histórico
// pro relatório da I5.

type Props = {
  pedido: Pedido
  onMudou: () => void
}

export default function CartaoEntrega({ pedido, onMudou }: Props) {
  const { membro, permissoes } = useMembro()
  const [modal, setModal] = useState<'registrar' | 'mudar' | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!permissoes.responderEntrega) return null
  if (!perguntarEntrega(pedido) && !estaAguardando(pedido)) return null

  async function marcarEntregue() {
    if (!confirm(`Marcar o pedido #${pedido.numero} (${pedido.cliente.nome}) como entregue?`)) return
    setErro(null)
    setSalvando(true)
    try {
      await atualizarPedido(pedido.id, { status: 'entregue' })
      onMudou()
    } catch {
      setErro('Não foi possível gravar. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  async function desfazer() {
    if (!confirm('Desfazer "Aguardando o cliente"? O pedido volta a contar normalmente.')) return
    setErro(null)
    setSalvando(true)
    try {
      await atualizarPedido(pedido.id, { aguardandoCliente: null })
      onMudou()
    } catch {
      setErro('Não foi possível gravar. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarLembrete() {
    setErro(null)
    setSalvando(true)
    try {
      await atualizarPedido(pedido.id, {
        aguardandoCliente: confirmarAguardando(pedido.aguardandoCliente!, membro?.nome ?? 'desconhecido'),
      })
      onMudou()
    } catch {
      setErro('Não foi possível gravar. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  if (perguntarEntrega(pedido)) {
    const prazo = prazoTexto(pedido.dataEntrega)
    const diasAtraso = Math.abs(prazo.dias ?? 0)
    const saldo = saldoEmAberto(pedido)
    return (
      <>
        <div className="card space-y-3 border-blue-200">
          <div className="flex items-center gap-2">
            <CircleHelp className="w-5 h-5 text-blue-700 shrink-0" />
            <h2 className="font-semibold text-titulo">Este pedido já foi entregue?</h2>
          </div>
          <p className="text-sm text-suave">
            O prazo era {prazo.data} — venceu há {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'}. O pedido está
            pronto e ninguém confirmou a retirada ainda.
          </p>
          {saldo > 0 && permissoes.verFinanceiro && (
            <span className="badge bg-amber-100 text-amber-700 w-fit">Falta receber {moeda(saldo)}</span>
          )}
          <div className="flex gap-2 flex-wrap">
            <button onClick={marcarEntregue} disabled={salvando} className="btn-primary text-sm">
              <Check className="w-4 h-4" /> Sim, foi entregue
            </button>
            <button onClick={() => setModal('registrar')} disabled={salvando} className="btn-secondary text-sm">
              Não, o cliente não retirou
            </button>
          </div>
          {erro && <p className="text-sm text-red-700">{erro}</p>}
        </div>
        {modal && (
          <ModalNaoRetirou pedido={pedido} aberto modo={modal} onFechar={() => setModal(null)}
            onGravado={onMudou} nomeMembro={membro?.nome} />
        )}
      </>
    )
  }

  const a = pedido.aguardandoCliente!
  const dias = diasAguardando(pedido)
  const pronto = prontoEm(pedido)
  const saldo = saldoEmAberto(pedido)
  const lembrete = lembreteDevido(pedido)

  return (
    <>
      <div className="card space-y-4 border-blue-200">
        {lembrete && (
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-blue-100 text-blue-700 text-sm flex-wrap">
            <span className="flex items-center gap-2"><Bell className="w-4 h-4 shrink-0" /> Ainda aguardando o cliente?</span>
            <div className="flex gap-2 shrink-0">
              <button onClick={confirmarLembrete} disabled={salvando} className="btn-secondary text-xs px-3 py-1.5">
                Sim, ainda aguardando
              </button>
              <button onClick={marcarEntregue} disabled={salvando} className="btn-secondary text-xs px-3 py-1.5">
                Já retirou
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Hourglass className="w-5 h-5 text-blue-700 shrink-0" />
          <h2 className="font-semibold text-titulo">Aguardando o cliente há {dias} {dias === 1 ? 'dia' : 'dias'}</h2>
        </div>
        <p className="text-sm text-suave">
          Pronto desde {pronto ? format(pronto, 'dd/MM') : '—'} · prazo era {formatarData(pedido.dataEntrega, 'dd/MM')}.
          Não conta como atraso da Nice.
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-fraco">Motivo</p>
            <p className="text-conteudo">{MOTIVO_LABEL[a.motivo]}</p>
            {a.observacao && <p className="text-xs text-suave italic mt-0.5">&quot;{a.observacao}&quot;</p>}
          </div>
          {permissoes.verFinanceiro && saldo > 0 && (
            <div>
              <p className="text-xs text-fraco">Falta receber</p>
              <p className="text-conteudo num">{moeda(saldo)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-fraco">Registrado por</p>
            <p className="text-conteudo">{a.registradoPor}, {format(new Date(a.registradoEm), 'dd/MM/yyyy HH:mm')}</p>
          </div>
          {a.previsaoRetirada && (
            <div>
              <p className="text-xs text-fraco">Combinou de buscar em</p>
              <p className="text-conteudo">{formatarData(a.previsaoRetirada)}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={marcarEntregue} disabled={salvando} className="btn-primary text-sm">
            <Check className="w-4 h-4" /> Cliente retirou — marcar entregue
          </button>
          <button onClick={() => setModal('mudar')} disabled={salvando} className="btn-secondary text-sm">
            Mudar motivo
          </button>
          <button onClick={desfazer} disabled={salvando} className="btn-ghost text-sm">
            <RotateCcw className="w-4 h-4" /> Desfazer
          </button>
        </div>
        {erro && <p className="text-sm text-red-700">{erro}</p>}
      </div>
      {modal && (
        <ModalNaoRetirou pedido={pedido} aberto modo={modal} onFechar={() => setModal(null)}
          onGravado={onMudou} nomeMembro={membro?.nome} />
      )}
    </>
  )
}
