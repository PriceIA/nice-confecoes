# Nice Confecções — contexto do projeto

Este arquivo é lido no início de toda sessão do Claude Code. Mantenha-o factual e curto.
Ao mudar algo estrutural (módulo novo, tabela nova, regra nova), atualize aqui.

## Visão geral

Sistema de gestão de pedidos da **Nice Confecções** (Maringá-PR). Está **em produção e em
uso diário real** — não é protótipo. Qualquer mudança pode quebrar o trabalho de alguém no
mesmo dia.

- **Stack:** Next.js 14.2.5 (App Router) + Tailwind 3.4 + Supabase (`@supabase/supabase-js` 2.x) + Vercel
- **Libs:** `date-fns`, `lucide-react`, `clsx`, `@dnd-kit/core` + `@dnd-kit/sortable` +
  `@dnd-kit/utilities` (só no Kanban)
- **Repo:** github.com/PriceIA/nice-confecoes
- **Deploy:** nice-confecoes.vercel.app
- **Não existe:** testes, camada de API (exceto um route handler de keep-alive)

## Identidade visual

Todo módulo novo segue este padrão — não invente componentes ou cores fora dele.

- **Verde Nice:** `#3a8c2f` = `nice-500`. Escala `nice-50` → `nice-900` em `tailwind.config.ts:12-24`.
- **Sidebar:** verde escura (`bg-nice-800`), item ativo `bg-nice-500`.
- **Cards:** brancos, `rounded-2xl`, borda `gray-100`, sombra leve. Fundo da página `#f4f6f4`.
- **Fonte:** Inter.
- **Classes utilitárias** em `src/app/globals.css` — use estas em vez de escrever Tailwind solto:
  `.card`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-perigo`, `.input`, `.label`,
  `.badge`, `.sidebar-link`
- **Cores: ver a seção "Tema claro/escuro" abaixo.** Nunca escreva `bg-white` ou
  `text-gray-500` numa tela — o sistema tem tema escuro e cor literal não reage a ele.
- **Responsivo:** sidebar fixa a partir de `md:`; no mobile vira topbar + drawer
  (`src/components/layout/Sidebar.tsx`). Elementos de navegação levam `print:hidden`.

## Tema claro/escuro — leia antes de escrever qualquer cor

**Nunca escreva cor literal numa tela.** `bg-white`, `text-gray-500`, `border-gray-100` não
reagem ao tema: viram texto invisível no escuro. Use as cores semânticas.

| Papel | Classe | Variável |
|---|---|---|
| Fundo da página | `bg-fundo` | `--fundo` |
| Card, campo, menu | `bg-superficie` | `--superficie` |
| Faixa levemente destacada | `bg-superficie-2` | `--superficie-2` |
| Chip, barra de progresso | `bg-superficie-3` | `--superficie-3` |
| Texto principal | `text-conteudo` | `--texto` |
| Texto secundário | `text-suave` | `--texto-suave` |
| Rótulo, placeholder, ícone inerte | `text-fraco` | `--texto-fraco` |
| Título de tela e de card | `text-titulo` | `--titulo` |
| Borda | `border-borda` / `border-borda-forte` | `--borda` |
| Verde de ação (fundo, texto branco) | `bg-marca` | `--marca` |
| Verde COMO TEXTO | `text-marca-texto` | `--marca-texto` |
| Fundo verde tênue | `bg-marca-suave` | `--marca-suave` |

Como funciona:

- `darkMode: 'class'` (`tailwind.config.ts`) — a classe `dark` no `<html>` é a única chave.
- As variáveis vivem em `:root` e `.dark` (`src/app/globals.css`). **Trocar o tema é trocar
  as variáveis ali; nenhuma tela precisa de `dark:`.**
- As classes utilitárias (`.card`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`,
  `.btn-perigo`, `.input`, `.label`) já consomem as variáveis — na maioria dos casos, usá-las
  já resolve.
- Quem liga/desliga a classe é `src/components/TemaProvider.tsx`; o botão é
  `src/components/BotaoTema.tsx` (variantes `sidebar`, `icone`, `avulso`).
- A escolha é guardada em `localStorage` (`nice-tema`). Sem escolha, segue
  `prefers-color-scheme`; com escolha explícita, ela vence sempre.
