// Apresentação do Kanban: cores de lista, urgência de prazo e o texto sugerido
// ao exportar um pedido para cartão. Sem acesso a dados — isso é kanban.ts.

import { differenceInCalendarDays, format } from 'date-fns'
import type { Cartao, CorLista, Pedido } from '@/types'
import type { Perfil } from '@/lib/permissoes'
import { totalPecas } from '@/lib/helpers'
import { classificarErro, sufixoCodigo } from '@/lib/erros'

// ---------------------------------------------------------------------------
// Mensagens de falha
// ---------------------------------------------------------------------------

export type MsgKanban = { tipo: 'erro' | 'ok'; texto: string }

/**
 * Mensagem de falha do Kanban.
 *
 * A regra inegociável desta tela: nunca deixar o usuário achando que salvou.
 * Quando `revertido` é true (arrasto otimista que falhou na gravação), a
 * mensagem diz, com todas as letras, que a tela voltou atrás — a /tabela-precos
 * já teve exatamente o bug de mostrar algo que o banco não tinha.
 *
 * `permissao` merece texto próprio porque, num módulo com RLS ligado, "não
 * salvou" quase sempre é policy negando, não rede caindo.
 */
export function descreverFalhaKanban(err: unknown, acao: string, revertido = false): MsgKanban {
  const falha = classificarErro(err)
  const cod = sufixoCodigo(falha)
  const fim = revertido
    ? 'A alteração NÃO foi salva e a tela voltou ao que está no banco.'
    : 'Nada foi salvo.'

  switch (falha.tipo) {
    case 'offline':
      return { tipo: 'erro', texto: `Sem conexão com a internet, não deu para ${acao}. ${fim}` }
    case 'rede':
      return { tipo: 'erro', texto: `Servidor inacessível, não deu para ${acao}. ${fim}` }
    case 'permissao':
      return { tipo: 'erro', texto: `Seu perfil não tem permissão para ${acao}. ${fim}` }
    case 'validacao':
      return {
        tipo: 'erro',
        texto: `O banco recusou os dados${cod}: ${falha.details || falha.message || 'valor inválido'}. ${fim}`,
      }
    default:
      return {
        tipo: 'erro',
        texto: `Falha ao ${acao}${cod}: ${falha.message || 'erro desconhecido'}. ${fim}`,
      }
  }
}

// ---------------------------------------------------------------------------
// Cores de lista
// ---------------------------------------------------------------------------

/**
 * Nenhuma cor nova: verde é a paleta Nice (tailwind.config.ts) e o resto são os
 * mesmos tons já usados em STATUS_CONFIG e COMPLEXIDADE_CONFIG (helpers.ts).
 *
 * As classes estão escritas por extenso porque o Tailwind varre o código como
 * texto — `bg-${cor}-400` não geraria CSS nenhum.
 */
export const CORES_LISTA: Record<CorLista, { label: string; barra: string; ponto: string }> = {
  verde:       { label: 'Verde',    barra: 'bg-nice-500',   ponto: 'bg-nice-500' },
  verde_claro: { label: 'Menta',    barra: 'bg-nice-300',   ponto: 'bg-nice-300' },
  cinza:       { label: 'Cinza',    barra: 'bg-gray-400',   ponto: 'bg-gray-400' },
  azul:        { label: 'Azul',     barra: 'bg-blue-400',   ponto: 'bg-blue-400' },
  ambar:       { label: 'Âmbar',    barra: 'bg-amber-400',  ponto: 'bg-amber-400' },
  roxo:        { label: 'Roxo',     barra: 'bg-purple-400', ponto: 'bg-purple-400' },
  vermelho:    { label: 'Vermelho', barra: 'bg-red-400',    ponto: 'bg-red-400' },
}

export const CORES_LISTA_KEYS = Object.keys(CORES_LISTA) as CorLista[]

export function corDaLista(cor: CorLista) {
  return CORES_LISTA[cor] ?? CORES_LISTA.verde
}

// ---------------------------------------------------------------------------
// Prazo
// ---------------------------------------------------------------------------

export type BadgePrazo = { texto: string; classes: string; titulo: string }

/**
 * Badge de prazo do cartão, com destaque por urgência:
 * atrasado vermelho · ≤3 dias laranja · ≤7 dias amarelo · resto neutro.
 *
 * Cartão concluído perde a urgência — o prazo continua visível, mas em cinza:
 * um cartão feito não pode gritar "atrasado".
 */
export function badgePrazo(prazo: string | null, concluido = false): BadgePrazo | null {
  if (!prazo) return null

  const data = new Date(prazo + 'T00:00:00')
  if (isNaN(data.getTime())) return null

  const curto = format(data, 'dd/MM')
  const longo = format(data, 'dd/MM/yyyy')

  if (concluido) {
    return { texto: curto, classes: 'bg-superficie-3 text-suave', titulo: `Prazo: ${longo}` }
  }

  const dias = differenceInCalendarDays(data, new Date())

  if (dias < 0) {
    const atraso = Math.abs(dias)
    return {
      texto: `Atrasado ${atraso}d`,
      classes: 'bg-red-100 text-red-700',
      titulo: `Venceu em ${longo} — ${atraso} dia(s) de atraso`,
    }
  }
  if (dias === 0) {
    return { texto: 'Hoje', classes: 'bg-orange-100 text-orange-700', titulo: `Prazo: ${longo}` }
  }
  if (dias === 1) {
    return { texto: 'Amanhã', classes: 'bg-orange-100 text-orange-700', titulo: `Prazo: ${longo}` }
  }
  if (dias <= 3) {
    return { texto: `${dias} dias`, classes: 'bg-orange-100 text-orange-700', titulo: `Prazo: ${longo}` }
  }
  if (dias <= 7) {
    return { texto: curto, classes: 'bg-yellow-100 text-yellow-700', titulo: `Prazo: ${longo} — em ${dias} dias` }
  }
  return { texto: curto, classes: 'bg-superficie-3 text-suave', titulo: `Prazo: ${longo}` }
}

