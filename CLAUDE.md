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
- **Não existe:** testes, autenticação, camada de API (exceto um route handler de keep-alive)

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
| `/api/keep-alive` | `src/app/api/keep-alive/route.ts` | Route handler; cron diário 06:00 UTC (`vercel.json`) para evitar a pausa por inatividade do Supabase free |

Código compartilhado:

- `src/lib/store.ts` — **todo** o acesso a dados passa por aqui (exceto `tabela-precos`, ver abaixo)
- `src/lib/supabase.ts` — client singleton, anon key
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

**Não há autenticação.** Não existe `supabase.auth` em nenhum lugar de `src/`, não existe
`middleware.ts` (nem na raiz, nem em `src/`, nem em `src/app/`), não há rota de login
iniciada. Qualquer pessoa com a URL acessa o sistema inteiro.

**O app depende inteiramente da anon key.** `src/lib/supabase.ts:3-4` lê
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` — o prefixo `NEXT_PUBLIC_` põe
as duas no bundle do browser, onde são legíveis por qualquer visitante. Não existe
`SUPABASE_SERVICE_ROLE_KEY` no repo, então não houve vazamento de chave privilegiada; mas
também não existe nenhum caminho de acesso privilegiado. Até o route handler
`src/app/api/keep-alive/route.ts` usa o mesmo client anon.

**RLS está desabilitado em todas as tabelas**, por migration explícita:
`supabase/migrations/001_initial.sql:47-49` (clientes, pedidos, terceirizadas) e
`002_tabela_precos.sql:10` (tabela_precos).

**Há DELETE disparado direto do browser:**

- `store.ts:183` — `deletarPedido`, apaga da tabela `pedidos`. Botão de lixeira em
  `src/app/pedidos/page.tsx:133`, protegido só por um `confirm()`.
- `src/app/tabela-precos/page.tsx:134` — `.delete().not('grupo', 'is', null)` **apaga a
  tabela `tabela_precos` inteira** e reinsere logo em seguida (`:136`), disparado pelo botão
  "Salvar alterações". Se o insert falhar depois do delete, o `catch` (`:139`) apenas exibe
  "Supabase indisponível — salvo localmente" e a tabela remota fica vazia.

`src/lib/store.ts` não tem `'use client'`, mas é importado por componentes que têm — na
prática executa no browser.

**Fotos são públicas.** O bucket `pedido-fotos` devolve `getPublicUrl` (`store.ts:314`);
quem tiver a URL vê a imagem, sem autenticação.

**Trabalho pendente e conhecido:** fechar o RLS e introduzir autenticação. Enquanto isso não
for feito, as evidências acima ficam registradas aqui para não precisar re-auditar a cada
sessão.
