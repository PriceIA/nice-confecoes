# Fase J — Recados (chat entre duas pessoas)

**Spec escrita em 25/09/2026 pelo Claude (Cowork), com as respostas do Pedro.** Mockup:
artifact "Recados — mockup" (6 telas).

> **ETAPA ATUAL: J3.** J0, J1 e J2 feitas e commitadas. Uma etapa por vez. Terminou a J3?
> Registre em `docs/fase-j-registro.md` e pare, sem commitar a J3.
>
> **Este arquivo é só do Cowork. O Claude Code NÃO edita `docs/fase-j.md`** — e ao commitar,
> commite o arquivo **como está no disco**, sem regravar a partir de cópia antiga. Não rode
> `git checkout`, `restore` ou `stash` em `docs/`.

---

## 0. Regras desta fase

1. **Uma etapa = um commit**, só depois do teste e da aprovação do Felipe. `npm run build` antes
   de cada push — **com o `npm run dev` parado** (os dois brigam pela pasta `.next`).
2. **SQL: o Claude Code nunca executa.** Escreve o arquivo em `supabase/migrations/` e o Felipe roda.
3. **Cores só por tokens semânticos.** Regras de perfil só em `permissoes.ts`. Datas `date` com
   `dataLocal`/`formatarData`; dinheiro com `moeda`.
4. **Teste com mensagem de verdade é mensagem de verdade.** Recado de teste chega na pessoa. Teste
   só entre **Pedro** e o login **Nice** (os dois são do Pedro), nunca mandando para a produção.
5. Nada de biblioteca nova. O Supabase Realtime já vem no `@supabase/supabase-js`.

## Decisões do Pedro (não reabrir)

- **Todos os perfis** mandam e recebem recado.
- **De pessoa para pessoa** (sem setor, sem "todos"). Cada par de pessoas tem uma conversa.
- **Privado entre as duas pessoas.** Nem o gestor lê a conversa dos outros — vale no banco (RLS).
- **Escrita livre** (até 500 caracteres) + respostas prontas: "Ok", "Já vou", "Preciso de ajuda", "Visto".
- ✓ enviado / ✓✓ visto.
- **Apaga sozinho depois de 30 dias** (pg_cron, todo dia 06:00 UTC = 03:00 em Brasília).
- Pode apontar para um pedido. Push no celular com o app fechado: **fase 2**, fora daqui.

---

## J0 — Migrations 018 (Felipe roda) + commit pendente  — feita (`17f853c`)

0. Commite a última anotação que ficou pendente em `docs/fase-i-registro.md` junto com os
   arquivos desta etapa.
1. Criar os dois arquivos abaixo em `supabase/migrations/`, exatamente assim, e **parar**:
   o Felipe roda o `018_recados.sql` primeiro, confere, e depois o `018b_recados_limpeza.sql`.

### `supabase/migrations/018_recados.sql`

