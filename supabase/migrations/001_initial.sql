-- Nice Confecções — schema inicial (Supabase)
-- Sem autenticação por enquanto: RLS desabilitado em todas as tabelas.

create extension if not exists pgcrypto;

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  empresa text,
  telefone text,
  email text,
  data_cadastro timestamptz not null default now()
);

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  cliente_id uuid references clientes(id) on delete set null,
  tipo text not null,
  status text not null,
  data_entrada timestamptz not null default now(),
  data_entrega date,
  valor_total numeric not null default 0,
  valor_pago numeric not null default 0,
  observacoes text,
  pecas jsonb not null default '[]'::jsonb,
  progresso jsonb not null default '{}'::jsonb
);

create table if not exists terceirizadas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null,
  pedido_id uuid references pedidos(id) on delete set null,
  numero_pedido text,
  itens text,
  data_envio date,
  data_retorno_previsto date,
  data_retorno_real date,
  valor_combinado numeric not null default 0,
  valor_pago numeric not null default 0,
  status text not null,
  observacoes text
);

create index if not exists pedidos_cliente_id_idx on pedidos(cliente_id);
create index if not exists terceirizadas_pedido_id_idx on terceirizadas(pedido_id);

alter table clientes disable row level security;
alter table pedidos disable row level security;
alter table terceirizadas disable row level security;
