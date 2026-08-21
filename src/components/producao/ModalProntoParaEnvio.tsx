'use client'
import { useState } from 'react'
import Modal from '@/components/kanban/Modal'
import { atualizarPedido } from '@/lib/store'
import { SETOR_LABELS } from '@/lib/helpers'
import { EntradaProgresso, Pedido, ProgressoSetor } from '@/types'

// Modal "Pronto para envio?", aberto ao concluir Acabamento/Embalagem quando
// ainda há setor pendente/em_andamento (Fase C0, docs/fase-c0.md).
//
// Regra de ouro: quem chama já gravou `acabamento: concluido` antes de
// montar este componente. Fechar sem confirmar, ou a gravação daqui falhar,
// nunca desfaz isso — só os setores marcados aqui são afetados.
//
// Sempre montado condicionalmente pelo componente pai (nunca com aberto=false
// persistente): assim o estado dos checkboxes nasce limpo a cada pedido.

const PRE_MARCADOS: (keyof ProgressoSetor)[] = ['estamparia_silk', 'prensa_dtf', 'prensa_sublimacao']

type Props = {
  pedido: Pedido
  onFechar: () => void
  /** Chamado depois de salvar com sucesso, para o pai recarregar a lista. */
  onSalvo: () => void
  nomeMembro?: string
}

export default function ModalProntoParaEnvio({ pedido, onFechar, onSalvo, nomeMembro }: Props) {
  const setoresPendentes = (Object.keys(pedido.progresso) as (keyof ProgressoSetor)[])
    .filter(s => s !== 'acabamento' && (pedido.progresso[s].status === 'pendente' || pedido.progresso[s].status === 'em_andamento'))

  const [marcados, setMarcados] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(setoresPendentes.map(s => [s, PRE_MARCADOS.includes(s)]))
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(false)

  if (setoresPendentes.length === 0) return null

  const restantes = setoresPendentes.filter(s => !marcados[s])
  const tudoMarcado = restantes.length === 0

  async function confirmar() {
    setSalvando(true)
    setErro(false)
    try {
      const agora = new Date().toISOString()
      const progresso = { ...pedido.progresso }
      for (const s of setoresPendentes) {
        if (marcados[s]) {
          const entrada: EntradaProgresso = { status: 'nao_se_aplica', atualizadoPor: nomeMembro, atualizadoEm: agora }
          progresso[s] = entrada
        }
      }
      await atualizarPedido(pedido.id, { progresso })
      onSalvo()
      onFechar()
    } catch {
      setErro(true)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto titulo="Acabamento/Embalagem concluído" onFechar={onFechar}
      rodape={
        <>
          <button onClick={onFechar} className="btn-secondary flex-1 justify-center">Pular</button>
          <button onClick={confirmar} disabled={salvando} className="btn-primary flex-1 justify-center">
            {salvando ? 'Salvando...' : tudoMarcado ? 'Liberar para envio' : 'Salvar'}
          </button>
        </>
      }>
      <div className="space-y-4">
        <p className="text-sm text-conteudo">Este pedido está pronto para envio?</p>

        <div>
          <p className="text-xs text-fraco mb-2">
            Estes setores ainda não foram concluídos. Marque os que <strong>não se aplicam</strong> a este pedido:
          </p>
          <div className="space-y-1.5">
            {setoresPendentes.map(s => (
              <label key={s}
                className="flex items-center gap-3 px-3 py-3 rounded-xl border border-borda hover:bg-superficie-2 cursor-pointer">
                <input type="checkbox" checked={!!marcados[s]}
                  onChange={e => setMarcados(prev => ({ ...prev, [s]: e.target.checked }))}
                  className="w-5 h-5 accent-nice-500 shrink-0" />
                <span className="text-sm text-conteudo flex-1">{SETOR_LABELS[s]}</span>
                {!PRE_MARCADOS.includes(s) && <span className="text-xs" title="Confirme com atenção: é uma afirmação grande">⚠️</span>}
              </label>
            ))}
          </div>
        </div>

        {!tudoMarcado && (
          <p className="text-xs text-suave">
            O pedido continua na produção porque {restantes.map(s => SETOR_LABELS[s]).join(', ')}{' '}
            ainda {restantes.length > 1 ? 'estão pendentes' : 'está pendente'}.
          </p>
        )}

        <p className="text-xs text-fraco">
          Marcado como &quot;não se aplica&quot; por {nomeMembro || 'você'}, hoje. Isso não apaga nada e pode ser desfeito clicando no setor.
        </p>

        {erro && (
          <p className="text-xs text-red-600 font-medium">Não foi possível salvar. Tente novamente.</p>
        )}
      </div>
    </Modal>
  )
}
