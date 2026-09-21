import { useEffect, useState } from 'react'

/**
 * Só liga o skeleton se o carregamento ainda estiver rolando depois de `ms`
 * (Fase G2.4). Sem o atraso, um carregamento quase instantâneo faz o
 * skeleton "piscar" na tela — pior do que não ter skeleton nenhum.
 */
export function useSkeletonDelay(carregando: boolean, ms = 200): boolean {
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => {
    if (!carregando) {
      setMostrar(false)
      return
    }
    const id = setTimeout(() => setMostrar(true), ms)
    return () => clearTimeout(id)
  }, [carregando, ms])

  return mostrar
}