```sql
-- 018 — Recados (Fase J): chat privado entre duas pessoas da equipe.
-- Idempotente. Rodar ANTES de subir qualquer código da Fase J.
--
-- Privacidade vale no BANCO: só quem mandou e quem recebeu leem a mensagem (RLS).
-- Nem gestor lê conversa dos outros — decisão do Pedro.
-- Depende de public.meu_id_equipe() (migration 016, já rodada em 29/08).

create table if not exists public.recados (
  id              uuid primary key default gen_random_uuid(),
  remetente_id    uuid not null references public.equipe(id) on delete cascade,
  destinatario_id uuid not null references public.equipe(id) on delete cascade,
  texto           text not null,
  pedido_id       uuid references public.pedidos(id) on delete set null,
  criado_em       timestamptz not null default now(),
  lido_em         timestamptz,
  constraint recados_texto_tamanho check (char_length(btrim(texto)) between 1 and 500),
  constraint recados_nao_para_si   check (remetente_id <> destinatario_id)
);

comment on table public.recados is
  'Recados (Fase J): mensagem de uma pessoa da equipe para outra. Privado entre as duas (RLS). Apagado depois de 30 dias (018b).';

create index if not exists recados_destinatario_naolido_idx on public.recados (destinatario_id, lido_em);
create index if not exists recados_par_idx on public.recados (remetente_id, destinatario_id, criado_em desc);
create index if not exists recados_criado_em_idx on public.recados (criado_em);

alter table public.recados enable row level security;

drop policy if exists recados_select on public.recados;
create policy recados_select on public.recados
  for select to authenticated
  using (remetente_id = public.meu_id_equipe() or destinatario_id = public.meu_id_equipe());

drop policy if exists recados_insert on public.recados;
create policy recados_insert on public.recados
  for insert to authenticated
  with check (remetente_id = public.meu_id_equipe() and lido_em is null);

-- Sem policy de UPDATE e de DELETE: ninguém altera nem apaga pela API.
-- "Visto" passa pela função abaixo; a limpeza de 30 dias pelo pg_cron (018b).

create or replace function public.marcar_recados_lidos(p_de uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.recados
     set lido_em = now()
   where destinatario_id = public.meu_id_equipe()
     and remetente_id = p_de
     and lido_em is null;
$$;
revoke all on function public.marcar_recados_lidos(uuid) from public;
grant execute on function public.marcar_recados_lidos(uuid) to authenticated;

-- A lista de pessoas para "Nova conversa". Security definer para não depender das policies
-- de `equipe` (criada à mão, fora do repo): devolve só id, nome e perfil.
create or replace function public.listar_equipe()
returns table (id uuid, nome text, perfil text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nome, e.perfil
    from public.equipe e
   where public.meu_id_equipe() is not null
   order by e.nome;
$$;
revoke all on function public.listar_equipe() from public;
grant execute on function public.listar_equipe() to authenticated;

-- Realtime: a mensagem chega na hora. O Realtime respeita a RLS de select acima.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recados'
  ) then
    alter publication supabase_realtime add table public.recados;
  end if;
end $$;

-- CONFERÊNCIA (uma linha só)
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'recados')                    as tabela,
  (select relrowsecurity from pg_class where oid = 'public.recados'::regclass)   as rls_ligado,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'recados')                       as policies,
  (select count(*) from pg_proc
    where proname in ('marcar_recados_lidos', 'listar_equipe'))                  as funcoes,
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'recados')               as realtime,
  (select count(*) from pg_proc where proname = 'meu_id_equipe')                 as meu_id_equipe_existe;
-- Esperado: 1 | true | 2 | 2 | 1 | 1
```

### `supabase/migrations/018b_recados_limpeza.sql`

```sql
-- 018b — Recados: apaga sozinho o que tem mais de 30 dias (Fase J).
-- Rodar DEPOIS da 018. Se o "create extension" der erro de permissão, ligue o pg_cron em
-- Database → Extensions → pg_cron no painel do Supabase e rode o arquivo de novo.

create extension if not exists pg_cron;

-- Idempotente: tira o agendamento antigo, se existir, e cria de novo.
select cron.unschedule(jobid) from cron.job where jobname = 'limpar-recados';

select cron.schedule(
  'limpar-recados',
  '0 6 * * *',   -- todo dia 06:00 UTC = 03:00 em Brasília
  $$ delete from public.recados where criado_em < now() - interval '30 days' $$
);

-- CONFERÊNCIA — esperado: uma linha, limpar-recados | 0 6 * * * | true
select jobname, schedule, active from cron.job where jobname = 'limpar-recados';
```

Commit (depois que o Felipe rodar e conferir):
`feat: tabela de recados com RLS, realtime e limpeza de 30 dias (migrations 018 e 018b)`

---

## J1 — Tipos + `src/lib/recados.ts` + permissão (sem tela)  — feita (`cf6459c`)

