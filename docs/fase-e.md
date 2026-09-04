# Fase E — logins novos e ordem por data de entrega

Documento escrito em **04/09/2026** pelo Cowork (Claude), a partir de três pedidos do Felipe.
Um dos três foi descartado depois da conferência — ver seção "Item descartado".

---

## Como este documento funciona — leia antes de executar

**Mudou o jeito de trabalhar.** O Felipe não passa mais prompt colado. O ciclo é:

1. O **Cowork** escreve/atualiza **este arquivo** (`docs/fase-e.md`) com o passo atual: o que
   fazer, como fazer, o que testar e o que ainda não se sabe.
2. O **Felipe** avisa o **Claude Code** para ler a documentação.
3. O **Claude Code** executa **um passo por vez** e, ao terminar, **reescreve este mesmo
   arquivo** preenchendo a seção "Registro de execução" — o que foi feito, o que mudou de
   fato, o que quebrou, o que ficou aberto e o que ele descobriu que contraria este texto.
   **Não crie arquivo novo. Não apague o histórico das seções anteriores.**
4. O Cowork lê o arquivo reescrito, entende o estado real e escreve o próximo passo aqui.

Regras do ciclo:

- **Um passo por vez.** Não emende E1 e E2 no mesmo commit. Este sistema está em uso diário
  real numa fábrica; um commit misturado é um rollback impossível.
- **Confirmar antes de afirmar.** "Rodei e não deu erro" não é prova. `SELECT` prova
  migration; `tsc`/`build` prova código; tela recarregada prova gravação.
- **Se este documento estiver errado, o código ganha.** Encontrou divergência? Corrija o texto
  no registro, com a linha do arquivo, em vez de seguir uma instrução errada.

---

## Estado inicial — conferido em 04/09/2026 pelo Cowork

Lido direto de `A:\Projetos SAAS\nice-confeccoes\nice-confeccoes`, não de memória:

| O que | Como está hoje |
|---|---|
| `src/app/pedidos/page.tsx` | Já tem seletor de ordenação (`ORDENS_DATA`), guardado em `localStorage` na chave `nice-ordem-pedidos`. **Padrão: `entrada_desc`** (linha do `useState`) |
| `src/lib/helpers.ts` | `ORDENS_DATA` tem as 4 opções de data; `entrega_asc` = "Entrega mais próxima". `ordenarPedidos` já trata data nula (vai pro fim) e desempata por `numero` desc |
| `src/app/producao/page.tsx` | Já usa `entrega_asc` como padrão. Trocar o padrão de `/pedidos` **alinha** as duas telas |
| `src/components/producao/FluxoEtapas.tsx` | Arrastar etapas com `@dnd-kit` já implementado (Fase D3), alcinha `⠿`, só para `editarFluxoProducao` |
| `src/lib/permissoes.ts` | `Perfil` já inclui `'corte'` e `'gestor'`. Nenhum perfil novo é necessário nesta fase |
| `equipe` (banco) | 7 pessoas com login na auditoria de 29/08. `corte`, `designer` e `acabamento` sem ninguém |

**Próxima migration livre: `017_`** — mas **esta fase não precisa de migration nenhuma.**

---

## Item descartado — arrastar na produção

O pedido original era: *"mudar as ações de ordem arrastando no estilo drag que tem no kanban,
mas mudar os processos da produção desta maneira"*.

**Isso já existe desde a Fase D3.** O Felipe conferiu ao vivo em 04/09 e confirmou: *"não
tinha visto, acabei de verificar e existe mesmo, então pode descartar essa ATT"*.

**Não implemente nada por causa deste item.** Fica registrado só para a próxima pessoa que ler
o pedido original não achar que ficou faltando algo.

---

## Passo E1 — `/pedidos` abre ordenada por entrega mais próxima

**Sem SQL. Sem migration. Um arquivo.** É o passo mais barato da fase, e por isso vem primeiro.

