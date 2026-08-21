# Fase C1 — Observações de produção, urgência direcionada e push

Documento de especificação para a próxima sessão do Claude Code.
Escrito em 19/08/2026, a partir do CLAUDE.md e do CHANGELOG.md do repo.
**Revisado em 21/08/2026** para incluir a **urgência direcionada** pedida pelo Pedro depois
de testar o site — ver seção 2-B.

**Decisões já tomadas com o Felipe:**

1. Entrega dividida: **Fase C1 = observações + urgência**. Push fica para a Fase C2, depois de
   C1 rodando em produção.
2. Push (C2) dispara **só em observação marcada como anomalia, e em urgência** — avanço normal
   de setor não notifica ninguém.
3. Visibilidade padrão da observação: **geral** (todo mundo vê). Privada e direcionada ficam a
   um clique.
4. **(21/08)** A urgência do Pedro **não vira módulo novo** — é a mesma tabela
   `observacoes_producao`, com uma coluna `tipo`. Motivo na seção 2-B.
5. **(21/08)** A urgência pode ser direcionada **a uma pessoa ou a um perfil inteiro**
   ("urgente para a Vera" ou "urgente para as costureiras").

> **Atenção à numeração da migration.** A **Fase C0**
> (`claude/Fase-C0-setores-nao-aplicaveis-e-ordenacao.md`) vem **antes** desta e, em princípio,
> não usa SQL nenhum. Mas ela tem uma auditoria que pode revelar a necessidade de recriar a
> função `atualizar_progresso_pedido` — e nesse caso a C0 consome o `010_`, e **tudo neste
> documento vira `011_`**. Confirme qual é o próximo número livre em `supabase/migrations/`
> antes de nomear os arquivos.

---

## 1. O que o WebPic tem, e o que vale copiar

O WebPic é a desenvolvedora; o produto chama-se **Dapic**, um ERP de confecção de São José do
Rio Preto. Preço de tabela: R$ 499 a R$ 1.199/mês, por faixa de usuários. Vale saber disso
porque enquadra a comparação: o Dapic é um ERP inteiro (fiscal, PDV, estoque, compras,
marketplace), a Nice é um sistema de pedidos e produção. Copiar o Dapic inteiro não é o
objetivo nem faria sentido.

O que o módulo de produção deles tem:

| Recurso do Dapic | A Nice tem? | Vale copiar? |
|---|---|---|
| Ordens de Produção por lote, tipo, previsão e status | Parcial — o pedido faz esse papel | Não. Na Nice o pedido **é** a OP, e a regra "entrega o pedido inteiro de uma vez" torna lote desnecessário |
| Kanban da Produção (etapas, células internas e externas, atrasos, retornos num painel) | Sim, mas dividido: `/producao` (8 setores) + `/terceirizadas` | Talvez, na C3 — juntar as duas visões numa tela só é o ganho real deles |
| Células, operações, rotas e ficha técnica | Não | Não. Exige cadastro pesado que a Nice não mantém |
| Rastreabilidade de terceirização (saída, retorno, material enviado, custo, pagamento) | Sim, `/terceirizadas` já cobre | Já feito |
| Programação e priorização manual da fila | Não | **A urgência da seção 2-B é a versão enxuta disto** — priorizar sem construir fila |
| Dashboard com "ordens em atraso, gargalos e **pontos que exigem ação imediata**" | Parcial — `/dashboard` tem urgentes | **Sim, e é exatamente o gancho da Fase C1**: uma anomalia aberta e uma urgência aberta são pontos que exigem ação imediata |
| App mobile / apontamento por celular | Não (o site é responsivo) | É a Fase C2 (PWA instalado) |
| Push notification | O Dapic **não anuncia** isso em lugar nenhum do site | — |

**O ponto mais útil da pesquisa é o que o Dapic *não* tem.** Nem o site de produção, nem o de
dashboard, nem o de planos mencionam observação por etapa, app mobile ou push. O que o Pedro
está pedindo não é "ficar igual ao Dapic" — é uma coisa que um ERP de R$ 799/mês não entrega.
O que dá pra pegar deles é a **linguagem**: "pontos que exigem ação imediata" é uma boa
descrição do card que vai pro `/dashboard`, e "o que ficou para trás" descreve a fila de
anomalias abertas.

---

## 2-A. Observação por setor (de baixo para cima)

### O caso de uso, nas palavras do Pedro

O cortador cortou errado e faltaram 2 camisetas por causa da metragem do pano. Ele precisa
marcar corte como concluído **e** avisar que tem um problema. Esse aviso pode ser:

- **Geral** — todo mundo do sistema vê (padrão)
- **Só a gestão** — Pedro e Kalomira, mais ninguém
- **Direcionada** — para uma pessoa específica, **ou para um perfil inteiro** (ver 2-B);
  Pedro e Kalomira também veem, sempre

### Por que uma tabela nova, e não JSONB dentro de `pedidos`

Este é o ponto técnico mais importante do documento, e ele decorre de duas lições que o próprio
projeto já pagou:

