'use client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { PlusCircle, CheckCircle2, Clock, Truck, Pencil, Trash2, AlertTriangle, Users } from 'lucide-react'
import { getTerceirizadas, criarTerceirizada, atualizarTerceirizada, deletarTerceirizada, getPedidos } from '@/lib/store'
import { getPrestadores, getServicos } from '@/lib/prestadores'
import { Terceirizada, Pedido, Prestador, PrestadorServico } from '@/types'
import { useMembro } from '@/components/AuthProvider'
import { classificarErro } from '@/lib/erros'
import PrestadorModal from '@/components/terceirizadas/PrestadorModal'
import clsx from 'clsx'

const round2 = (n: number) => Math.round(n * 100) / 100

const TIPO_CONFIG = {
  costura:     { label: 'Costura',      color: 'text-blue-600',   bg: 'bg-blue-50' },
  dtf:         { label: 'DTF',          color: 'text-purple-600', bg: 'bg-purple-50' },
  sublimacao:  { label: 'Sublimação',   color: 'text-orange-600', bg: 'bg-orange-50' },
  bordado:     { label: 'Bordado',      color: 'text-marca-texto',   bg: 'bg-marca-suave' },
}

const STATUS_TC = {
  enviado:   { label: 'Enviado',   icon: Truck,         color: 'text-blue-500',  bg: 'bg-blue-50' },
  retornado: { label: 'Retornado', icon: CheckCircle2,  color: 'text-nice-500',  bg: 'bg-marca-suave' },
  pago:      { label: 'Pago',      icon: CheckCircle2,  color: 'text-green-600', bg: 'bg-green-50' },
}

const VAZIO: Omit<Terceirizada, 'id'> = {
  nome: '', tipo: 'costura', pedidoId: '', numeroPedido: '', itens: '',
  dataEnvio: new Date().toISOString().slice(0, 10),
  dataRetornoPrevisto: '', dataRetornoReal: '', valorCombinado: 0, valorPago: 0,
  status: 'enviado', observacoes: '',
}

/**
 * Texto da falha. Segue o padrão do Kanban e de /tabela-precos: `classificarErro`
 * só classifica, cada tela escreve a própria consequência — aqui a consequência
 * é sempre "não foi salvo", e a tela recarrega do banco para não ficar mostrando
 * o que o banco não tem (regra 10 do CLAUDE.md).
 */
function descreverFalha(err: unknown, acao: string): string {
  const falha = classificarErro(err)
  const cod = falha.code ? ` (${falha.code})` : ''
  switch (falha.tipo) {
    case 'offline':   return `Sem conexão com a internet, não deu para ${acao}. Nada foi salvo.`
    case 'rede':      return `Servidor inacessível, não deu para ${acao}. Nada foi salvo.`
    case 'permissao': return `Seu perfil não tem permissão para ${acao}. Nada foi salvo.`
    case 'validacao': return `O banco recusou os dados${cod}: ${falha.details || falha.message || 'valor inválido'}. Nada foi salvo.`
    default:          return `Falha ao ${acao}${cod}: ${falha.message || 'erro desconhecido'}. Nada foi salvo.`
  }
}