### O pedido, nas palavras do Felipe

> "ter a opção no filtro ou sempre exibir em ordem de acordo com a data de entrega, os pedidos
> não estão nesta ordem"

**Decisão dele (04/09), depois de saber que o seletor já existe:** *"Padrão = entrega mais
próxima"*. O seletor **continua na tela**, com as 4 opções. Só o valor inicial muda.

### O que fazer

Em `src/app/pedidos/page.tsx`, o `useState` da ordem:

```ts
const [ordem, setOrdem] = useState<OrdemPedidos>('entrada_desc')   // hoje
const [ordem, setOrdem] = useState<OrdemPedidos>('entrega_asc')    // depois
```

E é só isso de código. **Não mexa em `ordenarPedidos` nem em `ORDENS_DATA`** (`helpers.ts`) —
as duas são compartilhadas com `/producao`, e mudar o comportamento delas mudaria a outra tela
junto, sem ninguém pedir.

### Três coisas que precisam estar claras no comentário do código

Escreva isto **no código**, não só no commit:

1. **Quem já escolheu uma ordem continua com a dele.** O `useEffect` lê
   `localStorage['nice-ordem-pedidos']` e sobrescreve o padrão. Como a gravação só acontece em
   `mudarOrdem`, quem nunca mexeu no seletor não tem valor salvo e passa a abrir em
   `entrega_asc`. **Quem já mexeu não vê diferença nenhuma** — inclusive o Pedro, se ele já
   tiver escolhido algo alguma vez. Isso não é bug; é o comportamento correto. Mas explica um
   "não mudou nada aqui" na hora do teste, e é por isso que o teste abaixo pede aba anônima.
2. O padrão passa a ser **o mesmo de `/producao`** — as duas telas abrem na mesma lógica.
3. `entrega_asc` é **crescente**: a data mais antiga primeiro.

### ⚠️ O efeito colateral que precisa ser MEDIDO antes de dar a fase por boa

`/pedidos` mostra **todos os status**, inclusive `entregue` e `cancelado`, e o filtro de status
padrão é `todos`. Ordem crescente por data de entrega = **datas mais antigas no topo** — ou
seja, pedidos entregues meses atrás podem empurrar os que estão realmente por vir para baixo.

Se isso acontecer, o padrão novo é **pior** que o de hoje, e o Felipe pediu exatamente o
contrário do que teria acontecido.

**Não conserte isso por conta própria** — primeiro meça, depois relate. O conserto (empurrar
`entregue`/`cancelado` para o fim, ou mudar o filtro de status padrão) muda o comportamento da
tela de um jeito que o Felipe não pediu, e é decisão dele.

**Medição obrigatória, com dados reais, antes de fechar o passo:**

- Abra `/pedidos` numa **aba anônima** (para não pegar o `localStorage` já salvo), logado como
  Pedro.
- Anote **os 10 primeiros da lista**: número, status e data de entrega.
- Conte quantos desses 10 são `entregue` ou `cancelado`.

**Relate o número no registro.** Se forem 3 ou mais dos 10, **pare o passo E1 aí**, deixe o
código commitado mas relate o problema com clareza — o Cowork escreve o E1-b neste documento
com a decisão do Felipe. Se forem 0, 1 ou 2, o passo está bom como está.

### Teste

1. `npx tsc --noEmit` e `npm run build` limpos.
2. Aba anônima → login → `/pedidos` → conferir que abre em "Entrega mais próxima" e que a
   lista **bate com a coluna Entrega** (a de cima é a mais antiga).
3. Trocar o seletor para "Mais recentes primeiro", recarregar (aba normal): tem que **voltar
   na escolha**, não no padrão. Isso prova que o `localStorage` continua ganhando.
4. `/producao` continua abrindo em "Entrega mais próxima", como já abria.

### Fechamento do E1

