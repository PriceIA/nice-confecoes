# Fase G — Acessibilidade, visual, renderização e peso das listas

**Spec escrita em 18/09/2026.** Ainda não executada. Este documento é o handoff: o Claude Code
lê daqui, executa **uma etapa por vez**, e depois reescreve este arquivo com o registro do que
foi feito, no mesmo formato das fases C, E e F.

O diagnóstico da seção 1 (performance e acessibilidade) e a auditoria da seção 4.1 (visual)
foram feitos lendo o código real do repo em 18/09/2026 — não são suposição. Cada afirmação tem
arquivo e linha, e os contrastes foram calculados, não estimados.

A seção 4 foi escrita a partir das skills instaladas em `.claude/skills/`: o enquadramento vem
do modo **Operate** do `impeccable`, o piso de qualidade do `craft-floor.md`, e as severidades
da base do `ui-ux-pro-max`. Onde as skills se contradizem, a seção 4.0 registra qual venceu e
por quê.

---

## 0. Regras desta fase (leia antes de qualquer coisa)

1. **Zero SQL.** Esta fase inteira é front-end e camada de acesso a dados. Nenhuma migration,
   nenhuma policy, nenhuma alteração de schema. Se alguma etapa parecer precisar de SQL, **pare
   e pergunte** — provavelmente está resolvendo o problema errado.
2. **`npm run dev` é produção** (CLAUDE.md, "Não existe ambiente de teste"). Todo teste desta
   fase é **só leitura**: abrir tela, buscar, filtrar, ordenar, passar o mouse. **Não crie, não
   edite e não apague pedido, cliente ou preço para testar.** A única exceção — clique de setor
   em `/producao` — está tratada na etapa G4.2, com o cuidado escrito lá.
3. **Uma etapa = um commit.** Nunca junte duas. Cada etapa abaixo termina com o commit dela.
4. **`npm run build` antes de cada push**, não só `tsc --noEmit`. Desde 10/09/2026 o ESLint
   derruba o deploy na Vercel (CLAUDE.md, "Convenções de trabalho").
5. **Nada de biblioteca nova.** Tooltip, memo e debounce desta fase saem de CSS + React puro. O
   `package.json` não muda.
6. **Cor literal é proibida** (`bg-white`, `text-gray-500`). Só os tokens semânticos do tema.
   Isso vale inclusive para o tooltip novo da etapa G1.
7. **As skills de design ficam em `.claude/skills/`** e foram usadas para escrever a seção 4.
   Antes de executar o G2, leia `impeccable/reference/operate.md` e
   `impeccable/reference/craft-floor.md` — nessa ordem. **Elas pesam 12,4 MB no repo:** coloque
   `.claude/skills/` no `.gitignore` antes do primeiro commit desta fase.

---

## 1. Diagnóstico — o que foi medido no código

### 1.1 Existe paginação de backend? **Não. Em lugar nenhum.**

`grep -rn "\.range(\|\.limit(" src/` devolve **uma** ocorrência em todo o repo
(`kanban.ts:400`, e é `limit(1)` para achar a última posição de uma lista).

`getPedidos()` (`store.ts:187-195`) é:

```ts
.from('pedidos').select('*, clientes(*)').order('data_entrada', { ascending: false })
```

Sem `range`, sem `limit`, e com `*` — o que inclui os JSONB pesados (`pecas`, `parcelas`,
`progresso`, `vetorizacao`). **Seis telas chamam isso**, todas carregando a tabela inteira:

| Tela | Onde | O que ela realmente usa |
|---|---|---|
| `/dashboard` | `dashboard/page.tsx:30` | ~10 linhas na tabela, mas carrega tudo |
| `/pedidos` | `pedidos/page.tsx:40` | a lista toda (filtro no navegador) |
| `/producao` | `producao/page.tsx:80` | **só `aprovado` + `em_producao`** — filtra no cliente, depois de baixar tudo (`:83`) |
| `/entregas` | `entregas/page.tsx:33` | **só os 100% concluídos** — mesma coisa |
| `/clientes` | `clientes/page.tsx:24` | só para montar o histórico do cliente clicado |
| `/terceirizadas` | `terceirizadas/page.tsx:71` | só `id` + `numero` para o seletor de pedido |

As duas últimas linhas são o desperdício mais claro: `/terceirizadas` baixa todos os pedidos
com todos os JSONB para preencher um `<select>` que mostra o número do pedido.

### 1.2 Existem N+1 queries? **Não. O backend está limpo nesse ponto.**

Isto foi verificado, não chutado:

- `select('*, clientes(*)')` (`store.ts:191, 201, 265`) é **um embedded join do PostgREST** —
  uma query só, não uma por pedido. É exatamente o oposto de N+1.
- O Kanban já batcheia com `.in()` em todos os lugares onde um N+1 seria natural:
  `kanban.ts:144` (cartões de várias listas), `:242` (cartões do quadro), `:435`
  (`numerosDePedidos`).
- `grep` por `await` dentro de `for`/`map`/`forEach` em `src/` não achou **nenhum** caso de
  leitura em laço.

**Duas ressalvas honestas**, que não são N+1 mas merecem ficar registradas:

- `kanban.ts:301` e `:414` fazem `Promise.all` sobre `map` de UPDATEs individuais — é um
  fan-out de **escrita**, não de leitura. Acontece só na renormalização de posições, que é rara
  por construção (`posicaoEntre` só devolve `null` quando a folga aperta). **Não mexa nisso
  nesta fase.**
- `gerarNumero()` (`store.ts:177-184`) faz um `count: 'exact'` na tabela inteira a cada pedido
  novo — uma ida extra ao banco por criação. Cresce com a tabela. Não é N+1 e não é lentidão
  sentida hoje, mas é o mesmo `count` que a regra 3 do CLAUDE.md já aponta como sujeito a
  corrida. **Fora do escopo desta fase** — anotado para quando o volume justificar.

### 1.3 Então de onde vem a lentidão?

**Provavelmente não do tamanho da tabela — e isso importa para não otimizar o lugar errado.**

O `docs/fase-f.md` registrou, em 10/09/2026, "45 clientes na base" e pedidos reais numerados até
`#2026-0042`. Se isso ainda vale, a tabela `pedidos` tem algumas dezenas de linhas. Nesse
volume, `select *` sem paginação **não** é o que trava a tela.

> **Confirme antes de agir.** Rode no SQL Editor (você, não o Claude Code):
> `select count(*) from pedidos;` e `select count(*) from clientes;`
> Abaixo de ~500 pedidos, a etapa G4.3 (paginação de verdade) **não deve ser feita** — ela
> quebraria os filtros atuais em troca de ganho nenhum.

O que **de fato** pesa hoje, independente do número de linhas:

**(a) `/producao` recarrega o sistema inteiro a cada clique.** `producao/page.tsx:237` passa
`onGravado={carregar}` para o `FluxoEtapas`. `carregar()` (`:76-86`) refaz `getPedidos()` **e**
`carregarEtapas()`. Ou seja: o Alex marca "corte concluído" num pedido → o navegador baixa
todos os pedidos de novo, com todos os JSONB, e redesenha a tela toda. Numa fábrica, com wi-fi
de fábrica, isso é sentido em **cada clique** — e o chão de fábrica clica o dia inteiro. Este é
o item número um da fase.

