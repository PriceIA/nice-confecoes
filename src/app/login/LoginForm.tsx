'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { LogoNiceN } from '@/components/LogoNiceN'
import { criarClienteBrowser } from '@/lib/supabase/client'
import BotaoTema from '@/components/BotaoTema'
import { rotaInicialDe, type Perfil } from '@/lib/permissoes'

// O login é por usuário curto (sem @); o domínio é fixo e interno.
const DOMINIO = '@niceconfec.app'

export default function LoginForm({ avisoInicial }: { avisoInicial: string | null }) {
  const router = useRouter()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(avisoInicial)
  const [entrando, setEntrando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    const login = usuario.trim().toLowerCase()
    if (!login || !senha) {
      setErro('Preencha usuário e senha.')
      return
    }

    setEntrando(true)
    setErro(null)

    const supabase = criarClienteBrowser()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${login}${DOMINIO}`,
      password: senha,
    })

    // Mensagem única e genérica: detalhar o motivo entrega a um atacante se o
    // usuário existe. O erro técnico do Supabase não vai para a tela.
    if (error || !data.user) {
      setErro('Usuário ou senha incorretos.')
      setEntrando(false)
      return
    }

    const { data: membro } = await supabase
      .from('equipe')
      .select('perfil')
      .eq('auth_user_id', data.user.id)
      .maybeSingle()

    if (!membro) {
      await supabase.auth.signOut()
      setErro('Seu usuário não está cadastrado na equipe. Fale com o gestor.')
      setEntrando(false)
      return
    }

    router.replace(rotaInicialDe(membro.perfil as Perfil))
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-fundo px-4">
      {/* O /login não tem sidebar nem topbar, então o alternador fica solto no
          canto — senão não haveria como trocar o tema antes de entrar. */}
      <div className="absolute top-4 right-4">
        <BotaoTema variante="avulso" />
      </div>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-nice-500 flex items-center justify-center shadow-md mb-3">
            <LogoNiceN className="w-12 h-11 text-white" />
          </div>
          <h1 className="text-xl font-bold text-titulo">Nice Confecções</h1>
          <p className="text-sm text-suave mt-0.5">Gestão de pedidos</p>
        </div>

        <form onSubmit={entrar} className="card space-y-4">
          <div>
            <label className="label" htmlFor="usuario">Usuário</label>
            <input
              id="usuario"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              placeholder="seu usuário"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="senha">Senha</label>
            <input
              id="senha"
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={senha}
              onChange={e => setSenha(e.target.value)}
            />
          </div>

          {erro && (
            <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {erro}
            </p>
          )}

          <button type="submit" disabled={entrando} className="btn-primary w-full justify-center">
            {entrando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {entrando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
