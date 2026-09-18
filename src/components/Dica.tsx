import clsx from 'clsx'

type Lado = 'top' | 'bottom' | 'left' | 'right'

const POSICAO: Record<Lado, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
}

interface Props {
  /** Texto da dica. É decorativo: o nome acessível do controle vem do aria-label dele, não daqui. */
  texto: string
  lado?: Lado
  children: React.ReactNode
  className?: string
}

/**
 * Tooltip 100% CSS (Fase G1): sem useState, sem listener, sem re-render por
 * mouseenter — numa lista de dezenas de pedidos isso importa (etapa G3 conta
 * com isso). Aparece no :hover e no :focus-visible do filho, porque quem
 * navega por teclado também precisa ver a dica.
 *
 * Armadilha conhecida (docs/fase-g.md, G1 · 3.2): `position: absolute` é
 * cortado dentro de um ancestral com overflow:hidden/auto (ex.: a tabela de
 * /pedidos). Não use <Dica> ali — use `title=` nativo nessas células, ou
 * troque este posicionamento por Popover API / position:fixed quando isso
 * for realmente preciso.
 */
export default function Dica({ texto, lado = 'top', children, className }: Props) {
  return (
    <span className={clsx('group/dica relative inline-flex', className)}>
      {children}
      <span
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute z-20 w-max max-w-[min(16rem,calc(100vw-2rem))] rounded-lg border px-2.5 py-1.5 text-xs font-medium',
          'bg-superficie text-conteudo border-borda-forte opacity-0 transition-opacity duration-150',
          'group-hover/dica:opacity-100 group-has-[:focus-visible]/dica:opacity-100',
          'print:hidden',
          POSICAO[lado],
        )}
        style={{ boxShadow: 'var(--sombra-media)' }}
      >
        {texto}
      </span>
    </span>
  )
}