**(b) Quase nada é memoizado.** `useMemo`/`useCallback` aparecem em **3 arquivos** do repo
inteiro (`clientes/page.tsx`, `QuadroBoard.tsx`, `FluxoEtapas.tsx`). Nas telas de lista, o
filtro + a ordenação são recalculados **a cada tecla digitada na busca**:
`pedidos/page.tsx:54-71` e `dashboard/page.tsx:37-69` derivam 6 arrays por render, sem memo.
Em `/producao` é pior, porque cada linha monta um `FluxoEtapas` com dnd-kit.

**(c) O payload é maior do que precisa.** `pecas` é o JSONB mais gordo (um objeto por peça,
cada um com `fotos[]`), e as telas de lista usam dele **só a quantidade total**
(`totalPecas(p)`). `vetorizacao` e `observacoes` não são usados em nenhuma lista.

### 1.4 Acessibilidade: praticamente inexistente

`title=`, `aria-label`, `role=` e `sr-only` somam **13 ocorrências em todo o `src/`**, e 4 delas
estão num arquivo só (`FluxoEtapas.tsx`). Telas inteiras — `/pedidos`, `/dashboard`,
`/novo-pedido`, `/tabela-precos`, `/configuracoes` — têm **zero**.

Botões só-de-ícone, sem nome acessível nenhum, que um leitor de tela anuncia como "botão" e
mais nada:

- `pedidos/page.tsx:175` — lixeira de excluir pedido
- `FluxoEtapas.tsx` — a lixeira que marca "não se aplica" (a mais crítica: a ação é
  **não-óbvia até para quem enxerga**)
- `BotaoTema.tsx` — alternar tema
- `MiniaturaArquivo.tsx` — abrir anexo
- `Sidebar.tsx` — abrir/fechar o drawer no mobile

**Achado que liga acessibilidade e visual:** `pedidos/page.tsx:170` esconde a coluna de ações
com `opacity-0 group-hover:opacity-100`. Isso é um problema duplo — quem não sabe que precisa
passar o mouse nunca descobre o "Ver", e quem navega por **teclado** foca um link que está
literalmente invisível (`opacity: 0` não tira do fluxo de foco). Tratado na etapa G2.

---

## 2. A estrutura da fase

Cinco etapas, **uma por vez**, nesta ordem. A ordem não é arbitrária:

```
G1  Acessibilidade      → FEITO (9c204b8) · registro em 3.5                     1 commit
G2  Visual              → 4 sub-etapas, da mais segura para a mais visível      4 commits
     G2.1  estados das classes utilitárias (foco, active, disabled)
     G2.2  área de toque e ações visíveis
     G2.3  contraste e números tabulares
     G2.4  skeleton e estados vazios
G3  Renderização        → memoiza o que o G1/G2 acabaram de mexer               1 commit
G4  Peso das listas     → o ganho real de velocidade                            2 commits
G5  Verificação         → fecha a fase                                          —
```

G1 antes de G2 porque o componente de dica é pré-requisito. G3 depois de G2 porque não adianta
memoizar um componente que vai ser reescrito na etapa seguinte. G4 por último porque é o que
mexe em `store.ts` — o arquivo mais perigoso do repo — e deve entrar com a tela já estável.

Dentro do G2 a ordem também é deliberada: **G2.1 mexe só em `globals.css`** e conserta sete
telas de uma vez sem tocar em nenhuma; as seguintes vão ficando mais visíveis. Se o Pedro achar
que já está bom depois do G2.1, para ali.

**Cada etapa é independente e reversível.** Parar depois de qualquer commit deixa o sistema
consistente.

---

## 3. G1 — Labels e dicas para o chão de fábrica

**Público definido pelo Pedro:** chão de fábrica. Linguagem simples, direta, respondendo "o que
este botão faz" e "o que acontece se eu clicar". Não é texto de documentação.

### 3.1 Por que não usar só `title=""`

O `title` nativo é grátis e acessível, mas: demora ~1s para aparecer, some sozinho, não existe
no toque (tablet na fábrica) e não aceita o tema. Então:

- **`aria-label` sempre** em todo controle só-de-ícone — é o que o leitor de tela lê, e é
  obrigatório independente do visual.
- **Dica visual** só onde há dúvida real de operação.

Os dois juntos, nunca um no lugar do outro.

### 3.2 Criar `src/components/Dica.tsx`

Tooltip **100% CSS**, sem JS, sem estado, sem biblioteca. Isso não é preferência estética: um
tooltip com `useState` re-renderiza a cada `mouseenter`, e numa lista de 40 pedidos isso vai
contra a etapa G3.

Requisitos:

- Envolve o filho e mostra a dica no hover **e no `focus-visible`** (teclado precisa ver
  também).
- Cores só com token: `bg-superficie` / `text-conteudo` / `border-borda-forte` / `--sombra-media`.
  Funciona nos dois temas sem uma linha de `dark:`.
- `print:hidden`, como todo elemento de navegação (CLAUDE.md, "Identidade visual").
- A dica é **decorativa** (`aria-hidden="true"`): o nome acessível vem do `aria-label` do botão.
  Sem isso o leitor de tela lê a mesma coisa duas vezes.
- Prop de lado (`top` / `bottom` / `left` / `right`), padrão `top`.

> **Armadilha 1 — a mais provável desta etapa.** A tabela de `/pedidos` está dentro de
> `card p-0 overflow-hidden` + `overflow-x-auto` (`pedidos/page.tsx:126, 132`). Um tooltip
> posicionado com `absolute` dentro disso **é cortado** — principalmente na última coluna, que é
> justamente onde estão os botões de ícone.
>
> O `impeccable/reference/operate.md` nomeia exatamente este caso e dá a saída certa: *"Overlays
> escapam do container. Um dropdown com position absolute dentro de um ancestral `overflow:
> hidden` ou `auto` é cortado; use `<dialog>`, a Popover API, `position: fixed` ou um portal."*
>
> Ou seja: **não resolva mudando o lado do tooltip** — isso só empurra o problema para a próxima
> coluna. Use a **Popover API** (`popover` + `anchor`, nativa, sem JS e sem dependência) ou
> `position: fixed`. Se a Popover API não cobrir os navegadores da fábrica, `title=` nativo
> nessas células é uma degradação honesta; tooltip cortado não é.

> **Armadilha 2.** `src/lib` está nos `content` do Tailwind e precisa continuar
> (CLAUDE.md). Se o `Dica.tsx` montar classe por string, confirme que `src/components` também
> está coberto — está, mas confira antes de confiar.

### 3.3 Onde aplicar, nesta ordem de prioridade

**Prioridade 1 — `/producao` + `FluxoEtapas.tsx`.** É a tela do chão de fábrica e a que tem a
ação mais obscura do sistema. Textos sugeridos (ajuste ao que o Pedro falar na revisão):

| Elemento | `aria-label` | Dica visual |
|---|---|---|
| Etapa (o clique que cicla) | `Etapa {rótulo}: {status}. Clique para avançar.` | `Clique para avançar: pendente → em andamento → concluído` |
| Lixeira da etapa | `Marcar {rótulo} como não se aplica` | `Este pedido não passa por esta etapa. Não apaga nada — clique de novo para desfazer.` |
| Alça de arrastar | `Reordenar etapa {rótulo}` | `Arraste para mudar a ordem das etapas deste pedido` |
| Barra de progresso | (`role="progressbar"` + `aria-valuenow`) | `{concluidos} de {aplicaveis} etapas concluídas` |
| "Pronto para envio?" | — | `Confere as etapas que ficaram pendentes antes de liberar` |

