-- Kanban de quadros livres: função meu_perfil(), tabelas quadros/listas/cards
-- com RLS, e a expansão de `equipe` para 8 perfis.
--
-- NÃO EXECUTADO PELO CLAUDE CODE. Este arquivo é REGISTRO HISTÓRICO: o dono já
-- rodou este SQL manualmente no Supabase SQL Editor antes da implementação do
-- código. Está aqui para o schema ficar versionado junto do repo.
--
-- ATENÇÃO: foi reconstruído a partir da descrição do que foi executado, não
-- exportado do banco. Se o SQL realmente aplicado divergir (nomes de policy,
-- defaults, on delete), vale colar o original por cima deste arquivo — caso
-- contrário ele passa a mentir sobre o estado do banco.
--
-- JÁ DIVERGIU UMA VEZ: as colunas `updated_at` declaradas abaixo não existiam
-- no banco real. Ver `008_kanban_updated_at.sql`.
--
-- Decisões relevantes para quem for mexer:
--
-- 1. Estas são as PRIMEIRAS tabelas do sistema com RLS LIGADO. As antigas
--    (clientes, pedidos, terceirizadas, tabela_precos) seguem com RLS
--    desabilitado — a Fase B continua pendente. Ver CLAUDE.md.
--
-- 2. Por isso, todo acesso a estas três tabelas usa o client AUTENTICADO
--    (src/lib/kanban.ts). O client anônimo do store.ts não tem sessão, então
--    auth.uid() seria null e as policies devolveriam ZERO LINHAS em silêncio.
--
-- 3. meu_perfil() é `security definer` porque precisa ler `equipe` de dentro
--    das policies. `search_path` fixo em uma linha só, para não abrir caminho
--    de escalonamento por schema.
--
-- 4. `posicao` é numeric, não integer, de propósito: mover um cartão grava UMA
--    linha com a média das posições vizinhas, em vez de reindexar a lista
--    inteira. Ver posicaoEntre() em src/lib/kanban.ts.
--
-- 5. `perfis_visiveis` nulo significa PÚBLICO (todos os perfis veem). A policy
--    de select em `cards` trata null e a inclusão do perfil como equivalentes.

-- ---------------------------------------------------------------------------
-- Perfis: de 3 para 8
-- ---------------------------------------------------------------------------

alter table equipe drop constraint if exists equipe_perfil_check;

alter table equipe add constraint equipe_perfil_check check (perfil in (
  'gestor',
  'recepcionista',
  'designer',
  'corte',
  'costureira',
  'estamparia_serigrafia',
  'estamparia_sublimacao',
  'acabamento'
));

-- Espelhado no tipo `Perfil` em src/lib/permissoes.ts. Ao mexer aqui, mexa lá.

-- ---------------------------------------------------------------------------
-- Perfil do usuário logado, para as policies
-- ---------------------------------------------------------------------------

create or replace function public.meu_perfil()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select perfil from equipe where auth_user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists quadros (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  arquivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists listas (
  id uuid primary key default gen_random_uuid(),
  quadro_id uuid not null references quadros(id) on delete cascade,
  titulo text not null,
  posicao numeric not null default 1024,
  cor text not null default 'verde',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references listas(id) on delete cascade,
  titulo text not null,
  descricao text,
  posicao numeric not null default 1024,
  perfis_visiveis text[],
  pedido_id uuid references pedidos(id) on delete set null,
  prazo date,
  concluido boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listas_quadro_id_idx on listas(quadro_id);
create index if not exists cards_lista_id_idx on cards(lista_id);
create index if not exists cards_pedido_id_idx on cards(pedido_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table quadros enable row level security;
alter table listas  enable row level security;
alter table cards   enable row level security;

-- quadros e listas: todos os perfis leem, só gestor e recepcionista escrevem.

create policy quadros_select on quadros
  for select using (meu_perfil() is not null);

create policy quadros_write on quadros
  for all
  using      (meu_perfil() in ('gestor', 'recepcionista'))
  with check (meu_perfil() in ('gestor', 'recepcionista'));

create policy listas_select on listas
  for select using (meu_perfil() is not null);

create policy listas_write on listas
  for all
  using      (meu_perfil() in ('gestor', 'recepcionista'))
  with check (meu_perfil() in ('gestor', 'recepcionista'));

-- cards: gestor e recepcionista veem todos; os demais perfis só veem os cartões
-- públicos (perfis_visiveis nulo) ou que listem o próprio perfil.

create policy cards_select on cards
  for select using (
    meu_perfil() in ('gestor', 'recepcionista')
    or perfis_visiveis is null
    or meu_perfil() = any (perfis_visiveis)
  );

create policy cards_write on cards
  for all
  using      (meu_perfil() in ('gestor', 'recepcionista'))
  with check (meu_perfil() in ('gestor', 'recepcionista'));
