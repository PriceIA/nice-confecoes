// Anexos de peça: o que o cliente ou o designer manda como arte.
//
// O campo continua sendo `fotos: string[]` (URLs públicas do bucket
// `pedido-fotos`) e NÃO virou objeto de propósito: pedido gravado antes desta
// mudança tem exatamente a mesma forma, e trocar o formato exigiria migrar o
// JSONB de todos os pedidos antigos. O TIPO do arquivo é lido da própria URL.
//
// A arte chega em PDF com frequência — é o formato em que o vetor sai. Quem
// desenha a miniatura precisa saber a diferença: `<img src="...pdf">` não
// renderiza nada, mostra o ícone de imagem quebrada.

/** O que o seletor de arquivo aceita: imagem de qualquer formato, mais PDF. */
export const TIPOS_ACEITOS = 'image/*,application/pdf,.pdf'

/**
 * Teto por arquivo. O padrão do bucket no Supabase free é 50 MB; cortamos um
 * pouco antes para o erro aparecer aqui, com texto em português, em vez de
 * voltar como falha crua do Storage.
 */
export const TAMANHO_MAXIMO_MB = 45

const RE_UUID_PREFIXO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i

/** Só o nome do arquivo na URL, sem query string. */
function baseName(url: string): string {
  const semQuery = url.split('?')[0]
  try {
    return decodeURIComponent(semQuery.split('/').pop() ?? '')
  } catch {
    return semQuery.split('/').pop() ?? ''
  }
}

export function extensaoDe(url: string): string {
  const nome = baseName(url)
  const i = nome.lastIndexOf('.')
  return i === -1 ? '' : nome.slice(i + 1).toLowerCase()
}

export function ehPdf(url: string): boolean {
  return extensaoDe(url) === 'pdf'
}

/**
 * Nome legível para mostrar na miniatura.
 *
 * Arquivo enviado a partir desta mudança guarda o nome original depois do
 * uuid (`{uuid}-arte-frente.pdf`), então dá para devolver "arte-frente.pdf".
 * Arquivo antigo é só `{uuid}.png` — aí não há nome a recuperar, e o fallback
 * é a extensão.
 */
export function nomeVisivel(url: string): string {
  const nome = baseName(url)
  const semUuid = nome.replace(RE_UUID_PREFIXO, '')
  if (semUuid && semUuid !== nome) return semUuid
  const ext = extensaoDe(url)
  return ext ? `arquivo.${ext}` : 'arquivo'
}

/**
 * Primeira imagem da lista. A ficha A4 impressa mostra UMA miniatura, e ela só
 * faz sentido se for imagem: peça que só tem PDF anexado devolve `undefined`
 * e a ficha escreve isso em texto, em vez de imprimir um quadrado quebrado.
 */
export function primeiraImagem(urls: string[] | undefined): string | undefined {
  return (urls ?? []).find(u => !ehPdf(u))
}

/** Quantos anexos da peça são PDF — a ficha impressa avisa que existem. */
export function contarPdfs(urls: string[] | undefined): number {
  return (urls ?? []).filter(ehPdf).length
}

/**
 * Nome de arquivo seguro para chave do Storage: o Supabase recusa alguns
 * caracteres, e acento atrapalha na URL pública. Mantém letra, número, ponto,
 * hífen e underscore; o resto vira hífen.
 */
export function sanitizarNome(nome: string): string {
  return nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}