- O `SCRIPT_TEMA` roda inline no `<head>` (`src/app/layout.tsx`) **antes da primeira
  pintura** — é o que evita o flash de tema errado. Por isso o `<html>` leva
  `suppressHydrationWarning`.

**A paleta de status também é variável.** `red`, `orange`, `yellow`, `green`, `blue`,
`purple` e `amber` apontam para variáveis, e a escala **inverte de papel** no escuro:

- `50–300` continuam sendo fundo/borda, mas em tom escuro
- `400–900` continuam sendo texto, mas em tom claro

Ou seja, `bg-red-100 text-red-700` significa "tarja vermelha com texto legível" nos dois
temas, sem edição. **Consequência:** `bg-red-600` não serve de fundo sólido para texto branco
no escuro — botão destrutivo usa `.btn-perigo`.

**A sidebar é verde escura nos dois temas** (identidade da marca). Ali o contraste se resolve
com os tons `nice-*`, não com as variáveis de superfície. No escuro, `--fundo` é mais escuro
que `bg-nice-800` de propósito, para a sidebar continuar se destacando.

**Impressão é sempre clara.** O bloco `@media print` em `globals.css` redefine as variáveis
para os valores claros (`:root, :root.dark`) e força `background:#fff !important` no `body`.
Tela futura que use as variáveis já imprime certo sem ninguém lembrar disso. A ficha A4 do
pedido usa `text-black`/`border-black` explícitos e não depende do tema.

**Contraste:** os tons foram escolhidos para passar WCAG AA (>= 4.5:1). Ao mexer, refaça a
conta — o sistema é usado o dia inteiro numa fábrica.

**`src/lib` está nos `content` do Tailwind.** Precisa continuar: `helpers.ts` e `kanban-ui.ts`
montam classes por string, e o Tailwind só gera a classe que enxerga no código.

## Módulos existentes

Todas as páginas são `'use client'`, exceto onde indicado.

| Rota | Arquivo | O que faz |
|---|---|---|
| `/` | `src/app/page.tsx` | Server component; redireciona para `/dashboard` |
| `/dashboard` | `src/app/dashboard/page.tsx` | 5 cards de KPI (`pedidosStats`), pedidos ativos, lista de urgentes |
| `/pedidos` | `src/app/pedidos/page.tsx` | Lista, busca (cliente/empresa/número), filtro por status, excluir |
| `/pedidos/[id]` | `src/app/pedidos/[id]/page.tsx` | Detalhe e edição ampla, progresso por setor, parcelas, layout de impressão A4 (bloco `print:block` em `:681`) |
| `/novo-pedido` | `src/app/novo-pedido/page.tsx` | Cadastro: cliente com autocomplete, peças, tamanhos, personalizações, parcelas, fotos, vetorização |
| `/clientes` | `src/app/clientes/page.tsx` | Lista, busca, edição inline, histórico de pedidos do cliente |
| `/tabela-precos` | `src/app/tabela-precos/page.tsx` | Grade de preços da categoria Escolar por grupo × faixa de tamanho. Empresarial/Esportivo/Acessórios ainda sem preço cadastrado |
| `/producao` | `src/app/producao/page.tsx` | Acompanhamento dos 8 setores; clique cicla pendente → em_andamento → concluido |
| `/entregas` | `src/app/entregas/page.tsx` | Fila de pedidos com os 8 setores concluídos, ainda não entregues; botão "Marcar como entregue". Só gestor/recepcionista |
| `/quadros` | `src/app/quadros/page.tsx` | Kanban livre: grid de quadros, com criar/renomear/arquivar/excluir |
| `/quadros/[id]` | `src/app/quadros/[id]/page.tsx` + `components/kanban/QuadroBoard.tsx` | O quadro: listas lado a lado, cartões, drag-and-drop |
| `/terceirizadas` | `src/app/terceirizadas/page.tsx` | Envios, retornos e pagamentos de parceiros |
| `/relatorios` | `src/app/relatorios/page.tsx` | Fechamento mensal: receita, unidades, distribuição por complexidade |
| `/configuracoes` | `src/app/configuracoes/page.tsx` | Catálogo de peças e personalizações — **grava só em `localStorage`**, não vai para o banco nem é compartilhado entre dispositivos |
| `/login` | `src/app/login/page.tsx` + `LoginForm.tsx` | Única rota pública. Usuário curto + senha; o e-mail é montado como `usuario@niceconfec.app` |
| `/perfil` | `src/app/perfil/page.tsx` | Mostra nome e perfil do usuário logado e permite trocar a própria senha. Aberta a todos os perfis |
| `/api/keep-alive` | `src/app/api/keep-alive/route.ts` | Route handler; cron diário 06:00 UTC (`vercel.json`) para evitar a pausa por inatividade do Supabase free. **Fora do matcher do middleware** — o cron não tem sessão |