- Commit `fix: /pedidos abre ordenada por entrega mais próxima` (ou `feat:`, se preferir).
- **Sem push antes do Pedro conferir**, como sempre.
- `CHANGELOG.md` atualizado.

---

## Passo E2 — dois logins novos: Marquinhos (corte) e dona Nice (gestor)

**Sem código. Sem migration.** É trabalho de banco e de painel do Supabase, e por isso o
**Claude Code não executa nada aqui** — ele prepara, confere e testa; quem cola e roda é o
Pedro, como sempre.

### O pedido, nas palavras do Felipe

> "vamos criar 2 novos logins, a primeira é do marquinhos (corte), segunda é a mãe do pedrinho
> a dona NICE, o nome vem dela, ela que começou e quem controla hoje em dia é o pedro, ela
> ficou agora fazendo em casa por amor e atende praticamente só os uniformes escolares, a
> conta dela será liberada tudo igual o CEO pedro!"

**Decidido com o Felipe em 04/09:**

| Pessoa | Usuário curto | E-mail montado pelo login | Perfil | Nome na tela |
|---|---|---|---|---|
| Marquinhos | `marquinhos` | `marquinhos@niceconfec.app` | `corte` | Marquinhos |
| Dona Nice | `nice` | `nice@niceconfec.app` | `gestor` | Nice |

**Nenhum perfil novo.** `corte` e `gestor` já existem no CHECK da tabela `equipe` e no tipo
`Perfil` (`src/lib/permissoes.ts`). Por isso esta fase não toca em `permissoes.ts` — se você
se pegar editando esse arquivo, parou de fazer o E2 e começou outra coisa.

### Três consequências que precisam estar escritas antes de executar

1. **A dona Nice vai ver tudo o que o Pedro vê — inclusive dinheiro.** `gestor` tem
   `verFinanceiro`, `excluirPedido`, relatórios, tabela de preços, configurações. Foi
   exatamente o que o Felipe pediu ("liberada tudo igual o CEO pedro"), então isto não é
   objeção — é registro. Se em algum momento a ideia for "ela vê os pedidos escolares mas não
   o caixa", isso **não** é o perfil `gestor`, é um perfil novo, e é outra fase.
2. **Ela não vai ver cartão marcado como "Privado" do Pedro no Kanban.** Foi a decisão da Fase
   D2.2: privado é privado, nem a gestão vê. Não é bug; não "conserte".
3. **O Marquinhos é a primeira pessoa real no perfil `corte`.** Esse perfil existe no código
   desde sempre, mas **nunca teve ninguém logado nele**. O teste da seção "Teste do E2" não é
   formalidade: é a primeira vez que essa trilha roda com gente de verdade.

### Rito — auditoria, execução, conferência

Mesmo rito de sempre. **`equipe` é populada manualmente e nenhuma migration deste repo a
cria** (CLAUDE.md diz isso) — então **não crie `017_*.sql`**. O SQL abaixo vive neste
documento e é colado direto no SQL Editor.

#### E2-a — Auditoria (só leitura, roda primeiro)

```sql
-- 1. Como é a tabela equipe hoje: precisamos saber se `id` tem default.
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'equipe'
 order by ordinal_position;

-- 2. O CHECK aceita mesmo 'corte' e 'gestor'?
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.equipe'::regclass and contype = 'c';

-- 3. Quem já está cadastrado (e com qual e-mail).
select e.nome, e.perfil, u.email
  from public.equipe e
  left join auth.users u on u.id = e.auth_user_id
 order by e.perfil, e.nome;

-- 4. Os dois e-mails novos já existem em auth.users? (antes de criar, deve voltar VAZIO)
select id, email, created_at, email_confirmed_at
  from auth.users
 where email in ('marquinhos@niceconfec.app', 'nice@niceconfec.app');
```

**O item 1 decide o SQL do E2-c.** Se `id` tiver `column_default` (`gen_random_uuid()`), o
insert abaixo serve como está. **Se não tiver default, o insert precisa de
`gen_random_uuid()` explícito na lista de colunas** — ajuste e registre a correção.

