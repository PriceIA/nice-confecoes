import clsx from 'clsx'

/**
 * Um bloco cinza pulsando — a peça básica dos skeletons da Fase G2.4.
 * Decorativo: a tela que usa isto marca o container com `aria-busy` e um
 * `role="status"` com texto em `sr-only`, então isto aqui não precisa dizer
 * nada para leitor de tela.
 */
export default function EsqueletoBarra({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx('rounded bg-superficie-3 animate-pulse', className)} />
}
