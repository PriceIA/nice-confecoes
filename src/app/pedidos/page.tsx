'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { PlusCircle, Search, ArrowRight, Trash2 } from 'lucide-react'
import { getPedidos, deletarPedido } from '@/lib/store'
import { ORDENS_DATA, OrdemPedidos, STATUS_CONFIG, ordenarPedidos, pedidoCasaComBusca, totalPecas } from '@/lib/helpers'
import { Pedido, StatusPedido } from '@/types'
import { useMembro } from '@/components/AuthProvider'
import clsx from 'clsx'

const FILTROS: { value: StatusPedido | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'aguardando_pagamento', label: 'Ag. Pagamento' },
  { value: 'em_producao', label: 'Em Produção' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelado', label: 'Cancelado' },
]

const ORDEM_CHAVE = 'nice-ordem-pedidos'

// A ordenação vive em src/lib/helpers.ts porque /producao usa a mesma função.
// Duas cópias divergem no dia em que alguém corrigir só uma.
const ORDENS = ORDENS_DATA

export default function PedidosPage() {
  const { permissoes } = useMembro()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [filtro, setFiltro] = useState<StatusPedido | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  // Padrão = "entrega mais próxima" (Fase E1, 04/09/2026), igual /producao — as duas
  // telas abrem na mesma lógica agora. entrega_asc é crescente: data mais antiga primeiro.
  // Quem já escolheu uma ordem alguma vez tem valor salvo em ORDEM_CHAVE e o useEffect
  // abaixo sobrescreve este padrão; só quem nunca mexeu no seletor sente a mudança.
  const [ordem, setOrdem] = useState<OrdemPedidos>('entrega_asc')

  const carregar = async () => setPedidos(await getPedidos())

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    const salva = localStorage.getItem(ORDEM_CHAVE)
    if (salva && ORDENS.some(o => o.value === salva)) setOrdem(salva as OrdemPedidos)
  }, [])

  function mudarOrdem(valor: OrdemPedidos) {
    setOrdem(valor)
    localStorage.setItem(ORDEM_CHAVE, valor)
  }

  const candidatos = pedidos.filter(p => {
    const matchStatus = filtro === 'todos' || p.status === filtro
    return matchStatus && pedidoCasaComBusca(p, busca)
  })

  // Fase E1-b (04/09/2026): medição do E1 achou 10 dos 10 primeiros pedidos como
  // entregue/cancelado quando ordenado por entrega_asc com o filtro "Todos" — pedidos já
  // encerrados há meses empurravam os que realmente estão por vir para baixo da lista.
  // Só nas ordens por ENTREGA (as únicas onde "mais antigo" pode significar "já acabou, não
  // importa mais"), pedidos entregue/cancelado vão sempre para o fim, mantendo a ordenação
  // normal dentro de cada grupo. Não mexe em ordenarPedidos/ORDENS_DATA (helpers.ts, também
  // usado por /producao) nem no comportamento das ordens por entrada — só reorganiza aqui.
  const filtrados = (ordem === 'entrega_asc' || ordem === 'entrega_desc')
    ? [
        ...ordenarPedidos(candidatos.filter(p => p.status !== 'entregue' && p.status !== 'cancelado'), ordem),
        ...ordenarPedidos(candidatos.filter(p => p.status === 'entregue' || p.status === 'cancelado'), ordem),
      ]
    : ordenarPedidos(candidatos, ordem)

  async function handleDeletar(id: string) {
    if (confirm('Deseja excluir este pedido?')) {
      await deletarPedido(id)
      carregar()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Pedidos</h1>
          <p className="text-sm text-suave mt-0.5">{pedidos.length} pedido(s) cadastrado(s)</p>
        </div>
        {permissoes.criarPedido && (
          <Link href="/novo-pedido" className="btn-primary">
            <PlusCircle className="w-4 h-4" />
            Novo Pedido
          </Link>
        )}
      </div>

      {/* Filtros + Busca */}
      <div className="card py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fraco" />
            <input
              aria-label="Buscar por cliente, empresa ou número"
              className="input pl-9"
              placeholder="Buscar por cliente, empresa ou número..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTROS.map(f => (
              <button key={f.value} onClick={() => setFiltro(f.value)}
                aria-pressed={filtro === f.value}
                className={clsx('px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
                  filtro === f.value
                    ? 'bg-nice-500 text-white'
                    : 'bg-superficie-3 text-suave hover:bg-superficie-3')}>
                {f.label}
              </button>
            ))}
          </div>
          <select aria-label="Ordenar pedidos" className="input sm:w-56 print:hidden" value={ordem}
            onChange={e => mudarOrdem(e.target.value as OrdemPedidos)}>
            {ORDENS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="py-20 text-center text-fraco">
            <p className="text-sm">Nenhum pedido encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Nº</th>
                  <th className="text-left px-6 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-6 py-3 font-semibold">Consultor</th>
                  <th className="text-left px-6 py-3 font-semibold">Tipo</th>
                  <th className="text-left px-6 py-3 font-semibold">Peças</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="text-left px-6 py-3 font-semibold">Entrada</th>
                  <th className="text-left px-6 py-3 font-semibold">Entrega</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {filtrados.map(p => {
                  const sc = STATUS_CONFIG[p.status]
                  return (
                    <tr key={p.id} className="hover:bg-superficie-2 transition-colors">
                      <td className="px-6 py-4 font-semibold text-marca-texto num">#{p.numero}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-conteudo">{p.cliente.nome}</div>
                        {p.cliente.empresa && <div className="text-xs text-fraco">{p.cliente.empresa}</div>}
                      </td>
                      <td className="px-6 py-4 text-sm text-suave">{p.consultor || <span className="text-fraco">—</span>}</td>
                      <td className="px-6 py-4">
                        {p.tipo === 'urgente' && <span className="badge bg-red-100 text-red-600">urgente</span>}
                        {p.tipo === 'grande_volume' && <span className="badge bg-purple-100 text-purple-600">grande vol.</span>}
                        {p.tipo === 'normal' && <span className="text-fraco text-xs">normal</span>}
                      </td>
                      <td className="px-6 py-4 text-suave num">{totalPecas(p)} un.</td>
                      <td className="px-6 py-4">
                        <span className={clsx('badge', sc.bg, sc.color)}>{sc.label}</span>
                      </td>
                      <td className="px-6 py-4 text-suave num">{format(new Date(p.dataEntrada), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4 text-suave font-medium num">{format(new Date(p.dataEntrega), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link href={`/pedidos/${p.id}`}
                            className="text-suave hover:text-marca-texto focus-visible:text-marca-texto font-medium text-xs flex items-center gap-1 rounded-lg px-1 -mx-1 py-1 -my-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice-400">
                            Ver <ArrowRight className="w-3 h-3" />
                          </Link>
                          {permissoes.excluirPedido && (
                            <button onClick={() => handleDeletar(p.id)}
                              aria-label={`Excluir pedido #${p.numero}`}
                              title={`Excluir pedido #${p.numero}`}
                              className="btn-icone text-red-400 hover:text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
