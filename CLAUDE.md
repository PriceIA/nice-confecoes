# Nice Confecções — contexto do projeto

Este arquivo é lido no início de toda sessão do Claude Code. Mantenha-o factual e curto.
Ao mudar algo estrutural (módulo novo, tabela nova, regra nova), atualize aqui.

## Visão geral

Sistema de gestão de pedidos da **Nice Confecções** (Maringá-PR). Está **em produção e em
uso diário real** — não é protótipo. Qualquer mudança pode quebrar o trabalho de alguém no
mesmo dia.

- **Stack:** Next.js 14.2.5 (App Router) + Tailwind 3.4 + Supabase (`@supabase/supabase-js` 2.x) + Vercel
- **Libs:** `date-fns`, `lucide-react`, `clsx`
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
  `.card`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input`, `.label`, `.badge`, `.sidebar-link`
- **Responsivo:** sidebar fixa a partir de `md:`; no mobile vira topbar + drawer
  (`src/components/layout/Sidebar.tsx`). Elementos de navegação levam `print:hidden`.

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
| `/tabela-precos` | `src/app/tabela-precos/page.tsx` | Grade de preços Escolar/Empresarial por grupo × faixa de tamanho |
| `/producao` | `src/app/producao/page.tsx` | Acompanhamento dos 8 setores; clique cicla pendente → em_andamento → concluido |
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
- `src/lib/store.ts` — **todo** o acesso a dados passa por aqui (exceto `tabela-precos`, ver abaixo)
- `src/lib/supabase.ts` — client singleton, anon key, **sem sessão**; é o que o `store.ts` usa
  para dados de negócio. Não confundir com os clients de auth acima
- `src/lib/helpers.ts` — `CATALOGO`, `PERSONALIZACOES`, `TAMANHOS`, `calcularComplexidade`, `STATUS_CONFIG`, `SETOR_LABELS`, `totalPecas`
- `src/types/index.ts` — todos os tipos do domínio
- `src/components/FotoUpload.tsx` — upload de fotos por peça, com lightbox

## Modelo de dados

Quatro tabelas + um bucket de Storage. Schema versionado em `supabase/migrations/`.

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

### `equipe`

Tabela de usuários do sistema. **Criada e populada manualmente pelo dono** — não há tela de
cadastro, e nenhuma migration deste repo a cria.

```
id · nome · perfil · auth_user_id → auth.users(id)
check (perfil in ('gestor', 'recepcionista', 'costureira'))
```

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
  de `005_`.
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
Gestor e recepcionista têm acesso total; costureira lê `/pedidos` e opera `/producao`. O
middleware bloqueia por URL e a sidebar esconde o que o perfil não pode abrir — os dois
consultam a **mesma** função `podeAcessarRota`, então menu e bloqueio não divergem.

### O que continua desprotegido (Fase B — NÃO feita)

> **O login protege a aplicação, não o banco.** Essa distinção é a coisa mais importante
> desta seção.

**RLS segue desabilitado nas tabelas de negócio** — `pedidos`, `clientes`, `terceirizadas`
(`supabase/migrations/001_initial.sql:47-49`) e `tabela_precos` (`002_tabela_precos.sql:10`).

**A anon key continua no bundle do browser** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, lida em
`src/lib/supabase.ts:3-4`), e todo o `store.ts` grava com ela. Como o RLS está desligado,
**quem extrair a anon key do bundle lê e escreve em qualquer tabela direto pela API do
Supabase, sem passar pelo login**. As permissões de perfil valem dentro do app; não valem
no banco.

Concretamente, isso significa que hoje a costureira é impedida de excluir um pedido **pela
interface**, mas nada no banco a impediria de fazê-lo por fora dela.

**Fechar o RLS é a Fase B e não foi feita nesta sessão.** Envolve: ligar RLS nas quatro
tabelas, escrever policies que leiam o perfil a partir de `equipe` via `auth.uid()`, e trocar
o client anônimo do `store.ts` pelo client autenticado — hoje o `store.ts` usa um client
**sem sessão**, então nenhuma policy baseada em `auth.uid()` funcionaria com ele.

**Fotos são públicas.** O bucket `pedido-fotos` devolve `getPublicUrl` (`store.ts:314`);
quem tiver a URL vê a imagem, sem autenticação.

**`/api/keep-alive` fica fora do middleware** de propósito (o cron da Vercel não tem sessão).
A rota só faz um `select id limit 1`, mas é um endpoint sem autenticação — considere isso ao
mexer nela.

Não existe `SUPABASE_SERVICE_ROLE_KEY` no repo: não houve vazamento de chave privilegiada,
mas também não existe nenhum caminho de acesso privilegiado.