- `src/types/index.ts`: `Recado { id, remetenteId, destinatarioId, texto, pedidoId: string | null,
  criadoEm, lidoEm: string | null }` e `Conversa { outro: MembroEquipe, ultima: Recado,
  naoLidas: number }`.
- `src/lib/permissoes.ts`: `usarRecados: boolean` — `true` em `ACESSO_TOTAL` e em
  `LEITURA_PRODUCAO` (todos os perfis, decisão do Pedro).
- `src/lib/recados.ts` (client autenticado, função por função, como `kanban.ts`):
  - `TEXTO_MAX = 500`, `RESPOSTAS_RAPIDAS = ['Ok', 'Já vou', 'Preciso de ajuda', 'Visto']`.
  - `getEquipeRecados()` → `rpc('listar_equipe')`, sem a própria pessoa.
  - `getMeusRecados()` → `select('*').order('criado_em', { ascending: true })` (a RLS já traz
    só os meus; 30 dias é pouco).
  - `agruparConversas(recados, meuId, equipe): Conversa[]` — uma por pessoa, mais recente
    primeiro, `naoLidas` = recebidas com `lidoEm` nulo.
  - `enviarRecado({ remetenteId, destinatarioId, texto, pedidoId? })` — `texto.trim()`,
    recusa vazio ou > 500 antes de ir ao banco.
  - `marcarLidos(deId)` → `rpc('marcar_recados_lidos', { p_de: deId })`.
  - `assinarRecados(meuId, { aoInserir, aoAtualizar })` → um `channel('recados-' + meuId)`
    com dois `postgres_changes`: `INSERT` filtrando `destinatario_id=eq.{meuId}` (chegou recado)
    e `UPDATE` filtrando `remetente_id=eq.{meuId}` (o outro viu → ✓✓). Devolve a função que
    faz `removeChannel`.
  - Número do pedido para o link: reusar `numerosDePedidos` de `kanban.ts` (não duplicar).

Teste: `tsc`. Nenhuma tela muda. Commit: `feat: acesso a dados dos recados`

---

## J2 — Painel de recados + conversa  — feita (`ba88089`), testada ao vivo Pedro ↔ Nice

Painel e conversa entram juntos: um sem o outro não dá para testar. Mockup telas 1, 2, 3 e 6.
Arquivos novos em `src/components/recados/`.

### 1. `RecadosProvider.tsx` — o estado de tudo
- Montado no `AppShell`, envolvendo `Sidebar` e `main`, **só** com `membro` e
  `permissoes.usarRecados`. O `PainelRecados` é renderizado dentro dele, uma vez.
- Carrega `getEquipeRecados(membro.id)` + `getMeusRecados()` ao montar, e de novo quando a aba
  volta a ter foco (`visibilitychange`) — cobre mensagem perdida com o Realtime caído.
- `assinarRecados(membro.id, …)`: `aoInserir` junta o recado na lista (sem duplicar por `id`);
  se a conversa com o remetente está aberta, chama `marcarLidos`. `aoAtualizar` troca o recado
  pelo novo (✓ → ✓✓). Limpa a assinatura ao desmontar.
- Expõe `useRecados()`: `naoLidas` (total), `conversas` (`agruparConversas`), `recadosCom(id)`,
  `equipe`, `aberto`, `tela` (`'lista' | 'conversa' | 'nova'`), `conversaCom`, `pedidoAnexado`,
  `abrir()`, `abrirConversa(id)`, `abrirNova(pedidoId?)`, `fechar()`, `enviar(texto)`.
- `enviar`: põe o balão na hora com estado "enviando"; se `enviarRecado` falhar, o balão fica
  "Não enviado — tentar de novo" (nunca some em silêncio — regra 10). Deu certo: troca pelo
  recado que o banco devolveu.
- Título da aba: `(N) Nice Confecções` quando `naoLidas > 0`.

### 2. `PainelRecados.tsx` — a gaveta
- `fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-superficie border-l border-borda
  shadow-xl print:hidden`, com fundo escurecido atrás só no celular. Fecha com Esc e com o X.
