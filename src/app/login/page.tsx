import LoginForm from './LoginForm'

// Server component só para ler o searchParams sem precisar de Suspense.
export default function LoginPage({
  searchParams,
}: {
  searchParams: { erro?: string }
}) {
  const avisoInicial =
    searchParams.erro === 'sem-equipe'
      ? 'Seu usuário existe, mas não está cadastrado na equipe. Fale com o gestor.'
      : null

  return <LoginForm avisoInicial={avisoInicial} />
}