#### E2-b — Criar os dois usuários no painel do Supabase (Pedro)

Painel do projeto **Niceconfeccoes** → **Authentication** → **Users** → **Add user** →
*Create new user*:

- E-mail `marquinhos@niceconfec.app`, senha inicial combinada com o Pedro.
- E-mail `nice@niceconfec.app`, senha inicial combinada com o Pedro.
- **Marcar "Auto Confirm User" nos dois.** Sem isso o usuário nasce pendente de confirmação
  por e-mail, e `@niceconfec.app` não é um domínio de e-mail que exista de verdade — ninguém
  vai receber nada, e o login falha sem dizer por quê.
- Não existe "esqueci minha senha" neste sistema: reset é manual, aqui mesmo. Cada uma pode
  trocar a própria senha depois em `/perfil`.

#### E2-c — Ligar as duas pessoas à tabela `equipe` (SQL Editor)

Rodar **depois** do E2-b, senão o `select` de `auth.users` não acha nada e o insert grava zero
linhas em silêncio.

```sql
insert into public.equipe (nome, perfil, auth_user_id)
select 'Marquinhos', 'corte', u.id
  from auth.users u
 where u.email = 'marquinhos@niceconfec.app'
   and not exists (select 1 from public.equipe e where e.auth_user_id = u.id);

insert into public.equipe (nome, perfil, auth_user_id)
select 'Nice', 'gestor', u.id
  from auth.users u
 where u.email = 'nice@niceconfec.app'
   and not exists (select 1 from public.equipe e where e.auth_user_id = u.id);
```

O `not exists` é proposital: rodar duas vezes por engano não cria pessoa duplicada. Se o
`insert` disser **0 rows**, o usuário do E2-b não existe com esse e-mail exato (ou já está em
`equipe`) — confira antes de tentar de novo.

#### E2-d — Conferência (prova, não impressão)

```sql
select e.nome, e.perfil, u.email, u.email_confirmed_at is not null as confirmado
  from public.equipe e
  join auth.users u on u.id = e.auth_user_id
 where u.email in ('marquinhos@niceconfec.app', 'nice@niceconfec.app');
```

Tem que voltar **2 linhas**, com `perfil` `corte` e `gestor`, e `confirmado = true` nas duas.

### Teste do E2 — com gente logada, não com ausência de erro vermelho

**Marquinhos (`corte`) — primeira vez que este perfil é usado:**

- Login com `marquinhos` (só o usuário curto, sem `@`).
- A sidebar mostra **Pedidos, Produção e Quadros**, e nada além disso.
- `/pedidos` abre e lista os pedidos; `/pedidos/[id]` abre **sem os valores** (sem valor total,
  valor pago, parcelas).
- `/producao` deixa clicar no status de uma etapa e **grava** (recarregar a página prova).
- Ele **não** vê a alcinha `⠿` de arrastar, nem "Adicionar etapa" — isso é
  `editarFluxoProducao`, só gestão.
- Digitar `/clientes` ou `/relatorios` na barra de endereço **devolve para a rota inicial dele**
  (middleware), não abre a tela.
- `/quadros` abre em modo leitura, sem criar/mover cartão.

**Dona Nice (`gestor`):**

- Login com `nice`.
- A sidebar mostra **tudo**, igual à do Pedro.
- `/pedidos/[id]` mostra os valores; `/relatorios` e `/tabela-precos` abrem.
- ⚠️ **Não salve nada de teste em `/tabela-precos`** — a tela não tem desfazer, e este projeto
  já teve um preço real alterado por engano num teste (registrado no CLAUDE.md). Abrir e olhar,
  só.
- Se o Pedro tiver algum cartão "Privado" no Kanban, ela **não** vê. Correto.

### Fechamento do E2

