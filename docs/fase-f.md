# Fase F — Filtro de pesquisa e reforma visual do /dashboard

**Executada em 10/09/2026.** Este documento era a spec (v2); a partir daqui é o registro do
que foi feito. O texto original da spec (seções 1–9) foi preservado abaixo do registro, sem
alteração, para referência.

---

## Registro de execução

### O que foi implementado

**Tudo o que a spec pedia, nas duas etapas e nos dois commits descritos.**

- **`src/lib/helpers.ts`**: `pedidoCasaComBusca`, `prazoTexto`, `FiltroDashboard` e
  `FILTROS_DASHBOARD`, exatamente como especificado na seção 4.
- **`src/app/pedidos/page.tsx`**: predicado inline trocado pela chamada a
  `pedidoCasaComBusca`. Nada mais no arquivo foi tocado.
- **`src/app/dashboard/page.tsx`** — commit 1 (seção 6): estado `filtro`/`busca` sem
  `localStorage`, derivação `filtrando`/`visiveis`/`linhas`, ordenação `ordenarPedidos(...,
  'entrega_asc')`, a barra de busca+chips+contador dentro do card, e os dois estados vazios
  distintos.
- **`src/app/dashboard/page.tsx`** — commit 2 (seção 7): grade de KPI 4 colunas com "Em
  produção" dominante e "Urgentes"/"Entrega em 7 dias" neutros em zero, "Total de Clientes"
  no cabeçalho, as duas faixas de alerta em uma linha cada, coluna "Produção" nova
  (`resumoProgresso`), coluna "Entrega" com `prazoTexto` em duas linhas, rail vermelho de
  urgência na primeira célula, e limpeza dos imports mortos (`COMPLEXIDADE_CONFIG`, `isAfter`,
  `addDays`).

Zero SQL em qualquer ponto — a regra da seção 1 foi respeitada à risca.

### Onde a spec errou sobre o código real

**Uma divergência, e não é sobre o código do dashboard — é sobre o ambiente.** A seção 8
manda "`npx tsc --noEmit` + `npm run lint` limpos" antes de cada commit, como se `npm run
lint` já funcionasse no repo. **Não funcionava**: não existe nenhum `.eslintrc*` versionado, e
`next lint` sem config abre um prompt interativo ("How would you like to configure ESLint?")
que trava em execução não-interativa. Criei `.eslintrc.json` com `{"extends":
"next/core-web-vitals"}` — a opção "Strict (recommended)" que o próprio `next lint` sugere —
e commitei junto do commit 1, porque sem isso a instrução da seção 8 não tinha como ser
seguida. Rodado depois disso, `npm run lint` aponta só avisos e 2 erros **pré-existentes**,
nenhum em arquivo tocado por esta fase (`react/no-unescaped-entities` em
`pedidos/[id]/page.tsx:879`, de antes desta sessão) — não mexi neles, fora do escopo.

Fora isso, a spec bateu com o código em tudo que conferi de novo: a ordenação de
`getPedidos()` (`data_entrada desc`, seção 6.1), o `COMPLEXIDADE_CONFIG` já importado e não
usado, as classes de tema (`bg-superficie-2`, `text-fraco`, `border-marca-borda` etc., todas
existentes em `globals.css`/`tailwind.config.ts`), `nice-400` como valor fixo da paleta, e
`date-fns` em `^3.6.0` com `differenceInCalendarDays` disponível.

Uma interpretação, não um erro: a seção 7.3, armadilha 2, diz "`r.total === 0` → mostre `—`
no lugar do rótulo e trilha vazia". Implementei literalmente — a trilha (o track cinza)
continua visível, só sem preenchimento, e o rótulo mostra `—` em vez de `0/0`. Nenhum pedido
real no banco caiu nesse caso durante o teste, então não foi visto na tela, só no código.

### Testes da seção 9 — cobertura

**Parte A (filtro, antes do commit 1): os 9 cenários foram confirmados no navegador**, logado
com a sessão já ativa no Chrome (perfil Kalomira/recepcionista — sessão que já existia,
nenhuma senha foi digitada nesta sessão). Busca por texto, busca vazia com espaço (trim),
"Limpar filtro", os 7 chips (nenhum sempre-zero), pedido fora das 10 linhas aparecendo ao
buscar/filtrar, ordem em repouso batendo com `/pedidos` em `entrega_asc`, e a busca de
`/pedidos` continuando a funcionar depois do refactor.

**Parte B (visual, antes do commit 2): a maior parte confirmada**, com dados reais:
- ✅ 4 KPIs, "Em produção" visivelmente maior, "45 clientes na base" no cabeçalho.
- ✅ Pedido atrasado → prazo vermelho, barra de progresso vermelha (`atrasado 11 dias` etc.).
- ✅ Pedido com entrega ≤7 dias e <70% pronto → barra laranja (`#2026-0042`, `#2026-0020`).
- ✅ Barra verde visível sobre a trilha escura no tema escuro (`#2026-0016`, `2/9`, `em 11
  dias` → `bg-nice-400` nítido contra `--superficie-3`).