1. **RLS é por linha.** A visibilidade privada só é real se cada observação for uma linha que o
   banco pode filtrar. Se a observação privada morar no JSONB de `progresso`, ela viaja pro
   navegador de qualquer pessoa que abrir o pedido — é literalmente o furo que o `verFinanceiro`
   ainda tem hoje (o CLAUDE.md registra: `getPedidoById` faz `select('*')`, os valores aparecem
   na aba Network). Repetir esse padrão num campo que existe justamente para ser privado seria
   criar um problema sabendo que ele é um problema.
2. **Array JSONB é reescrito inteiro.** Alterar uma peça reescreve o array todo
   (`store.ts:162`), sem update parcial nem lock. Duas pessoas de setores diferentes escrevendo
   observação no mesmo pedido ao mesmo tempo perderiam uma das duas, em silêncio. Numa fábrica
   com 8 setores tocando o mesmo pedido, isso acontece.

O modelo certo já existe no repo: `cards.perfis_visiveis` + policy de select no Kanban. É esse
padrão que a C1 segue.

---

## 2-B. Urgência direcionada (de cima para baixo) — **novo em 21/08**

### O pedido do Pedro, literal

> "Criar para o CEO ou a Kalomira conseguir colocar se algum processo da produção tem que ser
> feito com urgência, para quem é e o que deve fazer, com observação, com uma sinalização ou
> com uma mensagem direta para quem seja."

### Por que isto é a mesma coisa que a 2-A, invertida

Destrinchando o pedido, os ingredientes são: **um texto**, preso a **um pedido e um setor**,
com **um destinatário**, que **aparece sinalizado** para quem precisa ver e **se resolve**
quando o trabalho é feito.

É, item por item, a tabela `observacoes_producao` da seção 2-A. A única diferença é a direção:

| | Observação (2-A) | Urgência (2-B) |
|---|---|---|
| Quem escreve | qualquer um dos 8 perfis | **só gestor/recepcionista** |
| Direção | chão de fábrica → gestão | gestão → chão de fábrica |
| Significado | "aconteceu um problema aqui" | "faça isto primeiro" |
| Quando nasce | ao concluir um setor | a qualquer momento |
| Quem precisa ver com destaque | gestão | **o destinatário** |

Construir uma segunda tabela para isso seria duplicar a tabela, o RLS, o modal, o card do
dashboard e o disparo de push da C2 — e criar duas fontes da verdade sobre "o que está pegando
neste pedido". **Uma coluna `tipo` resolve.** É a mesma decisão que o projeto já tomou ao ter
uma `permissoes.ts` só, em vez de `if (perfil === ...)` espalhado.

### O que muda no modelo

Três colunas a mais do que a versão de 19/08:

- **`tipo`** — `'observacao'` (padrão) ou `'urgencia'`. Quem cria `'urgencia'` é só
  gestor/recepcionista, **e isso é garantido no banco pela policy de insert**, não só pelo botão
  escondido na tela.
- **`destinatario_perfil`** — para "urgente para as costureiras". Convive com
  `destinatario_id` (a pessoa), e a constraint garante que venha **um ou outro, nunca os dois**.
  Por que os dois formatos: `costura` tem três pessoas (Vera, Regina, Kezia) e faltar uma não
  pode fazer o aviso sumir; já `estamparia_serigrafia` tem só o Alex, e ali nomear a pessoa é
  mais natural.
- **Uma tabela `observacoes_ciencia`** — quem já viu o aviso. Não é uma coluna, e o motivo
  está na seção seguinte.

### ⚠️ Setor e perfil **não são a mesma lista** — o erro mais fácil desta fase

A coluna `setor` e a coluna `destinatario_perfil` têm CHECKs diferentes, e os nomes divergem
exatamente onde a confusão é mais provável:

| Setor (chave de `progresso`) | Perfil correspondente em `equipe` |
|---|---|
| `costura` | `costureira` |
| `estamparia_silk` | `estamparia_serigrafia` |
| `prensa_sublimacao` | `estamparia_sublimacao` |
| `corte`, `acabamento` | `corte`, `acabamento` (iguais) |
| `atendimento`, `compra`, `prensa_dtf` | **não existe perfil** |
| — | `designer`, `gestor`, `recepcionista` (não são setor) |

Consequências práticas:

- **A aba do seletor chama-se "Perfil", não "Setor"**, e é montada a partir dos 8 valores do
  CHECK de `equipe.perfil` — **nunca** a partir de `SETOR_LABELS`. Montá-la dos setores
  gravaria `'costura'` em `destinatario_perfil` e, mesmo que passasse pelo CHECK, `meu_perfil()`
  jamais devolveria esse valor: a policy de select filtraria a linha e o aviso **sumiria em
  silêncio**, sem erro nenhum. É o modo de falha que o `CLAUDE.md` já alerta.
- **Não dá para direcionar urgência a `compra`, `atendimento` ou `prensa_dtf`** — não há perfil
  para eles. Nesses casos, direcione à pessoa. Se o Pedro sentir falta, é perfil novo: CHECK do
  banco **e** o tipo `Perfil` em `permissoes.ts`, no mesmo commit, como manda o `CLAUDE.md`.

