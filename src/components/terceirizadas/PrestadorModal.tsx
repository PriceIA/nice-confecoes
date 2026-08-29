'use client'
import { useState } from 'react'
import { Lock, PlusCircle } from 'lucide-react'
import Modal from '@/components/kanban/Modal'
import { atualizarPrestador, atualizarServico, criarPrestador, criarServico } from '@/lib/prestadores'
import { classificarErro } from '@/lib/erros'
import type { Prestador, PrestadorServico, UnidadeServico } from '@/types'

// Modal de prestador — cadastro e os serviços dele, no mesmo lugar (Fase D2.1).
//
// Um prestador NOVO não tem id ainda, então não tem como ter serviço: a seção
// de serviços só aparece depois que o prestador existe no banco. Ao criar,
// o modal não fecha — ele transiciona pro modo edição do mesmo registro
// recém-criado, pra poder cadastrar o preço na sequência sem reabrir nada.
//
// Nunca oferece excluir prestador nem serviço — só ativar/desativar. A trava
// não é só de tela: `terceirizadas.prestador_id` não tem `on delete cascade`
// (migration 015), então excluir um prestador com lançamento vinculado seria
// recusado pelo banco de qualquer forma.

type Props = {
  prestador: Prestador | null
  /** Todos os serviços do sistema; o modal filtra pelo prestador. */
  servicos: PrestadorServico[]
  onFechar: () => void
  /** Chamado depois de qualquer gravação bem-sucedida, pro pai recarregar do banco. */
  onSalvo: () => void | Promise<void>
}

const SERVICO_VAZIO = { servico: '', valor: '', unidade: 'peca' as UnidadeServico }

function descreverFalha(err: unknown, acao: string): string {
  const f = classificarErro(err)
  const cod = f.code ? ` (${f.code})` : ''
  const motivo =
    f.tipo === 'offline'   ? 'Sem conexão com a internet' :
    f.tipo === 'rede'      ? 'Servidor inacessível' :
    f.tipo === 'permissao' ? 'Seu perfil não tem permissão' :
    f.tipo === 'validacao' ? `O banco recusou os dados${cod}: ${f.details || f.message}` :
    `Falha${cod}: ${f.message || 'erro desconhecido'}`
  return `${motivo}, não deu para ${acao}. Nada foi salvo.`
}