- Tela `lista`: título "Recados", botão "Nova conversa", busca por nome, conversas (iniciais
  numa bolinha, nome, prévia da última mensagem com "Você: " quando é minha e ✓/✓✓, hora
  curta — HH:mm hoje, "ontem", dd/MM —, bolinha verde com não lidas). Vazio: "Nenhum recado
  ainda. Toque em Nova conversa." Rodapé: "Mensagens com mais de 30 dias somem sozinhas."
- Tela `nova` (`NovaConversa.tsx`): busca + pessoas em "Gestão" (gestor/recepcionista) e
  "Produção" (resto), com `PERFIL_LABEL`. Clicar abre a conversa.

### 3. `Conversa.tsx` — o chat
- Cabeçalho: voltar (para a lista), iniciais, nome, `PERFIL_LABEL`.
- Separador de dia ("Hoje", "Ontem", dd/MM). Balões: meus à direita
  (`bg-marca-suave border border-marca-borda`), do outro à esquerda (`bg-superficie
  border border-borda`), `whitespace-pre-wrap`, hora embaixo; nos meus, ✓ (`text-fraco`,
  enviado) ou ✓✓ (`text-marca-texto`, visto). Recado com `pedidoId`: link `#AAAA-NNNN` no topo do
  balão para `/pedidos/[id]` (número via `numerosDePedidos`, de `kanban.ts`).
- Chips de `RESPOSTAS_RAPIDAS`: mandam na hora.
- Campo: `textarea` que cresce até 4 linhas, `maxLength={TEXTO_MAX}`, contador a partir de 400,
  Enter envia, Shift+Enter quebra linha. Botão enviar redondo verde (`aria-label="Enviar"`).
  Se houver `pedidoAnexado`, um chip "#AAAA-NNNN ×" em cima do campo (vai no próximo envio e
  some). O clipe para escolher pedido fica para a J3.
- Ao abrir e a cada recado que chega com ela aberta: `marcarLidos(outroId)`. Rola para o fim
  ao abrir e ao chegar/enviar mensagem.

### 4. Onde abre
- **Sidebar** (`SidebarContent`): primeiro item do `nav`, um `<button className="sidebar-link">`
  "Recados" com `MessageCircle` e contador (`bg-superficie text-nice-800` sobre o verde) quando
  `naoLidas > 0`. Ativo (`bg-nice-500`) enquanto o painel está aberto.
- **Topbar do celular**: botão só-ícone `MessageCircle` com contador, antes do `BotaoTema`
  (`aria-label="Recados, N não lidos"`).
- Tudo só com `permissoes.usarRecados`.

### Teste (Cowork pelo navegador + Felipe)
- Painel abre e fecha; lista e "Nova conversa" mostram a equipe.
- **Mensagem de verdade só entre Pedro e o login Nice** (os dois do Pedro): mandar de um, ver
  chegar no outro sem recarregar, abrir e ver o ✓✓ aparecer no primeiro. Nunca para a produção.

Commit: `feat: recados — painel na sidebar e conversa estilo chat`

---

## J3 — Aviso de chegada + clipe + recado a partir do pedido  ← ATUAL

Mockup telas 2 (clipe), 4 (aviso) e 5 (pedido). Nada de migration: é só tela.

### 0. Acessibilidade que ficou da J2 (fazer primeiro, é pequeno)
- `Conversa.tsx` e a lista do `PainelRecados.tsx`: o ✓ / ✓✓ ganha `aria-hidden="true"` e,
  ao lado, `<span className="sr-only">enviado</span>` / `<span className="sr-only">visto</span>`.
  Balão `pendente: 'enviando'` → sr-only "enviando".