### Ciência: por que uma tabela, e não uma coluna

A razão de existir `destinatario_perfil` é que *faltar uma costureira não pode fazer o aviso
sumir*. Uma coluna `ciente_em` na própria observação destruiria isso: a Vera clica em "ciente"
e o aviso desaparece para a Regina e a Kezia — que talvez sejam quem realmente vai fazer o
trabalho. Seria criar o problema no mesmo campo que existe para evitá-lo.

Então a ciência é **uma linha por pessoa**:

```
observacoes_ciencia
  observacao_id uuid fk→observacoes_producao (on delete cascade)
  membro_id     uuid fk→equipe
  membro_nome   text
  ciente_em     timestamptz default now()
  primary key (observacao_id, membro_id)
```

A faixa vermelha de `/producao` mostra as urgências **abertas para mim e ainda não vistas por
mim**: `not resolvida` e sem linha minha em `observacoes_ciencia`. O `/dashboard` da gestão
mostra o outro lado — **quantas pessoas já viram**, com os nomes. É isso que responde a
pergunta real do Pedro: "mandei; chegou?".

### A sinalização, enquanto o push (C2) não existe

O Pedro falou em "sinalização ou mensagem direta". A C1 entrega a sinalização **dentro do
sistema**; o push no celular é a C2. É importante ser claro com ele sobre isso, porque a
diferença é grande na prática: a sinalização só aparece para quem abre o sistema.

Três lugares, do mais visível para o menos:

1. **Faixa no topo de `/producao`** — a rota inicial dos 6 perfis de chão de fábrica, ou seja, a
   primeira tela que a Vera vê ao entrar. _"Você tem 2 avisos urgentes"_, em `bg-red-100
   text-red-700` (que é legível nos dois temas por construção — ver `CLAUDE.md`), expandindo
   para o texto, o pedido, o setor e o botão **"Marcar como ciente"**.
2. **Badge vermelho no pedido**, nas listas de `/producao` e `/pedidos`, para quem é
   destinatário. O pedido com urgência aberta salta da lista.
3. **Card "Pontos que exigem ação" no `/dashboard`** — a fila da gestão, com anomalias abertas
   **e** urgências abertas, mostrando quais já foram vistas pelo destinatário e quais não.

### Regras de negócio da urgência

1. **Urgência não muda nada no pedido.** Não altera status, não altera progresso, não reordena
   fila. É um aviso. Isso é deliberado: é o mesmo princípio da regra 8 do `CLAUDE.md`
   (`/producao` e `/quadros` são módulos diferentes, e nenhum automatiza o outro).
2. **Urgência sempre tem destinatário.** "Urgente para ninguém" é só um pedido nervoso. A tela
   obriga escolher pessoa ou perfil antes de habilitar o botão de salvar.
3. **Gestor e recepcionista veem todas as urgências**, como já veem todas as observações.
4. **Só a gestão resolve; só o destinatário fica ciente.** Duas ações diferentes, dois botões
   diferentes, duas pessoas diferentes, duas funções de banco diferentes. E numa urgência
   direcionada a um perfil, **a ciência de uma pessoa não fala pelas outras** — a Vera ficar
   ciente não tira o aviso da tela da Regina.
5. **Urgência também não sai na ficha A4.** Mesmo `print:hidden` do bloco de observações.

---

## 2-C. A tabela `observacoes_producao`

```
id uuid pk
pedido_id uuid fk→pedidos (on delete cascade)
setor text            -- um dos 8 setores fixos
tipo text             -- 'observacao' | 'urgencia', default 'observacao'
texto text            -- 1 a 2000 caracteres
anomalia bool         -- "isso é um problema", default false
visibilidade text     -- 'geral' | 'gestao' | 'direcionada', default 'geral'
destinatario_id uuid fk→equipe    -- pessoa (só quando visibilidade='direcionada')
destinatario_nome text            -- desnormalizado, ver nota abaixo
destinatario_perfil text          -- perfil inteiro (alternativa à pessoa)
autor_id uuid fk→equipe not null
autor_nome text not null
resolvida bool default false
resolvida_por text
resolvida_em timestamptz
created_at timestamptz default now()
```

**`autor_nome` e `destinatario_nome` são desnormalizados de propósito.** O sistema já faz isso
em `progresso.atualizadoPor`, que guarda a string do nome vinda de `useMembro()`. Guardar o nome
evita um join com `equipe` — e `equipe` é uma tabela que as policies nunca leem direto (é sempre
via `meu_perfil()`, security definer). Fazer a tela precisar de um select em `equipe` abriria uma
pergunta de RLS que hoje não existe. O `id` fica guardado junto, para o caso de alguém trocar de
nome.

### Regras de negócio (valem para os dois tipos)

1. **A observação nunca segura o progresso.** O clique no setor grava primeiro, pela função
   `atualizar_progresso_pedido` que já existe. Só depois o modal abre. Se a pessoa fechar o
   modal, se a internet cair, se o insert falhar — o setor continua concluído. Nunca o
   contrário. _(A Fase C0 aplica exatamente esta regra ao modal de "pronto para envio".)_
