'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Users2, X, ArrowRight, Phone, Mail, Search, Pencil, Save, MapPin, FileText, User } from 'lucide-react'
import { getClientes, getPedidos, pedidosDoCliente, atualizarCliente } from '@/lib/store'
import { STATUS_CONFIG } from '@/lib/helpers'
import { Cliente, Pedido } from '@/types'
import clsx from 'clsx'

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [selecionado, setSelecionado] = useState<Cliente | null>(null)
  const [busca, setBusca] = useState('')
  const [editandoCliente, setEditandoCliente] = useState(false)
  const [editDados, setEditDados] = useState<Omit<Cliente, 'id' | 'dataCadastro'>>({
    nome: '', empresa: '', telefone: '', email: '', responsavel: '', endereco: '', documento: '',
  })
  const [salvandoCliente, setSalvandoCliente] = useState(false)

  useEffect(() => {
    (async () => {
      const [cli, ped] = await Promise.all([getClientes(), getPedidos()])
      setClientes(cli)
      setPedidos(ped)
    })()
  }, [])

  const clientesFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      c.empresa?.toLowerCase().includes(q) ||
      c.responsavel?.toLowerCase().includes(q) ||
      c.telefone?.includes(q)
    )
  }, [busca, clientes])

  const historico = selecionado
    ? pedidosDoCliente(selecionado, pedidos).sort((a, b) => new Date(b.dataEntrada).getTime() - new Date(a.dataEntrada).getTime())
    : []

  const historicoTotal = historico.reduce((a, p) => a + p.valorTotal, 0)
  const historicoTotalPago = historico.reduce((a, p) => a + p.valorPago, 0)
  const historicoSaldo = historicoTotal - historicoTotalPago

  function abrirDrawer(c: Cliente) {
    setSelecionado(c)
    setEditandoCliente(false)
  }

  function fecharDrawer() {
    setSelecionado(null)
    setEditandoCliente(false)
  }

  function iniciarEdicaoCliente() {
    if (!selecionado) return
    setEditDados({
      nome: selecionado.nome,
      empresa: selecionado.empresa,
      telefone: selecionado.telefone,
      email: selecionado.email,
      responsavel: selecionado.responsavel,
      endereco: selecionado.endereco,
      documento: selecionado.documento,
    })
    setEditandoCliente(true)
  }

  async function salvarCliente() {
    if (!selecionado || !editDados.nome) return
    setSalvandoCliente(true)
    try {
      await atualizarCliente(selecionado.id, editDados)
      const atualizado: Cliente = { ...selecionado, ...editDados }
      setClientes(prev => prev.map(c => c.id === selecionado.id ? atualizado : c))
      setSelecionado(atualizado)
      setEditandoCliente(false)
    } catch {
      alert('Erro ao salvar. Tente novamente.')
    } finally {
      setSalvandoCliente(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Clientes</h1>
        <p className="text-sm text-suave mt-0.5">{clientes.length} cliente(s) cadastrado(s)</p>
      </div>

      {/* Busca */}
      <div className="card py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fraco" />
          <input
            className="input pl-9"
            placeholder="Buscar por nome, empresa, responsável ou telefone..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
      </div>

      {clientesFiltrados.length === 0 ? (
        <div className="card py-20 text-center text-fraco">
          <Users2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{busca ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado ainda.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientesFiltrados.map(c => {
            const pedidosCliente = pedidosDoCliente(c, pedidos)
            const valorTotal = pedidosCliente.reduce((a, p) => a + p.valorTotal, 0)
            const valorPago = pedidosCliente.reduce((a, p) => a + p.valorPago, 0)
            const saldo = valorTotal - valorPago
            const ultimoPedido = pedidosCliente.reduce<Pedido | null>((mais, p) =>
              !mais || new Date(p.dataEntrada) > new Date(mais.dataEntrada) ? p : mais, null)

            return (
              <button key={c.id} onClick={() => abrirDrawer(c)}
                className="card text-left hover:border-nice-300 border border-transparent transition-colors space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-marca-suave flex items-center justify-center shrink-0">
                    <Users2 className="w-5 h-5 text-nice-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-titulo truncate">{c.nome}</div>
                    {c.empresa && <div className="text-xs text-fraco truncate">{c.empresa}</div>}
                    {c.responsavel && (
                      <div className="text-xs text-fraco truncate flex items-center gap-1">
                        <User className="w-3 h-3" />{c.responsavel}
                      </div>
                    )}
                  </div>
                </div>

                {c.telefone && (
                  <div className="text-xs text-suave flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />{c.telefone}
                  </div>
                )}

                <div className="border-t border-borda pt-3 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-lg font-bold text-marca-texto">{pedidosCliente.length}</div>
                    <div className="text-xs text-fraco">pedido(s)</div>
                  </div>
                  <div>
                    <div className="text-base font-bold text-marca-texto">R$ {valorTotal.toFixed(2)}</div>
                    <div className="text-xs text-fraco">total gasto</div>
                  </div>
                  {valorPago > 0 && (
                    <div>
                      <div className="text-sm font-bold text-green-600">R$ {valorPago.toFixed(2)}</div>
                      <div className="text-xs text-fraco">total pago</div>
                    </div>
                  )}
                  {saldo > 0 && (
                    <div>
                      <div className="text-sm font-bold text-orange-600">R$ {saldo.toFixed(2)}</div>
                      <div className="text-xs text-fraco">em aberto</div>
                    </div>
                  )}
                </div>

                {ultimoPedido && (
                  <div className="text-xs text-fraco">
                    Último pedido: {format(new Date(ultimoPedido.dataEntrada), 'dd/MM/yyyy')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Drawer */}
      {selecionado && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={fecharDrawer} />
          <aside className="relative h-screen w-full max-w-md bg-superficie shadow-xl flex flex-col">

            {/* Header do drawer */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-borda">
              <div className="min-w-0">
                <h2 className="font-bold text-titulo text-lg truncate">{selecionado.nome}</h2>
                {selecionado.empresa && <p className="text-sm text-fraco truncate">{selecionado.empresa}</p>}
                {selecionado.responsavel && (
                  <p className="text-xs text-fraco flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3" />Resp.: {selecionado.responsavel}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {!editandoCliente && (
                  <button onClick={iniciarEdicaoCliente}
                    className="p-2 rounded-xl hover:bg-marca-suave text-marca-texto transition-colors"
                    title="Editar cliente">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <button onClick={fecharDrawer} className="text-fraco hover:text-suave p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto">
              {editandoCliente ? (
                <div className="px-6 py-4 space-y-4">
                  <h3 className="text-xs font-semibold text-fraco uppercase tracking-wide">Editar Dados</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="label">Nome *</label>
                      <input className="input" value={editDados.nome}
                        onChange={e => setEditDados(d => ({ ...d, nome: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Empresa</label>
                      <input className="input" value={editDados.empresa}
                        onChange={e => setEditDados(d => ({ ...d, empresa: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Responsável</label>
                      <input className="input" value={editDados.responsavel}
                        onChange={e => setEditDados(d => ({ ...d, responsavel: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Telefone</label>
                      <input className="input" value={editDados.telefone}
                        onChange={e => setEditDados(d => ({ ...d, telefone: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">E-mail</label>
                      <input className="input" type="email" value={editDados.email}
                        onChange={e => setEditDados(d => ({ ...d, email: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">CNPJ / CPF</label>
                      <input className="input" value={editDados.documento}
                        onChange={e => setEditDados(d => ({ ...d, documento: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Endereço</label>
                      <input className="input" value={editDados.endereco}
                        onChange={e => setEditDados(d => ({ ...d, endereco: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setEditandoCliente(false)} className="btn-secondary flex-1 justify-center">
                      Cancelar
                    </button>
                    <button onClick={salvarCliente} disabled={salvandoCliente || !editDados.nome}
                      className="btn-primary flex-1 justify-center">
                      <Save className="w-4 h-4" /> {salvandoCliente ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-6 py-4 border-b border-borda space-y-2">
                    {selecionado.telefone && (
                      <div className="text-sm text-suave flex items-center gap-2">
                        <Phone className="w-4 h-4 text-fraco" />{selecionado.telefone}
                      </div>
                    )}
                    {selecionado.email && (
                      <div className="text-sm text-suave flex items-center gap-2">
                        <Mail className="w-4 h-4 text-fraco" />{selecionado.email}
                      </div>
                    )}
                    {selecionado.documento && (
                      <div className="text-sm text-suave flex items-center gap-2">
                        <FileText className="w-4 h-4 text-fraco" />{selecionado.documento}
                      </div>
                    )}
                    {selecionado.endereco && (
                      <div className="text-sm text-suave flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-fraco shrink-0 mt-0.5" />{selecionado.endereco}
                      </div>
                    )}
                    {historico.length > 0 && (
                      <div className="pt-2 grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-superficie-2 rounded-lg p-2 text-center">
                          <div className="font-bold text-marca-texto">R$ {historicoTotal.toFixed(2)}</div>
                          <div className="text-fraco">Total</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-2 text-center">
                          <div className="font-bold text-green-600">R$ {historicoTotalPago.toFixed(2)}</div>
                          <div className="text-fraco">Pago</div>
                        </div>
                        <div className={clsx('rounded-lg p-2 text-center', historicoSaldo > 0 ? 'bg-orange-50' : 'bg-superficie-2')}>
                          <div className={clsx('font-bold', historicoSaldo > 0 ? 'text-orange-600' : 'text-fraco')}>
                            R$ {historicoSaldo.toFixed(2)}
                          </div>
                          <div className="text-fraco">Em aberto</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 px-6 py-4 space-y-3">
                    <h3 className="text-xs font-semibold text-fraco uppercase tracking-wide">
                      Histórico de Pedidos ({historico.length})
                    </h3>
                    {historico.length === 0 ? (
                      <p className="text-sm text-fraco py-8 text-center">Nenhum pedido encontrado.</p>
                    ) : historico.map(p => {
                      const sc = STATUS_CONFIG[p.status]
                      return (
                        <Link key={p.id} href={`/pedidos/${p.id}`}
                          className="block border border-borda rounded-xl px-4 py-3 hover:border-nice-300 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-marca-texto text-sm">#{p.numero}</span>
                            <span className={clsx('badge text-xs', sc.bg, sc.color)}>{sc.label}</span>
                          </div>
                          <div className="flex items-center justify-between mt-2 text-xs text-suave">
                            <span>{format(new Date(p.dataEntrada), 'dd/MM/yyyy')}</span>
                            <span className="font-medium text-conteudo">R$ {p.valorTotal.toFixed(2)}</span>
                          </div>
                          {p.valorPago > 0 && p.valorPago < p.valorTotal && (
                            <div className="flex items-center justify-between mt-1 text-xs">
                              <span className="text-green-600">Pago: R$ {p.valorPago.toFixed(2)}</span>
                              <span className="text-orange-500">Aberto: R$ {(p.valorTotal - p.valorPago).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-end mt-1">
                            <ArrowRight className="w-3.5 h-3.5 text-fraco" />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