Código compartilhado:

- `src/lib/permissoes.ts` — **fonte única das regras de perfil**. Middleware, sidebar e telas
  consultam a mesma matriz; nunca espalhe `if (perfil === ...)` por componente
- `src/middleware.ts` — exige sessão em tudo que não é `/login` e aplica a matriz de rotas
- `src/components/AuthProvider.tsx` — contexto com o membro logado; `useMembro()` devolve
  `{ membro, permissoes, sair }`
- `src/lib/supabase/client.ts` e `src/lib/supabase/server.ts` — clients de **autenticação**
  (`@supabase/ssr`, sessão em cookies)
- `src/lib/store.ts` — acesso a dados de pedidos/clientes/terceirizadas (exceto
  `tabela-precos` e o Kanban, ver abaixo). Desde a Fase B, usa `criarClienteBrowser()`
  (client autenticado) função por função, igual `kanban.ts` — só `uploadFotoPeca` continua no
  client anônimo, porque Storage não entrou na Fase B
- `src/lib/supabase.ts` — client singleton, anon key, **sem sessão**; hoje só usado pelo
  Storage (`uploadFotoPeca`, `store.ts`). Não confundir com os clients de auth acima
- `src/lib/kanban.ts` — acesso a dados do Kanban. **Usa o client AUTENTICADO**, não o
  anônimo — ver "Dois clients Supabase" abaixo. Nunca misture com `store.ts`
- `src/lib/kanban-ui.ts` — apresentação do Kanban: `CORES_LISTA`, `badgePrazo`,
  `descreverFalhaKanban`, `pedidoConcluido`, `porPosicao`. Apesar do nome, `pedidoConcluido`
  e `badgePrazo` também são usados fora do Kanban — em `/pedidos/[id]` (botão "Criar cartão")
  e em `/entregas` (fila e badge de prazo) — porque é o mesmo cálculo, não uma cópia
- `src/lib/precosEscolar.ts` — fonte única dos preços padrão da categoria Escolar, com os
  mesmos nomes de `grupo`/`produto` gravados no banco pela migration 006 (que por sua vez usa
  os nomes do `CATALOGO`). Consumido só por `/tabela-precos`; ver "Preço: uma fonte só" abaixo
- `src/lib/erros.ts` — `classificarErro`: traduz erro do Supabase em `TipoFalha`
  (`offline`/`rede`/`conflito`/`permissao`/`validacao`). Cada tela escreve o próprio texto,
  porque a consequência muda — usada por `/tabela-precos` e pelo Kanban
- `src/components/kanban/` — `QuadroBoard`, `ColunaLista`, `CartaoKanban`, `PainelCartao`,
  `Modal`, `BannerErro`, `CriarCartaoDoPedido`
- `src/lib/helpers.ts` — `CATALOGO`, `PERSONALIZACOES`, `TAMANHOS`, `calcularComplexidade`, `STATUS_CONFIG`, `SETOR_LABELS`, `totalPecas`
- `src/types/index.ts` — todos os tipos do domínio
- `src/components/FotoUpload.tsx` — upload de fotos por peça, com lightbox

## Preço da categoria Escolar — uma fonte só

`/tabela-precos` e o cálculo automático de `/novo-pedido` já usaram nomes de peça e de grupo
diferentes entre si (`DADOS_PADRAO` de um lado, `CATALOGO` do outro) — a tela nunca mostrava
os valores reais do banco, e editar um preço por ela gravava linhas paralelas que o cálculo
automático nunca lia. Corrigido nesta sessão (17/08/2026). Ver `CHANGELOG.md` para o
diagnóstico completo.