export default function TerceirizadasPage() {
  const { permissoes } = useMembro()
  const [lista, setLista] = useState<Terceirizada[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [prestadores, setPrestadores] = useState<Prestador[]>([])
  const [servicos, setServicos] = useState<PrestadorServico[]>([])
  const [modal, setModal] = useState(false)
  /** null = criando um envio novo; id = editando aquele lançamento. */
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Terceirizada, 'id'>>(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  /** null = "Novo prestador"; um Prestador = editando aquele. `undefined` = modal fechado. */
  const [modalPrestador, setModalPrestador] = useState<Prestador | null | undefined>(undefined)

  const carregar = async () => {
    const [lista, pedidosData, prestadoresData, servicosData] = await Promise.all([
      getTerceirizadas(), getPedidos(), getPrestadores(), getServicos(),
    ])
    setLista(lista)
    setPedidos(pedidosData.filter(p => !['entregue', 'cancelado'].includes(p.status)))
    setPrestadores(prestadoresData)
    setServicos(servicosData)
  }

  useEffect(() => { carregar() }, [])

  function abrirNovo() {
    setEditandoId(null)
    setForm(VAZIO)
    setErro(null)
    setModal(true)
  }

  function abrirEdicao(t: Terceirizada) {
    const { id, ...dados } = t
    setEditandoId(id)
    setForm({ ...dados, dataRetornoReal: dados.dataRetornoReal ?? '' })
    setErro(null)
    setModal(true)
  }

  /**
   * Trocar de prestador reseta serviço/quantidade/valor — o cálculo do
   * prestador anterior não faz sentido pro novo. '' = "outro/avulso": some o
   * vínculo, e `nome` volta a ser texto livre.
   */
  function handlePrestadorChange(id: string) {
    if (!id) {
      setForm(f => ({ ...f, prestadorId: undefined, servico: undefined, quantidade: undefined, valorUnitario: undefined }))
      return
    }
    const p = prestadores.find(x => x.id === id)
    setForm(f => ({
      ...f, prestadorId: id, nome: p?.nome ?? f.nome,
      servico: undefined, quantidade: undefined, valorUnitario: undefined,
    }))
  }

  /**
   * Serviço escolhido preenche quantidade (1, se ainda não houver) e o valor
   * unitário DO CATÁLOGO — uma cópia, não uma referência: editar o preço do
   * serviço depois não muda este lançamento (regra 1 da Fase D2.1). Dali pra
   * frente quantidade e valor unitário continuam editáveis à mão.
   */
  function handleServicoChange(nomeServico: string) {
    if (!nomeServico) {
      setForm(f => ({ ...f, servico: undefined }))
      return
    }
    const s = servicos.find(x => x.prestadorId === form.prestadorId && x.servico === nomeServico)
    setForm(f => {
      const quantidade = f.quantidade || 1
      const valorUnitario = s?.valor ?? f.valorUnitario ?? 0
      return { ...f, servico: nomeServico, quantidade, valorUnitario, valorCombinado: round2(quantidade * valorUnitario) }
    })
  }

  /** quantidade × valor unitário preenche o valor combinado; o campo continua editável depois (regra 2). */
  function handleQuantidadeChange(quantidade: number) {
    setForm(f => ({ ...f, quantidade, valorCombinado: round2(quantidade * (f.valorUnitario ?? 0)) }))
  }

  function handleValorUnitarioChange(valorUnitario: number) {
    setForm(f => ({ ...f, valorUnitario, valorCombinado: round2((f.quantidade ?? 0) * valorUnitario) }))
  }

  async function handleSalvar() {
    if (!form.nome.trim() || !form.dataEnvio) {
      setErro('Preencha a prestadora e a data de envio.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      if (editandoId) {
        await atualizarTerceirizada(editandoId, form)
      } else {
        await criarTerceirizada(form)
      }
      setModal(false)
      setEditandoId(null)
      setForm(VAZIO)
      await carregar()
    } catch (err) {
      setErro(descreverFalha(err, editandoId ? 'salvar a alteração' : 'registrar o envio'))
    } finally {
      setSalvando(false)
    }
  }

  async function avancarStatus(id: string, atual: Terceirizada['status']) {
    const prox = atual === 'enviado' ? 'retornado' : atual === 'retornado' ? 'pago' : 'pago'
    setErro(null)
    try {
      await atualizarTerceirizada(id, { status: prox, ...(prox === 'retornado' ? { dataRetornoReal: new Date().toISOString().slice(0, 10) } : {}) })
    } catch (err) {
      setErro(descreverFalha(err, 'mudar o status'))
    }
    // Recarrega sempre: se a gravação falhou, a tela volta ao que o banco tem.
    await carregar()
  }

  async function handleExcluir(t: Terceirizada) {
    const confirmacao = `Excluir o envio de ${t.nome}, de R$ ${t.valorCombinado.toFixed(2)}?\n\n` +
      'Isso apaga também o histórico de pagamento deste lançamento. Não tem desfazer.'
    if (!confirm(confirmacao)) return
    setErro(null)
    try {
      await deletarTerceirizada(t.id)
    } catch (err) {
      setErro(descreverFalha(err, 'excluir o lançamento'))
    }
    await carregar()
  }

  const totalAPagar = lista.filter(t => t.status !== 'pago').reduce((a, t) => a + (t.valorCombinado - t.valorPago), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Terceirizadas</h1>
          <p className="text-sm text-suave mt-0.5">Controle de envios e pagamentos</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary">
          <PlusCircle className="w-4 h-4" /> Registrar Envio
        </button>
      </div>

      {erro && (
        <div className="card border border-red-200 bg-red-50 flex items-start gap-3 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{erro}</p>
          <button type="button" onClick={() => setErro(null)}
            className="text-red-600 text-xs font-semibold hover:underline">fechar</button>
        </div>
      )}

      {/* Resumo financeiro */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4 border border-orange-200">
          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
            <Clock className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-titulo">R$ {totalAPagar.toFixed(2)}</div>
            <div className="text-xs text-fraco">A pagar</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Truck className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-titulo">{lista.filter(t => t.status === 'enviado').length}</div>
            <div className="text-xs text-fraco">Aguardando retorno</div>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 bg-marca-suave rounded-xl flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-nice-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-titulo">{lista.filter(t => t.status === 'retornado').length}</div>
            <div className="text-xs text-fraco">Retornados</div>
          </div>
        </div>
      </div>

      {/* Prestadores (Fase D2.1) */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-fraco" />
            <h2 className="font-semibold text-titulo">Prestadores</h2>
          </div>
          <button onClick={() => setModalPrestador(null)} className="btn-secondary text-sm">
            <PlusCircle className="w-4 h-4" /> Novo Prestador
          </button>
        </div>

        {prestadores.length === 0 ? (
          <p className="text-sm text-fraco py-4">Nenhum prestador cadastrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {prestadores.map(p => {
              const servicosDele = servicos.filter(s => s.prestadorId === p.id)
              const ativos = servicosDele.filter(s => s.ativo).length
              return (
                <div key={p.id}
                  className={clsx('flex items-center gap-3 px-3 py-2 rounded-xl border border-borda',
                    p.ativo ? 'bg-superficie-2' : 'bg-superficie-3 opacity-70')}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-conteudo truncate">
                      {p.nome}
                      {!p.ativo && <span className="ml-2 text-xs text-fraco font-normal">(inativo)</span>}
                    </div>
                    <div className="text-xs text-fraco">
                      {p.telefone || 'sem telefone'} · {servicosDele.length === 0
                        ? 'nenhum serviço cadastrado'
                        : `${ativos} de ${servicosDele.length} serviço(s) ativo(s)`}
                    </div>
                  </div>
                  <button onClick={() => setModalPrestador(p)} title="Editar prestador"
                    className="text-fraco hover:text-marca-texto transition-colors shrink-0">
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="card p-0 overflow-hidden">
        {lista.length === 0 ? (
          <div className="py-20 text-center text-fraco text-sm">Nenhum registro de terceirizada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-superficie-2 text-xs text-suave uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-semibold">Prestadora</th>
                  <th className="text-left px-6 py-3 font-semibold">Tipo</th>
                  <th className="text-left px-6 py-3 font-semibold">Pedido</th>
                  <th className="text-left px-6 py-3 font-semibold">Envio</th>
                  <th className="text-left px-6 py-3 font-semibold">Valor</th>
                  <th className="text-left px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {lista.map(t => {
                  const tc = TIPO_CONFIG[t.tipo]
                  const sc = STATUS_TC[t.status]
                  const StatusIcon = sc.icon
                  return (
                    <tr key={t.id} className="hover:bg-superficie-2">
                      <td className="px-6 py-4 font-medium text-conteudo">{t.nome}</td>
                      <td className="px-6 py-4"><span className={clsx('badge', tc.bg, tc.color)}>{tc.label}</span></td>
                      <td className="px-6 py-4 text-suave">{t.numeroPedido ? `#${t.numeroPedido}` : '—'}</td>
                      <td className="px-6 py-4 text-suave">{format(new Date(t.dataEnvio), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-conteudo">R$ {t.valorCombinado.toFixed(2)}</div>
                        {t.valorPago > 0 && <div className="text-xs text-green-600">Pago: R$ {t.valorPago.toFixed(2)}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={clsx('badge', sc.bg, sc.color, 'gap-1')}>
                          <StatusIcon className="w-3 h-3" />{sc.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-3">
                          {t.status !== 'pago' && (
                            <button onClick={() => avancarStatus(t.id, t.status)}
                              className="text-marca-texto text-xs font-medium hover:underline whitespace-nowrap">
                              {t.status === 'enviado' ? 'Marcar retorno' : 'Marcar pago'}
                            </button>
                          )}
                          <button onClick={() => abrirEdicao(t)} title="Editar lançamento"
                            className="text-fraco hover:text-marca-texto transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          {permissoes.excluirTerceirizada && (
                            <button onClick={() => handleExcluir(t)} title="Excluir lançamento"
                              className="text-red-400 hover:text-red-600 transition-colors">
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

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-superficie rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-titulo text-lg">
              {editandoId ? 'Editar Envio' : 'Registrar Envio'}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Prestador</label>
                <select className="input" value={form.prestadorId ?? ''} onChange={e => handlePrestadorChange(e.target.value)}>
                  <option value="">Outro / avulso (digitar nome)</option>
                  {prestadores.filter(p => p.ativo || p.id === form.prestadorId).map(p => (
                    <option key={p.id} value={p.id}>{p.nome}{!p.ativo ? ' (inativo)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Prestadora (nome) *</label>
                <input className="input" placeholder="Ex: Talícia, Quésia..." value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              {form.prestadorId && (
                <>
                  <div className="col-span-2">
                    <label className="label">Serviço</label>
                    <select className="input" value={form.servico ?? ''} onChange={e => handleServicoChange(e.target.value)}>
                      <option value="">— Nenhum (lançar valor à mão) —</option>
                      {servicos
                        .filter(s => s.prestadorId === form.prestadorId && (s.ativo || s.servico === form.servico))
                        .map(s => (
                          <option key={s.id} value={s.servico}>
                            {s.servico} — R$ {s.valor.toFixed(2)} {s.unidade === 'peca' ? '/ peça' : 'fixo'}
                            {!s.ativo ? ' (inativo)' : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Quantidade</label>
                    <input className="input" type="number" placeholder="1" value={form.quantidade ?? ''}
                      onChange={e => handleQuantidadeChange(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="label">Valor unitário (R$)</label>
                    <input className="input" type="number" step="0.01" placeholder="0,00" value={form.valorUnitario ?? ''}
                      onChange={e => handleValorUnitarioChange(parseFloat(e.target.value) || 0)} />
                  </div>
                </>
              )}
              <div>
                <label className="label">Tipo de Serviço</label>
                <select className="input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}>
                  <option value="costura">Costura</option>
                  <option value="dtf">DTF</option>
                  <option value="sublimacao">Sublimação</option>
                  <option value="bordado">Bordado</option>
                </select>
              </div>
              <div>
                <label className="label">Pedido (opcional)</label>
                <select className="input" value={form.pedidoId} onChange={e => {
                  const p = pedidos.find(x => x.id === e.target.value)
                  setForm(f => ({ ...f, pedidoId: e.target.value, numeroPedido: p?.numero || '' }))
                }}>
                  <option value="">— Sem vínculo —</option>
                  {pedidos.map(p => <option key={p.id} value={p.id}>#{p.numero} — {p.cliente.nome}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Itens enviados</label>
                <input className="input" placeholder="Descrição do que foi enviado" value={form.itens} onChange={e => setForm(f => ({ ...f, itens: e.target.value }))} />
              </div>
              <div>
                <label className="label">Data de Envio *</label>
                <input className="input" type="date" value={form.dataEnvio} onChange={e => setForm(f => ({ ...f, dataEnvio: e.target.value }))} />
              </div>
              <div>
                <label className="label">Retorno Previsto</label>
                <input className="input" type="date" value={form.dataRetornoPrevisto} onChange={e => setForm(f => ({ ...f, dataRetornoPrevisto: e.target.value }))} />
              </div>
              <div>
                <label className="label">Valor combinado (R$)</label>
                <input className="input" type="number" placeholder="0,00" value={form.valorCombinado || ''} onChange={e => setForm(f => ({ ...f, valorCombinado: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">Valor já pago (R$)</label>
                <input className="input" type="number" placeholder="0,00" value={form.valorPago || ''} onChange={e => setForm(f => ({ ...f, valorPago: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">Retorno real</label>
                <input className="input" type="date" value={form.dataRetornoReal ?? ''}
                  onChange={e => setForm(f => ({ ...f, dataRetornoReal: e.target.value }))} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as Terceirizada['status'] }))}>
                  <option value="enviado">Enviado</option>
                  <option value="retornado">Retornado</option>
                  <option value="pago">Pago</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Observações</label>
                <textarea className="input resize-none" rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
            {erro && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{erro}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setModal(false); setErro(null) }} disabled={salvando}
                className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={handleSalvar} disabled={salvando}
                className="btn-primary flex-1 justify-center">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de prestador (Fase D2.1) */}
      {modalPrestador !== undefined && (
        <PrestadorModal
          prestador={modalPrestador}
          servicos={servicos}
          onFechar={() => setModalPrestador(undefined)}
          onSalvo={carregar}
        />
      )}
    </div>
  )
}
