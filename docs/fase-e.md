# Fase E — logins novos e ordem por data de entrega

Documento escrito em **04/09/2026** pelo Cowork (Claude), a partir de três pedidos do Felipe.
Um dos três foi descartado depois da conferência — ver seção "Item descartado".

> **Estado da fase em 05/09/2026** — E1 **fechado** (commit `40c0361`). E1-b **fechado**
> (commit `33998da`). **E2: a parte de banco está FEITA e conferida** (ver "Resultado no
> banco" na seção do E2) — faltam só os **dois testes de login**, que dependem do Felipe ou
> do Pedro, e o fechamento documental pelo Code. `main` está 2 commits à frente de
> `origin/main`, aguardando o Pedro conferir.

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
- **Este documento nunca promete uma seção que não existe.** Regra aprendida na marra em
  04/09: o E1 dizia "o Cowork escreve o E1-b depois", o Code chegou nele e não achou nada, e
  ficou bloqueado. Quando um passo pode se desdobrar, as saídas possíveis vêm **escritas
  aqui desde já**, com a recomendação — o que falta é só a escolha, e ela cabe numa linha.
- **O Cowork relê este arquivo imediatamente antes de escrever nele.** Em 04/09 uma escrita
  do Cowork sobrescreveu o registro do E1 com uma versão anterior do arquivo; o Code
  reconstituiu a partir do commit `40c0361`, mas foi trabalho jogado fora. O commit no git é
  a rede de segurança — **feche cada passo com commit antes de devolver a bola**, exatamente
  como já vinha sendo feito.
- **Teste que exige login.** O Claude Code **não digita senha**, nem com autorização — isso
  não se contorna. Então: se houver sessão ativa com acesso suficiente e o teste **não
  depender do perfil** (ordenação, por exemplo), use essa sessão e registre com qual perfil
  testou. Se o teste **depende do perfil** — é o caso inteiro do E2 —, quem loga é o Felipe ou
  o Pedro, e o Code registra o resultado **marcado como relato deles**, nunca como observação
  própria.

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

## Passo E1-b — encerrados fora do topo — **FEITO em 04/09/2026**

A medição obrigatória do E1 deu o pior caso possível: **10 de 10** dos primeiros pedidos eram
`entregue`/`cancelado`, com entregas de junho a agosto. Ordenar por entrega crescente sem
tratar isso deixou a tela pior do que era — o oposto do que foi pedido.

**Decisão do Felipe (04/09): "concluídos por último".** Nada é escondido e nada some da busca;
pedido encerrado continua na lista, só que no fim. As duas alternativas foram descartadas por
ele: mudar o filtro de status padrão (esconde pedido, e quem busca um antigo acha que sumiu) e
aceitar como está (não resolve nada).

**O que ficou implementado** (`src/app/pedidos/page.tsx`, só este arquivo): quando a ordem
escolhida é `entrega_asc` ou `entrega_desc`, a lista recortada é partida em dois grupos —
ativos e `entregue`/`cancelado` — cada um ordenado pela **mesma** `ordenarPedidos` com a
**mesma** ordem, e concatenado `[...ativos, ...encerrados]`. Nas ordens por **entrada** nada
muda. `ordenarPedidos` e `ORDENS_DATA` (`helpers.ts`, compartilhados com `/producao`)
continuam intocados.

**A partição só nas ordens por entrega foi decisão do Code, não deste documento** — e fica
mantida. A razão dele é boa: "entrega mais próxima" responde *o que eu preciso entregar*, e
pedido encerrado ali é ruído; "mais recentes primeiro" responde *o que entrou*, e um pedido que
entrou ontem e já foi entregue continua sendo, legitimamente, recente. Duas perguntas
diferentes, duas ordens diferentes.

**Duas coisas que ficaram de fora — não são bug, são escopo:**

1. `finalizado` **não** é encerrado, e não desce. Produção acabou, entrega não: é exatamente o
   pedido que a fila de `/entregas` está esperando. O código está certo nisso; só o texto do
   registro chama o segundo grupo de "finalizados", que é um nome infeliz para
   `entregue`/`cancelado`. **Se alguém for mexer nesse trecho um dia, chame de `encerrados`** —
   `finalizado` é um status de verdade, e confundir os dois esconde a fila de entrega.
2. O subtítulo da tela continua dizendo só `N pedido(s) cadastrado(s)`, sem avisar que os
   encerrados foram para o fim. Uma lista que se reordena sozinha sem dizer nada é como alguém
   conclui que um pedido sumiu. **Não é bloqueante e não foi pedido** — fica anotado como
   melhoria barata (uma linha), se o Felipe quiser.

Resultado do reteste, com os mesmos dados: **0 de 10** encerrados no topo, contra 10/10 antes.
Commit `33998da`. Detalhe completo no registro, no fim deste arquivo.

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

### Resultado no banco — **FEITO e CONFERIDO em 05/09/2026**

Executado pelo Felipe no SQL Editor, com print de cada etapa. O que se sabe agora, com o
resultado na mão:

**E2-a (auditoria).** `equipe.id` tem `gen_random_uuid()` no default — o insert padrão serviu
sem ajuste. **Descoberta que não estava documentada:** a tabela `equipe` tem duas colunas a
mais do que o `CLAUDE.md` registra — **`ativo`** (`boolean`, default `true`) e **`created_at`**
(default `now()`). O schema no `CLAUDE.md` está incompleto e precisa ser corrigido no
fechamento desta fase.

> **Tarefa para o Code, junto do fechamento:** rode um `grep -rn "ativo" src/` e confira se
> alguma consulta a `equipe` filtra por essa coluna (`middleware.ts`, `AuthProvider.tsx`,
> `kanban.ts`). Se filtrar, pessoa com `ativo = false` some do sistema **sem erro nenhum** —
> é o mesmo modo de falha de sempre, e vale estar escrito no `CLAUDE.md` antes de alguém
> descobrir na marra. Se não filtrar, a coluna existe e não é usada: registre isso também,
> porque coluna órfã já é dívida conhecida deste repo.

**E2-b (painel).** Os dois usuários foram criados em Authentication → Users, com **Auto
Confirm User** marcado:

| Pessoa | UID em `auth.users` |
|---|---|
| Marquinhos | `7a2fd0d6-1612-440c-9728-b8a4ab727eee` |
| Nice | `a0b5ae5b-3a14-470a-b3a7-d68924d40330` |

**E2-c (insert).** O insert por e-mail deste documento **não foi o que rodou**. Motivo
registrado porque é instrutivo: ele foi executado antes de os usuários existirem, achou zero
linhas em `auth.users` e gravou nada — e o SQL Editor respondeu `Success. No rows returned`,
exatamente igual a um insert bem-sucedido. **`Success. No rows returned` não prova gravação;
só o `select` de conferência prova.** Depois de criar os usuários, o insert foi refeito **por
UID**, com `where not exists` para continuar idempotente.

**E2-d (conferência).** Voltou 2 linhas:

| nome | perfil | ativo | email | confirmado |
|---|---|---|---|---|
| Marquinhos | `corte` | true | `marquinho@niceconfec.app` | true |
| Nice | `gestor` | true | `nice@niceconfec.app` | true |

#### ⚠️ O usuário do Marquinhos é `marquinho`, **sem o "s"**

O e-mail criado no painel foi `marquinho@niceconfec.app`. Como a tela de login monta
`usuario@niceconfec.app` a partir do que a pessoa digita, **ele entra digitando `marquinho`**.
Digitar `marquinhos` devolve credencial inválida sem dizer por quê — e é exatamente o tipo de
detalhe que faz alguém concluir "o sistema não deixa eu entrar".

**Decisão: fica como está.** Renomear o e-mail no painel pode derrubar a confirmação e criar
um problema maior que o benefício. O `nome` na tela continua **Marquinhos** (é o que está em
`equipe`); só o login é sem "s". **Escreva os dois na tabela de equipe do `CLAUDE.md`: nome
Marquinhos, usuário `marquinho`.**

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
  vez; não deixe de novo. Registre o usuário do Marquinhos como **`marquinho`**, sem "s".
- **`CLAUDE.md`: corrigir o schema de `equipe`** — faltam as colunas `ativo` (default `true`)
  e `created_at` (default `now()`), confirmadas na auditoria de 05/09. E responda no registro
  se algum código filtra por `ativo`.
- `CHANGELOG.md` com o que foi feito, incluindo o SQL rodado (é mudança de dado em produção,
  mesmo sem migration).
- Commit só de documentação (`docs:`), sem código — não dispara deploy novo.

---

## Ordem de execução

```
E1   /pedidos abre por entrega mais próxima  → FECHADO 04/09. Commit 40c0361
E1-b encerrados fora do topo da lista        → FECHADO 04/09. Commit 33998da (0/10, era 10/10)
E2   dois logins novos                       → PASSO ATUAL. Sem código; painel + SQL do
                                              Pedro; o Code prepara, confere e registra
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

> **Nota da execução do E1-b (04/09/2026):** esta subseção tinha sido preenchida na execução
> anterior do E1 e voltou em branco na cópia de trabalho do arquivo quando fui chamado para o
> E1-b (o conteúdo continuava seguro no commit `40c0361`). Reconstituí abaixo a partir desse
> commit, porque a regra do documento é não apagar histórico de passo anterior.

- **Status:** código feito e commitado (`40c0361`). Passo ficou PAUSADO pela regra do próprio
  documento (10 de 10 na medição). **Resolvido no E1-b, ver subseção abaixo.**
- **Arquivos alterados:** `src/app/pedidos/page.tsx` (só o `useState` da ordem, com comentário
  explicando o comportamento).
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
  `localStorage` estar vazio. Rodei contra `npm run dev` local, não contra produção.
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
  recentes primeiro" (`entrada_desc`) via evento de change real, recarreguei a página e o
  seletor voltou marcado em `entrada_desc`, não no novo padrão `entrega_asc`.
- **Teste 4 (`/producao` continua em "Entrega mais próxima"):** confirmado, `entrega_asc`
  sem mudança.
- **Commit:** `fix: /pedidos abre ordenada por entrega mais próxima` (`40c0361`). **Sem
  push** — aguarda o Pedro conferir, como sempre.
- **Divergências encontradas neste documento:**
  1. O efeito colateral da seção "⚠️" não é hipotético neste banco: ele se confirma com
     folga (10/10, não "3 ou mais"). Pedidos entregues em 06/2026-08/2026 dominam o topo da
     lista quando ordenado por entrega crescente sem filtrar status.
  2. O rito de teste ("aba anônima, logado como Pedro") não é executável por mim sem que
     alguém digite a senha na hora.

### E1-b — corrigir o efeito colateral medido no E1

> **Este documento não chegou a definir o E1-b antes de eu ser chamado para executá-lo** — a
> linha 121 (seção do E1) só dizia "o Cowork escreve o E1-b neste documento", mas nenhuma
> seção nova existia no arquivo. Perguntei ao Felipe como prosseguir; ele escolheu a opção
> "no filtro padrão 'Todos', empurrar pedidos entregue/cancelado para o fim mesmo com
> ordenação por entrega mais próxima" — é essa a interpretação implementada abaixo. Registro
> aqui para o Cowork saber que este passo não veio de um texto prévio do documento, veio de
> uma decisão tomada ao vivo com o Felipe nesta sessão (04/09/2026).

- **Status:** feito e commitado.
- **O que mudou:** só `src/app/pedidos/page.tsx`. Não mexeu em `ordenarPedidos` nem em
  `ORDENS_DATA` (`helpers.ts`) — continuam intocados, como as duas fases anteriores exigiam.
  A lista filtrada (`candidatos`) agora, **só quando a ordem escolhida é `entrega_asc` ou
  `entrega_desc`**, é dividida em dois grupos — pedidos ainda ativos (status diferente de
  `entregue` e `cancelado`) e pedidos finalizados — cada grupo ordenado normalmente por
  `ordenarPedidos`, e o resultado é `[...ativos, ...finalizados]`. Nas ordens por entrada
  (`entrada_asc`/`entrada_desc`), o comportamento não muda em nada — a partição só existe
  para as duas ordens por entrega, que são as únicas onde "mais antigo" podia significar "já
  acabou, não importa mais".
- **Por que só nas ordens por entrega:** o problema nasceu especificamente de ordenar por
  data de entrega crescente sem filtrar status — pedidos entregues há meses têm data de
  entrega antiga e subiam ao topo. Ordenar por entrada não tem esse problema (data de
  entrada não "explica" um pedido como encerrado), então mexer lá seria mudar um
  comportamento que ninguém reclamou.
- **`tsc` / `build`:** os dois limpos (`npx tsc --noEmit` sem saída; `npm run build` ✓
  Compiled successfully, 17/17 páginas geradas, mesmo conjunto de rotas de antes).
- **Reteste da medição (mesmo método do E1: local, logado como Kalomira via sessão já
  ativa, sem `nice-ordem-pedidos` em `localStorage`; porta 3000 tinha um processo `next dev`
  remanescente da execução anterior do E1 que eu já achava ter parado — matei o processo
  (PID, não só a task) e subi um novo em `localhost:3001` para garantir código atual):**
  - Filtro "Todos" + "Entrega mais próxima" (`entrega_asc`): **0 de 10** primeiros são
    `entregue`/`cancelado` agora (eram 10/10 antes). Os 30 pedidos ativos aparecem primeiro,
    ordenados por entrega crescente; os 12 `entregue`/`cancelado` aparecem depois, também
    ordenados por entrega crescente entre si (conferido lendo a lista completa, não só os
    10 primeiros).
  - Filtro "Todos" + "Entrega mais distante" (`entrega_desc`): mesma partição, mesma
    confirmação — os 10 primeiros são todos ativos, os 12 finalizados ficam no fim.
  - Filtro "Todos" + "Mais recentes primeiro" (`entrada_desc`): confirmado que **não** houve
    partição — pedidos `entregue` aparecem misturados na posição normal (ex.: `#2026-0038`
    entregue aparece na 5ª posição, entre pedidos ativos), provando que a mudança não vazou
    para as ordens por entrada.
  - `/producao`: confirmado sem mudança nenhuma — segue abrindo em `entrega_asc`, tela não
    foi tocada.