**A regra agora:** `src/lib/precosEscolar.ts` é a única fonte dos nomes de `grupo`/`produto`
e dos preços padrão da categoria Escolar, e os nomes ali são **exatamente** os gravados por
`supabase/migrations/006_povoar_tabela_precos.sql`, que por sua vez usa os nomes de
`CATALOGO.Escolar` (`src/lib/helpers.ts`) — porque é `tabelaPrecos[peca.tipo]` que
`/novo-pedido` usa pra achar o preço. Os três (migration, `CATALOGO`, `precosEscolar.ts`)
precisam concordar; renomear um sem os outros dois reabre a divergência.

Empresarial, Esportivo e Acessórios não têm preço cadastrado em lugar nenhum — nem no banco,
nem em nenhum PDF de referência do projeto. Não é bug: é dado que ainda não existe. Quando o
dono definir os valores, a mesma estrutura de `precosEscolar.ts` serve de modelo pras outras
categorias.

## Dois clients Supabase — leia antes de escrever qualquer query

O sistema tem **dois** clients com semânticas diferentes. Escolher o errado não dá erro:
dá **zero linhas em silêncio**.

| Client | Onde | Sessão? | Usado por | Tabelas |
|---|---|---|---|---|
| Anônimo | `src/lib/supabase.ts` | **Não** | só `uploadFotoPeca` (`store.ts`), Storage de `pedido-fotos` | nenhuma tabela — só o bucket |
| Autenticado | `src/lib/supabase/client.ts` (`@supabase/ssr`, cookies) | Sim | `store.ts`, `/tabela-precos`, `src/lib/kanban.ts`, auth | `pedidos`, `clientes`, `terceirizadas`, `tabela_precos`, `quadros`, `listas`, `cards` — todas **com RLS** |

`store.ts` segue o padrão de `kanban.ts`: cada função exportada cria seu próprio
`criarClienteBrowser()` localmente, em vez de um singleton no topo do arquivo.

Regra prática hoje: **toda tabela de negócio já é RLS + client autenticado.** Não existe
mais tabela de negócio no client anônimo — se for escrever uma query nova em `store.ts` ou
`/tabela-precos`, use `criarClienteBrowser()`, nunca importe `supabase` de `./supabase`.

**Status: em produção.** Esta troca (client + `supabase/migrations/009_rls_fase_b.sql`, que
liga o RLS de fato nas 4 tabelas) foi feita e confirmada em 17–18/08/2026 — ver "Estado de
segurança atual" abaixo para o histórico completo, incluindo um problema real encontrado e
corrigido no meio do caminho (`tabela_precos` já tinha RLS ligado com policies antigas
liberadas pro `anon`).

## Modelo de dados

Sete tabelas + um bucket de Storage. Schema versionado em `supabase/migrations/`.

### `pedidos`

```
id uuid pk · numero text · cliente_id uuid fk→clientes · consultor text
tipo text · status text · data_entrada timestamptz · data_entrega date
valor_total numeric · valor_pago numeric · observacoes text · updated_at timestamptz
pecas jsonb · parcelas jsonb · progresso jsonb · vetorizacao jsonb · imagem text
```

> **As peças do pedido são JSONB dentro da tabela `pedidos`, não uma tabela relacional
> separada.** O mesmo vale para `parcelas`, `progresso` e `vetorizacao`.

Consequências práticas, importantes antes de propor qualquer mudança:

- Não dá para consultar peça por peça em SQL relacional, nem indexar por tipo/tamanho sem
  operadores JSONB.
- Toda alteração numa única peça reescreve o array inteiro (`store.ts:162`) — não existe
  update parcial nem lock por item.
- A validação da forma de `Peca` é só o tipo TypeScript (`src/types/index.ts:15-27`); o banco
  aceita qualquer JSON.

### `clientes`

```
id uuid pk · nome text not null · empresa · telefone · email
responsavel · endereco · documento · data_cadastro timestamptz · updated_at timestamptz
```

### `terceirizadas`

```
id uuid pk · nome · tipo · pedido_id uuid fk→pedidos · numero_pedido · itens
data_envio · data_retorno_previsto · data_retorno_real
valor_combinado numeric · valor_pago numeric · status · observacoes
```

### `tabela_precos`

