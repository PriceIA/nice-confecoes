-- ===========================================================================
-- FASE D3a — Catálogo de etapas de produção
--
-- NÃO EXECUTADO PELO CLAUDE CODE. Rodar manualmente no Supabase SQL Editor,
-- DEPOIS de conferir o resultado de 014_fase_d_auditoria.sql.
--
-- Por que esta tabela existe
-- --------------------------
-- Até aqui, os 8 setores de produção eram chaves fixas no código
-- (SETOR_LABELS, src/lib/helpers.ts). O Pedro precisa criar etapas que não
-- existem lá — bordado, lavanderia — e isso não pode depender de deploy.
--
-- A alternativa seria guardar o catálogo em localStorage, como /configuracoes
-- faz com o catálogo de peças. Não serve: o CLAUDE.md já registra essa
-- escolha como dívida ("não vai para o banco nem é compartilhado entre
-- dispositivos"), e um fluxo de produção que muda de PC para PC é pior do que
-- não ter fluxo configurável.
--
-- O padrão seguido é o mesmo que a Fase C2 validou na tabela de preços: a
-- constante do código vira SEMENTE (ETAPAS_PADRAO, src/lib/etapas.ts) e o
-- banco vira a fonte. O código tolera esta migration não ter rodado ainda —
-- `carregarEtapas` trata o erro 42P01 (relação inexistente) caindo na semente,
-- exatamente como `carregarPrecos` trata o 42703. Ou seja: subir o código
-- antes de rodar este SQL não quebra nada.
--
-- O que NÃO está aqui, de propósito
-- ---------------------------------
-- A ordem das etapas DE UM PEDIDO não fica nesta tabela. Ela mora no JSONB
-- `pedidos.progresso`, no campo `ordem` de cada entrada — porque é por pedido,
-- não global. `etapas_producao.ordem` é só a ordem PADRÃO, usada para semear
-- pedido novo e para listar o catálogo.
--
-- Isso não precisa de migration nenhuma: `progresso` é JSONB sem schema, e
-- `atualizar_progresso_pedido` (009_rls_fase_b.sql) grava a coluna inteira sem
-- validar chave nem status. Conferido lendo o corpo da função.
-- ===========================================================================

begin;

create table if not exists public.etapas_producao (
  -- A chave é o que vai para dentro de `pedidos.progresso`. É ela, e não o
  -- rótulo, que identifica a etapa: renomear "Bordado" para "Bordado manual"
  -- não pode perder o status gravado nos pedidos.
  chave      text primary key
               check (chave ~ '^[a-z][a-z0-9_]{1,39}$'),
  rotulo     text not null
               check (char_length(btrim(rotulo)) between 1 and 40),
  -- Ordem PADRÃO, para semear pedido novo. A ordem de um pedido específico
  -- vive no JSONB dele.
  ordem      integer not null,
  -- Etapa desativada some dos seletores e de pedidos novos, mas continua
  -- nomeando o que já está gravado em pedidos antigos.
  ativa      boolean not null default true,
  -- As 8 originais. Não podem ser excluídas: a chave delas está dentro do
  -- JSONB de todos os pedidos já gravados, e apagar a linha do catálogo
  -- deixaria esses setores sem nome na tela.
  canonica   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists etapas_producao_ordem_idx
  on public.etapas_producao (ordem, chave);

-- ---------------------------------------------------------------------------
-- Semente: as 8 canônicas, com os MESMOS rótulos de SETOR_LABELS
-- (src/lib/helpers.ts). Os dois precisam concordar — é o mesmo acordo que
-- existe hoje entre `precosEscolar.ts`, o CATALOGO e a migration 006.
--
-- `on conflict do nothing`: re-executar este arquivo não sobrescreve um
-- rótulo que o Pedro já tenha mudado pela tela.
-- ---------------------------------------------------------------------------
insert into public.etapas_producao (chave, rotulo, ordem, canonica) values
  ('atendimento',       'Atendimento',           1, true),
  ('compra',            'Compra',                2, true),
  ('corte',             'Corte',                 3, true),
  ('costura',           'Costura',               4, true),
  ('estamparia_silk',   'Estamparia Silk',       5, true),
  ('prensa_dtf',        'Prensa DTF',            6, true),
  ('prensa_sublimacao', 'Prensa Sublimação',     7, true),
  ('acabamento',        'Acabamento/Embalagem',  8, true)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------
-- RLS — mesmo modelo das outras tabelas de negócio.
--
-- Leitura para QUALQUER perfil com linha em `equipe`: os 6 perfis de chão de
-- fábrica precisam ler o catálogo para a tela de produção conseguir escrever o
-- nome de cada etapa. Restringir o select aqui faria os cards aparecerem com a
-- chave crua ("extra_7f3a91") no lugar do nome — e sem erro nenhum, que é
-- justamente o modo de falha que este projeto já documentou: RLS que barra não
-- dá erro, dá zero linhas.
-- ---------------------------------------------------------------------------
alter table public.etapas_producao enable row level security;

drop policy if exists etapas_producao_select on public.etapas_producao;
create policy etapas_producao_select on public.etapas_producao
  for select to authenticated
  using (public.meu_perfil() is not null);

drop policy if exists etapas_producao_insert on public.etapas_producao;
create policy etapas_producao_insert on public.etapas_producao
  for insert to authenticated
  with check (public.meu_perfil() in ('gestor', 'recepcionista'));

drop policy if exists etapas_producao_update on public.etapas_producao;
create policy etapas_producao_update on public.etapas_producao
  for update to authenticated
  using      (public.meu_perfil() in ('gestor', 'recepcionista'))
  with check (public.meu_perfil() in ('gestor', 'recepcionista'));

-- DELETE nunca alcança as 8 canônicas. A trava vale no BANCO, não só no botão
-- escondido da tela: RLS é por linha, e "esta linha não" é exatamente o que uma
-- policy de delete sabe expressar. Sem isso, um DELETE direto no PostgREST com
-- a sessão da Kalomira apagaria 'corte' do catálogo e todos os pedidos ficariam
-- com um setor sem nome.
drop policy if exists etapas_producao_delete on public.etapas_producao;
create policy etapas_producao_delete on public.etapas_producao
  for delete to authenticated
  using (public.meu_perfil() in ('gestor', 'recepcionista') and not canonica);

commit;
