'use client'
import { useState } from 'react'
import { KeyRound, Loader2, User } from 'lucide-react'
import { criarClienteBrowser } from '@/lib/supabase/client'
import { useMembro } from '@/components/AuthProvider'
import { PERFIL_LABEL } from '@/lib/permissoes'

const MIN_SENHA = 6

export default function PerfilPage() {
  const { membro } = useMembro()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)

    if (senha.length < MIN_SENHA) {
      setMsg({ tipo: 'err', texto: `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.` })
      return
    }
    if (senha !== confirmacao) {
      setMsg({ tipo: 'err', texto: 'As senhas não conferem.' })
      return
    }

    setSalvando(true)
    const { error } = await criarClienteBrowser().auth.updateUser({ password: senha })
    setSalvando(false)

    if (error) {
      setMsg({ tipo: 'err', texto: 'Não foi possível trocar a senha. Tente novamente.' })
      return
    }

    setSenha('')
    setConfirmacao('')
    setMsg({ tipo: 'ok', texto: 'Senha alterada com sucesso.' })
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-titulo">Meu perfil</h1>
        <p className="text-sm text-suave mt-0.5">Seus dados de acesso</p>
      </div>

      <div className="card">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-nice-500 flex items-center justify-center text-white font-bold">
            {membro?.nome?.charAt(0).toUpperCase() ?? <User className="w-5 h-5" />}
          </div>
          <div>
            <div className="font-semibold text-conteudo">{membro?.nome ?? '—'}</div>
            <div className="text-sm text-suave">
              {membro ? PERFIL_LABEL[membro.perfil] : '—'}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={trocarSenha} className="card space-y-4">
        <div className="flex items-center gap-2 text-marca-texto">
          <KeyRound className="w-4 h-4" />
          <h2 className="font-semibold text-sm">Trocar senha</h2>
        </div>

        <div>
          <label className="label" htmlFor="senha">Nova senha</label>
          <input
            id="senha"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={senha}
            onChange={e => setSenha(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="confirmacao">Confirmar nova senha</label>
          <input
            id="confirmacao"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirmacao}
            onChange={e => setConfirmacao(e.target.value)}
          />
        </div>

        {msg && (
          <p className={msg.tipo === 'ok'
            ? 'text-sm text-green-600 font-medium'
            : 'text-sm text-red-600 font-medium'}>
            {msg.texto}
          </p>
        )}

        <button type="submit" disabled={salvando} className="btn-primary w-full justify-center">
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {salvando ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  )
}
