-- 019 — Almoxarifado (Fase K): materiais e movimentos de estoque.
-- Idempotente. Rodar ANTES de subir qualquer código da Fase K.
--
-- Modelo: o saldo de cada material é a soma dos seus movimentos. O trigger
-- estoque_aplicar_movimento atualiza materiais.saldo a cada insert, dentro da
-- mesma transação (o UPDATE trava a linha do material, então dois movimentos
-- simultâneos no mesmo material entram em fila, não se perdem).
--
-- Decisões do Pedro: malha em kg, tecido plano em metro, só total por
-- tecido + cor (sem rolo, sem lote).
-- Depende de public.meu_perfil() e public.meu_id_equipe() (já existem).

begin;

create table if not exists public.materiais (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (char_length(btrim(nome)) between 1 and 80),
  -- '' = item sem cor (zíper, tinta, embalagem). Não nulo de propósito: o
  -- índice único abaixo não enxerga duplicata quando a coluna é null.
  cor             text not null default '' check (char_length(cor) <= 40),
  categoria       text not null check (categoria in
                    ('malha','tecido_plano','aviamento','estamparia','embalagem','outro')),
  unidade         text not null check (unidade in ('kg','m','un','cone','rolo','l')),
  saldo           numeric(12,3) not null default 0,
  estoque_minimo  numeric(12,3) check (estoque_minimo is null or estoque_minimo >= 0),
  local           text check (local is null or char_length(local) <= 40),
  -- Último custo conhecido por unidade. Só informativo (valor do estoque);
  -- o histórico de preço fica em cada movimento de entrada.
  custo_unitario  numeric(10,2) check (custo_unitario is null or custo_unitario >= 0),
  observacoes     text,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.materiais is
  'Almoxarifado (Fase K): tecido, aviamento e insumo. saldo é DERIVADO de estoque_movimentos — nunca editar à mão pela aplicação.';

create unique index if not exists materiais_nome_cor_key
  on public.materiais (lower(btrim(nome)), lower(btrim(cor)));

create table if not exists public.estoque_movimentos (
  id              uuid primary key default gen_random_uuid(),
  material_id     uuid not null references public.materiais(id),
  tipo            text not null check (tipo in ('entrada','saida','devolucao','ajuste')),
  quantidade      numeric(12,3) not null,
  -- Preenchido pelo trigger: o saldo do material logo depois deste movimento.
  saldo_depois    numeric(12,3),
  pedido_id       uuid references public.pedidos(id) on delete set null,
  fornecedor      text check (fornecedor is null or char_length(fornecedor) <= 80),
  nota_fiscal     text check (nota_fiscal is null or char_length(nota_fiscal) <= 40),
  custo_unitario  numeric(10,2) check (custo_unitario is null or custo_unitario >= 0),
  observacao      text check (observacao is null or char_length(observacao) <= 300),
  feito_por       uuid references public.equipe(id),
  criado_em       timestamptz not null default now(),
  constraint estoque_movimentos_sinal check (
    (tipo in ('entrada','devolucao') and quantidade > 0) or
    (tipo = 'saida'  and quantidade < 0) or
    (tipo = 'ajuste' and quantidade <> 0)
  )
);

comment on table public.estoque_movimentos is
  'Almoxarifado (Fase K): toda entrada, saída, devolução e ajuste. Imutável — correção é um ajuste novo.';

create index if not exists estoque_mov_material_idx on public.estoque_movimentos (material_id, criado_em desc);
create index if not exists estoque_mov_criado_idx   on public.estoque_movimentos (criado_em desc);
create index if not exists estoque_mov_pedido_idx   on public.estoque_movimentos (pedido_id);

-- ---------------------------------------------------------------------------
-- Trigger 1: aplica o movimento no saldo. security definer porque o corte
-- grava movimento mas não tem UPDATE em materiais (RLS).
-- ---------------------------------------------------------------------------
create or replace function public.estoque_aplicar_movimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric(12,3);
begin
  new.feito_por := coalesce(new.feito_por, public.meu_id_equipe());

  update public.materiais
     set saldo = saldo + new.quantidade,
         updated_at = now()
   where id = new.material_id
  returning saldo into v_saldo;

  if not found then
    raise exception 'material % não existe', new.material_id;
  end if;

  new.saldo_depois := v_saldo;
  return new;
end
$$;

drop trigger if exists estoque_movimentos_aplicar on public.estoque_movimentos;
create trigger estoque_movimentos_aplicar
  before insert on public.estoque_movimentos
  for each row execute function public.estoque_aplicar_movimento();

-- ---------------------------------------------------------------------------
-- Trigger 2: protege materiais.saldo (regra K-1). Pela aplicação, o saldo
-- nasce 0 e só muda via trigger 1 (pg_trigger_depth() > 1). No SQL Editor
-- (meu_perfil() nulo) passa — a trava é para o app, não para o dono do banco,
-- mesmo raciocínio do guard da migration 013.
-- ---------------------------------------------------------------------------
create or replace function public.materiais_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.meu_perfil() is not null then
    if tg_op = 'INSERT' then
      new.saldo := 0;
    elsif new.saldo is distinct from old.saldo and pg_trigger_depth() < 2 then
      raise exception 'saldo só muda por movimento de estoque (regra K-1)';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists materiais_guard on public.materiais;
create trigger materiais_guard
  before insert or update on public.materiais
  for each row execute function public.materiais_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.materiais          enable row level security;
alter table public.estoque_movimentos enable row level security;

drop policy if exists materiais_select on public.materiais;
create policy materiais_select on public.materiais
  for select to authenticated
  using (public.meu_perfil() in ('gestor','recepcionista','corte'));

drop policy if exists materiais_insert on public.materiais;
create policy materiais_insert on public.materiais
  for insert to authenticated
  with check (public.meu_perfil() in ('gestor','recepcionista'));

drop policy if exists materiais_update on public.materiais;
create policy materiais_update on public.materiais
  for update to authenticated
  using      (public.meu_perfil() in ('gestor','recepcionista'))
  with check (public.meu_perfil() in ('gestor','recepcionista'));
-- Sem policy de delete: material nunca é excluído (regra K-3).

drop policy if exists estoque_mov_select on public.estoque_movimentos;
create policy estoque_mov_select on public.estoque_movimentos
  for select to authenticated
  using (public.meu_perfil() in ('gestor','recepcionista','corte'));

drop policy if exists estoque_mov_insert on public.estoque_movimentos;
create policy estoque_mov_insert on public.estoque_movimentos
  for insert to authenticated
  with check (
    feito_por = public.meu_id_equipe()
    and (
      public.meu_perfil() in ('gestor','recepcionista')
      or (public.meu_perfil() = 'corte' and tipo in ('saida','devolucao'))
    )
  );
-- Sem policy de update/delete: movimento é imutável (regra K-2).

commit;

-- Conferência (rodar depois, separado). Esperado: 2 | true | true | 5 | 2
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('materiais','estoque_movimentos')) as tabelas,
  (select relrowsecurity from pg_class where relname = 'materiais')                 as rls_materiais,
  (select relrowsecurity from pg_class where relname = 'estoque_movimentos')        as rls_movimentos,
  (select count(*) from pg_policies
    where tablename in ('materiais','estoque_movimentos'))                          as policies,
  (select count(*) from pg_trigger
    where tgname in ('estoque_movimentos_aplicar','materiais_guard'))               as triggers;
