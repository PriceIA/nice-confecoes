'use client'
import { useParams } from 'next/navigation'
import QuadroBoard from '@/components/kanban/QuadroBoard'

// Página fina de propósito: todo o estado do quadro (listas, cartões, arrasto,
// rollback) vive em QuadroBoard.
export default function QuadroPage() {
  const { id } = useParams()
  return <QuadroBoard quadroId={id as string} />
}
