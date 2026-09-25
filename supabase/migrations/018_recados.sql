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
