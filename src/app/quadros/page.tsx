'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive, ArchiveRestore, KanbanSquare, Pencil, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useMembro } from '@/components/AuthProvider'
import Modal from '@/components/kanban/Modal'
import BannerErro from '@/components/kanban/BannerErro'
import { descreverFalhaKanban, type MsgKanban } from '@/lib/kanban-ui'
import {
  atualizarQuadro, criarQuadro, excluirQuadro, getContagens, getQuadros,
  type ContagemQuadro,
} from '@/lib/kanban'
import type { Quadro } from '@/types'

type Rascunho = { titulo: string; descricao: string }
const RASCUNHO_VAZIO: Rascunho = { titulo: '', descricao: '' }

export default function QuadrosPage() {
  const { permissoes } = useMembro()
  const podeEditar = permissoes.editarKanban

  const [quadros, setQuadros] = useState<Quadro[]>([])
  const [contagens, setContagens] = useState<Record<string, ContagemQuadro>>({})
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState<MsgKanban | null>(null)
  const [verArquivados, setVerArquivados] = useState(false)

  // Modal de criar/renomear. `editando` null = criando.
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Quadro | null>(null)
  const [rascunho, setRascunho] = useState<Rascunho>(RASCUNHO_VAZIO)
  const [salvando, setSalvando] = useState(false)

  const [confirmarExclusao, setConfirmarExclusao] = useState<Quadro | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      const [lista, cont] = await Promise.all([getQuadros(true), getContagens()])
      setQuadros(lista)
      setContagens(cont)
    } catch (err) {
      setMsg(descreverFalhaKanban(err, 'carregar os quadros'))
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const visiveis = quadros.filter(q => verArquivados || !q.arquivado)
  const qtdArquivados = quadros.filter(q => q.arquivado).length

  function abrirCriacao() {
    setEditando(null)
    setRascunho(RASCUNHO_VAZIO)
    setModalAberto(true)
  }

  function abrirEdicao(q: Quadro) {
    setEditando(q)
    setRascunho({ titulo: q.titulo, descricao: q.descricao })
    setModalAberto(true)
  }

  // Grava e SÓ DEPOIS mexe na tela. Aqui o usuário está num modal esperando —
  // não há nada a ganhar sendo otimista, e assim a lista nunca mostra um quadro
  // que o banco recusou.
  async function salvar() {
    const titulo = rascunho.titulo.trim()
    if (!titulo) return

    setSalvando(true)
    try {
      if (editando) {
        await atualizarQuadro(editando.id, { titulo, descricao: rascunho.descricao.trim() })
      } else {
        await criarQuadro(titulo, rascunho.descricao.trim())
      }
      setModalAberto(false)
      setMsg(null)
      await carregar()
    } catch (err) {
      setMsg(descreverFalhaKanban(err, editando ? 'renomear o quadro' : 'criar o quadro'))
    } finally {
      setSalvando(false)
    }
  }

  async function alternarArquivo(q: Quadro) {
    try {
      await atualizarQuadro(q.id, { arquivado: !q.arquivado })
      setMsg(null)
      await carregar()
    } catch (err) {
      setMsg(descreverFalhaKanban(err, q.arquivado ? 'desarquivar o quadro' : 'arquivar o quadro'))
    }
  }

  async function excluir() {
    if (!confirmarExclusao) return
    setSalvando(true)
    try {
      await excluirQuadro(confirmarExclusao.id)
      setConfirmarExclusao(null)
      setMsg(null)
      await carregar()
    } catch (err) {
      setMsg(descreverFalhaKanban(err, 'excluir o quadro'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-titulo">Quadros</h1>
          <p className="text-sm text-suave mt-0.5">
            Tarefas livres, organizadas em listas e cartões.
            {!podeEditar && ' Seu perfil vê os quadros, mas não altera.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {qtdArquivados > 0 && (
            <button onClick={() => setVerArquivados(v => !v)} className="btn-secondary">
              <Archive className="w-4 h-4" />
              {verArquivados ? 'Ocultar arquivados' : `Arquivados (${qtdArquivados})`}
            </button>
          )}
          {podeEditar && (
            <button onClick={abrirCriacao} className="btn-primary">
              <Plus className="w-4 h-4" /> Novo Quadro
            </button>
          )}
        </div>
      </div>

      {carregando ? (
        <div className="text-fraco text-sm">Carregando...</div>
      ) : visiveis.length === 0 ? (
        <div className="card py-20 text-center text-fraco space-y-3">
          <KanbanSquare className="w-10 h-10 mx-auto text-fraco" />
          <p className="text-sm">
            {quadros.length === 0
              ? 'Nenhum quadro ainda.'
              : 'Todos os quadros estão arquivados.'}
          </p>
          {podeEditar && quadros.length === 0 && (
            <button onClick={abrirCriacao} className="btn-primary mx-auto">
              <Plus className="w-4 h-4" /> Criar o primeiro quadro
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visiveis.map(q => {
            const c = contagens[q.id] ?? { listas: 0, cartoes: 0 }
            return (
              <div
                key={q.id}
                className={clsx(
                  'card p-0 overflow-hidden flex flex-col hover:shadow-md transition-shadow',
                  q.arquivado && 'opacity-60'
                )}
              >
                <Link href={`/quadros/${q.id}`} className="flex-1 p-5 space-y-2">
                  <div className="flex items-start gap-2">
                    <h2 className="font-semibold text-titulo flex-1 min-w-0 break-words">{q.titulo}</h2>
                    {q.arquivado && <span className="badge bg-superficie-3 text-suave shrink-0">arquivado</span>}
                  </div>
                  {q.descricao && (
                    <p className="text-sm text-suave line-clamp-2">{q.descricao}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-fraco pt-1">
                    <span>{c.listas} lista(s)</span>
                    <span className="text-fraco">·</span>
                    <span>{c.cartoes} cartão(ões)</span>
                  </div>
                </Link>

                {podeEditar && (
                  <div className="flex items-center gap-1 px-3 py-2 border-t border-borda bg-superficie-2">
                    <button onClick={() => abrirEdicao(q)} title="Renomear"
                      className="p-2 rounded-lg text-fraco hover:text-marca-texto hover:bg-superficie">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => alternarArquivo(q)} title={q.arquivado ? 'Desarquivar' : 'Arquivar'}
                      className="p-2 rounded-lg text-fraco hover:text-marca-texto hover:bg-superficie">
                      {q.arquivado ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setConfirmarExclusao(q)} title="Excluir"
                      className="p-2 rounded-lg text-fraco hover:text-red-600 hover:bg-superficie ml-auto">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Criar / renomear */}
      <Modal
        aberto={modalAberto}
        titulo={editando ? 'Renomear quadro' : 'Novo quadro'}
        onFechar={() => setModalAberto(false)}
        rodape={
          <>
            <button onClick={() => setModalAberto(false)} className="btn-secondary flex-1 justify-center">
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando || !rascunho.titulo.trim()}
              className="btn-primary flex-1 justify-center disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Título *</label>
            <input className="input" autoFocus value={rascunho.titulo}
              onChange={e => setRascunho(r => ({ ...r, titulo: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') salvar() }}
              placeholder="Ex.: Arte e vetorização" />
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea className="input min-h-[80px] resize-y" value={rascunho.descricao}
              onChange={e => setRascunho(r => ({ ...r, descricao: e.target.value }))}
              placeholder="Para que serve este quadro" />
          </div>
        </div>
      </Modal>

      {/* Confirmação de exclusão */}
      <Modal
        aberto={confirmarExclusao !== null}
        titulo="Excluir quadro"
        onFechar={() => setConfirmarExclusao(null)}
        rodape={
          <>
            <button onClick={() => setConfirmarExclusao(null)} className="btn-secondary flex-1 justify-center">
              Cancelar
            </button>
            <button onClick={excluir} disabled={salvando}
              className="btn-perigo flex-1 justify-center disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {salvando ? 'Excluindo...' : 'Excluir'}
            </button>
          </>
        }
      >
        <p className="text-sm text-suave">
          Excluir <strong className="text-titulo">{confirmarExclusao?.titulo}</strong> apaga
          também todas as listas e cartões dele. Não dá para desfazer.
        </p>
        <p className="text-sm text-suave mt-3">
          Se a ideia é só tirar da frente, prefira <strong>arquivar</strong>.
        </p>
      </Modal>

      <BannerErro msg={msg} onFechar={() => setMsg(null)} onRecarregar={carregar} />
    </div>
  )
}