2. **Observação é opcional.** O modal abre com "Pular" tão visível quanto "Salvar". Chão de
   fábrica com o celular na mão não pode ser obrigado a digitar para marcar um setor.
3. **Registro imutável, e imutável no banco — não só na tela.** Ninguém edita nem apaga.
   Gestor e recepcionista podem marcar como **resolvida** — que é o que tira da fila de
   pendências, sem apagar o histórico. Se o autor errou o texto, escreve outra.
   *(Proposta minha, não decisão do Pedro — confirmar antes de rodar a migration.)*

   **Como isso é garantido:** a tabela não tem policy de UPDATE **nem** de DELETE. Resolver e
   ficar ciente passam por funções `security definer` que gravam só as colunas delas. Uma
   policy de UPDATE liberada para a gestão pareceria inofensiva, mas **RLS é por linha, não
   por coluna** — ela deixaria reescrever `texto`, `autor_nome` e `created_at` pelo DevTools,
   e a regra da imutabilidade viraria só um texto neste documento. É a mesma limitação que a
   Fase B contornou com `atualizar_progresso_pedido`, e a mesma solução.
4. **Gestor e recepcionista veem tudo, sempre**, independente da visibilidade escolhida. E a
   tela diz isso, com todas as letras, embaixo do seletor: *"Pedro e Kalomira sempre veem esta
   observação."* Não pode existir a sensação de canal secreto num sistema de 12 pessoas.
5. **O autor sempre vê o que escreveu**, mesmo em observação privada.
6. **Nada disso sai na ficha A4 do cliente.** Todo o bloco leva `print:hidden`. Uma anomalia de
   corte impressa e entregue junto com o pedido é um problema de negócio, não um bug de layout.
7. **O que aparece no `/dashboard`** é `(anomalia or tipo = 'urgencia') and not resolvida`. Só
   para gestor e recepcionista.

### RLS

Precisa de uma função nova, irmã da `meu_perfil()`:

```sql
public.meu_id_equipe() returns uuid  -- security definer, devolve equipe.id do usuário logado
```

Com ela, as policies ficam:

- **SELECT** — passa se: perfil é gestor/recepcionista **ou** `visibilidade = 'geral'` **ou**
  você é o autor **ou** você é o destinatário (por id **ou por perfil**).
- **INSERT** — qualquer pessoa com linha em `equipe`, com `autor_id = meu_id_equipe()` no
  `with check` (impede forjar autoria pelo DevTools) **e** com `tipo = 'urgencia'` permitido só
  a gestor/recepcionista.
- **UPDATE e DELETE** — **nenhuma policy**, de propósito (ver regra 3). O cascade do
  `pedido_id` cuida do caso de pedido excluído.
- **As duas escritas que existem depois do insert passam por função `security definer`:**
  `marcar_resolvida(obs_id)` (gestão) e `marcar_ciente(obs_id)` (destinatário). Cada uma grava
  só o que lhe cabe.
- **As duas devolvem `boolean`, não `void`.** Se a condição não casar — destinatário errado,
  já resolvida, usuário sem linha em `equipe` — um `update` de zero linhas retorna com sucesso,
  e a tela mostraria "pronto" sem nada ter sido gravado. É exatamente o *"não dá erro, dá zero
  linhas"* que este documento repete, e aqui nem o RLS está no caminho, porque o
  `security definer` já o contorna. **O front trata `false` como falha visível**, no espírito
  da regra 10 do `CLAUDE.md` (a tela nunca mostra o que o banco não tem).
- **O nome de quem resolveu / ficou ciente é derivado dentro da função**, a partir de `equipe`
  via `meu_id_equipe()` — nunca recebido como parâmetro do cliente. A policy de insert se dá o
  trabalho de exigir `autor_id = meu_id_equipe()` para impedir autoria forjada pelo DevTools;
  seria incoerente deixar `resolvida_por` aceitar qualquer string.

Lembrete que o CLAUDE.md já registra e que vale repetir: **RLS que barra não dá erro, dá zero
linhas.** Se depois da migration uma observação privada "sumir" para a costureira, isso é o
sistema funcionando, não um bug.

### Telas afetadas

| Tela | O que muda |
|---|---|
| `/producao` | Modal de observação ao concluir um setor. Ícone de balão em cada setor com o contador. Filtro "só pedidos com anomalia aberta". **Faixa vermelha no topo com as urgências abertas do usuário logado, e botão "Marcar como ciente"**. **Botão "Urgente" na linha do setor, só para gestor/recepcionista** |
| `/pedidos/[id]` | O card "Progresso por Setor" ganha as observações abaixo de cada setor, com autor, data e tarja de visibilidade. Urgência aparece em vermelho, com destinatário e quem já ficou ciente. Botão "Resolver" para gestor/recepcionista (chama `marcar_resolvida`). **Botão "Urgente" por setor**, também só para a gestão. Tudo `print:hidden` |
| `/pedidos` | Badge vermelho no pedido com urgência aberta direcionada ao usuário logado |
| `/dashboard` | Card novo: **"Pontos que exigem ação"** — anomalias e urgências abertas, com link pro pedido e **quantas pessoas já viram, com os nomes** (de `observacoes_ciencia`). Só gestor/recepcionista |
| `permissoes.ts` | Quatro flags novas: `escreverObservacao` (os 8 perfis), `verObservacaoPrivada`, `resolverObservacao` e **`criarUrgencia`** (só gestor/recepcionista) |