### 1. `src/components/recados/AvisoRecado.tsx` — o cartão de "chegou recado"
- **Quando aparece:** no `aoInserir` do `RecadosProvider`, **só para recado que chegou pelo
  Realtime** (nunca para os não lidos carregados ao abrir a página ou no `visibilitychange`),
  e só se a conversa daquela pessoa **não** estiver aberta (mesma condição que hoje decide o
  `marcarConversaLida`, invertida).
- **Onde:** renderizado pelo `RecadosProvider` (ao lado do `<PainelRecados />`), `fixed`
  no canto inferior direito (`bottom-4 right-4`, largura ~340px); no celular ocupa a largura
  com `left-4 right-4`. Acima do conteúdo, abaixo de modais (`z-40`, conferir com os modais
  existentes). Cores só por token (`bg-superficie`, borda e textos semânticos, detalhe
  `nice-*`), igual ao painel.
- **Conteúdo:** iniciais + nome de quem mandou, prévia do texto (1–2 linhas, `line-clamp-2`),
  "Pedido #xxxx" se vier ligado a pedido (reusar `numerosDePedidos`), e três controles:
  - **Responder** → `abrirConversa(remetenteId)` e fecha o cartão.
  - **Ok** → manda "Ok" para essa pessoa **sem abrir o painel**, marca a conversa dela como
    lida e fecha o cartão. Precisa de uma função nova no contexto, p.ex.
    `responderRapido(destinatarioId, texto)`, que reaproveita `enviarPara` (balão otimista +
    erro) — `enviar` atual depende de `conversaCom`, não serve.
  - **X** (`aria-label="Fechar aviso"`) → só fecha.
- **Tempo:** some sozinho em 8 s; o tempo **pausa** enquanto o mouse está em cima ou o foco
  está dentro do cartão.
- **Vários:** no máximo 3 empilhados, o mais novo embaixo (perto do canto); chegou o 4º, sai o
  mais antigo. Se a **mesma pessoa** manda de novo com o cartão dela aberto, **troca** o cartão
  dela (texto novo, reinicia os 8 s) em vez de empilhar outro.
- **Some também** quando a pessoa abre aquela conversa por outro caminho (painel).
- **Leitor de tela:** o contêiner da pilha é `role="status"` + `aria-live="polite"`. **Não
  roubar foco** — o cartão aparece, mas o foco fica onde estava.
- Sem som, sem notificação do navegador (fica para depois, se o Pedro pedir).

### 2. Clipe na conversa — ligar um pedido
- `Conversa.tsx`: botão `Paperclip` à esquerda do campo de texto (`aria-label="Ligar a um
  pedido"`, 40px de alvo). Só aparece se o perfil pode abrir `/pedidos` — usar a função de
  rota que já existe em `permissoes.ts` (a que compara por prefixo), não inventar regra nova.
- Abre um popover acima do campo: busca (número ou cliente) + lista de até 8 pedidos.
  Dados: `getPedidosLista({ statusExcluir: ['cancelado', 'entregue'] })` de `store.ts`,
  carregado **só quando o clipe abre pela primeira vez** (guardar em estado, não recarregar
  a cada abertura). Cada linha: número + cliente (nome ou empresa).
- Escolher um pedido → chip do pedido anexado (o mesmo da J2, com "×"). Precisa de
  `anexarPedido(id)` no contexto (hoje só existe `removerPedidoAnexado`). Um pedido por recado.
- Esc ou clique fora fecha o popover e devolve o foco ao clipe. Setas + Enter escolhem na
  lista seria ótimo; no mínimo, cada linha é um `<button>` alcançável por Tab.
- Sem resultado: "Nenhum pedido encontrado".

### 3. `/pedidos/[id]` — botão "Mandar recado"
- No cabeçalho da página do pedido, junto das ações que já existem: botão secundário
  `MessageCircle` + "Mandar recado", só com `permissoes.usarRecados`.
- Clique → `abrirNova(pedido.id)`: o painel abre em "Nova conversa" e, ao escolher a pessoa,
  a conversa abre com o chip do pedido já anexado (o `abrirConversa` não limpa
  `pedidoAnexado` — conferir que continua assim).
