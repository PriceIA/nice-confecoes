import { ExcecaoPagamento, Pedido } from '@/types'

// Regra 1 do CLAUDE.md e sua única exceção.
//
// "Pedido não avança para produção sem pagamento registrado" continua valendo.
// O que muda é que agora existe UM jeito explícito de abrir exceção — cliente
// fiel que paga na retirada — em vez de alguém lançar um pagamento que não
// aconteceu para destravar a tela.
//
// Tudo o que decide se o pedido pode ou não avançar mora aqui, e não espalhado
// pelas telas: /pedidos/[id] e qualquer coisa que venha depois perguntam a
// mesma função.

/** O pedido tem liberação APROVADA para pagar na retirada? */
export function excecaoAprovada(pedido: Pick<Pedido, 'excecaoPagamento'>): boolean {
  return pedido.excecaoPagamento?.status === 'aprovada'
}

/** Existe pedido de liberação esperando decisão do gestor? */
export function excecaoPendente(pedido: Pick<Pedido, 'excecaoPagamento'>): boolean {
  return pedido.excecaoPagamento?.status === 'pendente'
}

/**
 * O pedido pode ir para produção?
 *
 * Duas portas, nunca mais que isso: ou há pagamento registrado, ou há
 * liberação aprovada. Solicitação PENDENTE não abre nada — é justamente o
 * ponto do fluxo: a Kalomira pede e o pedido continua parado até o Pedro
 * decidir.
 */
export function podeIrParaProducao(pedido: Pick<Pedido, 'valorPago' | 'excecaoPagamento'>): boolean {
  return (pedido.valorPago ?? 0) > 0 || excecaoAprovada(pedido)
}

/** Frase para a tela quando `podeIrParaProducao` é falso. */
export function motivoBloqueio(pedido: Pick<Pedido, 'valorPago' | 'excecaoPagamento'>): string | null {
  if (podeIrParaProducao(pedido)) return null
  if (excecaoPendente(pedido)) {
    return 'A liberação para pagar na retirada foi solicitada e ainda aguarda aprovação do gestor. Enquanto isso, o pedido não avança para produção.'
  }
  if (pedido.excecaoPagamento?.status === 'recusada') {
    return 'A liberação para pagar na retirada foi recusada. Registre o pagamento para o pedido avançar.'
  }
  return 'Pedido não pode ir para produção sem pagamento registrado. Registre o pagamento ou solicite a liberação para pagar na retirada.'
}

/** Solicitação da recepcionista: nasce pendente, não libera nada. */
export function novaSolicitacao(quem: string, motivo: string): ExcecaoPagamento {
  return {
    status: 'pendente',
    motivo,
    solicitadoPor: quem,
    solicitadoEm: new Date().toISOString(),
  }
}

/**
 * Liberação direta do gestor: ele é quem solicita e quem decide, então os dois
 * pares de campos são preenchidos de uma vez — e ficam registrados assim, sem
 * fingir que houve uma solicitação de outra pessoa.
 */
export function liberacaoDireta(quem: string, motivo: string): ExcecaoPagamento {
  const agora = new Date().toISOString()
  return {
    status: 'aprovada',
    motivo,
    solicitadoPor: quem,
    solicitadoEm: agora,
    decididoPor: quem,
    decididoEm: agora,
  }
}

/** Decisão do gestor sobre uma solicitação existente. Preserva quem pediu. */
export function decidir(
  atual: ExcecaoPagamento,
  aprovar: boolean,
  quem: string,
  observacao?: string,
): ExcecaoPagamento {
  return {
    ...atual,
    status: aprovar ? 'aprovada' : 'recusada',
    decididoPor: quem,
    decididoEm: new Date().toISOString(),
    ...(observacao?.trim() ? { decisaoObservacao: observacao.trim() } : {}),
  }
}