**O modal é mobile-first.** Quem vai usar isso é o Alex com o celular na mão, no meio do
barulho. Campo de texto grande, os três botões de visibilidade lado a lado como chips, o toggle
de anomalia bem visível, "Pular" e "Salvar" no rodapé fixo. E **cores semânticas**:
`bg-superficie`, `text-conteudo`, `text-suave` — nunca `bg-white`, que some no tema escuro.

**O modal de urgência é o mesmo componente**, aberto num modo diferente: título "Marcar como
urgente", `tipo` fixo em `'urgencia'`, visibilidade travada em `direcionada`, e um seletor
"Para quem?" com duas abas — **Pessoa** (lista de `listar_equipe()`) e **Perfil** (os 8 valores
de `equipe.perfil`, **não** os 8 setores — reler o aviso da seção 2-B antes de montar essa
aba). Não escreva um segundo modal.

---

## 3. A migration 010

Segue o padrão validado na Fase B: **auditoria primeiro, execução depois**. Foi essa prática que
pegou o problema real das policies antigas de `tabela_precos` antes de qualquer coisa quebrar.

Dois arquivos, ambos versionados em `supabase/migrations/`. O Claude Code entrega o SQL;
**o Pedro é quem cola e roda no SQL Editor do Supabase.**

> Se a Fase C0 tiver consumido o `010_`, renumere tudo abaixo para `011_`.

### `010_observacoes_producao_auditoria.sql` — só leitura, rode primeiro

```sql
-- AUDITORIA — só SELECT. Não altera nada. Rode e mande o resultado.

-- 1. As tabelas já existem?
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('observacoes_producao','observacoes_ciencia');

-- 2. Como está a tabela equipe (RLS ligado? quais policies?)
select relname, relrowsecurity
from pg_class
where relname = 'equipe' and relnamespace = 'public'::regnamespace;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'equipe';

-- 3. Quantas pessoas estão realmente cadastradas hoje, e todas têm auth_user_id?
select perfil, count(*) as total, count(auth_user_id) as com_login
from public.equipe
group by perfil
order by perfil;

-- 4. As funções auxiliares que já existem
select proname, prosecdef as security_definer, proconfig
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('meu_perfil', 'meu_id_equipe', 'listar_equipe', 'marcar_ciente',
                  'marcar_resolvida', 'posso_ver_observacao',
                  'atualizar_progresso_pedido');

-- 5. gen_random_uuid disponível?
select gen_random_uuid();
```

**O que olhar no resultado:**

- Item 1 tem que voltar **vazio**. Se voltar alguma linha, alguém já criou a tabela fora do
  repo — pare e investigue, exatamente como aconteceu com `tabela_precos`.
- Item 3 responde de quebra a pergunta que está aberta no contexto do projeto desde 14/08:
  **quem de fato está cadastrado hoje**. Aproveite e atualize a tabela de equipe no CLAUDE.md
  com o resultado. **Isso não é acessório nesta fase: sem gente cadastrada, não há para quem
  direcionar uma urgência.**
- Item 4 mostra se `meu_id_equipe`, `listar_equipe` e `marcar_ciente` já existem (não devem).

### `010_observacoes_producao.sql` — execução