- **Teste de persistência (igual ao E1):** troquei o seletor via evento de `change` real,
  recarreguei com `navigate` (não só re-render), e a escolha continuou salva — comportamento
  de `localStorage` não foi afetado pela mudança.
- **Commit:** `fix: /pedidos empurra entregue/cancelado para o fim na ordem por entrega`
  (a preparar — ver nota abaixo). **Sem push** — aguarda o Pedro conferir.
- **Limpeza do ambiente:** os dois processos `next dev` que rodaram durante os testes
  (portas 3000 e 3001) foram encerrados ao final; não sobrou processo nem porta ocupada.
  `localStorage` da sessão usada para teste foi limpo da chave de teste ao final de cada
  rodada.
- **Divergências encontradas neste documento:**
  1. O documento nunca chegou a escrever a definição do E1-b (só prometeu que escreveria) —
     a decisão de qual das três saídas seguir veio do Felipe ao vivo nesta sessão, não do
     texto do arquivo. Registrado no aviso no topo desta subseção.
  2. A cópia de trabalho do `docs/fase-e.md` estava com a seção "Registro de execução" do E1
     em branco (revertida) quando comecei esta sessão, apesar do commit `40c0361` já ter o
     conteúdo preenchido. Reconstituí a partir do commit — ver nota no início da subseção E1.

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