O texto da lixeira importa: hoje ela **parece** um "excluir" e na verdade marca "não se aplica"
e é reversível (CLAUDE.md, regra 7). Essa dica sozinha já justifica a etapa.

**Prioridade 2 — `/pedidos`.** `aria-label` na lixeira (`:175`), no campo de busca (`:100`, que
hoje tem só `placeholder` — placeholder **não** é label), no `<select>` de ordem (`:118`) e nos
chips de filtro. Nos chips, use `aria-pressed={filtro === f.value}` — é o atributo correto para
um botão que fica "ligado".

**Prioridade 3 — o resto.** `/dashboard`, `/entregas`, `Sidebar`, `BotaoTema`,
`MiniaturaArquivo`, Kanban. Só `aria-label`; dica visual só onde a ação for ambígua.

### 3.4 Teste e commit

Teste (só leitura, nenhum clique que grave):

1. Passar o mouse em cada ícone de `/producao` — a dica aparece, legível, não cortada.
2. Repetir no **tema escuro** — contraste mantido.
3. `Tab` pela tela inteira: todo controle focável mostra a dica e tem nome acessível.
4. `Ctrl+P` em `/pedidos`: nenhuma dica aparece na impressão.
5. Mobile (DevTools, largura de celular): a dica não estoura a tela.

Commit: `feat: labels e dicas de acessibilidade em /producao e /pedidos`

### 3.5 Registro de execução do G1 — FEITO (18/09/2026, commit `9c204b8`)

**Aprovado e pushado.** Primeiro commit `7026f12`, corrigido por `amend` para `9c204b8` depois
da revisão. Ficou acima do que a spec pedia em dois pontos: os `aria-label` anunciam o **status
atual** antes da ação (`"Etapa Corte: concluído. Clique para avançar."`), e o `progressbar` veio
com `aria-valuenow/min/max` completo.

**A armadilha 1 se confirmou na prática.** Dentro da tabela de `/pedidos` (`overflow-x-auto`) a
`<Dica>` não foi usada — ficou `title=` nativo pareado com `aria-label`, a degradação que o 3.2
já previa. A Popover API não chegou a ser avaliada; se algum dia a dica ali precisar de estilo,
é por lá que se resolve, não mudando o lado.

**Dois defeitos achados na revisão de código, os dois corrigidos antes do push:**

1. **`whitespace-nowrap` sem `max-width`.** O texto mais longo (o da lixeira, 84 caracteres)
   gerava uma caixa de ~525px centrada num ícone de 14px — vazava da tela no celular. Trocado
   por `w-max max-w-[min(16rem,calc(100vw-2rem))]`. **Este é o defeito que o build não pega e o
   teste de largura de celular pegaria**: é a razão de o teste 5 do 3.4 existir.
2. **`role="tooltip"` junto com `aria-hidden="true"`.** Os dois se anulam — `aria-hidden` remove
   o elemento da árvore de acessibilidade, então o `role` era markup morto. `role` removido,
   `aria-hidden` mantido, como o 3.2 define.

**Duas coisas verificadas no CSS gerado pelo build, não só no código-fonte** — vale repetir o
método nas próximas etapas, porque **o Tailwind descarta em silêncio a classe que não entende, e
`npm run build` passa do mesmo jeito**:

- `group-has-[:focus-visible]/dica` **compila** no Tailwind 3.4.1. A regra
  `.group\/dica:has(:focus-visible) ...` está no bundle. Ou seja, o caminho de teclado funciona.
- `max-w-[min(16rem,calc(100vw-2rem))]` sai como `min(16rem,calc(100vw - 2rem))` — **o Tailwind
  acrescenta o espaço** em volta do `-`, que o `calc()` exige. Em CSS puro ou num `style={{}}`
  essa mesma string seria inválida e a declaração inteira seria descartada.

**Ressalva que ficou aberta:** `:has()` exige Chrome 105+ / Firefox 121+. Em navegador mais
antigo o caminho de teclado morre em silêncio (o hover continua). Não foi verificado qual
navegador roda nos computadores da fábrica.

**Teste do 3.4: os 5 cenários foram rodados no navegador e passaram**, incluindo o de largura de
celular — a dica de 256px centrada na coluna da direita **não** vazou, então o `lado="left"` na
lixeira não foi necessário. Se o `FluxoEtapas` mudar de colunas no mobile, reteste este ponto.

---

## 4. G2 — Visual

### 4.0 Como as skills foram usadas (e o conflito que elas têm entre si)

As skills estão em `.claude/skills/`. Três importam aqui, e **elas não concordam entre si** —
resolver isso é metade do trabalho desta seção.

**`impeccable` define o enquadramento.** O `SKILL.md` separa quatro modos, e o nosso é
**Operate**: "app UI, dashboards, admin, settings, tools — o visitante está executando uma
tarefa". A regra do modo é explícita: *scanability, consistência e expectativa nativa vencem a
expressão*. E o teste que ele propõe, o "product slop test", é o norte da fase inteira:

> A ferramenta deve desaparecer dentro da tarefa. O modo de falha do produto não é ser sem
> graça, é ser estranho sem propósito.

Para o Alex marcando corte às sete da manhã, isso vale mais que qualquer efeito.

**`redesign-existing-projects` foi filtrado, não seguido.** A checklist dele é excelente, mas
foi escrita pensando em landing page — hero, pricing, depoimentos, parallax. Aplicar inteiro
aqui pioraria o sistema. Onde ele conflita com o `operate.md`, **o `operate.md` ganha**:

| `redesign-existing-projects` manda | `operate.md` responde | Decisão |
|---|---|---|
| Trocar Inter por Geist/Satoshi/Outfit | "Uma família só costuma estar certa... fonte sans familiar é permissão do produto" | **Inter fica** |
| Quebrar simetria, grid assimétrico, sobreposição | "Consistência acima de surpresa; a mesma gramática visual tela a tela é virtude" | **Não quebra** |
| Dashboard não precisa de sidebar à esquerda | Identidade de marca fixada no CLAUDE.md | **Sidebar fica** |
| Trocar lucide por Phosphor/Heroicons | — | **Não** (dependência nova; regra 5 da seção 0) |
| Grão, ruído, glassmorphism, spotlight border | "Motion e decoração que não comunicam estado" está na lista de restrições do Operate | **Não** |
| Tipografia fluida com `clamp()` | "Escala rem fixa, não fluida — usuários veem em DPI constante" | **Escala fixa** |

O que **sobrevive** do `redesign-existing-projects`, porque o `operate.md` concorda: estados de
hover/active/foco, skeleton no lugar de spinner, estados vazios e de erro desenhados,
`transform`/`opacity` na animação, números tabulares em interface de dados, e semântica HTML.
É justamente o que as sub-etapas abaixo fazem.

**`ui-ux-pro-max` foi consultado por domínio**, não lido inteiro — ele é uma base pesquisável
(119 diretrizes de UX, 22 stacks). As consultas que embasam esta seção estão citadas nos
achados, com a severidade que a própria base atribui.

### 4.1 Auditoria — o que foi medido, com evidência

Nove achados. Todos verificados no código em 18/09/2026, com arquivo e linha.