```sql
-- FASE C1 — Observações de produção por setor e urgência direcionada.
-- Rodar SOMENTE depois de conferir o resultado da auditoria.

begin;

-- ── 1. Função auxiliar: id da linha do usuário logado em equipe ──────────────
create or replace function public.meu_id_equipe()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.equipe where auth_user_id = auth.uid() limit 1;
$$;

revoke all on function public.meu_id_equipe() from public;
grant execute on function public.meu_id_equipe() to authenticated;

-- ── 2. Função auxiliar: lista de pessoas para o seletor "direcionada" ────────
-- Devolve só id, nome e perfil. Nunca auth_user_id.
create or replace function public.listar_equipe()
returns table (id uuid, nome text, perfil text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nome, e.perfil from public.equipe e order by e.nome;
$$;

revoke all on function public.listar_equipe() from public;
grant execute on function public.listar_equipe() to authenticated;

-- ── 3. Tabela ───────────────────────────────────────────────────────────────
create table public.observacoes_producao (
  id                uuid primary key default gen_random_uuid(),
  pedido_id         uuid not null references public.pedidos(id) on delete cascade,
  setor             text not null check (setor in (
                      'atendimento','compra','corte','costura',
                      'estamparia_silk','prensa_dtf','prensa_sublimacao','acabamento')),
  tipo              text not null default 'observacao'
                      check (tipo in ('observacao','urgencia')),
  texto             text not null check (char_length(btrim(texto)) between 1 and 2000),
  anomalia          boolean not null default false,
  visibilidade      text not null default 'geral'
                      check (visibilidade in ('geral','gestao','direcionada')),
  destinatario_id   uuid references public.equipe(id),
  destinatario_nome text,
  destinatario_perfil text check (destinatario_perfil in (
                      'gestor','recepcionista','designer','corte','costureira',
                      'estamparia_serigrafia','estamparia_sublimacao','acabamento')),
  autor_id          uuid not null references public.equipe(id),
  autor_nome        text not null,
  resolvida         boolean not null default false,
  resolvida_por     text,
  resolvida_em      timestamptz,
  created_at        timestamptz not null default now(),

  -- Direcionada exige EXATAMENTE um destinatário (pessoa XOR perfil);
  -- as outras visibilidades não têm destinatário nenhum.
  constraint obs_destinatario_coerente check (
    (visibilidade =  'direcionada'
       and ((destinatario_id is not null) <> (destinatario_perfil is not null)))
    or
    (visibilidade <> 'direcionada'
       and destinatario_id is null and destinatario_perfil is null)
  ),

  -- Se guardou o id da pessoa, guardou o nome junto — a tela lê o nome daqui
  -- justamente para não precisar de join com equipe.
  constraint obs_destinatario_nome check (
    destinatario_id is null or destinatario_nome is not null
  ),

  -- Urgência sempre tem dono. "Urgente para ninguém" não existe.
  constraint obs_urgencia_direcionada check (
    tipo <> 'urgencia' or visibilidade = 'direcionada'
  )
);

-- Quem já viu o aviso — uma linha por pessoa, porque urgência direcionada a um
-- perfil tem N destinatários e o "ciente" de um não vale pelos outros.
create table public.observacoes_ciencia (
  observacao_id uuid not null
                  references public.observacoes_producao(id) on delete cascade,
  membro_id     uuid not null references public.equipe(id),
  membro_nome   text not null,
  ciente_em     timestamptz not null default now(),
  primary key (observacao_id, membro_id)
);

create index observacoes_pedido_idx
  on public.observacoes_producao (pedido_id, created_at desc);

create index observacoes_acao_aberta_idx
  on public.observacoes_producao (created_at desc)
  where (anomalia or tipo = 'urgencia') and not resolvida;

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
alter table public.observacoes_producao enable row level security;

-- Leitura: gestão vê tudo; os demais veem o que é geral, o que escreveram,
-- e o que foi direcionado a eles — pessoalmente ou pelo perfil.
create policy observacoes_select
  on public.observacoes_producao
  for select to authenticated
  using (
    public.meu_perfil() in ('gestor','recepcionista')
    or visibilidade      = 'geral'
    or autor_id          = public.meu_id_equipe()
    or destinatario_id   = public.meu_id_equipe()
    or destinatario_perfil = public.meu_perfil()
  );

-- Escrita: qualquer pessoa com linha em equipe, mas só em nome próprio.
-- Urgência é privilégio de gestor/recepcionista — garantido aqui, no banco,
-- não só pelo botão escondido na tela.
create policy observacoes_insert
  on public.observacoes_producao
  for insert to authenticated
  with check (
    public.meu_id_equipe() is not null
    and autor_id = public.meu_id_equipe()
    and (tipo = 'observacao' or public.meu_perfil() in ('gestor','recepcionista'))
  );

-- UPDATE e DELETE: NENHUMA policy, de propósito.
-- RLS é por linha, não por coluna — uma policy de update "só para a gestão"
-- deixaria reescrever texto, autor_nome e created_at pelo DevTools. As duas
-- escritas legítimas passam pelas funções da seção 5, cada uma gravando só o
-- que lhe cabe. Mesmo padrão de atualizar_progresso_pedido (Fase B).

-- Leitura da ciência: quem enxerga a observação enxerga quem já a viu.
alter table public.observacoes_ciencia enable row level security;

-- Regra do CLAUDE.md: policy que consulta outra tabela com RLS usa função
-- security definer, NUNCA um exists direto. Esta é a função.
create or replace function public.posso_ver_observacao(obs_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.observacoes_producao o
     where o.id = obs_id
       and (public.meu_perfil() in ('gestor','recepcionista')
         or o.visibilidade       = 'geral'
         or o.autor_id           = public.meu_id_equipe()
         or o.destinatario_id    = public.meu_id_equipe()
         or o.destinatario_perfil = public.meu_perfil())
  );
$$;

revoke all on function public.posso_ver_observacao(uuid) from public;
grant execute on function public.posso_ver_observacao(uuid) to authenticated;

create policy ciencia_select
  on public.observacoes_ciencia
  for select to authenticated
  using (public.posso_ver_observacao(observacao_id));
-- INSERT/UPDATE/DELETE: nenhuma policy — só a função marcar_ciente escreve.

-- ── 5. As duas escritas pós-insert, cada uma gravando só o que lhe cabe ──────

-- "Marcar como ciente" — o destinatário confirma que viu.
create or replace function public.marcar_ciente(obs_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  meu_id   uuid := public.meu_id_equipe();
  meu_nome text;
  n        integer;
begin
  if meu_id is null then
    return false;
  end if;

  select nome into meu_nome from public.equipe where id = meu_id;

  insert into public.observacoes_ciencia (observacao_id, membro_id, membro_nome)
  select o.id, meu_id, meu_nome
    from public.observacoes_producao o
   where o.id = obs_id
     and (o.destinatario_id     = meu_id
       or o.destinatario_perfil = public.meu_perfil())
  on conflict do nothing;

  get diagnostics n = row_count;   -- row_count é integer, nunca boolean
  return n > 0;
end;
$$;

revoke all on function public.marcar_ciente(uuid) from public;
grant execute on function public.marcar_ciente(uuid) to authenticated;

-- "Marcar como resolvida" — só gestão, e só as três colunas de resolução.
create or replace function public.marcar_resolvida(obs_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  meu_id   uuid := public.meu_id_equipe();
  meu_nome text;
  n        integer;
begin
  if meu_id is null or public.meu_perfil() not in ('gestor','recepcionista') then
    return false;
  end if;

  select nome into meu_nome from public.equipe where id = meu_id;

  update public.observacoes_producao
     set resolvida     = true,
         resolvida_por = meu_nome,
         resolvida_em  = now()
   where id = obs_id
     and not resolvida;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.marcar_resolvida(uuid) from public;
grant execute on function public.marcar_resolvida(uuid) to authenticated;

commit;
```

