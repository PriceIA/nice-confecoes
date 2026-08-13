import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ehRotaPublica, podeAcessarRota, rotaInicialDe, type Perfil } from '@/lib/permissoes'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Repassa os cookies de sessão renovados para qualquer redirect que sair daqui,
  // senão o refresh de token se perde e o usuário cai em loop de login.
  const redirecionar = (destino: string) => {
    const url = request.nextUrl.clone()
    url.pathname = destino
    url.search = ''
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach(c => redirect.cookies.set(c))
    return redirect
  }

  // getUser() valida o token no servidor. Não usar getSession() aqui: ele confia
  // no cookie sem verificar.
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user) {
    return ehRotaPublica(pathname) ? response : redirecionar('/login')
  }

  // Autenticado no Supabase Auth, mas sem linha correspondente em `equipe`:
  // não dá para saber o perfil, então não entra.
  const { data: membro } = await supabase
    .from('equipe')
    .select('perfil')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!membro) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = '?erro=sem-equipe'
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach(c => redirect.cookies.set(c))
    return redirect
  }

  const perfil = membro.perfil as Perfil

  if (ehRotaPublica(pathname)) return redirecionar(rotaInicialDe(perfil))
  if (!podeAcessarRota(perfil, pathname)) return redirecionar(rotaInicialDe(perfil))

  return response
}

export const config = {
  // Exclui assets estáticos e TODA a /api — o cron de /api/keep-alive precisa
  // continuar respondendo sem sessão (ver vercel.json).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