- ✅ "Filtrar urgentes →" acende o chip "Urgentes" e recorta a tabela.
- ✅ Clique em `#numero` dentro da faixa de urgentes abre `/pedidos/{id}`.
- ⚠️ **Não coberto com dados reais**, por não existir o cenário no banco hoje ou por
  limitação da ferramenta de teste desta sessão:
  - **Zero urgentes** (cartão neutro, faixa vermelha ausente) — hoje há exatamente 1 pedido
    urgente ativo no banco. Confirmado só por leitura do código (`stats.urgentes > 0` decide
    cor/ponto/faixa).
  - **Pedido com todas as etapas concluídas** (barra 100% verde, `r.total`/`r.total`) — não
    encontrado nos ~31 pedidos ativos olhados.
  - **Pedido com etapa "não se aplica"** (rótulo sem contar essa etapa, ex. `6/6` não `6/8`)
    — depende de `resumoProgresso`, função já existente e já usada por `/producao`; não é
    código novo desta fase, só um novo consumidor dela.
  - **Largura de tablet/celular** — a ferramenta de automação do navegador desta sessão não
    conseguiu capturar screenshot depois de redimensionar a janela (timeout do CDP,
    reproduzido em duas tentativas). As classes usadas (`grid-cols-2 xl:grid-cols-4`,
    `flex-wrap`, `overflow-x-auto`) são o mesmo padrão responsivo já usado no resto do app.
  - **Impressão da ficha A4** — não testado ao vivo. Por inspeção de código: esta fase não
    tocou `src/app/pedidos/[id]/page.tsx` nem o bloco `print:block` de lá, então não há
    mecanismo para algo ter vazado para a impressão.

**Parte C (produção, depois do push): fica para o Pedro**, como a spec já previa — inclui os
itens acima que não deram para cobrir localmente.

### SQL

Nenhum apareceu. Nenhuma migration, query ou seed foi necessária ou sugerida.

### Commits

1. `4f67eec` — `feat: filtro de busca e status no /dashboard` (inclui o refactor de
   `/pedidos` e o `.eslintrc.json`)
2. `e140eed` — `feat: reforma visual do /dashboard — KPIs por estado, progresso e prazo em
   dias`

**Push ainda não feito** — aguardando o Pedro conferir, conforme a seção 8/12 pede.

---

## Spec original (v2, preservada para referência)

Documento de especificação para a próxima sessão do Claude Code.
Escrito em 10/09/2026 a pedido do Felipe. **Esta é a v2 e substitui a v1 inteira** — a v1
separava o trabalho em duas fases e continha um erro sobre a ordenação (ver seção 6).

Escrito depois de ler, no repo: `src/app/dashboard/page.tsx`, `src/app/pedidos/page.tsx`,
`src/lib/helpers.ts`, `src/lib/store.ts`, `src/lib/permissoes.ts`, `src/lib/excecaoPagamento.ts`,
`src/types/index.ts`, `src/app/globals.css`, `tailwind.config.ts` e `package.json`.

**Uma sessão, dois commits, um push.** O Felipe decidiu fazer o filtro e o visual juntos, mas
em commits separados: se o visual incomodar o Pedro, dá para reverter só ele sem perder o
filtro. E **nada é commitado antes do teste local da seção 8.**

---

### 1. O que esta fase faz

Duas coisas na mesma tela, `/dashboard`:

1. **Filtro de pesquisa** — busca por texto + chips de status, igual ao `/pedidos`, porque a
   tabela "Pedidos Ativos" do dashboard hoje não tem como recortar nada e o dashboard é a tela
   em que o Pedro entra todo dia.
2. **Reforma visual** — quatro correções no dashboard, desenhadas num mockup que o Felipe já
   aprovou. Resumidas na seção 5.

Zero SQL. Zero migration. Zero mudança de RLS. **Se aparecer SQL em qualquer ponto desta
fase, pare e avise o Felipe** — significa que a spec errou em algo.

---

### 2. Decisões já tomadas — não reabra nenhuma

Respondidas pelo Felipe em 10/09/2026. Quando a spec e o mockup divergirem, **a spec ganha**:
o mockup é um desenho, a spec foi conferida contra o código.