| # | Achado | Evidência | O que a skill diz | Grav. |
|---|---|---|---|---|
| 1 | **`:focus-visible` não existe no projeto** | `grep -rn "focus-visible" src/` → **0 ocorrências**. Só `.input` tem `focus:ring` (`globals.css:217`), e é `:focus`, que também dispara no clique de mouse | `ui-ux-pro-max`, prioridade 1: "remover focus ring" é anti-padrão CRÍTICO. `craft-floor`: foco de teclado é item de verificação | **Alta** |
| 2 | **Área de toque de 16×16 px** | `pedidos/page.tsx:175` — `<button>` sem padding com `<Trash2 className="w-4 h-4"/>` dentro. Igual em `terceirizadas/page.tsx:280, 337, 342` | `ux`: "Target Size (Minimum)" — WCAG 2.2 **AA exige 24×24 CSS px**. Severidade High | **Alta** |
| 3 | **Contraste reprova AA no chip de etapa** | `FluxoEtapas.tsx:69` — `bg-superficie-3 text-fraco` = `#6b7280` sobre `#f3f4f6` = **4,39:1**. Mínimo AA é 4,5:1 | `craft-floor`: "texto de corpo ≥4.5:1". Só no tema **claro** — no escuro dá 4,89:1 e passa | **Alta** |
| 4 | **Componentes com 2 dos 7 estados** | As classes utilitárias têm `default` e `:hover`. Não têm `:focus-visible`, `:active`, `:disabled`, loading nem error. `grep "active:"` → 3, e 2 são variáveis do dnd-kit, não CSS | `operate.md`: "Todo componente interativo tem default, hover, focus, active, disabled, loading, error. Não entregue com metade deles" | **Alta** |
| 5 | **`.card` é o "ghost card"** | `globals.css:177-182` — `@apply rounded-2xl border p-6` **e** `box-shadow: var(--sombra)` | `craft-floor`: "Declare elevação uma vez, borda **ou** sombra. Uma borda de 1px sob uma sombra larga é o ghost card" | Média |
| 6 | **Números em fonte proporcional** | `grep "tabular-nums"` → **2 ocorrências**, ambas em `dashboard/page.tsx` (sobra da Fase F). Valores, quantidades, %, datas e o `#numero` do pedido em todo o resto usam a largura variável do Inter | `craft-floor`: "os numerais em dados tabulares embarcam com o padrão do navegador, que não pertence a design system nenhum" | Média |
| 7 | **Nenhum skeleton, nenhum estado de ocupado** | `grep "animate-pulse"` → 0. `grep 'role="status"'` → 0. `grep "aria-busy"` → 0. Só `/entregas` avisa que está carregando, e com texto solto (`entregas/page.tsx:57`) | `ux`, "Loading Indicators", Severidade High: "preserve layout, foco e status acessível de ocupado". `operate.md`: "skeleton para carregamento, não spinner no meio do conteúdo" | Média |
| 8 | **Superfícies do navegador não tematizadas** | Sem `::selection`, sem barra de rolagem tematizada. `globals.css` já trata `option` e o ícone de data no escuro (`:227-233`) — o começo está lá, falta o resto | `craft-floor`: "as partes que você não desenhou também carregam o design... é o sinal mais barato de que a página foi construída, e o que os modelos mais pulam" | Baixa |
| 9 | **Ações escondidas em `opacity-0`** | `pedidos/page.tsx:170` — `opacity-0 group-hover:opacity-100` na coluna de ações | Quem não sabe do hover nunca acha o "Ver"; e `opacity:0` **não** tira do fluxo de foco, então o teclado foca um link invisível | Alta |

**E o que já está certo — não mexa.** Vale listar, porque metade da checklist do
`redesign-existing-projects` pediria para mudar coisas que aqui estão corretas:

- **Uma família tipográfica (Inter), escala rem fixa** — `operate.md` confirma as duas como a
  escolha certa para produto.
- **Raio de 12–16px** (`rounded-2xl` = 16px) — exatamente a faixa que o `craft-floor` define.
- **Transições em 150ms** (`duration-150` nos `.btn-*`) — dentro dos 150–250ms do `operate.md`.
- **Item de navegação ativo destacado** (`Sidebar`, `bg-nice-500`) — a diretriz "Active State"
  do `ux` já está atendida.
- **Cor restrita ao verde da marca**, sem acento secundário — o "Restrained" que o `operate.md`
  define como piso do produto.
- **Tema escuro por variável, impressão sempre clara** — melhor que a média do que a skill
  descreve como típico.

### 4.2 — G2.1 · Estados completos nas classes utilitárias (commit 1)

**Um arquivo só: `src/app/globals.css`.** Nenhuma tela é tocada, e sete telas melhoram. É a
maior relação retorno/risco da fase inteira — por isso vem primeiro.

Resolve os achados 1, 4 e 5.

**a) `:focus-visible` em tudo que é focável.** `.btn-primary`, `.btn-secondary`, `.btn-ghost`,
`.btn-perigo`, `.sidebar-link` e `.card` (quando clicável) não têm nada hoje. Use um anel
derivado de `--marca` com `outline-offset: 2px`.

> **Armadilha.** Na sidebar o anel de `--marca` (`#3a8c2f`) fica sobre `bg-nice-800`
> (`#1e2d1b`) — verde sobre verde escuro, quase invisível. O `.sidebar-link` precisa do anel em
> tom claro (`nice-200`/branco), não no verde da marca. Essa é a razão de o anel padrão do
> navegador não servir aqui, e é o caso que se esquece.

> **Por que `:focus-visible` e não `:focus`.** `:focus` acende o anel também no clique de mouse,
> o que parece bug para quem não usa teclado. `.input` hoje usa `:focus` (`globals.css:217`) —
> vale migrar junto.

**b) `:active` — feedback de clique.** Um `transform: translateY(1px)` (ou `scale(0.98)`) nos
quatro `.btn-*`. É o que faz a interface parecer física em vez de morta, e custa duas linhas.
Respeite `prefers-reduced-motion`.

**c) `:disabled`.** Hoje só existe `disabled:opacity-50` solto em dois pontos do Kanban
(`QuadroBoard.tsx:474, 590`). Padronize nas classes: opacidade reduzida, `cursor: not-allowed`,
e **hover neutralizado** — botão desabilitado que ainda muda de cor no hover mente sobre o
próprio estado.

**d) Resolver o ghost card.** `.card` declara borda **e** sombra. Escolha uma. A recomendação é
**manter a borda e tirar a sombra**: a borda é o que separa o card do `--fundo` no tema escuro,
onde a sombra praticamente não aparece; e o sistema é usado sob luz de galpão, onde sombra sutil
some de qualquer jeito. Mantenha `--sombra-media`/`--sombra-forte` para modal e dropdown, que
são elevação de verdade.

Commit: `feat: estados de foco, clique e desabilitado nas classes utilitarias`

### 4.3 — G2.2 · Área de toque e ações visíveis (commit 2)

Resolve os achados 2 e 9. Três arquivos: `/pedidos`, `/terceirizadas` e **`FluxoEtapas.tsx`**.

**a) Botões de ícone com 24×24 px no mínimo.** Hoje a lixeira de `/pedidos` é um `<button>` sem
padding embrulhando um ícone de 16px. Um `p-2` com `rounded-lg` leva a área para 32×32 e ainda
ganha um alvo de hover visível. Mesma coisa em `terceirizadas/page.tsx:280, 337, 342`. E o
`ux` pede **8px de espaçamento** entre alvos adjacentes — o `gap-2` que já existe (8px) atende.

