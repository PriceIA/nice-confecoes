# Fase J — Recados (chat entre duas pessoas)

**Spec escrita em 25/09/2026 pelo Claude (Cowork), com as respostas do Pedro.** Mockup:
artifact "Recados — mockup" (6 telas).

> **ETAPA ATUAL: commit da J1 → J2.** Uma etapa por vez. Terminou a J2? Registre em
> `docs/fase-j-registro.md` e pare, sem commitar a J2.
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

## J1 — Tipos + `src/lib/recados.ts` + permissão (sem tela)  — aprovada pelo Cowork; falta o commit

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

## J2 — Painel de recados + conversa  ← ATUAL (depois do commit da J1)

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

## J3 — Aviso de chegada + recado a partir do pedido  (não executar ainda)

Mockup telas 4 e 5.
- `AvisoRecado.tsx`: chegou recado e a conversa daquela pessoa não está aberta → cartão no canto
  inferior direito (`role="status"`), com "Responder" (abre a conversa) e "Ok" (manda "Ok").
  Some em 8 s ou no X. Vários seguidos: empilha no máximo 3.
- Clipe na conversa para ligar um pedido (busca por número, `getPedidosLista`).
- `/pedidos/[id]`: botão "Mandar recado" no cabeçalho (só com `usarRecados`) → `abrirNova(pedido.id)`.

Commit: `feat: aviso de recado novo e recado a partir do pedido`

---

## J4 — CHANGELOG.md e CLAUDE.md  (não executar ainda)

O texto será escrito aqui pelo Cowork depois da J3.

---

## Registro

Fica em **`docs/fase-j-registro.md`**. Este arquivo é só do Cowork.