### `010_observacoes_producao_conferencia.sql` — rode depois

```sql
-- Confirmar antes de afirmar.
select relrowsecurity from pg_class
where relname = 'observacoes_producao' and relnamespace = 'public'::regnamespace;
-- esperado: true

select tablename, policyname, cmd from pg_policies
where tablename in ('observacoes_producao','observacoes_ciencia')
order by tablename, policyname;
-- esperado, e SÓ isso:
--   observacoes_ciencia   ciencia_select        SELECT
--   observacoes_producao  observacoes_insert    INSERT
--   observacoes_producao  observacoes_select    SELECT
-- Se aparecer qualquer policy de UPDATE ou DELETE, algo saiu errado:
-- a imutabilidade do registro depende de elas NÃO existirem.

select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('meu_id_equipe','listar_equipe','marcar_ciente',
                  'marcar_resolvida','posso_ver_observacao');
-- esperado: as cinco

select public.meu_id_equipe();
-- rodando pelo SQL Editor isso volta null (não há auth.uid()) — é esperado.
-- O teste real é pela aplicação, logado.
```

---

## 4. Ordem de execução — e uma lição da Fase B

**Na Fase C1 a ordem é o inverso da Fase B.**

Na Fase B, o código subiu antes da migration, e por um intervalo a tela de preços *parecia*
funcionar porque o fallback de `localStorage` mascarava um bloqueio real de RLS. Aqui o risco é
diferente e mais simples: o código novo lê uma tabela que ainda não existe. Sem a tabela,
`/producao` quebra na cara de quem estiver usando — e o sistema está em uso diário real.

Ordem correta:

1. **Fase C0 concluída, testada em produção e commitada.** Não empilhe as duas.
2. `git pull` (sempre, antes de qualquer coisa — são dois PCs)
3. Pedro roda **a auditoria** no SQL Editor e manda o resultado
4. Claude Code ajusta a migration conforme o que a auditoria mostrar
5. **Cadastrar quem falta em `equipe`** — sem gente cadastrada não há a quem direcionar
   urgência, e o item 3 da auditoria diz exatamente quem falta
6. Pedro roda **a migration**
7. Pedro roda **a conferência** e confirma
8. Só então o Claude Code escreve o código: `types/index.ts` → `store.ts` → `permissoes.ts` →
   componente do modal → `/producao` → `/pedidos/[id]` → `/pedidos` → `/dashboard`
9. Teste local (`npm run dev`) e `npx tsc --noEmit` limpo
10. Commit `feat: observações de produção e urgência direcionada por setor` → Pedro confere →
    push
11. Deploy "Ready" na Vercel
12. **Teste em produção com perfis de verdade**, quatro cenários:
    - o Alex escreve uma observação privada; a Vera **não** vê
    - o Pedro manda urgência **para a Vera**; ela vê a faixa vermelha ao entrar, clica em
      "ciente", e o Pedro vê isso no `/dashboard`
    - o Pedro manda urgência **para o perfil `costureira`**; Vera, Regina e Kezia veem; a Vera
      clica em "ciente" e **o aviso continua na tela da Regina** — este é o teste que justifica
      a tabela `observacoes_ciencia` existir
    - o Alex tenta criar uma urgência (o botão não aparece para ele; se aparecesse, a policy de
      insert barraria) — confirmar que não há caminho
13. `CHANGELOG.md` + `CLAUDE.md` atualizados antes de encerrar

O passo 12 não é opcional. A Fase B só foi dada como concluída depois de um teste com perfil
real, e foi bom que tenha sido.

---