- **`CLAUDE.md`: atualizar a tabela de equipe** — passa de 7 para 9 pessoas com login, e
  `corte` deixa de ser "sem ninguém". Essa tabela já ficou desatualizada por duas semanas uma
  vez; não deixe de novo.
- `CHANGELOG.md` com o que foi feito, incluindo o SQL rodado (é mudança de dado em produção,
  mesmo sem migration).
- Commit só de documentação (`docs:`), sem código — não dispara deploy novo.

---

## Ordem de execução

```
E1  /pedidos abre por entrega mais próxima   → código, 1 arquivo, sem SQL.  FAZER PRIMEIRO
E2  dois logins novos                        → sem código; painel + SQL do Pedro; Code testa
```

E1 antes de E2 porque E1 não depende de ninguém: o Code faz, testa, commita e acabou. O E2 fica
parado esperando o Pedro abrir o painel do Supabase — não faz sentido o E1 esperar junto.

As regras de sempre, que este projeto já pagou para aprender:

- `git pull` antes de qualquer coisa — são dois PCs.
- SQL rodado **manualmente pelo Pedro**. Auditoria primeiro, execução depois, conferência no fim.
- **RLS que barra não dá erro, dá zero linhas.**
- Commits em `tipo: descrição`, português. **Sem push antes do Pedro conferir.**
- `CHANGELOG.md` e `CLAUDE.md` atualizados antes de encerrar a sessão.

---

## Registro de execução — o Claude Code preenche

> Reescreva **esta seção** deste mesmo arquivo ao terminar cada passo. Escreva o que
> **aconteceu**, não o que estava planejado. Divergência entre este documento e o código é
> informação valiosa — registre com o caminho do arquivo e a linha.

### E1 — `/pedidos` por entrega mais próxima

- **Status:** código feito e commitado, **passo PAUSADO** pela regra do próprio documento (10
  de 10 na medição — ver abaixo). Não fechar E1 até o Felipe/Cowork decidirem o E1-b.
- **Arquivos alterados:** `src/app/pedidos/page.tsx` (só o `useState` da ordem, com comentário
  explicando o comportamento — linhas ~34-37) + `CHANGELOG.md`.
- **`tsc` / `build`:** os dois limpos (`npx tsc --noEmit` sem saída; `npm run build` ✓
  Compiled successfully, 17/17 páginas geradas).
- **Divergência com o rito de teste:** o documento pede aba anônima logada como Pedro. Não
  tenho as credenciais do Pedro e **não posso digitar senha de login por regra própria de
  segurança** (entrar senha em campo é ação proibida, mesmo com autorização do Felipe). O
  Felipe optou por eu abrir a aba e ele digitar — mas o navegador já tinha uma sessão ativa
  como **Kalomira (recepcionista)** no `localhost:3000` (ambiente local, não produção), sem
  a chave `nice-ordem-pedidos` salva em `localStorage`. Como `recepcionista` tem o mesmo
  acesso total de `gestor` a `/pedidos` (CLAUDE.md), usei essa sessão em vez de pedir para
  logar como Pedro de novo — o teste de ordenação não depende de quem está logado, só do
  `localStorage` estar vazio. Rodei contra `npm run dev` local (`http://localhost:3000`), não
  contra produção.
- **Medição dos 10 primeiros (local, logado como Kalomira, `localStorage` sem
  `nice-ordem-pedidos` prévio):**

  | # | Nº do pedido | Status | Data de entrega |
  |---|---|---|---|
  | 1 | #2026-0004 | Entregue | 30/06/2026 |
  | 2 | #2026-0003 | Entregue | 30/06/2026 |
  | 3 | #2026-0001 | Cancelado | 23/07/2026 |
  | 4 | #2026-0007 | Entregue | 26/07/2026 |
  | 5 | #2026-0005 | Entregue | 26/07/2026 |
  | 6 | #2026-0002 | Entregue | 28/07/2026 |
  | 7 | #2026-0006 | Entregue | 05/08/2026 |
  | 8 | #2026-0008 | Entregue | 18/08/2026 |
  | 9 | #2026-0009 | Entregue | 19/08/2026 |
  | 10 | #2026-0010 | Entregue | 27/08/2026 |

  - Quantos dos 10 são `entregue` ou `cancelado`: **10 de 10** (9 entregue + 1 cancelado).
    Muito acima do limite de 3 que o documento definiu para parar o passo.
