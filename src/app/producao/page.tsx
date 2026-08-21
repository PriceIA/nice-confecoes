'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPedidos, atualizarPedido } from '@/lib/store'
import { SETOR_LABELS, STATUS_CONFIG, autorSetorTexto } from '@/lib/helpers'
import { useMembro } from '@/components/AuthProvider'
import { EntradaProgresso, Pedido, ProgressoSetor, StatusSetor } from '@/types'
import { CheckCircle2, Circle, Loader2, MinusCircle, ArrowRight } from 'lucide-react'
import ModalProntoParaEnvio from '@/components/producao/ModalProntoParaEnvio'
import clsx from 'clsx'

const SETORES = Object.keys(SETOR_LABELS) as (keyof ProgressoSetor)[]

export default function ProducaoPage() {
  const { membro } = useMembro()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [modalPedidoId, setModalPedidoId] = useState<string | null>(null)

  const carregar = async () => {
    const data = (await getPedidos()).filter(p => ['aprovado', 'em_producao'].includes(p.status))
    setPedidos(data)
  }

  useEffect(() => { carregar() }, [])

  async function ciclarSetor(pedidoId: string, setor: keyof ProgressoSetor) {
    const p = pedidos.find(x => x.id === pedidoId)
    if (!p) return
    const ciclo: StatusSetor[] = ['pendente', 'em_andamento', 'concluido']
    const atual = p.progresso[setor].status
    const proximo = ciclo[(ciclo.indexOf(atual) + 1) % ciclo.length]
    const entrada: EntradaProgresso = {
      status: proximo,
      atualizadoPor: membro?.nome,
      atualizadoEm: new Date().toISOString(),
    }
    const progresso = { ...p.progresso, [setor]: entrada }
    await atualizarPedido(pedidoId, { progresso })
    await carregar()

    // Modal "Pronto para envio?" — só ao concluir Acabamento/Embalagem, e só
    // se sobrar setor pendente/em_andamento. A gravação acima já aconteceu;
    // isso nunca segura o progresso (docs/fase-c0.md, seção 4).
    if (setor === 'acabamento' && proximo === 'concluido') {
      const pendentes = (Object.keys(progresso) as (keyof ProgressoSetor)[])
        .filter(s => s !== 'acabamento' && (progresso[s].status === 'pendente' || progresso[s].status === 'em_andamento'))
      if (pendentes.length > 0) setModalPedidoId(pedidoId)
    }
  }

  const statusIcon = (s: StatusSetor) => {
    if (s === 'concluido') return <CheckCircle2 className="w-4 h-4 text-nice-500" />
    if (s === 'em_andamento') return <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
    if (s === 'nao_se_aplica') return <MinusCircle className="w-4 h-4 text-fraco" />
    return <Circle className="w-4 h-4 text-fraco" />
  }

  const modalPedido = pedidos.find(p => p.id === modalPedidoId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Produção</h1>
        <p className="text-sm text-suave mt-0.5">{pedidos.length} pedido(s) em andamento</p>
      </div>

      {pedidos.length === 0 ? (
        <div className="card py-20 text-center text-fraco">
          <p className="text-sm">Nenhum pedido em produção no momento.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pedidos.map(pedido => {
            const sc = STATUS_CONFIG[pedido.status]
            // Setor "não se aplica" sai do numerador E do denominador — um
            // pedido sem os 8 setores aplicáveis não pode empacar em 75%.
            const aplicaveis = SETORES.filter(s => pedido.progresso[s].status !== 'nao_se_aplica')
            const concluidos = aplicaveis.filter(s => pedido.progresso[s].status === 'concluido').length
            const progPct = aplicaveis.length === 0 ? 100 : Math.round((concluidos / aplicaveis.length) * 100)
            return (
              <div key={pedido.id} className="card space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-marca-texto">#{pedido.numero}</span>
                        <span className="font-medium text-conteudo text-sm">{pedido.cliente.nome}</span>
                        {pedido.cliente.empresa && <span className="text-fraco text-xs">— {pedido.cliente.empresa}</span>}
                        {pedido.tipo === 'urgente' && <span className="badge bg-red-100 text-red-600 text-xs">urgente</span>}
                      </div>
                    </div>
                  </div>
                  <Link href={`/pedidos/${pedido.id}`} className="text-marca-texto hover:text-marca-texto text-xs font-medium flex items-center gap-1">
                    Detalhe <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* Barra de progresso */}
                <div>
                  <div className="flex justify-between text-xs text-fraco mb-1.5">
                    <span>{concluidos} de {aplicaveis.length} setores concluídos</span>
                    <span className="font-medium text-marca-texto">{progPct}%</span>
                  </div>
                  <div className="w-full bg-superficie-3 rounded-full h-2">
                    <div className="bg-nice-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progPct}%` }} />
                  </div>
                </div>

                {/* Setores */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SETORES.map(setor => {
                    const entrada = pedido.progresso[setor]
                    const status = entrada.status
                    const autor = autorSetorTexto(entrada)
                    return (
                      <button key={setor} onClick={() => ciclarSetor(pedido.id, setor)}
                        className={clsx(
                          'flex flex-col gap-1 px-3 py-2 rounded-xl border text-xs font-medium transition-all text-left',
                          status === 'concluido' ? 'bg-marca-suave border-marca-borda text-marca-texto' :
                          status === 'em_andamento' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                          status === 'nao_se_aplica' ? 'bg-superficie-3 border-borda text-fraco' :
                          'bg-superficie-2 border-borda text-fraco hover:border-borda'
                        )}>
                        <span className="flex items-center gap-2">
                          {statusIcon(status)}
                          <span className="truncate">{SETOR_LABELS[setor]}</span>
                        </span>
                        {status === 'nao_se_aplica' && <span className="text-[10px] font-normal opacity-70">não se aplica</span>}
                        {autor && <span className="text-[10px] font-normal opacity-70 truncate">{autor}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalPedido && (
        <ModalProntoParaEnvio
          pedido={modalPedido}
          onFechar={() => setModalPedidoId(null)}
          onSalvo={carregar}
          nomeMembro={membro?.nome}
        />
      )}
    </div>
  )
}