export default function PrestadorModal({ prestador, servicos, onFechar, onSalvo }: Props) {
  // Cópia local: começa igual à prop, mas ganha o id depois de criar. É o que
  // faz a seção de serviços aparecer sem fechar e reabrir o modal.
  const [atual, setAtual] = useState<Prestador | null>(prestador)
  const [nome, setNome] = useState(prestador?.nome ?? '')
  const [telefone, setTelefone] = useState(prestador?.telefone ?? '')
  const [documento, setDocumento] = useState(prestador?.documento ?? '')
  const [observacoes, setObservacoes] = useState(prestador?.observacoes ?? '')
  const [novoServico, setNovoServico] = useState(SERVICO_VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const servicosDoPrestador = atual ? servicos.filter(s => s.prestadorId === atual.id) : []

  async function salvarPrestador() {
    if (!nome.trim()) {
      setErro('Preencha o nome do prestador.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      if (atual) {
        await atualizarPrestador(atual.id, { nome, telefone, documento, observacoes })
      } else {
        const criado = await criarPrestador({ nome, telefone, documento, observacoes })
        setAtual(criado)
      }
      await onSalvo()
    } catch (err) {
      setErro(descreverFalha(err, 'salvar o prestador'))
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo() {
    if (!atual) return
    setErro(null)
    try {
      await atualizarPrestador(atual.id, { ativo: !atual.ativo })
      setAtual({ ...atual, ativo: !atual.ativo })
      await onSalvo()
    } catch (err) {
      setErro(descreverFalha(err, atual.ativo ? 'desativar o prestador' : 'reativar o prestador'))
    }
  }

  async function salvarServicoEditado(s: PrestadorServico, dados: Partial<Pick<PrestadorServico, 'servico' | 'valor' | 'unidade'>>) {
    setErro(null)
    try {
      await atualizarServico(s.id, dados)
      await onSalvo()
    } catch (err) {
      setErro(descreverFalha(err, 'salvar o serviço'))
    }
  }

  async function alternarAtivoServico(s: PrestadorServico) {
    setErro(null)
    try {
      await atualizarServico(s.id, { ativo: !s.ativo })
      await onSalvo()
    } catch (err) {
      setErro(descreverFalha(err, s.ativo ? 'desativar o serviço' : 'reativar o serviço'))
    }
  }

  async function adicionarServico() {
    if (!atual) return
    const nomeServico = novoServico.servico.trim()
    const valor = parseFloat(novoServico.valor)
    if (!nomeServico || !(valor >= 0)) {
      setErro('Preencha o nome e o valor do serviço.')
      return
    }
    setErro(null)
    try {
      await criarServico(atual.id, nomeServico, valor, novoServico.unidade)
      setNovoServico(SERVICO_VAZIO)
      await onSalvo()
    } catch (err) {
      setErro(descreverFalha(err, 'criar o serviço'))
    }
  }

  return (
    <Modal aberto titulo={atual ? 'Editar Prestador' : 'Novo Prestador'} onFechar={onFechar} largura="lg"
      rodape={
        <>
          <button onClick={onFechar} className="btn-secondary flex-1 justify-center">Fechar</button>
          <button onClick={salvarPrestador} disabled={salvando} className="btn-primary flex-1 justify-center">
            {salvando ? 'Salvando...' : atual ? 'Salvar' : 'Criar prestador'}
          </button>
        </>
      }>
      <div className="space-y-6">
        {erro && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{erro}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Nome *</label>
            <input className="input" placeholder="Ex: Talícia, Quésia..." value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input className="input" placeholder="(44) 99999-0000" value={telefone} onChange={e => setTelefone(e.target.value)} />
          </div>
          <div>
            <label className="label">CNPJ / CPF</label>
            <input className="input" value={documento} onChange={e => setDocumento(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Observações</label>
            <textarea className="input resize-none" rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)} />
          </div>
        </div>

        {atual && (
          <div className="border-t border-borda pt-4">
            <button type="button" onClick={alternarAtivo}
              className={clsxAtivo(atual.ativo)}>
              {atual.ativo ? 'Desativar prestador' : 'Reativar prestador'}
            </button>
            <p className="text-xs text-fraco mt-1">
              Desativar tira o prestador dos seletores de novo lançamento, mas não apaga o
              histórico já gravado.
            </p>
          </div>
        )}

        {atual ? (
          <div className="border-t border-borda pt-4 space-y-3">
            <label className="label">Serviços e valores</label>

            {servicosDoPrestador.length === 0 ? (
              <p className="text-sm text-suave">Nenhum serviço cadastrado ainda.</p>
            ) : (
              <div className="space-y-2">
                {servicosDoPrestador.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-borda bg-superficie-2">
                    <input
                      className="input flex-1 py-1.5"
                      defaultValue={s.servico}
                      maxLength={60}
                      onBlur={e => {
                        const novo = e.target.value.trim()
                        if (!novo || novo === s.servico) { e.target.value = s.servico; return }
                        salvarServicoEditado(s, { servico: novo })
                      }}
                    />
                    <input
                      className="input w-28 py-1.5"
                      type="number"
                      step="0.01"
                      defaultValue={s.valor}
                      onBlur={e => {
                        const novo = parseFloat(e.target.value)
                        if (!(novo >= 0) || novo === s.valor) { e.target.value = String(s.valor); return }
                        salvarServicoEditado(s, { valor: novo })
                      }}
                    />
                    <select className="input w-28 py-1.5" value={s.unidade}
                      onChange={e => salvarServicoEditado(s, { unidade: e.target.value as UnidadeServico })}>
                      <option value="peca">por peça</option>
                      <option value="fixo">fixo</option>
                    </select>
                    <button type="button" onClick={() => alternarAtivoServico(s)}
                      className="text-xs font-semibold text-suave hover:text-conteudo whitespace-nowrap">
                      {s.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input className="input flex-1" placeholder="Novo serviço (ex: Bordado ponto cheio)"
                value={novoServico.servico}
                onChange={e => setNovoServico(f => ({ ...f, servico: e.target.value }))} />
              <input className="input w-28" type="number" step="0.01" placeholder="Valor"
                value={novoServico.valor}
                onChange={e => setNovoServico(f => ({ ...f, valor: e.target.value }))} />
              <select className="input w-28" value={novoServico.unidade}
                onChange={e => setNovoServico(f => ({ ...f, unidade: e.target.value as UnidadeServico }))}>
                <option value="peca">por peça</option>
                <option value="fixo">fixo</option>
              </select>
              <button type="button" className="btn-secondary" onClick={adicionarServico}>
                <PlusCircle className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-fraco flex items-center gap-1">
              <Lock className="w-3 h-3" /> Serviço nunca é excluído — só desativado. Editar o
              valor aqui não muda lançamentos já registrados.
            </p>
          </div>
        ) : (
          <p className="text-xs text-fraco border-t border-borda pt-4">
            Salve o prestador primeiro para cadastrar os serviços e valores dele.
          </p>
        )}
      </div>
    </Modal>
  )
}

function clsxAtivo(ativo: boolean) {
  return ativo
    ? 'text-xs font-semibold text-red-600 hover:text-red-700'
    : 'text-xs font-semibold text-marca-texto hover:underline'
}