- **E1/E1-b estão fechados** com o resultado esperado: `/pedidos` abre por entrega mais
  próxima, e agora pedidos entregue/cancelado não dominam mais o topo da lista (0/10 no
  reteste, contra 10/10 antes). Nada pendente aqui.
- **E2 não foi iniciado.** Depende do Pedro no painel do Supabase (E2-b), sem relação com o
  que travou o E1.
- **Rito de login para telas que exigem sessão:** não tenho como digitar senha (regra de
  segurança minha, não contorna nem com autorização). Da próxima vez que um teste pedir
  "logado como fulano", ou o Felipe testa e me passa o resultado, ou ele digita a senha numa
  aba que eu abro e devolve o controle depois.
- **Cuidado ao reescrever este arquivo por fora do fluxo combinado:** nesta sessão a seção
  "Registro de execução" do E1 apareceu em branco na cópia de trabalho, embora o commit
  `40c0361` já tivesse o conteúdo certo — alguma edição fora do commit sobrescreveu o
  arquivo com uma versão anterior. Recomendo sempre partir de `git pull` + conferir
  `git diff` antes de reescrever este documento à mão, para não perder registro de passo já
  fechado.
- **Definir o E1-b diretamente no documento da próxima vez**, em vez de só prometer "o Cowork
  escreve depois" — evita o Claude Code ficar bloqueado esperando uma definição que não
  chegou a existir no arquivo (foi o que aconteceu aqui: tive que perguntar ao Felipe ao vivo
  qual das três saídas seguir).
