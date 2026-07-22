import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Endpoint de keep-alive: mantém o projeto Supabase ativo evitando a pausa
// automática por inatividade (plano free pausa após 7 dias). Chamado pelo
// cron da Vercel (ver vercel.json). Não requer autenticação.

// Evita cache — a query precisa ir ao banco a cada chamada do cron.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const { error } = await supabase
      .from('pedidos')
      .select('id')
      .limit(1)

    if (error) {
      return NextResponse.json(
        { status: 'error', error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      },
      { status: 500 }
    )
  }
}
