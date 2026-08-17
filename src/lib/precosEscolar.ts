// Fonte única dos preços "de fábrica" da categoria Escolar — usada como valor
// inicial da grade em /tabela-precos, antes do banco carregar (e como
// fallback se o banco não responder).
//
// Os nomes de `grupo` e `produto` aqui são EXATAMENTE os gravados por
// `supabase/migrations/006_povoar_tabela_precos.sql`, que por sua vez usa os
// nomes da categoria Escolar em `CATALOGO` (src/lib/helpers.ts) — porque é
// `tabelaPrecos[peca.tipo]` (peca.tipo vindo do CATALOGO) que o cálculo
// automático em /novo-pedido usa pra achar o preço.
//
// Antes desta unificação, /tabela-precos tinha seu próprio array
// (`DADOS_PADRAO`) com nomes abreviados e grupos diferentes — a tela nunca
// mostrava os valores reais do banco, e salvar um preço por ela gravava
// linhas paralelas que o cálculo automático nunca lia. Ver CHANGELOG.md.
//
// Consequência prática: **não renomeie nada aqui sem também atualizar a
// migration 006 e o CATALOGO** (ou sem rodar uma migration de dados) — os
// três precisam concordar, ou a divergência volta.
export const FAIXAS = ['0-02', '04-06', '08-10', '12-14', 'P/M/G', 'GG'] as const

export type ProdutoPreco = { nome: string; precos: (number | null)[] }
export type GrupoPreco = { grupo: string; produtos: ProdutoPreco[] }

export const GRUPOS_PRECO_ESCOLAR: GrupoPreco[] = [
  {
    grupo: 'Escolar',
    produtos: [
      // "M Curta" e "Regata" são uma linha só na tabela oficial 2025
      // ("Manga Curta/Regata"), por isso compartilham os mesmos preços.
      { nome: 'Camiseta M Curta',   precos: [26.40, 29.70, 32.30, 34.00, 38.30,  41.80] },
      { nome: 'Regata',             precos: [26.40, 29.70, 32.30, 34.00, 38.30,  41.80] },
      { nome: 'Manga Longa',        precos: [29.10, 33.70, 39.70, 42.70, 50.40,  52.00] },
      { nome: 'Camiseta Algodão',   precos: [29.80, 32.90, 35.80, 37.50, 42.20,  47.20] },
      { nome: 'Jardineira Curta',   precos: [48.40, 54.50, 66.60, 71.70, 90.80,  null]  },
      { nome: 'Jardineira Longa',   precos: [49.30, 67.80, 76.60, 88.10, 102.90, null]  },
    ],
  },
  {
    // Sem cedilha de propósito — é a grafia exata da migration 006.
    grupo: 'Conjunto Helanca',
    produtos: [
      { nome: 'Conjunto Helança',          precos: [94.60, 107.20, 124.60, 145.50, 176.80, 195.00] },
      { nome: 'Blusa Helança',             precos: [57.00, 61.40,  72.30,  82.80,  96.10,  108.50] },
      { nome: 'Blusa c/ Capuz Helança',    precos: [62.00, 71.00,  86.30,  96.10,  108.50, 127.20] },
      { nome: 'Calça Helança',             precos: [37.30, 45.90,  52.10,  62.60,  81.00,  86.30]  },
      { nome: 'Bailarina/Legging',         precos: [37.30, 45.90,  52.10,  62.60,  81.00,  86.30]  },
      { nome: 'Corsário',                  precos: [34.40, 36.90,  41.70,  45.70,  53.60,  57.00]  },
    ],
  },
  {
    grupo: 'Conjunto Moletom',
    produtos: [
      { nome: 'Conjunto Moletom',          precos: [117.00, 140.50, 160.10, 179.60, 214.30, 243.70] },
      { nome: 'Blusa Moletom',             precos: [65.40,  80.80,  87.80,  102.50, 121.00, 140.50] },
      { nome: 'Blusa c/ Capuz Moletom',    precos: [76.60,  86.40,  97.10,  117.00, 132.30, 158.80] },
      { nome: 'Calça Moletom',             precos: [51.50,  59.90,  72.40,  76.60,  93.30,  103.00] },
      { nome: 'Shorts Saia Inteira',       precos: [38.00,  41.00,  48.50,  52.50,  58.50,  68.00]  },
      { nome: 'Shorts Saia Meia',          precos: [34.50,  37.50,  44.50,  48.50,  53.00,  62.50]  },
    ],
  },
  {
    grupo: 'Conjunto Tactel',
    produtos: [
      { nome: 'Conjunto Tactel',           precos: [118.25, 142.00, 162.10, 173.80, 215.00, 245.00] },
      { nome: 'Blusa Tactel',              precos: [58.90,  63.30,  89.20,  105.70, 124.00, 145.00] },
      { nome: 'Blusa c/ Capuz Tactel',     precos: [77.90,  85.30,  92.40,  115.40, 125.30, 151.90] },
      { nome: 'Calça c/ Forro Tactel',     precos: [48.90,  57.40,  71.60,  75.40,  88.70,  98.40]  },
      { nome: 'Calça s/ Forro Tactel',     precos: [37.60,  45.80,  52.00,  62.50,  80.60,  86.20]  },
      { nome: 'Bermuda Helança e Tactel',  precos: [27.10,  36.20,  39.20,  41.80,  48.00,  58.00]  },
    ],
  },
]