// ---------------------------------------------------------------------------
// Pedido → cartão
// ---------------------------------------------------------------------------

/**
 * Um pedido está pronto para virar cartão quando os 8 setores estão
 * concluídos OU marcados como não aplicáveis a ele (Fase C0) — é o mesmo
 * critério que libera /entregas, ver CLAUDE.md regra 9.
 */
export function pedidoConcluido(pedido: Pedido): boolean {
  const setores = Object.values(pedido.progresso ?? {})
  return setores.length > 0 && setores.every(s => s.status === 'concluido' || s.status === 'nao_se_aplica')
}

export function tituloSugerido(pedido: Pedido): string {
  const cliente = pedido.cliente.empresa || pedido.cliente.nome
  return `Pedido #${pedido.numero}${cliente ? ` — ${cliente}` : ''}`
}

/** Rascunho de descrição. É sugestão: quem cria o cartão pode reescrever tudo. */
export function descricaoSugerida(pedido: Pedido): string {
  const linhas: string[] = []

  if (pedido.cliente.nome) linhas.push(`Cliente: ${pedido.cliente.nome}`)
  if (pedido.cliente.telefone) linhas.push(`Telefone: ${pedido.cliente.telefone}`)

  for (const p of pedido.pecas ?? []) {
    const qtd = p.tamanhos.reduce((a, t) => a + t.quantidade, 0)
    linhas.push(`• ${p.tipo}${p.cor ? ` (${p.cor})` : ''} — ${qtd} un.`)
  }

  linhas.push(`Total: ${totalPecas(pedido)} un.`)
  if (pedido.dataEntrega) {
    linhas.push(`Entrega: ${format(new Date(pedido.dataEntrega), 'dd/MM/yyyy')}`)
  }

  return linhas.join('\n')
}

// ---------------------------------------------------------------------------
// Ordenação
// ---------------------------------------------------------------------------

/** Empate de posicao é desempatado pelo id, para a ordem não oscilar entre renders. */
export function porPosicao<T extends { posicao: number; id: string }>(a: T, b: T): number {
  return a.posicao - b.posicao || a.id.localeCompare(b.id)
}

export function cartoesDaLista(cartoes: Cartao[], listaId: string): Cartao[] {
  return cartoes.filter(c => c.listaId === listaId).sort(porPosicao)
}

// ---------------------------------------------------------------------------
// Visibilidade do cartão (Fase D2.2)
// ---------------------------------------------------------------------------

export type ModoVisibilidade = 'todos' | 'gestao' | 'grupo' | 'pessoas' | 'privado'

export const OPCOES_VISIBILIDADE: { value: ModoVisibilidade; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'gestao', label: 'Só a gestão' },
  { value: 'grupo', label: 'Grupo (perfis)' },
  { value: 'pessoas', label: 'Pessoas específicas' },
  { value: 'privado', label: 'Privado (só eu)' },
]

/** A dupla que "Só a gestão" grava em `perfisVisiveis` — sempre as duas juntas. */
export const PERFIS_GESTAO: Perfil[] = ['gestor', 'recepcionista']

function mesmoConjunto(a: Perfil[], b: Perfil[]): boolean {
  return a.length === b.length && a.every(p => b.includes(p))
}

/**
 * As 5 opções de visibilidade são mutuamente exclusivas na TELA, mas o banco
 * só guarda 3 colunas (`privado`, `perfis_visiveis`, `membros_visiveis`) — é
 * esta função que faz o caminho de volta, pro seletor de edição nascer na
 * opção certa em vez de sempre em "Todos".
 *
 * A ordem de checagem importa e é a mesma que a gravação respeita:
 * `privado` vence tudo (é a única opção que esconde até da gestão);
 * depois `membrosVisiveis` (Pessoas específicas); depois o caso especial de
 * `perfisVisiveis` ser EXATAMENTE `['gestor','recepcionista']` (Só a
 * gestão) — sem essa checagem, editar um cartão assim reabriria mostrando
 * "Grupo" com os dois perfis certos marcados, o que não está errado, mas
 * esconde que existe o atalho; por fim `perfisVisiveis` não-vazio é
 * "Grupo", e a ausência de tudo é "Todos".
 *
 * 34 dos 42 cartões existentes hoje já têm `perfisVisiveis` restrito — não
 * pode nascer mostrando "Todos" errado pra eles.
 */
export function modoVisibilidadeDe(
  cartao: Pick<Cartao, 'privado' | 'membrosVisiveis' | 'perfisVisiveis'>,
): ModoVisibilidade {
  if (cartao.privado) return 'privado'
  if (cartao.membrosVisiveis && cartao.membrosVisiveis.length > 0) return 'pessoas'
  if (cartao.perfisVisiveis && mesmoConjunto(cartao.perfisVisiveis, PERFIS_GESTAO)) return 'gestao'
  if (cartao.perfisVisiveis && cartao.perfisVisiveis.length > 0) return 'grupo'
  return 'todos'
}
