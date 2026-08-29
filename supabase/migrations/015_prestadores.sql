-- ===========================================================================
-- FASE D2.1 — Cadastro de prestadores terceirizados e preço por serviço
--
-- JÁ EXECUTADA pelo Pedro no SQL Editor em 29/08/2026. Este arquivo é
-- reconstrução do SQL colado por ele, versionada aqui pelo mesmo motivo que
-- 007_kanban.sql é reconstrução: o repo precisa ter registro de todo schema
-- que existe de verdade, mesmo quando a execução não passou por este arquivo
-- primeiro.
--
-- Por que existe
-- --------------
-- `terceirizadas.nome` sempre foi texto livre — "Talícia", "Quésia", digitado
-- de novo em cada lançamento. Sem cadastro, não tinha como saber quanto se
-- cobra por peça de cada prestadora sem abrir o histórico e procurar.
--
-- O que NÃO muda
-- ---------------
-- `terceirizadas.nome` continua existindo e sendo o que a tela mostra. Ele
-- passa a ser PREENCHIDO a partir do prestador escolhido, mas não vira FK
-- obrigatória — prestador excluído (se algum dia isso acontecer) não pode
-- apagar o nome do histórico de quem já foi lançado. É por isso que
-- `prestador_id` em `terceirizadas` é opcional e sem `on delete cascade`.
--
-- `valor_unitario` em `terceirizadas` é uma CÓPIA do valor em
-- `prestador_servicos` no momento do lançamento, não uma referência viva. Se
-- o Pedro editar o preço da Vera em outubro, lançamentos de setembro
-- continuam com o valor antigo — é histórico financeiro, não devia mudar
-- sozinho.
-- ===========================================================================

begin;

create table if not exists public.prestadores (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null check (char_length(btrim(nome)) between 1 and 80),
  telefone     text,
  documento    text,
  observacoes  text,
  -- Nunca excluído pela tela — só desativado. Ativo=false some dos seletores
  -- de novo lançamento, mas o prestador continua existindo para o histórico
  -- que já referencia ele.
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.prestador_servicos (
  id            uuid primary key default gen_random_uuid(),
  prestador_id  uuid not null references public.prestadores(id) on delete cascade,
  servico       text not null check (char_length(btrim(servico)) between 1 and 60),
  valor         numeric(10,2) not null check (valor >= 0),
  -- 'peca': valor × quantidade. 'fixo': valor não escala com quantidade
  -- (ex.: frete, ajuste avulso).
  unidade       text not null default 'peca' check (unidade in ('peca','fixo')),
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Mesma prestadora não pode ter dois serviços com o mesmo nome — é o que
  -- garante que o texto gravado em `terceirizadas.servico` identifica um
  -- preço sem ambiguidade no momento do lançamento.
  unique (prestador_id, servico)
);

-- `servico`, `quantidade` e `valor_unitario` nullable de propósito: um
-- lançamento "outro/avulso" (sem prestador do catálogo) não tem nenhum dos
-- três, e lançamento gravado antes desta migration não tinha de onde vir
-- esses valores. `prestador_id` sem `on delete cascade`: apagar um prestador
-- com lançamento vinculado é bloqueado pelo banco, não é decisão da tela.
alter table public.terceirizadas
  add column if not exists prestador_id   uuid references public.prestadores(id),
  add column if not exists servico        text,
  add column if not exists quantidade     numeric(10,2),
  add column if not exists valor_unitario numeric(10,2);

-- ---------------------------------------------------------------------------
-- RLS — mesmo modelo do resto do sistema (`meu_perfil()`, ver CLAUDE.md).
-- Leitura para qualquer perfil com linha em `equipe`; escrita só
-- gestor/recepcionista, igual `terceirizadas` já era.
-- ---------------------------------------------------------------------------
alter table public.prestadores enable row level security;
alter table public.prestador_servicos enable row level security;

drop policy if exists prestadores_select on public.prestadores;
create policy prestadores_select on public.prestadores
  for select to authenticated
  using (public.meu_perfil() is not null);

drop policy if exists prestadores_write on public.prestadores;
create policy prestadores_write on public.prestadores
  for all to authenticated
  using      (public.meu_perfil() in ('gestor','recepcionista'))
  with check (public.meu_perfil() in ('gestor','recepcionista'));

drop policy if exists prestador_servicos_select on public.prestador_servicos;
create policy prestador_servicos_select on public.prestador_servicos
  for select to authenticated
  using (public.meu_perfil() is not null);

drop policy if exists prestador_servicos_write on public.prestador_servicos;
create policy prestador_servicos_write on public.prestador_servicos
  for all to authenticated
  using      (public.meu_perfil() in ('gestor','recepcionista'))
  with check (public.meu_perfil() in ('gestor','recepcionista'));

commit;