```
id uuid pk · grupo text · produto text · faixa_tamanho text · valor numeric · updated_at
```

Sem constraint de unicidade em `(grupo, produto, faixa_tamanho)` — por isso a tela de preços
apaga tudo e reinsere em vez de fazer upsert.

### `quadros`, `listas`, `cards` — Kanban livre

Foram as três primeiras tabelas do sistema com RLS ligado — desde a Fase B (18/08/2026),
`pedidos`, `clientes`, `terceirizadas` e `tabela_precos` também têm. Registro histórico do
SQL em `supabase/migrations/007_kanban.sql` (rodado manualmente pelo dono; o arquivo é
reconstrução, não export).

```
quadros  id uuid pk · titulo · descricao · arquivado bool · created_at · updated_at
listas   id uuid pk · quadro_id fk→quadros · titulo · posicao numeric · cor text
                    · created_at · updated_at
cards    id uuid pk · lista_id fk→listas · titulo · descricao · posicao numeric
                    · perfis_visiveis text[] · pedido_id fk→pedidos (opcional)
                    · prazo date · concluido bool · created_at · updated_at
```

Pontos que mudam como se escreve código contra elas:

- **`posicao` é numeric de propósito.** Mover um item grava **uma** linha, com a média das
  posições vizinhas (`posicaoEntre`, `kanban.ts`) — não reindexa a lista. Quando a folga
  entre vizinhos aperta (< 0.0001), `posicaoEntre` devolve `null` e o chamador renormaliza
  aquela lista. Não troque por integer sem reescrever isso.
- **`perfis_visiveis` nulo = público.** Array vazio é tratado como nulo no mapeamento, porque
  um cartão restrito a ninguém é sempre engano.
- **A visibilidade por perfil vale no banco, não só na tela.** A policy de select em `cards`
  filtra por `meu_perfil()`; o quadro não "esconde" cartões, ele simplesmente não os recebe.

### `public.meu_perfil()`

Função `security definer`, `search_path` fixo em `public`. Devolve o `perfil` do usuário
logado lendo `equipe` por `auth.uid()`. É o que as policies de RLS do Kanban consultam —
policy nenhuma lê `equipe` diretamente.

### `equipe`

Tabela de usuários do sistema. **Criada e populada manualmente pelo dono** — não há tela de
cadastro, e nenhuma migration deste repo a cria.

```
id · nome · perfil · auth_user_id → auth.users(id)
check (perfil in ('gestor', 'recepcionista', 'designer', 'corte', 'costureira',
                  'estamparia_serigrafia', 'estamparia_sublimacao', 'acabamento'))
```

São **8 perfis**. Dois administrativos (`gestor`, `recepcionista`) com acesso total, e seis
de chão de fábrica que compartilham o mesmo objeto `LEITURA_PRODUCAO` em `permissoes.ts`:
leem `/pedidos`, operam `/producao`, leem `/quadros`, e nada além disso.

`auth_user_id` liga a linha ao usuário do Supabase Auth. É por ele que o middleware
(`src/middleware.ts`) e o layout raiz descobrem nome e perfil de quem está logado. Usuário
autenticado **sem** linha em `equipe` não entra: é devolvido para `/login`.

Os valores de `perfil` estão espelhados em `Perfil` (`src/lib/permissoes.ts`) — ao mexer no
CHECK, mexa no tipo junto.

### Storage

Bucket **`pedido-fotos`**, caminho `{pecaId}/{uuid}.{ext}`, servido por URL **pública**
(`store.ts:307-316`).

### Convenções e pendências do schema

- Banco é **snake_case**, TypeScript é **camelCase**. A tradução acontece em
  `mapCliente` / `mapPedido` / `mapTerceirizada` (`store.ts:5-71`) e nos objetos de
  insert/update. Ao adicionar campo, mexa nos dois lados.
- Os arquivos de migration têm **prefixos duplicados**: existem dois `002_` e dois `004_`.
  `004_pedido_imagem.sql` e `004_vetorizacao.sql` criam a mesma coluna `vetorizacao`
  (ambos com `if not exists`, então é idempotente, mas confuso). Numere a próxima a partir
  de `008_`.