| # | Decisão | Escolha |
|---|---|---|
| 1 | O que tem na barra de filtro | Busca por texto **+** chips. **Sem** seletor de ordenação |
| 2 | Os KPIs do topo filtram junto? | **Não.** Continuam globais. Só a tabela recorta |
| 3 | Onde a busca procura | Só nos pedidos **ativos** (exclui `entregue` e `cancelado`) |
| 4 | O limite de 10 linhas | **Cai quando houver filtro ativo**; vale na tela em repouso |
| 5 | Escopo e commits | F1 + F2 na mesma sessão, **dois commits**, um push, teste antes |
| 6 | Bloco vermelho de urgentes | **Funde** numa faixa de uma linha. A lista de 3 linhas sai |
| 7 | Predicado de busca | **Extrair** para `helpers.ts` e trocar o inline do `/pedidos` também |
| 8 | Segundas linhas dos KPIs | **Só as que saem de graça.** As que exigem conta nova ficam fora |

---

### 3. Regras que valem para todo o código desta fase

- **Cores semânticas, sempre.** `bg-white`, `text-gray-500`, `border-gray-100` não reagem ao
  tema escuro. Use `bg-superficie`, `bg-superficie-2`, `bg-superficie-3`, `text-conteudo`,
  `text-suave`, `text-fraco`, `text-titulo`, `border-borda`, `border-borda-forte`,
  `bg-marca`, `text-marca-texto`, `bg-marca-suave`, `border-marca-borda`. Tabela completa no
  `CLAUDE.md`, seção "Tema claro/escuro". **Esta fase cria muitos componentes novos — é
  exatamente onde esse erro entra.**
- **A escala de status inverte no tema escuro.** `bg-red-100 text-red-700` continua
  significando "tarja vermelha com texto legível" nos dois temas, sem `dark:`. Mas
  `bg-red-600` **não** serve de fundo sólido para texto branco no escuro. Nesta fase não há
  texto sobre fundo de status, então não é problema — só não invente um.
- **Nada no banco.** Não mexa em `getPedidos()`, em nenhum `select`, em `pedidosStats`, nem
  em `permissoes.ts`. Todo filtro e toda conta nova acontece no cliente, sobre a lista que a
  tela já tem em mãos.
