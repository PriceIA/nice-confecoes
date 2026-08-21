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