- Colunas órfãs, criadas por migration e **não usadas em nenhum lugar do código**:
  `pedidos.imagem` e `clientes.responsavel_empresa`. Não assuma que estão populadas.

## Regras de negócio invioláveis

1. **Pedido não avança para produção sem pagamento registrado.**
   `src/app/pedidos/[id]/page.tsx:187-190` — mudar o status para `em_producao` com
   `valorPago <= 0` é bloqueado. Hoje a validação existe **só no client**; não há constraint
   no banco.
2. **Cliente é deduplicado por telefone.** `buscarOuCriarCliente` (`store.ts:281-305`)
   procura por telefone; se achar, atualiza o existente em vez de criar outro. Cliente sem
   telefone sempre gera registro novo.
3. **Número do pedido é `AAAA-NNNN`**, sequencial derivado do `count` da tabela
   (`store.ts:73-79`). Duas criações simultâneas podem gerar o mesmo número — não há
   unique constraint.
4. **Havendo parcelas, elas são a fonte da verdade.** `valor_total` e `valor_pago` passam a
   ser derivados da soma das parcelas (`store.ts:164-171` e `mapPedido` em `:22-27`),
   ignorando o que vier nos campos avulsos.
5. **Prazo padrão de entrega = 25 dias úteis** a partir de hoje
   (`calcularDataEntrega`, `store.ts:325`).
6. **Complexidade P1–P5 é calculada, não escolhida.** Derivada do tipo da peça + número de
   personalizações em `calcularComplexidade` (`helpers.ts:20-31`).
7. **Progresso tem 8 setores fixos**, sempre nesta ordem: atendimento, compra, corte,
   costura, estamparia_silk, prensa_dtf, prensa_sublimacao, acabamento
   (`types/index.ts:29-38`). Pedido novo nasce com `atendimento: 'concluido'` e o resto
   pendente (`store.ts:107-116`).

   Cada setor guarda `EntradaProgresso { status, atualizadoPor?, atualizadoEm? }`, não só o
   status — quem clicou por último e quando, gravado a partir de `useMembro().nome` no
   momento do clique (`/producao` e o card "Progresso por Setor" em `/pedidos/[id]`).
   `atualizadoPor`/`atualizadoEm` só existem depois de um clique real: o `atendimento`
   nasce concluído sem autor (é o sistema criando o pedido, ninguém clicou), e pedidos
   gravados antes desta mudança guardam só a string do status, sem o objeto. Como
   `progresso` é JSONB sem schema, os dois formatos convivem no banco — é
   `normalizarProgresso` (`store.ts`) que converte ambos para o formato atual **na leitura**,
   então o resto do código nunca vê o formato antigo. Setor sem autor registrado
   simplesmente não mostra o rodapé de "quem/quando" na tela.
8. **`/producao` e `/quadros` são módulos diferentes, e nenhum substitui o outro.**
   `/producao` é a fonte da verdade do progresso real dos pedidos pelos 8 setores; o Kanban
   é um quadro de tarefas livres. Exportar um pedido para cartão **não** muda nada no pedido.
9. **Cartão a partir de pedido é sugestão, nunca automação.** A ação só aparece com os 8
   setores concluídos, e nada é criado sem alguém escolher quadro, lista e confirmar — o
   texto vem pré-preenchido só para poupar digitação.
10. **No Kanban, a tela nunca mostra o que o banco não tem.** Arrastar é otimista, mas se a
    gravação falhar a posição **volta** e um banner diz explicitamente que não salvou
    (`QuadroBoard.tsx`, função `gravar`). Este projeto já teve exatamente esse bug na tela
    de preços — não reintroduza "salvou na tela, não salvou no banco".

## Convenções de trabalho

- **SQL é rodado manualmente pelo dono no Supabase SQL Editor. O Claude Code nunca executa
  nada no Supabase** — nem migration, nem query, nem seed.
- Toda mudança de banco vem com **o SQL entregue separado**, pronto para colar no SQL Editor,
  e versionado em `supabase/migrations/` com o próximo número livre.
- **Português brasileiro** nas mensagens de commit e em toda a UI.
- Commits no formato `tipo: descrição` — `feat:`, `fix:`, `docs:`.
- Registre no `CHANGELOG.md` o que foi feito antes de encerrar a sessão.
- Não faça push sem o dono conferir.