- No celular o botão pode ficar só com o ícone, com `aria-label="Mandar recado sobre este
  pedido"`.

### 4. Correções achadas no teste do Cowork (25/09, 21:20–21:47) — fazer antes de commitar

**4a. Realtime não entrega nada (bug desde a J2 — o mais importante).** O teste mostrou que o
recado **nunca** chega ao vivo: o contador só subia quando a página voltava a ficar visível
(o recarregamento do `visibilitychange`). Por isso o cartão de aviso nunca aparece. No Supabase,
`realtime.subscription` mostra as assinaturas do sistema (`destinatario_id=eq…` /
`remetente_id=eq…`) com papel **`anon`**: o canal entra antes do token da sessão estar no
cliente de Realtime, e a policy `recados_select` é `to authenticated` — então o banco descarta
todo evento em silêncio.
- Correção em `assinarRecados` (`src/lib/recados.ts`): antes de `.subscribe()`, pegar a sessão
  (`await supabase.auth.getSession()`) e chamar `supabase.realtime.setAuth(session.access_token)`.
  Como vira assíncrono, a função continua devolvendo a limpeza **na hora**: usar uma flag
  `cancelado` e, se a limpeza rodar antes do canal existir, não criar o canal (ou removê-lo
  assim que for criado). Sem sessão → não assina.
- Conferir no `.subscribe((status, err) => …)`: em `CHANNEL_ERROR`/`TIMED_OUT`, `console.warn`
  com o motivo (só log, sem banner). Token renovado depois: o supabase-js já repassa ao
  Realtime no `TOKEN_REFRESHED` — conferir que a versão instalada faz isso; se não fizer, um
  `onAuthStateChange` que chama `setAuth` de novo.
- Conferência (Felipe roda depois, no SQL Editor): as assinaturas novas de `public.recados`
  devem aparecer com `claims_role = authenticated`.

**4b. Esc do clipe fecha o painel inteiro.** Com o popover do clipe aberto, Esc fecha o popover
**e** a gaveta (os dois escutam `keydown` no `window`). Correção: em `ClipePedido`, registrar o
`keydown` em fase de captura (`addEventListener('keydown', fn, true)`) e, no Esc,
`e.preventDefault()` antes de fechar; em `PainelRecados`, só fechar se `!e.defaultPrevented`.

**4c. Região do aviso sempre montada.** `AvisoRecado` hoje devolve `null` sem avisos — a região
`role="status"` some da página e o leitor de tela pode não anunciar o primeiro cartão. Deixar o
contêiner `role="status" aria-live="polite"` sempre renderizado (vazio quando não há aviso;
sem padding/altura, para não bloquear clique na tela).

### Teste (Cowork pelo navegador + Felipe)
- **Recado de verdade só entre Pedro e o login Nice.** Nunca para outras pessoas.
- Com o Nice numa página qualquer e o painel fechado: Pedro manda → cartão aparece no Nice;
  "Ok" responde sem abrir o painel e o Pedro recebe; "Responder" abre a conversa certa.
- Três recados seguidos do Pedro → um cartão só (troca), não três.
- Recarregar a página com não lidos → **nenhum** cartão (só o contador).
- Pedro abre um pedido, "Mandar recado" → escolhe Nice → chip do pedido → envia → no Nice o
  balão tem o link "Pedido #xxxx" que abre o pedido certo.
- Clipe: buscar por número e por cliente, anexar, remover com "×", Esc fecha.
- `tsc` limpo; build só com o dev parado.

Commit (só depois da revisão do Cowork): `feat: aviso de recado novo e recado a partir do pedido`

---

## J4 — CHANGELOG.md e CLAUDE.md  (não executar ainda)

O texto será escrito aqui pelo Cowork depois da J3.

---

## Registro

Fica em **`docs/fase-j-registro.md`**. Este arquivo é só do Cowork.