- **Teste 3 (escolha salva ganha do padrão):** confirmado. Troquei o seletor para "Mais
  recentes primeiro" (`entrada_desc`) via evento de change real (dispatch no `<select>`),
  recarreguei a página (`navigate` de novo, não só re-render) e o seletor voltou marcado em
  `entrada_desc`, não no novo padrão `entrega_asc`. `localStorage` continua ganhando.
  Removi a chave de teste do `localStorage` depois, para não deixar resíduo na sessão real do
  Felipe.
- **Teste 4 (`/producao` continua em "Entrega mais próxima"):** confirmado, `entrega_asc`
  sem mudança.
- **Commit:** `fix: /pedidos abre ordenada por entrega mais próxima` (código +
  `CHANGELOG.md` + este registro em `docs/fase-e.md`), seguindo a instrução do próprio
  documento de deixar o código commitado mesmo com o passo pausado. **Sem push** — aguarda o
  Pedro conferir, como sempre.
- **Divergências encontradas neste documento:**
  1. O efeito colateral da seção "⚠️" não é hipotético neste banco: ele se confirma com
     folga (10/10, não "3 ou mais"). Pedidos entregues em 06/2026-08/2026 dominam o topo da
     lista quando ordenado por entrega crescente sem filtrar status.
  2. O rito de teste ("aba anônima, logado como Pedro") não é executável por mim sem que
     alguém digite a senha na hora — registrar isso como padrão para os próximos passos que
     pedirem login: ou o Felipe testa e me passa o resultado, ou ele digita a senha numa aba
     que eu abro e me devolve o controle depois do login.

### E2 — logins de Marquinhos e Nice

- **Status:** não iniciado
- **E2-a auditoria — `equipe.id` tem default?**
- **E2-a — CHECK aceita `corte` e `gestor`?**
- **E2-b — usuários criados no painel (quem/quando):**
- **E2-c — linhas inseridas (0 ou 1 por insert):**
- **E2-d — conferência voltou 2 linhas confirmadas?**
- **Teste do Marquinhos (`corte`), item por item:**
- **Teste da dona Nice (`gestor`):**
- **`CLAUDE.md` atualizado (tabela de equipe 7 → 9)?**
- **Commit:**
- **Divergências encontradas neste documento:**

### Pendências para o próximo passo (o Cowork lê isto)

- **E1 está pausado, não fechado.** O código (`entrega_asc` como padrão) está pronto, testado
  e limpo em `tsc`/`build`, mas a medição obrigatória deu 10/10 pedidos entregues/cancelados
  nos 10 primeiros — o efeito colateral que o documento pediu para medir antes de fechar.
  Falta o Felipe decidir o E1-b: opções possíveis são (a) manter o filtro padrão em "Todos"
  mas empurrar `entregue`/`cancelado` para o fim da ordenação por entrega, (b) mudar o filtro
  de status padrão de `/pedidos` para excluir `entregue`/`cancelado`, ou (c) aceitar o
  resultado como está. Nenhuma das três foi implementada — decisão do Felipe, não minha.
- **E2 não foi iniciado.** Depende do Pedro no painel do Supabase (E2-b), sem relação com o
  que travou o E1.
- **Rito de login para telas que exigem sessão:** não tenho como digitar senha (regra de
  segurança minha, não contorna nem com autorização). Da próxima vez que um teste pedir
  "logado como fulano", ou o Felipe testa e me passa o resultado, ou ele digita a senha numa
  aba que eu abro e devolve o controle depois.