- **Não mutar estado.** `[...lista].sort(...)`, nunca `lista.sort(...)`.
- **Permissão:** confirmado em `src/lib/permissoes.ts` que `/dashboard` é só de `gestor` e
  `recepcionista` (o comentário do `LEITURA_PRODUCAO` diz "Sem /dashboard — ele expõe
  faturamento e total de clientes"). Quem chega na tela já pode ver tudo. **Nada de
  `verFinanceiro` aqui.**
- **`npx tsc --noEmit` limpo** antes de cada um dos dois commits, não só no fim.

---

### 4. Etapa 1 — `src/lib/helpers.ts`

Três coisas novas, todas compartilhadas. Elas vão em `helpers.ts` e não soltas na página pelo
mesmo motivo que `ordenarPedidos` está lá: `/producao` e `/pedidos` usam a mesma resposta, e
duas cópias divergem no dia em que alguém corrigir só uma.

#### 4.1 `pedidoCasaComBusca`

Hoje esse predicado vive inline em `/pedidos`:

```ts
const q = busca.toLowerCase()
const matchBusca = !q || p.cliente.nome.toLowerCase().includes(q)
  || p.numero.includes(q) || p.cliente.empresa?.toLowerCase().includes(q)
```

```ts
/**
 * O predicado de busca de pedido, compartilhado por /pedidos e /dashboard.
 * Procura em nome do cliente, empresa e número do pedido. Busca vazia casa com tudo.
 */
export function pedidoCasaComBusca(
  pedido: Pick<Pedido, 'numero' | 'cliente'>,
  busca: string,
): boolean {
  const q = busca.trim().toLowerCase()
  if (!q) return true
  return pedido.cliente.nome.toLowerCase().includes(q)
    || pedido.numero.toLowerCase().includes(q)
    || (pedido.cliente.empresa?.toLowerCase().includes(q) ?? false)
}
```

Duas diferenças deliberadas em relação ao inline de hoje, as duas corrigem comportamento:

- **`busca.trim()`** — hoje digitar um espaço faz a lista "filtrar" por nada e parecer quebrada.
- **`?? false`** — hoje a expressão devolve `undefined` quando `empresa` é nula. Funciona por
  coincidência dentro de um `||`. O `?.` continua lá de propósito: `empresa` é tipada `string`,
  mas pedido antigo no banco pode ter `null`, e o tipo não protege contra isso em runtime.

#### 4.2 `prazoTexto`

O dashboard vai mostrar prazo em dias em dois lugares (a tabela e a faixa de urgentes). Uma
função, uma resposta.

```ts
import { differenceInCalendarDays, format } from 'date-fns'

export type TomPrazo = 'atrasado' | 'proximo' | 'normal' | 'sem_data'

/**
 * O prazo de entrega como a pessoa lê: "em 4 dias", "atrasado 1 dia", "amanhã".
 * `tom` é a severidade, para a tela escolher a cor — a função não escolhe classe
 * nenhuma, porque /dashboard e uma futura tela podem pintar isso diferente.
 */
export function prazoTexto(dataEntrega: string | null | undefined): {
  texto: string
  tom: TomPrazo
  data: string | null
} {
  if (!dataEntrega) return { texto: 'sem data', tom: 'sem_data', data: null }
  const d = new Date(dataEntrega)
  if (Number.isNaN(d.getTime())) return { texto: 'sem data', tom: 'sem_data', data: null }

  const dias = differenceInCalendarDays(d, new Date())
  const data = format(d, 'dd/MM/yyyy')

  if (dias < 0) {
    const n = Math.abs(dias)
    return { texto: `atrasado ${n} ${n === 1 ? 'dia' : 'dias'}`, tom: 'atrasado', data }
  }
  if (dias === 0) return { texto: 'entrega hoje', tom: 'atrasado', data }
  if (dias === 1) return { texto: 'amanhã', tom: 'proximo', data }
  if (dias <= 7) return { texto: `em ${dias} dias`, tom: 'proximo', data }
  return { texto: `em ${dias} dias`, tom: 'normal', data }
}
```

`date-fns` está em `^3.6.0` (conferido no `package.json`) — `differenceInCalendarDays` existe.
**Use `differenceInCalendarDays`, não `differenceInDays`**: a segunda conta blocos de 24h, e
aí um pedido que entrega amanhã às 8h vira "em 0 dias" hoje às 18h.

#### 4.3 `FILTROS_DASHBOARD`

**Não copie o `FILTROS` do `/pedidos`.** Ele tem 8 entradas, incluindo `entregue` e
`cancelado` — e o dashboard exclui esses dois status antes de filtrar, então seriam dois chips
que sempre devolvem zero resultado. Chip que nunca funciona é bug visível.

```ts
export type FiltroDashboard = StatusPedido | 'todos' | 'urgentes'

/**
 * Os chips do /dashboard. Sete, não oito: `entregue` e `cancelado` não entram
 * porque a tela só lista pedido ativo, e entraria um chip que nunca acha nada.
 *
 * `urgentes` não é um status — é `pedido.tipo`. Ele está na mesma fileira de
 * propósito: é o recorte mais usado, e é o que o botão da faixa de alerta aciona.
 * Consequência aceita: um filtro por vez. "Urgentes" + "Em Produção" ao mesmo
 * tempo exigiria dois estados independentes, e essa tela não precisa disso.
 */
export const FILTROS_DASHBOARD: { value: FiltroDashboard; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'urgentes', label: 'Urgentes' },
  { value: 'orcamento', label: 'Orçamento' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'aguardando_pagamento', label: 'Ag. Pagamento' },
  { value: 'em_producao', label: 'Em Produção' },
  { value: 'finalizado', label: 'Finalizado' },
]
```

Deixe o `FILTROS` do `/pedidos` onde está, com o nome que tem. Dois arrays com propósitos
diferentes e nomes diferentes está correto; dois arrays com o mesmo propósito e nomes
diferentes é a divergência que o `CLAUDE.md` reclama.

---

### 5. Etapa 2 — `src/app/pedidos/page.tsx` (só refactor)

Troque o predicado inline pela chamada a `pedidoCasaComBusca`. **Nada mais nesse arquivo** —
não mexa nos chips, na ordenação, na lógica da Fase E1-b, em nada.

```ts
const candidatos = pedidos.filter(p => {
  const matchStatus = filtro === 'todos' || p.status === filtro
  return matchStatus && pedidoCasaComBusca(p, busca)
})
```

Isso entra no **commit 1**, junto com o `helpers.ts` e o filtro do dashboard.

---

### 6. Etapa 3 — o filtro no `/dashboard` (commit 1)

#### 6.1 Correção da v1 desta spec — leia antes

A v1 dizia que `ativos.slice(0, 10)` cortava "uma lista que não está ordenada por nada".
**Errado.** `getPedidos()` faz `.order('data_entrada', { ascending: false })`, então a lista
chega ordenada — por **data de entrada, mais recente primeiro**.

O bug é real, só é outro: os 10 que o Pedro vê são os **10 pedidos mais recentemente
cadastrados**. Um pedido entrado há três meses que entrega amanhã pode estar fora da tela, e
é exatamente o pedido que ele precisava ver. A Fase E1 resolveu isso em `/pedidos` e
`/producao` adotando `entrega_asc` como padrão; o dashboard ficou de fora.

**Ordene com `ordenarPedidos(lista, 'entrega_asc')`** — a função de `helpers.ts`, sem seletor e
sem `localStorage`: a ordem do dashboard é fixa. Não precisa do desdobramento em dois grupos
que o `/pedidos` faz (a E1-b, que empurra `entregue`/`cancelado` para o fim), porque o
dashboard já excluiu esses dois status antes de ordenar.

#### 6.2 Estado

Dois `useState`, **sem `localStorage`**. O dashboard é a tela de entrada diária: abre limpa,
não com o filtro de ontem.

```tsx
const [filtro, setFiltro] = useState<FiltroDashboard>('todos')
const [busca, setBusca] = useState('')
```

#### 6.3 Derivação

Logo depois do `ativos` que já existe:

```tsx
const filtrando = filtro !== 'todos' || busca.trim() !== ''

const visiveis = ordenarPedidos(
  ativos.filter(p => {
    const matchFiltro =
      filtro === 'todos' ? true
      : filtro === 'urgentes' ? p.tipo === 'urgente'
      : p.status === filtro
    return matchFiltro && pedidoCasaComBusca(p, busca)
  }),
  'entrega_asc',
)

const linhas = filtrando ? visiveis : visiveis.slice(0, 10)
```

Três nomes, três responsabilidades: `visiveis` é o recorte, `linhas` é o que a tela desenha.
Não colapse numa expressão só — o contador da 6.4 precisa dos dois. O `map` da tabela passa a
iterar `linhas`.

#### 6.4 A barra

Entre o cabeçalho do card ("Pedidos Ativos" / "Ver todos") e a tabela — **dentro do card**, não
num card separado acima. É assim que a tela comunica que o filtro recorta a tabela e não os
KPIs (decisão 2). Faixa `bg-superficie-2 border-b border-borda px-6 py-3`,
`flex items-center gap-3 flex-wrap`.

Reaproveite a marcação exata do `/pedidos` — o Pedro não deve perceber que são duas telas:

- Campo: `.input` com `pl-9`, dentro de um `relative`, com o ícone `Search` do `lucide-react`
  em `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fraco`. Placeholder
  `"Buscar por cliente, empresa ou número..."`. Largura `flex-1 max-w-sm`.
- Chips: `px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors`, ativo em
  `bg-nice-500 text-white`, inativo em `bg-superficie-3 text-suave`.
- **Contador à direita** (`ml-auto`), `text-xs text-fraco whitespace-nowrap`:
  `{linhas.length} de {ativos.length} pedidos ativos`. É a frase que impede o Pedro de olhar
  10 linhas e achar que são todas.

#### 6.5 Os dois estados vazios — e eles são dois

O bloco vazio de hoje diz "Nenhum pedido ativo no momento." com "Criar primeiro pedido →". Se
ele aparecer quando a busca não casar, a tela **mente**: existem 23 pedidos ativos, o Pedro só
digitou o nome errado.

```tsx
{linhas.length === 0 && (
  filtrando
    ? /* "Nenhum pedido ativo casa com esse filtro." + botão "Limpar filtro" */
    : /* o bloco de hoje, intacto: ícone ClipboardCheck + "Criar primeiro pedido →" */
)}
```

"Limpar filtro" zera os dois estados (`setFiltro('todos')`, `setBusca('')`). Tela com caminho
de ida precisa de caminho de volta — mesma lição da Fase C0.

---

### 7. Etapa 4 — a reforma visual (commit 2)

Quatro correções. Cada uma tem um problema concreto atrás dela; nenhuma é gosto.

#### 7.1 KPIs: quatro cartões, e cor significa estado

**Problema hoje:** cinco cartões com cinco cores de ícone (verde, vermelho, laranja, azul,
roxo) que não significam nada — azul não quer dizer "informação", e "Total de Clientes" em roxo
é um número de referência sentado numa fileira de alertas. Os cinco têm peso visual idêntico,
então o olho não sabe onde pousar.

**Total de Clientes sai da grade.** Vira texto no cabeçalho, depois da data, em `text-fraco`:

```
quinta-feira, 10 de setembro de 2026 · 87 clientes na base
```

**A grade passa a ter 4 colunas** (`grid-cols-2 xl:grid-cols-4 gap-4`), nesta ordem:

**1. Em produção — o cartão dominante.** É a pergunta que o Pedro faz todo dia.

- `card` + `bg-marca-suave border-marca-borda`
- topo: rótulo "Em produção" em `text-sm font-medium text-marca-texto`, e o ícone `Factory`
  em `w-4 h-4 text-marca-texto` empurrado para a direita
- valor: **`text-4xl font-bold leading-none text-marca-texto`** (os outros ficam em `text-3xl`
  — é a diferença de tamanho que cria a hierarquia)
- segunda linha: `{pecasEmProducao} peças na fábrica`, `text-xs text-marca-texto`

**2. Urgentes** e **3. Entrega em 7 dias** — cartões de estado. **Cor só quando o valor é
maior que zero.** Quando zerar, o cartão fica neutro: `border-borda`, valor em `text-titulo`,
sem ponto, sem segunda linha. Esse é o ponto inteiro da mudança — "0 urgentes" em vermelho
treina o olho a ignorar vermelho.

- borda: `border-red-200` / `border-orange-200` quando `> 0`, `border-borda` quando `0`
- topo: rótulo em `text-sm text-suave`, e à direita um ponto
  `w-2 h-2 rounded-full bg-red-500` / `bg-orange-500`, **só quando `> 0`**
- valor: `text-3xl font-bold leading-none`, em `text-red-700` / `text-orange-700` quando `> 0`,
  `text-titulo` quando `0`
- **Urgentes** tem segunda linha quando houver vencido:
  `{urgentesVencidos} já venceu` / `{urgentesVencidos} já venceram`, em `text-xs text-red-700`.
  Com zero vencidos, **sem segunda linha.**
- **Entrega em 7 dias não tem segunda linha.** O mockup mostra "2 ainda abaixo de 50%" —
  **ignore**, é uma das contas que ficaram fora pela decisão 8.

**4. Aguardando produção** — neutro, sempre. `card` normal, rótulo `text-sm text-suave`, ícone
`ClipboardCheck` em `text-fraco`, valor `text-3xl font-bold text-titulo`, **sem segunda linha**
(o mockup mostra "nenhum parado há mais de 5 dias" — **ignore**, não existe dado de "parado
desde" no banco).

**As duas contas novas, as duas na página, nenhuma em `pedidosStats`:**

```tsx
const pecasEmProducao = pedidos
  .filter(p => p.status === 'em_producao')
  .reduce((acc, p) => acc + totalPecas(p), 0)

const urgentesVencidos = urgentes.filter(p => prazoTexto(p.dataEntrega).tom === 'atrasado').length
```

`urgentes` já existe na página. `totalPecas` e `prazoTexto` vêm de `helpers.ts`. **Não toque em
`pedidosStats`** (`src/lib/store.ts`): os quatro KPIs continuam saindo dela, globais, como
estão hoje.

> Nota: `urgentesVencidos` conta "venceu **ou** entrega hoje", porque `prazoTexto` agrupa os
> dois no tom `atrasado`. Está certo — entrega hoje que ainda não saiu é assunto de hoje.

#### 7.2 As duas faixas de alerta, uma linha cada

**Problema hoje:** os pedidos urgentes aparecem duas vezes — no bloco vermelho de 3 linhas e
de novo na tabela abaixo. O bloco ocupa meia tela dizendo o que a tabela já diz.

Decisão 6: **funde.** As duas faixas seguem o mesmo molde —
`flex items-center gap-3 rounded-xl border px-4 py-3`, empilhadas com `gap-2.5`, no lugar onde
os dois blocos estão hoje.

**Faixa de urgentes** (`bg-red-50 border-red-200`), só quando `urgentes.length > 0`:

- ícone `AlertTriangle` em `w-4 h-4 text-red-600 shrink-0`
- `{n} pedido urgente` / `{n} pedidos urgentes` em `text-sm font-semibold text-red-700`
- resumo em `text-sm text-suave`: os **dois** urgentes de prazo mais próximo, cada um como
  `#{numero} {prazoTexto().texto}`, separados por vírgula. **Cada número é um `<Link>` para
  `/pedidos/{id}`** — é isso que substitui as linhas clicáveis do bloco antigo. Com mais de
  dois, nada de "+N": a tabela logo abaixo tem todos.
- à direita (`ml-auto`), um `<button>` "Filtrar urgentes →" em
  `text-xs font-semibold text-red-700 whitespace-nowrap` que faz
  `setFiltro('urgentes')`. É por isso que `urgentes` é um chip de verdade na 4.3: o botão
  aciona um filtro visível na tela, não um estado escondido.

**Faixa de aprovação pendente** (`bg-yellow-50 border-yellow-200`), mantém a condição de hoje
(`permissoes.aprovarExcecaoPagamento && aguardandoAprovacao.length > 0`):

- ícone `HandCoins` em `w-4 h-4 text-yellow-600 shrink-0`
- `{n} pedido aguardando sua aprovação` / `{n} pedidos aguardando sua aprovação` em
  `text-sm font-semibold text-yellow-800`
- resumo em `text-sm text-suave`: até dois, como
  `#{numero} — {excecaoPagamento?.solicitadoPor}`, cada número um `<Link>` para o pedido
- **sem botão à direita** — os números são a ação, e não existe chip para "aguardando
  aprovação"

A função `excecaoPendente` de `src/lib/excecaoPagamento.ts` continua sendo o que decide quem
entra nessa lista. Não mexa nela.

#### 7.3 Coluna nova "Produção" — o maior ganho da fase

**Problema hoje:** a tabela mostra o status (`Em Produção`) e mais nada. O pedido com 1 de 8
etapas prontas e o pedido com 7 de 8 são visualmente idênticos.

Coluna nova entre **Status** e **Entrega**, alimentada por `resumoProgresso(p.progresso)`, que
já existe em `helpers.ts` e é **a mesma conta do `/producao`** — é por isso que ela está lá, e
é por isso que não se faz outra.

```tsx
const r = resumoProgresso(p.progresso)
```

- trilha: `w-[76px] h-1.5 rounded-full bg-superficie-3 overflow-hidden shrink-0`
- preenchimento: `h-full rounded-full` com `style={{ width: `${r.pct}%` }}`
- cor do preenchimento, nesta ordem de precedência:
  - `bg-red-500` quando `prazoTexto(p.dataEntrega).tom === 'atrasado'`
  - `bg-orange-500` quando `tom === 'proximo'` **e** `r.pct < 70`
  - `bg-nice-400` em todos os outros casos
- rótulo ao lado, `text-xs text-suave tabular-nums`: `{r.concluidos}/{r.total}`

Três armadilhas:

1. **Nunca escreva "/8" fixo.** Depois da Fase D3 o número de etapas aplicáveis **varia por
   pedido**, e `resumoProgresso` já desconta as marcadas `nao_se_aplica`. Use `r.total`.
2. **`r.total === 0`** → mostre `—` no lugar do rótulo e trilha vazia. `resumoProgresso`
   devolve `pct: 100` nesse caso (nada a fazer = pronto), e uma barra cheia num pedido que
   ninguém tocou seria mentira na tela.
3. **Use `bg-nice-400` (#5ab84a), não `bg-marca`**, para o verde da barra. `--marca` é #3a8c2f
   nos dois temas, e sobre a trilha escura (`--superficie-3` = #2a3228) isso dá contraste
   fraco demais para uma barra de 6px. `nice-400` é valor fixo da paleta de marca e funciona
   nos dois temas com uma classe só, sem `dark:`.

`p.progresso` chega preenchido: `mapPedido` em `store.ts` passa tudo por `normalizarProgresso`,
e `progresso` é campo obrigatório no tipo `Pedido`. Conferido — não precisa de `console.log`.

#### 7.4 Coluna Entrega: prazo em dias

**Problema hoje:** `14/09/2026` exige conta de cabeça, todo dia, para cada linha.

- linha de cima: `prazoTexto(p.dataEntrega).texto` em `text-sm font-semibold`, com a cor pelo
  `tom`: `atrasado` → `text-red-700`; `proximo` → `text-orange-700`; `normal` → `text-conteudo`;
  `sem_data` → `text-fraco`
- linha de baixo: a data (`.data`) em `text-xs text-fraco tabular-nums`. Com
  `tom === 'sem_data'`, **sem segunda linha**.

Isso substitui o `vencendo` calculado com `isAfter(addDays(...))` que está lá hoje.

#### 7.5 Rail de urgência na linha

Com o bloco vermelho fundido, a tabela precisa marcar urgência sozinha. A tarja `urgente` que
já existe fica, e ganha um rail:

**A primeira célula de toda linha** leva `border-l-[3px]` — `border-red-500` quando
`p.tipo === 'urgente'`, `border-transparent` nas outras. Todas as linhas, não só as urgentes:
assim o texto não pula 3px entre uma linha e outra, e não precisa compensar padding.

#### 7.6 Limpeza de imports

Depois de 7.4, confira e remova o que ficou morto em `dashboard/page.tsx`:

- `COMPLEXIDADE_CONFIG` — **já está importado e nunca usado hoje**, antes desta fase.
- `isAfter` e `addDays` do `date-fns` — ficam sem uso quando `vencendo` sair.

O `npx tsc --noEmit` não reclama de import não usado; o `npm run lint` reclama. Rode os dois.

---

### 8. Ordem de execução

1. **`git pull`.** Sempre, antes de qualquer coisa. São dois PCs.
2. Ler o `CLAUDE.md` do repo (é a fonte da verdade; esta spec é derivada).
3. `src/lib/helpers.ts` — `pedidoCasaComBusca`, `prazoTexto`, `FiltroDashboard`,
   `FILTROS_DASHBOARD`.
4. `src/app/pedidos/page.tsx` — trocar o inline pela função. Nada mais.
5. `src/app/dashboard/page.tsx` — seção 6 inteira (estado, derivação, barra, contador, dois
   estados vazios, ordenação `entrega_asc`).
6. `npx tsc --noEmit` + `npm run lint` limpos.
7. **`npm run dev` e o teste local da seção 9, parte A.** Não commite antes.
8. **Commit 1:**
   `feat: filtro de busca e status no /dashboard`
   (inclui o refactor do predicado — mencione isso no corpo do commit)
9. `src/app/dashboard/page.tsx` — seção 7 inteira (KPIs, faixas, coluna Produção, coluna
   Entrega, rail, limpeza de imports).
10. `npx tsc --noEmit` + `npm run lint` limpos.
11. **Teste local da seção 9, parte B.** Não commite antes.
12. **Commit 2:**
    `feat: reforma visual do /dashboard — KPIs por estado, progresso e prazo em dias`
13. **Pedro confere** → push → deploy "Ready" na Vercel. **Não dê push sem ele conferir.**
14. Teste em produção (seção 9, parte C).
15. `CHANGELOG.md` + `CLAUDE.md` atualizados antes de encerrar. No `CLAUDE.md`, três pontos:
    - a linha de `/dashboard` na tabela de módulos passa a mencionar o filtro e as colunas
      novas;
    - registrar que a ordem da tabela do dashboard agora é **`entrega_asc` fixa** — senão a
      próxima sessão "conserta" isso de volta para `data_entrada`;
    - registrar que `pedidoCasaComBusca` e `prazoTexto` são compartilhadas, para a próxima
      tela não escrever a terceira cópia.

---

### 9. Testes

#### Parte A — local, antes do commit 1 (o filtro)

1. Digitar o nome de um cliente com pedido ativo → a tabela recorta, **e nenhum dos KPIs do
   topo muda um número.** Se mexerem, está errado (decisão 2).
2. Digitar o nome de um cliente cujo pedido está **entregue** → zero resultados, e aparece
   "nenhum pedido casa com esse filtro" — **não** a mensagem de "nenhum pedido ativo".
3. "Limpar filtro" → volta a lista de 10.
4. Buscar um pedido que você sabe que **não estava entre os 10 visíveis** → ele aparece. É o
   teste do limite, e é o que justifica a fase.
5. Clicar em cada um dos 7 chips. **Nenhum pode devolver zero sempre** — se "Urgentes" não
   achar nada, confirme que existe pedido com `tipo === 'urgente'` antes de chamar de bug.
6. Digitar **só um espaço** no campo → a lista não muda (teste do `trim`).
7. Em repouso, conferir que as 10 linhas são as de **entrega mais próxima** — compare com
   `/producao`, que usa a mesma ordem.
8. **Ligar o tema escuro** e repetir 1 e 5. Campo, chips e contador legíveis.
9. Abrir `/pedidos` e conferir que a busca continua funcionando igual. É a tela que o refactor
   tocou.

#### Parte B — local, antes do commit 2 (o visual)

1. Os KPIs são **quatro**, "Em produção" é visivelmente o maior, e "87 clientes na base" está
   no cabeçalho.
2. Achar (ou criar local) um cenário com **zero urgentes** → o cartão Urgentes fica **neutro**,
   sem ponto vermelho e sem segunda linha, e a faixa vermelha **não aparece**.
3. Um pedido com entrega atrasada → prazo em vermelho, barra de progresso vermelha.
4. Um pedido com entrega em ≤7 dias e menos de 70% pronto → barra laranja.
5. Um pedido com todas as etapas concluídas → barra cheia verde e `r.total`/`r.total`.
6. **Um pedido com etapa marcada "não se aplica"** → o rótulo mostra o total **sem** ela
   (ex. `6/6`, nunca `6/8`). É a armadilha 1 da 7.3.
7. Clicar em "Filtrar urgentes →" na faixa → o chip "Urgentes" acende e a tabela recorta.
8. Clicar num número de pedido dentro de cada faixa → abre `/pedidos/{id}`.
9. **Tema escuro**: a barra de progresso verde tem que ser visível sobre a trilha. É o ponto
   da armadilha 3 da 7.3 — se ela sumir, o verde errado foi usado.
10. Largura de tablet/celular → os 4 KPIs viram 2×2, a barra de filtro empilha, a tabela
    rola na horizontal sem quebrar a página.
11. **Imprimir a ficha A4 de um pedido** (`/pedidos/[id]`) só para confirmar que nada desta
    fase vazou para a impressão.

#### Parte C — em produção, depois do push

Logado como `pedrobenedetti`, com dados reais:

1. Repetir A1, A4 e B7 — são os três que dependem de volume real de dados.
2. Conferir que o contador à direita da barra bate com o KPI "Em Produção" quando o chip
   "Em Produção" está ativo.
3. Recarregar a página → a barra volta limpa, "Todos" selecionado.
4. Conferir a coluna Produção contra o `/producao` em **dois** pedidos: a porcentagem tem que
   ser a mesma nas duas telas. Se divergir, alguém escreveu uma segunda conta.

---

### 10. O que NÃO fazer

- **Não mexer em `pedidosStats`** (`src/lib/store.ts`). Os 4 KPIs continuam globais e saem
  dela como hoje.
- **Não mexer em `getPedidos()` nem em nenhum `select`.** Filtro e contas são todos no cliente.
- **Não adicionar `localStorage`** para o filtro do dashboard.
- **Não tocar em `permissoes.ts`.**
- **Não implementar as segundas linhas de KPI que a spec mandou ignorar** ("2 abaixo de 50%",
  "nenhum parado há mais de 5 dias"), mesmo estando no mockup. Decisão 8.
- **Não adicionar seletor de ordenação** no dashboard. Decisão 1.
- **Não escrever SQL.** Se achar que precisa, pare e avise o Felipe.
- **Não dar push** sem o Pedro conferir.