> **Escopo acrescentado depois do G1.** A auditoria original (achado 2) só tinha olhado
> `/pedidos` e `/terceirizadas`. Executar o G1 revelou que o `FluxoEtapas` tem o mesmo problema,
> e **pior**: o `GripVertical` e o `Trash2` são `w-3.5` (**14 px**), menores ainda que os 16 de
> `/pedidos`, e ficam na tela que o chão de fábrica mais usa, em celular e tablet. Entram nesta
> sub-etapa.
>
> Cuidado ao aumentar o alvo ali: os dois ficam dentro de um card de etapa que no mobile divide
> a linha em `grid-cols-2`. Padding a mais estreita o rótulo da etapa, que já usa `truncate`.
> Confira na largura de celular que o nome da etapa continua legível — se apertar demais, o
> caminho é reduzir o padding lateral do card, não o alvo.

> Isso não é preciosismo de norma: o chão de fábrica usa o sistema com a mão suja e às vezes no
> tablet. Um alvo de 16px é errado clicar.

**b) Ações sempre visíveis em `/pedidos`.** Troque `opacity-0 group-hover:opacity-100` por
presença permanente em tom fraco, escurecendo no hover e no foco. Conserta a descoberta e o
teclado de uma vez.

> Se o Pedro preferir manter o efeito de revelar, o **mínimo aceitável** é acrescentar
> `focus-within:opacity-100` — mas a recomendação é remover. `operate.md`: consistência acima de
> surpresa, e uma ação que só existe no hover não é consistente.

**c) Enquanto estiver nesses arquivos**, confirme que todo `<button>` de ícone ganhou o
`aria-label` do G1. As duas etapas se cruzam aqui, e é o ponto mais provável de sobrar um botão
mudo.

Commit: `fix: area de toque dos botoes de icone e acoes visiveis em /pedidos`

### 4.4 — G2.3 · Contraste e números tabulares (commit 3)

Resolve os achados 3 e 6.

**a) Corrigir os 4,39:1 do chip de etapa.** `FluxoEtapas.tsx:69` usa `text-fraco` sobre
`bg-superficie-3`. Duas saídas:

- **Trocar para `text-suave` naquela linha** → 6,87:1. Cirúrgico, não afeta mais nada.
  **Recomendada.**
- Escurecer `--texto-fraco` no tema claro → conserta todo caso futuro, mas mexe em
  ~100 rótulos de uma vez e pede reteste geral.

> **Este achado corrige uma informação do CLAUDE.md.** Ele afirma que o par mais apertado é
> `--texto-fraco` "hoje em ~6,2:1". Essa conta foi feita contra `--superficie` (branco), onde dá
> 4,83:1. Contra `--superficie-3` dá 4,39:1 e reprova. **Atualize o CLAUDE.md junto com este
> commit** — a afirmação errada é pior que a ausência dela, porque a próxima pessoa confia.
>
> Números conferidos: claro — sobre `--superficie` 4,83:1 ✅, sobre `--superficie-2` 4,63:1 ✅,
> sobre `--superficie-3` **4,39:1 ❌**. Escuro — 6,30 / 5,63 / 4,89, todos ✅.

**b) `font-variant-numeric: tabular-nums` nos dados.** Em tabela, valor que muda de largura faz
a coluna "dançar" a cada render e atrapalha comparar dois números na vertical. O dashboard já
usa em dois pontos; falta o resto: `#numero` do pedido, `totalPecas`, datas, `valorTotal`,
percentuais de progresso, e os valores de `/terceirizadas` e `/relatorios`.

O caminho limpo é uma utilitária em `@layer components` (`.num`, com `font-variant-numeric:
tabular-nums`) e aplicá-la nas células, em vez de espalhar `tabular-nums` solto.

**c) `::selection` no tema.** Duas linhas usando `--marca-suave`/`--texto`. É o item que o
`craft-floor` chama de "o sinal mais barato de que a página foi construída".

Commit: `fix: contraste AA no chip de etapa e numeros tabulares nas tabelas`

### 4.5 — G2.4 · Skeleton e estados vazios (commit 4)

Resolve o achado 7. É a sub-etapa mais visível, e a única que mexe em várias telas.

**a) Skeleton nas seis telas de lista.** Hoje, enquanto o `fetch` não volta, elas mostram lista
vazia — indistinguível de "não há nada". Com o payload atual (etapa G4, ainda não feita) isso
dura o suficiente para o Alex achar que o pedido sumiu.

Blocos `bg-superficie-3` com `animate-pulse`, **na forma do conteúdo que vai chegar** — linhas
de tabela em `/pedidos` e `/dashboard`, cards em `/producao`. Skeleton genérico de tamanho
errado causa salto de layout na troca, que é o problema que ele deveria evitar.

> **Acessibilidade do carregamento** (`ux`, "Loading Indicators", Severidade High): o container
> leva `aria-busy="true"` enquanto carrega e `role="status"` com um texto em `sr-only`
> ("Carregando pedidos"). Sem isso, para quem usa leitor de tela a página simplesmente fica
> muda.

> **Não faça o skeleton piscar.** Carregamento quase instantâneo com skeleton fica pior que sem
> — é a ressalva literal da base: "evite piscar em trabalho quase instantâneo". Um atraso de
> ~200ms antes de mostrar o skeleton resolve.

**b) Estados vazios que ensinam.** `operate.md`: "estados vazios que ensinam a interface, não
'nada aqui'". Hoje as mensagens são corretas mas mudas — "Nenhum pedido encontrado."
(`pedidos/page.tsx:129`), "Nenhum pedido em produção no momento." (`producao/page.tsx:177`).

Distinga os dois casos, que hoje se parecem:

- **Vazio de verdade** (não há nada): explique e ofereça a ação — "Nenhum pedido em produção.
  Pedidos aparecem aqui quando o pagamento é registrado ou a liberação é aprovada." Esse texto
  ensina a regra 1 do sistema para quem nunca leu o CLAUDE.md.
- **Vazio por filtro** (existe, o filtro escondeu): já está certo em `/producao`
  (`:180-186`, com "Limpar filtros"). **Copie esse padrão para `/pedidos` e `/dashboard`**, que
  hoje mostram a mesma frase nos dois casos.

**c) Erro visível.** `/entregas` tem faixa de erro (`:31`); `/pedidos` e `/dashboard` não têm
nada — se `getPedidos()` falhar, a tela fica vazia e silenciosa, igualzinho a "não há pedidos".
Use `classificarErro` (`src/lib/erros.ts`), que já existe exatamente para isso, e escreva o
texto por tela — a consequência muda.

Commit: `feat: skeleton, estados vazios que ensinam e faixa de erro nas listas`

### 4.6 O que NÃO fazer nesta etapa

Sai do `operate.md` ("restrições do produto"), do `craft-floor` ("refuse") e do CLAUDE.md:

- **Não troque a fonte.** Inter é a escolha certa aqui, e o `operate.md` diz isso com todas as
  letras. A sugestão do `redesign-existing-projects` não se aplica a produto.
- **Não mexa na paleta `nice-*` nem nas variáveis de `:root`/`.dark`**, fora do caso pontual do
  achado 3. Os tons foram calculados para AA e o CLAUDE.md manda refazer a conta a cada mexida.
- **Não troque a sidebar verde escura**, nem por top nav. Identidade de marca, deliberada nos
  dois temas.