## Estado de segurança atual

Seção honesta do que existe hoje. Nada aqui é surpresa — é dívida conhecida e assumida.

### O que já está protegido (Fase A — feita)

**Existe login e ele protege o acesso à aplicação.** Supabase Auth + `@supabase/ssr`, sessão
em cookies. `src/middleware.ts` exige sessão em toda rota que não seja `/login` e valida com
`getUser()` (não `getSession()`, que confiaria no cookie sem verificar). Sem sessão →
`/login`. Com sessão em `/login` → rota inicial do perfil.

**Existe autorização por perfil**, com a matriz em `src/lib/permissoes.ts` como fonte única.
Gestor e recepcionista têm acesso total; os seis perfis de produção leem `/pedidos`, operam
`/producao` e leem `/quadros`. O middleware bloqueia por URL e a sidebar esconde o que o
perfil não pode abrir — os dois consultam a **mesma** função `podeAcessarRota`, então menu e
bloqueio não divergem.

**O Kanban tem RLS de verdade — e agora as quatro tabelas antigas também.** `quadros`,
`listas` e `cards` foram as primeiras, com policies que leem o perfil por
`public.meu_perfil()` (`007_kanban.sql`), e o acesso passa pelo client autenticado
(`src/lib/kanban.ts`). Desde a Fase B, `pedidos`, `clientes`, `terceirizadas` e
`tabela_precos` seguem o mesmo modelo.

### Fase B — feita (17–18/08/2026)

**RLS está ligado em `pedidos`, `clientes`, `terceirizadas` e `tabela_precos`, com policies
via `meu_perfil()`, e `store.ts`/`tabela-precos` usam o client autenticado.** A distinção
"login protege a aplicação, não o banco" que essa seção registrava não vale mais pras quatro
tabelas de negócio — a permissão agora vale no banco, igual já valia no Kanban.

**O que mudou no código:** `src/lib/store.ts` e `src/app/tabela-precos/page.tsx` trocaram o
client anônimo pelo `criarClienteBrowser()` (autenticado), função por função, igual
`kanban.ts`. `atualizarPedido` ganhou um desvio: um update cujo payload é **só**
`{ progresso }` (os cliques de setor em `/producao` e em `/pedidos/[id]`) passa a chamar a
função de banco `atualizar_progresso_pedido` via `.rpc()` em vez de um `UPDATE` direto — ver
decisão 4 abaixo.

**Ordem seguida:** commit + push (`d5433ec`) → deploy confirmado "Ready" na Vercel →
`009_rls_fase_b_auditoria.sql` (só leitura) rodado e conferido → `009_rls_fase_b.sql`
executado com sucesso. Testado depois de rodar: `/tabela-precos` lendo e salvando de verdade
(não mais o fallback de `localStorage`), `/pedidos` carregando pro gestor, clique de setor em
`/producao` gravando pela função nova, e um perfil de chão de fábrica (testado pelo dono)
confirmado conseguindo ler `/pedidos` e gravar em `/producao`.