## 5. Fase C2 — PWA e push de anomalia (esboço, não executar ainda)

Registrado agora para o Pedro dimensionar. **Não faça na mesma sessão da C1.**

### O que é preciso

1. **`public/manifest.json`** — nome, ícones 192 e 512, `display: "standalone"`, cor `#3a8c2f`.
   É o que faz o "Adicionar à Tela de Início" virar um app de verdade em vez de um atalho.
2. **`public/sw.js`** — service worker escrito à mão (~60 linhas: `push` e `notificationclick`).
   Recomendo **não** usar `next-pwa`: ele tem histórico de brigar com o App Router do Next 14 e
   o ganho aqui é pequeno.
3. **Tabela `push_subscriptions`** — `membro_id`, `endpoint` (unique), `p256dh`, `auth`,
   `user_agent`, `created_at`. Migration 011 (ou 012).
4. **Chaves VAPID** — geradas uma vez pelo pacote `web-push`. Vão para a Vercel como
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`.
5. **Route handler `/api/push/enviar`** — recebe um Database Webhook do Supabase disparado no
   insert de `observacoes_producao` com `anomalia = true` **ou `tipo = 'urgencia'`**, e envia
   para gestor, recepcionista e o destinatário (resolvendo `destinatario_perfil` para as pessoas
   daquele perfil).
6. **Tela `/instalar`** — passo a passo ilustrado de como colocar na tela de início, uma no
   iPhone e outra no Android. Sem isso ninguém instala.

### As três coisas que o Pedro precisa saber antes de aprovar

**No iPhone, push só funciona com o app instalado na tela de início.** Não é escolha nossa: o
Safari só entrega Web Push para site instalado (iOS 16.4+). Numa aba comum, o navegador nem
oferece a permissão. No Android funciona nos dois casos, mas instalar é melhor de qualquer
jeito. Ou seja: **a adoção depende de instalar no celular de cada pessoa, uma a uma.** Vale
reservar meia hora para fazer isso com o pessoal junto, presencialmente.

**Isso exige criar uma service role key.** Hoje o CLAUDE.md registra, como ponto positivo, que
"não existe `SUPABASE_SERVICE_ROLE_KEY` no repo: não houve vazamento de chave privilegiada, mas
também não existe nenhum caminho de acesso privilegiado". O envio de push quebra isso: quem
dispara o push precisa ler as inscrições de *outras* pessoas, e nenhuma sessão de usuário comum
pode fazer isso. É uma mudança consciente de postura de segurança, com duas regras que não podem
ser negociadas: a variável é **server-only** (jamais com prefixo `NEXT_PUBLIC_`), e o route
handler valida um segredo compartilhado no header antes de fazer qualquer coisa.

**Push não é garantia de entrega.** O celular pode estar sem rede, com a bateria economizando,
com a notificação silenciada. Push é um lembrete conveniente, não o canal oficial do aviso.
**O canal oficial continua sendo o sistema** — a anomalia e a urgência estão lá no `/dashboard`
e no pedido, tenha o push chegado ou não. É por isso que a C1 entrega a faixa vermelha em
`/producao` e o `ciente_em`: **a urgência já funciona sem push**, e o push só a torna mais
rápida. Se depois de C2 o push se mostrar frágil na prática, o plano B é WhatsApp via API
oficial, que tem custo por mensagem e um cadastro chato na Meta — por isso não é o plano A.

Custo de infraestrutura: **zero**. O route handler cabe no plano free da Vercel e o Web Push é
um protocolo aberto, sem intermediário pago.

---

## 6. O que ficou de fora, e por quê

- **Anexar foto na observação.** Faz muito sentido ("olha aqui o corte errado") e o bucket
  `pedido-fotos` já existe. Ficou de fora da C1 só para não inflar a primeira entrega. Candidato
  natural a uma C1.5.
- **Prazo na urgência** ("para hoje às 16h"). Tentador, mas abre a porta para urgência vencida,
  alerta de urgência vencida, e uma segunda noção de prazo concorrendo com a `data_entrega` do
  pedido. Se o Pedro sentir falta depois de usar, é uma coluna e meia tela.
- **Comentar em resposta a uma observação.** Vira thread, vira chat, vira outro produto. Se o
  Pedro quiser conversa, o Kanban já existe pra isso.
- **Juntar `/producao` e `/terceirizadas` num painel só** (o "Kanban da Produção" do Dapic). É
  provavelmente o maior ganho de visibilidade disponível hoje, mas é uma fase própria.
- **Programação e priorização da fila de produção** (também do Dapic). A urgência da seção 2-B é
  o atalho barato para 80% disso. Fila de verdade é fase própria, e depende de o Pedro querer
  gerenciar fila.

---

## Fontes

- [WebPic — página inicial (ERP Dapic)](https://www.webpic.com.br/)
- [Produção no Dapic](https://www.webpic.com.br/producao)
- [Dashboard do Dapic](https://www.webpic.com.br/dashboard)
- [Planos e preços do Dapic](https://www.webpic.com.br/planos)
- [Sobre a WebPic](https://www.webpic.com.br/sobre)