- **Não introduza `dark:` em tela nenhuma.** O sistema não precisa — é tudo variável.
- **Nada de gradiente, vidro, ruído, grão ou sombra colorida.** `craft-floor` lista todos como
  hábito de superfície; `operate.md` chama de "estranheza sem propósito".
- **Nada de coreografia de entrada.** "Produto carrega dentro de uma tarefa; ninguém quer
  assistir a página carregar." Movimento só comunica estado.
- **Nem um modal novo.** "Modal como primeiro pensamento costuma ser preguiça." O sistema já
  tem os que precisa.
- **Nem um card dentro de outro card.** "Cards aninhados estão sempre errados."
- **Não troque a biblioteca de ícones.** Dependência nova está fora do escopo (regra 5).

### 4.7 Teste de cada sub-etapa do G2

Tudo só leitura — nenhum clique que grave. Rode **nos dois temas**, sempre.

**Depois do G2.1:** `Tab` por `/pedidos`, `/producao` e pela sidebar — o anel aparece em todo
controle e é visível **inclusive sobre o verde escuro da sidebar**. Clique com o mouse: o anel
**não** aparece (é `:focus-visible`). Segure o clique num botão: afunda. Um botão desabilitado
(o "Excluindo..." do Kanban serve) não reage ao hover.

**Depois do G2.2:** meça a lixeira de `/pedidos` no DevTools — a caixa precisa dar ≥24×24 px.
Abra em largura de tablet e confira que dá para acertar o alvo com o dedo. O "Ver" aparece sem
hover.

**Depois do G2.3:** inspecione o chip "não se aplica" no tema **claro** e confirme o contraste
≥4,5:1 pelo próprio DevTools (ele mostra a razão no seletor de cor). Numa tabela com valores de
larguras diferentes, os dígitos alinham na vertical.

**Depois do G2.4:** recarregue `/pedidos` com throttle "Slow 3G" no DevTools — o skeleton
aparece na forma das linhas, sem salto de layout quando os dados chegam. Filtre por algo que não
existe: a mensagem é a de filtro, com "Limpar", não a de lista vazia. Desligue a rede e
recarregue: aparece faixa de erro, não tela vazia e silenciosa.

**Em toda sub-etapa:** `Ctrl+P` em `/pedidos/[id]` e confira que a ficha A4 continua idêntica.
É o artefato que sai em papel para a produção, e nenhuma mudança do G2 deveria alcançá-lo.

---

## 5. G3 — Renderização

Só depois do G2 estar commitado.

### 5.1 Memoizar as derivações das telas de lista

| Arquivo | O que memoizar |
|---|---|
| `pedidos/page.tsx:54-71` | `candidatos` e `filtrados` → um `useMemo` com deps `[pedidos, filtro, busca, ordem]` |
| `dashboard/page.tsx:37-69` | `ativos`, `urgentes`, `aguardandoAprovacao`, `visiveis`, `pecasEmProducao`, `urgentesVencidos` |
| `producao/page.tsx:116-130` | `visiveis` → deps `[pedidos, busca, recorte, ordem]` |

> **Armadilha.** `resumoProgresso` roda dentro de `casaRecorte` (`producao/page.tsx:54`), ou
> seja, **uma vez por pedido a cada render**. Memoizar `visiveis` já resolve. Não tente cachear
> `resumoProgresso` por dentro — ela é a fonte única do "% pronto" (CLAUDE.md, `helpers.ts`), e
> um cache ali é exatamente como a barra de progresso e o filtro "quase prontos" passam a
> discordar.

### 5.2 Busca que não trava a digitação

Hoje cada tecla dispara filtro + ordenação + render completo da lista.

Há dois caminhos, e a base do `ui-ux-pro-max` (`--domain react`, categoria "Rerender", item
"Transitions") aponta o melhor: **o projeto está em React 18** (`package.json`: `react: ^18`),
então `startTransition` está disponível e é a solução idiomática — marca a atualização do filtro
como não urgente, o React mantém a digitação fluida e interrompe a renderização antiga quando
chega tecla nova. Nenhuma biblioteca, nenhum `setTimeout`.

```
const [busca, setBusca] = useState('')        // urgente: o que aparece no input
const [filtro, setFiltro] = useState('')      // não urgente: o que filtra a lista
onChange={e => { setBusca(e.target.value); startTransition(() => setFiltro(e.target.value)) }}
```

Debounce de 200–250ms continua sendo alternativa válida e mais simples de entender. **Faça um
ou outro, não os dois** — juntos, o atraso soma e a busca parece travada.

Outros dois itens da mesma base, se o Claude Code esbarrar neles ao mexer:

- **Dependências primitivas**: `useEffect(..., [pedido.id])`, não `[pedido]`. Objeto novo a cada
  render dispara o efeito sempre.
- **Init preguiçoso**: `useState(() => calcular())`, não `useState(calcular())` — a segunda
  forma roda em todo render e joga o resultado fora.

### 5.3 Extrair as linhas em componentes memoizados

- `<LinhaPedido>` em `/pedidos`, com `React.memo`.
- O card de pedido de `/producao`, com `React.memo` — é o de maior ganho, porque cada card monta
  um `FluxoEtapas` com dnd-kit.

> **Armadilha — `React.memo` é inútil com callback novo a cada render.** `FluxoEtapas` recebe
> `onGravado={carregar}` e `onAcabamentoConcluido={() => ...}` (`producao/page.tsx:237-238`).
> Ambos são recriados em todo render e furam o memo. Envolva `carregar` em `useCallback` e troque
> a arrow inline por um handler estável. **Sem isso, a etapa 5.3 não faz efeito nenhum** — e é o
> erro mais comum ao memoizar React.

Commit: `perf: memoiza filtros das listas e extrai linhas em componentes`

---

## 6. G4 — Peso das listas

A decisão do Pedro: **enxugar o payload primeiro**, paginação de verdade só se ainda ficar
lento. É a ordem certa — a paginação real quebraria os filtros atuais, que rodam sobre a lista
inteira no navegador.

### 6.1 Medir antes (obrigatório, não pule)

Abra o DevTools → Network → recarregue `/pedidos` e anote: **tamanho da resposta** e **tempo**.
Repita em `/producao`. Anote os quatro números aqui no documento antes de mudar qualquer linha.
Sem isso não existe "melhorou" — existe achismo, e a etapa 6.3 vira desculpa para reescrever
`store.ts` sem motivo.

**Medido em 21/09/2026, pelo Pedro, direto na sessão real (Performance API — o Supabase não
libera o tamanho em bytes via CORS pra JS de outro domínio; quem precisar do peso exato em
bytes confere na coluna Size do próprio DevTools):**

- `/pedidos`: fetch de pedidos+clientes entre **536ms e 1448ms** por carregamento.
- `/producao`: refazia a MESMA busca completa de pedidos (**1686–1795ms**) + busca separada de
  `etapas_producao` (**162–929ms**) — não reaproveitava nada do que `/pedidos` já tinha buscado.

Sem o tamanho em bytes, a comparação "antes/depois" desta fase fica só em tempo — é a limitação
que ficou registrada aqui, não decisão de pular a medição.

### 6.2 Matar o refetch total de `/producao` (o item de maior impacto da fase)

Hoje: clique numa etapa → `onGravado` → `carregar()` → `getPedidos()` + `carregarEtapas()`
inteiros.