**Problema real encontrado pela auditoria, corrigido antes de executar:** `tabela_precos` já
estava com RLS ligado — diferente das outras três — com 4 policies provisórias
(`tabela_precos_select_anon`/`insert_anon`/`update_anon`/`delete_anon`) criadas fora deste
repo, direto no painel do Supabase, liberando só o papel `anon`. Nenhuma valia pro papel
`authenticated`. Sem corrigir, a troca de `/tabela-precos` pro client autenticado teria ficado
bloqueada por RLS assim que o deploy subisse — e confirmamos que ficou mesmo, por um instante:
o deploy do código novo (`d5433ec`) subiu antes da migration rodar, e nesse intervalo a leitura
da tela **parecia** funcionar (valores corretos na tela), mas era o fallback de `localStorage`
mascarando um bloqueio real — só a tentativa de salvar expôs o erro ("Sem permissão para
gravar"). `009_rls_fase_b.sql` foi corrigido pra dar `drop policy` nas 4 antigas antes de criar
`tabela_precos_admin`, e a versão corrigida foi a que rodou. Fica registrado porque é
exatamente o modo de falha "RLS que barra não dá erro" que este documento já alertava — só que
desta vez com um agravante (o cache do navegador) que também escondeu o problema por um
tempo.

**Efeito colateral do teste, corrigido:** durante o teste de gravação (de propósito, pra
provar o bloqueio), um preço de teste (`Camiseta M Curta`, faixa `0-02`, `26,40` → `27`) foi
salvo de verdade no banco depois que a migration rodou, porque o campo continuou com o valor
de teste entre a tentativa bloqueada e a migration. Corrigido na hora, voltado pra `26,40` e
confirmado salvo. Fica registrado como lembrete: **depois de qualquer teste em
`/tabela-precos`, sempre conferir se o valor voltou ao original antes de sair da tela** — não
tem undo.

**Decisões tomadas nesta sessão, registradas aqui porque foram feitas sem confirmação
item-a-item do dono** (ele pediu para seguir com o que der pra fazer em vez de parar em
pergunta — decisão dele, mas os defaults abaixo são meus e merecem uma olhada):

1. `pedidos` e `clientes` ganham SELECT liberado pra **qualquer perfil com linha em
   `equipe`** (não só gestor/recepcionista) — os seis perfis de chão de fábrica leem
   `/pedidos` e `/producao`, que mostram nome/empresa do cliente via join; restringir SELECT
   de `clientes` quebraria esse join em silêncio.
2. INSERT/UPDATE/DELETE em `pedidos`/`clientes`, e tudo em `terceirizadas`/`tabela_precos`,
   ficam só pra gestor/recepcionista — espelha o que a interface já permite hoje.
3. Nenhum mascaramento de coluna: `verFinanceiro` **continua sendo controle só de
   interface** (ver abaixo) — decisão de deixar isso fora desta migration e tratar como uma
   Fase B2 separada, se e quando for priorizada.
4. RLS é por **linha**, não por coluna — não dá pra restringir UPDATE em `pedidos` a "só a
   coluna progresso" com uma policy comum. Por isso `pedidos_write` bloqueia UPDATE direto
   pra quem não é gestor/recepcionista, e os 8 perfis com `editarProducao` passam por
   `atualizar_progresso_pedido` (`security definer`) — que só grava a coluna `progresso`,
   nunca o resto da linha.

**A anon key continua no bundle do browser** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, lida em
`src/lib/supabase.ts:3-4`) — agora ela só serve pro Storage de fotos (`uploadFotoPeca`), que
não tem RLS (buckets não usam RLS de tabela) e continua público por URL, então isso não é
regressão.

**O `verFinanceiro` segue sendo controle de interface, não de banco**, mesmo depois da Fase
B. Os perfis de chão de fábrica não veem valor em `/pedidos/[id]` — nem na tela, nem na
impressão — mas `getPedidoById` faz `select('*')`, então `valor_total`, `valor_pago` e
`parcelas` continuam trafegando pro navegador deles (Network do DevTools mostra). A Fase B
fecha o acesso **direto ao banco por fora do app** (sem passar pelo login), mas não mascara
coluna por perfil dentro de uma sessão válida — isso exigiria uma view sem as colunas de
dinheiro, ou RLS de coluna via função, e fica pra uma Fase B2 hipotética.

Um detalhe já coberto na migration: `numerosDePedidos` (`kanban.ts`) lê `pedidos` pelo client
autenticado — a policy `pedidos_select` (item 1 acima) cobre esse caso, então os links de
pedido no Kanban não somem quando o RLS entrar.

`/api/keep-alive` **continua no client anônimo de propósito** (o cron da Vercel não tem
sessão) — depois da migration, o `select id limit 1` dele passa a devolver zero linhas (RLS
filtra, não erra), mas o endpoint só checa `error`, então continua respondendo 200 OK. Nada a
mudar lá.

**Fotos são públicas.** O bucket `pedido-fotos` devolve `getPublicUrl` (`store.ts:314`);
quem tiver a URL vê a imagem, sem autenticação.

**`/api/keep-alive` fica fora do middleware** de propósito (o cron da Vercel não tem sessão).
A rota só faz um `select id limit 1`, mas é um endpoint sem autenticação — considere isso ao
mexer nela.

Não existe `SUPABASE_SERVICE_ROLE_KEY` no repo: não houve vazamento de chave privilegiada,
mas também não existe nenhum caminho de acesso privilegiado.
