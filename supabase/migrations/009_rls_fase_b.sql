-- Fase B: liga RLS em pedidos, clientes, terceirizadas e tabela_precos.
--
-- NÃO EXECUTADO PELO CLAUDE CODE. Rodar manualmente no Supabase SQL Editor,
-- SÓ DEPOIS que o código que troca store.ts (e /tabela-precos) para o client
-- autenticado (criarClienteBrowser(), @supabase/ssr) já estiver em produção.
--
-- ORDEM IMPORTA E É IRREVERSÍVEL NA PRÁTICA: se este SQL rodar antes do
-- deploy do código novo, o app em produção continua lendo/gravando essas
-- quatro tabelas com o client ANÔNIMO — sem sessão, auth.uid() vira null,
-- toda policy abaixo falha, e todo mundo (gestor incluído) passa a ver
-- listas vazias e updates que não gravam, SEM ERRO NENHUM NA TELA. É
-- exatamente o modo de falha que este projeto já documentou no CLAUDE.md
-- ("RLS que barra não dá erro, dá zero linhas").
--
-- Rode a auditoria (arquivo separado, só SELECT) antes desta execução.
--
-- Decisões:
--
-- 1. Segue o mesmo padrão do Kanban (007_kanban.sql): policies via
--    meu_perfil() (security definer, já existe), sem duplicar a leitura de
--    `equipe` em cada policy.
--
-- 2. `pedidos` e `clientes` têm SELECT liberado pra qualquer perfil com linha
--    em `equipe` — os seis perfis de chão de fábrica leem /pedidos e
--    /producao, que mostram nome/empresa do cliente via join. Restringir
--    SELECT de `clientes` só a gestor/recepcionista quebraria esse join em
--    silêncio (nome do cliente sumiria da tela de quem não é admin).
--
-- 3. INSERT/UPDATE/DELETE em `pedidos` e `clientes`, e tudo em
--    `terceirizadas`/`tabela_precos`, só gestor/recepcionista — espelha
--    exatamente `criarPedido`/`editarPedido`/`excluirPedido` e o fato de
--    `/terceirizadas`, `/tabela-precos` e `/novo-pedido` nem aparecerem pro
--    perfil de chão de fábrica (src/lib/permissoes.ts).
--
-- 4. RLS é por LINHA, não por coluna — não dá pra restringir UPDATE em
--    `pedidos` a "só a coluna progresso" com uma policy comum. Por isso
--    `pedidos_write` (like quadros_write/listas_write no Kanban) bloqueia
--    UPDATE direto pra quem não é gestor/recepcionista, e quem tem só
--    editarProducao (todos os 8 perfis) passa pela função
--    atualizar_progresso_pedido abaixo — security definer, dona é o
--    superusuário do SQL Editor, então ela ignora a policy restritiva e
--    grava mesmo assim, mas só a coluna progresso, nunca o resto da linha.
--    src/lib/store.ts já foi ajustado pra chamar essa função sempre que o
--    update pedido() só tem `progresso` no payload — os dois call sites são
--    o clique de setor em /producao e em /pedidos/[id].
--
-- 5. Mascarar valor_total/valor_pago/parcelas/vetorização de quem não tem
--    verFinanceiro (view sem colunas de dinheiro) FICA FORA desta migration
--    de propósito — decisão tomada em sessão com o dono. verFinanceiro
--    continua sendo controle só de interface, exatamente como já documentado
--    no CLAUDE.md; entra numa Fase B2 separada, se e quando for priorizada.
--
-- 6. numerosDePedidos (src/lib/kanban.ts) lê `pedidos` pelo client
--    autenticado pra popular o link do cartão pro pedido. Já é coberto pela
--    policy pedidos_select abaixo (qualquer perfil com linha em equipe lê) —
--    não precisa de policy própria.
--
-- 7. /api/keep-alive continua com o client ANÔNIMO de propósito (o cron da
--    Vercel não tem sessão). Depois desta migration, o `select id limit 1`
--    dele passa a devolver zero linhas (RLS filtra, não erra) — o endpoint
--    só checa se veio `error`, então continua respondendo 200 OK. Nenhuma
--    mudança necessária nesse arquivo.

-- ---------------------------------------------------------------------------
-- pedidos
-- ---------------------------------------------------------------------------

alter table pedidos enable row level security;

drop policy if exists pedidos_select on pedidos;
create policy pedidos_select on pedidos
  for select using (meu_perfil() is not null);

drop policy if exists pedidos_write on pedidos;
create policy pedidos_write on pedidos
  for all
  using      (meu_perfil() in ('gestor', 'recepcionista'))
  with check (meu_perfil() in ('gestor', 'recepcionista'));

-- ---------------------------------------------------------------------------
-- clientes
-- ---------------------------------------------------------------------------

alter table clientes enable row level security;

drop policy if exists clientes_select on clientes;
create policy clientes_select on clientes
  for select using (meu_perfil() is not null);

drop policy if exists clientes_write on clientes;
create policy clientes_write on clientes
  for all
  using      (meu_perfil() in ('gestor', 'recepcionista'))
  with check (meu_perfil() in ('gestor', 'recepcionista'));

-- ---------------------------------------------------------------------------
-- terceirizadas — chão de fábrica nunca acessa /terceirizadas, então nem
-- select fica liberado pra eles.
-- ---------------------------------------------------------------------------

alter table terceirizadas enable row level security;

drop policy if exists terceirizadas_admin on terceirizadas;
create policy terceirizadas_admin on terceirizadas
  for all
  using      (meu_perfil() in ('gestor', 'recepcionista'))
  with check (meu_perfil() in ('gestor', 'recepcionista'));

-- ---------------------------------------------------------------------------
-- tabela_precos — mesma lógica: só quem acessa /tabela-precos e /novo-pedido.
-- ---------------------------------------------------------------------------

alter table tabela_precos enable row level security;

drop policy if exists tabela_precos_admin on tabela_precos;
create policy tabela_precos_admin on tabela_precos
  for all
  using      (meu_perfil() in ('gestor', 'recepcionista'))
  with check (meu_perfil() in ('gestor', 'recepcionista'));

-- ---------------------------------------------------------------------------
-- Escrita restrita a progresso, pra quem só tem editarProducao
-- ---------------------------------------------------------------------------

create or replace function public.atualizar_progresso_pedido(p_pedido_id uuid, p_progresso jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Qualquer perfil com linha em equipe pode chamar (os 8 perfis têm
  -- editarProducao = true em src/lib/permissoes.ts, gestor/recepcionista
  -- incluídos). Quem não tem linha em equipe (meu_perfil() null) nem chegou
  -- até aqui pela app, mas a checagem fica explícita mesmo assim.
  if meu_perfil() is null then
    raise exception 'sem permissão: usuário sem perfil em equipe';
  end if;

  update pedidos
  set progresso = p_progresso, updated_at = now()
  where id = p_pedido_id;
end;
$$;

revoke all on function public.atualizar_progresso_pedido(uuid, jsonb) from public;
grant execute on function public.atualizar_progresso_pedido(uuid, jsonb) to authenticated;