Alvo: atualizar **só o pedido que mudou**, no estado local, como o Kanban já faz.

**O padrão já existe no repo — copie, não invente.** `QuadroBoard.tsx`, função `gravar`:
otimista na tela, rollback + faixa de erro se a gravação falhar. É a regra 10 do CLAUDE.md ("a
tela nunca mostra o que o banco não tem"), e ela vale aqui igual.

Forma sugerida: `FluxoEtapas` passa a devolver o progresso gravado, e `/producao` faz
`setPedidos(ps => ps.map(p => p.id === id ? { ...p, progresso: novo } : p))`.

> **Armadilha 1.** Se o `onGravado` sumir sem substituto, o modal "Pronto para envio?"
> (`producao/page.tsx:253-261`, que lê `modalPedido` de `pedidos`) passa a trabalhar com
> progresso velho. Ele **precisa** enxergar o estado atualizado.

> **Armadilha 2.** `resumoProgresso` e a barra de progresso leem `pedido.progresso`. Se o update
> local mutar o objeto em vez de criar um novo, o React não re-renderiza e a barra congela.
> Sempre objeto novo.

> **Armadilha 3 — teste de escrita, o único desta fase.** Este é o único ponto em que testar
> significa gravar no banco real. Então: **use um pedido real que já existe**, marque uma etapa,
> **confirme na tela que gravou, e devolva ao status original no mesmo minuto.** Não crie pedido
> de teste. E lembre que o clique grava o seu nome em `atualizadoPor` — o Pedro vai ver. Avise
> qual pedido você usou.

### 6.3 `getPedidos` enxuto para as listas

Nova função em `store.ts` — **sem tocar em `getPedidos`**, que continua servindo
`/pedidos/[id]`:

```ts
export async function getPedidosLista(): Promise<PedidoLista[]>
```

com lista **explícita** de colunas, sem `vetorizacao`, sem `observacoes`, e com o
`clientes(...)` reduzido aos campos que as listas mostram (`nome`, `empresa`, `telefone`).

> **Armadilha — `pecas` não pode simplesmente sair.** `totalPecas(p)` (`helpers.ts`) precisa das
> quantidades, e todas as telas de lista mostram "X un.". `parcelas` também não sai: `mapPedido`
> deriva `valorTotal`/`valorPago` dela (regra 4). O que pesa em `pecas` são as `fotos[]`, não as
> quantidades. **Não tente resolver isso com `select` de JSONB parcial sem medir antes** — se o
> 6.1 mostrar que `pecas` não é o gargalo, deixe como está.

> **Armadilha — RLS silenciosa.** Toda query nova em `store.ts` usa `criarClienteBrowser()`,
> nunca o `supabase` anônimo de `./supabase`. Errar aqui **não dá erro**: dá zero linhas em
> silêncio (CLAUDE.md, "Dois clients Supabase").

Alvos, em ordem de retorno:

1. `/terceirizadas` (`:71`) — precisa de `id` + `numero`. Trocar por uma query mínima.
2. `/producao` (`:80`) e `/entregas` (`:33`) — já descartam a maioria no cliente. Filtrar por
   `status` **na query** (`.in('status', ['aprovado','em_producao'])`) é seguro e corta o
   payload de imediato.
3. `/dashboard` (`:30`) — `getClientes()` é chamado só para `clientes.length`. Um
   `count: 'exact', head: true` resolve sem baixar nada.
4. `/pedidos` — a que mais se beneficia de `getPedidosLista`, e a última a mexer.

### 6.4 Paginação de verdade — **só se a medição pedir**

Não faça agora. Faça quando `select count(*) from pedidos` passar de ~500 **ou** o 6.1 mostrar
resposta acima de ~1MB depois do 6.3.

Quando chegar a hora: `.range(de, ate)` + `count: 'exact'` e — o ponto que costuma ser esquecido
— **a busca e os filtros precisam ir junto para o banco**. Paginar mantendo o filtro no
navegador faz a busca enxergar só a página atual, o que é pior que não paginar: some pedido sem
avisar.

Commits (separados): `perf: atualiza so o pedido alterado em /producao` e depois
`perf: enxuga o payload das telas de lista`

---

## 7. G5 — Verificação da fase

1. `npx tsc --noEmit` limpo.
2. `npm run build` limpo — **não basta o `tsc`**.
3. As 6 telas abrindo com dados reais, nos **dois temas**, com a sessão que já estiver logada.
4. Navegação por `Tab` em `/producao` e `/pedidos`: todo controle alcançável, focado de forma
   visível, com nome acessível.
5. Os quatro números do 6.1 medidos de novo e escritos aqui, lado a lado com os de antes.
6. `/pedidos/[id]` e a impressão A4 **intactas** — nenhuma etapa desta fase deveria tê-las
   tocado; confirme.
7. **Os 9 achados da seção 4.1, um por um**, com a evidência refeita: `grep -rn "focus-visible"
   src/` agora devolve resultado; a lixeira de `/pedidos` mede ≥24×24; o chip de etapa passa de
   4,5:1 no claro; `animate-pulse` e `role="status"` aparecem nas listas.
8. **`.claude/skills/` está no `.gitignore`** e `git status` não lista os 12,4 MB de skill.
9. **`CLAUDE.md` atualizado** com o que esta fase mudou de estrutural: as classes utilitárias
   passaram a ter estados completos, a correção do número de contraste de `--texto-fraco`
   (seção 4.4), e o componente `Dica` como o jeito de fazer tooltip no projeto.
10. Reescrever este arquivo com o registro de execução (o que foi feito, onde a spec errou sobre
    o código real, o que não deu para testar) e atualizar o `CHANGELOG.md`.

### 7.1 Registro de execução — G2 a G5 (fecha a fase, 21/09/2026)

**G1 já tem o próprio registro na seção 3.5.** Do G2 em diante, ficou tudo registrado aqui de
uma vez, ao final, e não sub-etapa por sub-etapa — decisão de ritmo desta sessão, não desvio da
regra "uma etapa = um commit" (os commits saíram um por sub-etapa, como pedido; só o *registro
escrito* ficou concentrado no fechamento).

**1–2. `tsc`/`build`.** Limpos em todo commit desta fase, sem excecão — conferido antes de cada
push, não só no final.

**3–4. As 6 telas + `Tab` em `/producao` e `/pedidos`, nos dois temas.** Testado pelo Pedro no
navegador a cada sub-etapa (G2.1 a G2.4, G3, G4) e de novo no fechamento do G5. **Um susto no
meio do caminho, não um bug do G4:** depois do G4, `/pedidos` carregou "0 pedido(s)" sem nenhuma
chamada ao Supabase disparar, e `/producao` ficou travado em "Carregando...". Console mostrava
404 de chunk estático e um 500 — sintoma de HMR quebrado depois de muitos `Fast Refresh`
seguidos enquanto o código ainda estava sendo editado, não de `getPedidosLista`. Resolvido
matando o processo do `npm run dev`, apagando `.next/` e subindo de novo do zero; depois disso
as duas telas voltaram a carregar normal, com dados reais (`/producao` confirmado com 27
pedidos). **Lição para a próxima fase:** depois de uma sequência longa de edições em arquivo que
o dev server já tem aberto, reiniciar o `npm run dev` antes de desconfiar do código.

**5. Os quatro números do 6.1, medidos de novo:**

| | Antes (19–21/09) | Depois (21/09, pós-G4) |
|---|---|---|
| `/pedidos` | 536–1448ms | 1677ms e 1246ms |
| `/producao` | pedidos 1686–1795ms + etapas 162–929ms (buscas separadas, sem reaproveitar nada) | não remedido — só confirmado que carrega normal com 27 pedidos reais |

**Honestidade sobre o número de `/pedidos`: não caiu — ficou na mesma faixa, e uma medição
(1677ms) até passou do pior "antes" (1448ms).** Isso não invalida o G4: a seção 1.3 deste
documento já tinha avisado, antes de qualquer código ser tocado, que **abaixo de ~500 pedidos o
tamanho do payload provavelmente não é o que trava a tela** — o volume real (dezenas de
pedidos) é pequeno o bastante para a latência de rede/banco dominar sobre a diferença de alguns
KB entre `getPedidos()` e `getPedidosLista()`. O ganho mensurável desta fase é outro: **6.2**
(matar o refetch de `/producao` a cada clique), que elimina uma chamada inteira por clique, não
uns bytes por carregamento inicial. `getPedidosLista` continua certo de se fazer — mais barato
nunca é pior — mas não é ele que resolve lentidão sentida neste volume de dados. Paginação real
(6.4) continua não fazendo sentido pelo mesmo motivo, e pela mesma regra: só refazer essa conta
se a tabela passar de ~500 pedidos.

**6. `/pedidos/[id]` e a ficha A4.** Não testado ao vivo nesta sessão (a fase não tocou a
tela), mas confirmado por leitura de código: as poucas mudanças que passaram por
`pedidos/[id]/page.tsx` (a etapa G2.3, `.num` nas parcelas e no resumo financeiro) estão todas
dentro do bloco `<div className="max-w-4xl space-y-6 print:hidden">` (`:398`), estruturalmente
separado do `<div className="hidden print:block text-black">` da ficha (`:1103`). Não tem como
uma mudança dentro do primeiro alcançar o segundo.

**7. Os 9 achados da seção 4.1, um por um — todos confirmados corrigidos, exceto a barra de
rolagem:**

| # | Achado | Depois |
|---|---|---|
| 1 | `:focus-visible` inexistente | `grep -rn "focus-visible" src/` → 3 arquivos (`globals.css`, `Dica.tsx`, mais o `.input`) |
| 2 | Alvo de toque 16×16 | `.btn-icone` = `p-2` sobre ícone de 16px → 32×32; `FluxoEtapas` (14px, espaço apertado) → 26×26 via `p-1.5 -m-1.5` |
| 3 | Contraste 4,39:1 no chip "não se aplica" | `text-suave` → 6,87:1, corrigido em `FluxoEtapas.tsx` |
| 4 | Componentes com 2 de 7 estados | `.btn-*`/`.card`/`.sidebar-link` ganharam `:focus-visible`, `:active`, `:disabled` |
| 5 | `.card` ghost card | `globals.css` — só borda, sombra saiu |
| 6 | Números em fonte proporcional | `.num` (`tabular-nums`) aplicado nas 6 telas de lista + `/pedidos/[id]` |
| 7 | Nenhum skeleton | `useSkeletonDelay` + `EsqueletoBarra`, `aria-busy` + `role="status"` nas 6 telas |
| 8 | `::selection` e barra de rolagem não tematizadas | `::selection` feito; **barra de rolagem continua sem tema** — nunca teve sub-etapa própria com commit, ficou de fora mesmo (severidade Baixa na auditoria original) |
| 9 | Ações escondidas em `opacity-0` | Removido de `/pedidos`; `grep opacity-0 group-hover src/app` → vazio |

**8. `.claude/skills/` fora do Git.** `.gitignore` usa `.claude/skills/*` + `!.claude/skills/README.md`
(não `.claude/skills/` sozinho — precisou mudar pra isso na Fase G2.2/G2.3 pra poder versionar o
README sem soltar o resto). `git status` não lista os 12,4 MB.

**9. `CLAUDE.md` atualizado.** Lista de classes utilitárias ganhou `.btn-icone` e `.num`; a
correção do número de contraste de `--texto-fraco` (estava documentada errada, "~6,2:1" sem
dizer contra qual fundo); `src/lib/store.ts` e `src/lib/hooks.ts`/`EsqueletoBarra.tsx` descritos
na lista de código compartilhado.

**Etapa que a spec original não previu:** o G2.2 descobriu, ao revisar `FluxoEtapas.tsx`, que o
alvo de toque pequeno também existia ali (14px, mais apertado que os 16px de `/pedidos`) —
entrou no escopo do G2.2 quando a auditoria original só tinha mapeado `/pedidos` e
`/terceirizadas`. Registrado como "escopo acrescentado depois do G1" na seção 4.3.

**O que não foi testado nesta sessão:** o clique de setor real em `/producao` (armadilha 3 do
6.2, a única gravação de verdade desta fase) — o Pedro decidiu aceitar sem esse teste manual
específico, com base na leitura do código e no build limpo. Fica registrado como decisão dele,
não como lacuna escondida.

---

## 8. Fora do escopo — anotado, não feito

- **Segurança.** É a **próxima** atualização, por decisão do Pedro: checar exposição de `.env` e
  os outros itens que ele vai passar. Adiantando uma boa notícia: `.gitignore` já cobre
  `.env*.local`, então `.env.local` **não** está no Git. O que continua valendo é o que o
  CLAUDE.md já registra com honestidade — `verFinanceiro` é controle só de interface, e o bucket
  `pedido-fotos` é público por URL.
- **Lixo no repo.** Existem duas pastas com nome quebrado dentro de `src/`, sobra de um `mkdir`
  com chaves no Windows: `src/{app` e
  `src/{app/{dashboard,pedidos,...}/components/{ui,layout,...}`. Não afetam o build (nada as
  importa), mas poluem busca e árvore. **Apague pelo Explorer** — o Cowork desta sessão não tem
  permissão de exclusão na pasta.
- **Peso das skills.** `.claude/skills/` tem **394 arquivos e 12,4 MB** (`font-index.json` 1 MB,
  `phosphor-icons-upstream.json` 836 KB, `google-fonts.csv` 732 KB, `live-browser.js` 548 KB), e
  ainda uma pasta `synced/` com as skills pessoais da conta Claude do Pedro — `morning`,
  `import-memory`, `pptx`, `xlsx` — que não têm relação com este projeto. **Vai para o
  `.gitignore`** (regra 7 da seção 0). Ignorar não desinstala nada: continuam no disco, e tanto
  o Claude Code quanto o Cowork seguem lendo.
- `gerarNumero()` com `count` da tabela inteira (seção 1.2).
- Fase B2 (mascarar colunas financeiras no banco) — segue hipotética.

---

## 9. Nota sobre o ambiente desta sessão

O handoff foi escrito pelo Claude no **Cowork**, que nesta sessão **lê e escreve** os arquivos
do projeto mas **não tem shell** na máquina do Pedro: não roda `npm run dev`, `npm run build`,
`npx tsc` nem `git`. Todo comando desta fase é executado pelo Pedro ou pelo Claude Code.

Por isso a spec é detalhada no **porquê** e nas **armadilhas**, e não traz diff pronto: quem
executa consegue rodar o build e ver a tela, e deve confiar no que vê, não no que está escrito
aqui. **Onde este documento divergir do código real, o código ganha** — e a divergência vai para
o registro de execução, como foi feito na Fase F.
