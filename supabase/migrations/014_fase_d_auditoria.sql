-- ===========================================================================
-- AUDITORIA DA FASE D — SÓ LEITURA. Não altera absolutamente nada.
--
-- NÃO EXECUTADO PELO CLAUDE CODE. Quem cola e roda é o Pedro, no SQL Editor
-- do Supabase, e manda o resultado de volta.
--
-- Responde de uma vez as perguntas de três frentes:
--   D2.1  cadastro de prestadores terceirizados (preço por serviço)
--   D2.2  visibilidade do cartão no Kanban (por perfil, por pessoa, privado)
--   D3a   catálogo de etapas de produção
--
-- Por que auditoria antes de migration: foi exatamente esta prática que, na
-- Fase B, pegou as 4 policies antigas de `tabela_precos` liberando o papel
-- `anon` — criadas fora do repo, direto no painel — antes de qualquer coisa
-- quebrar. RLS que barra não dá erro, dá zero linhas.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Que tabelas existem hoje
--
-- ESPERADO: pedidos, clientes, terceirizadas, tabela_precos, equipe,
--           quadros, listas, cards.
--
-- NÃO devem aparecer: observacoes_producao, observacoes_ciencia (a Fase C1
-- nunca rodou), prestadores, prestador_servicos, etapas_producao.
-- Se alguma delas aparecer, PARE: alguém criou fora do repo, e é o mesmo
-- cenário do tabela_precos. Mande o resultado antes de seguir.
-- ---------------------------------------------------------------------------
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_type = 'BASE TABLE'
 order by 1;


-- ---------------------------------------------------------------------------
-- 2. D2.2 — a policy de select de `cards`, exatamente como ela é hoje
--
-- Esta é A policy que a migration da visibilidade vai REESCREVER. Escrever
-- por cima de uma policy que ninguém leu é o erro que este projeto já pagou.
-- Olhe a coluna `qual`: é ali que está a regra de quem vê o quê.
-- ---------------------------------------------------------------------------
select policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename = 'cards'
 order by policyname;


-- ---------------------------------------------------------------------------
-- 3. D2.2 — colunas de `cards`
--
-- ESPERADO encontrar: id, lista_id, titulo, descricao, posicao,
--                     perfis_visiveis, pedido_id, prazo, concluido,
--                     created_at, updated_at
--
-- NÃO devem existir ainda: membros_visiveis, criado_por. São elas que a
-- migration adiciona. Se já existirem, pare e mande o resultado.
-- ---------------------------------------------------------------------------
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'cards'
 order by ordinal_position;


-- ---------------------------------------------------------------------------
-- 4. D2.2 — quantos cartões existem, e quantos já são restritos por perfil
--
-- Importa porque a policy nova precisa deixar TODO cartão de hoje continuar
-- visível para quem já o vê. Cartão antigo tem `criado_por` nulo (a coluna
-- nem existe ainda), então ele depende da cláusula "público" da policy nova.
-- ---------------------------------------------------------------------------
select
  count(*)                                              as cartoes_total,
  count(*) filter (where perfis_visiveis is null)       as publicos,
  count(*) filter (where perfis_visiveis is not null)   as restritos_por_perfil,
  count(*) filter (where perfis_visiveis = '{}')        as array_vazio
  from public.cards;


-- ---------------------------------------------------------------------------
-- 5. D2.2 — quem está cadastrado de verdade em `equipe`
--
-- Pendência aberta no contexto do projeto desde 14/08/2026. Não é acessório:
-- SEM GENTE CADASTRADA NÃO HÁ A QUEM DAR VISIBILIDADE POR PESSOA. Se só o
-- Pedro e a Kalomira tiverem login, a visibilidade por pessoa da D2.2 não tem
-- o que oferecer, e vale cadastrar o resto antes.
--
-- Atualize a tabela de equipe no CLAUDE.md com este resultado.
-- ---------------------------------------------------------------------------
select perfil,
       count(*)                  as total,
       count(auth_user_id)       as com_login
  from public.equipe
 group by perfil
 order by perfil;

-- Os nomes, para montar o seletor "para quem?" com gente real:
select nome, perfil, (auth_user_id is not null) as tem_login
  from public.equipe
 order by perfil, nome;


-- ---------------------------------------------------------------------------
-- 6. Funções auxiliares que já existem
--
-- ESPERADO: meu_perfil e atualizar_progresso_pedido (Fase B).
--
-- NÃO devem existir: meu_id_equipe, listar_equipe — elas foram escritas na
-- migration 010 (Fase C1), que nunca rodou. A migration da D2.2 precisa de
-- `meu_id_equipe` para a visibilidade por pessoa, então ela vai ter que criar
-- a função. Este item confirma isso antes de a migration ser escrita.
-- ---------------------------------------------------------------------------
select proname,
       prosecdef as security_definer,
       proconfig
  from pg_proc
 where pronamespace = 'public'::regnamespace
 order by proname;


-- ---------------------------------------------------------------------------
-- 7. D3a — as chaves de setor que realmente existem nos pedidos
--
-- O catálogo de etapas nasce com as 8 canônicas. Este item confirma que
-- nenhum pedido gravado tem chave fora dessas 8 — se tiver, a semente do
-- catálogo precisa incluí-la, senão aquele setor apareceria sem nome na tela.
--
-- Confirma de quebra o formato do JSONB: `formato_antigo` conta os pedidos
-- gravados antes da autoria por setor, que guardam só a string do status.
-- `normalizarProgresso` já lida com os dois, mas é bom saber quantos são.
-- ---------------------------------------------------------------------------
select chave, count(*) as pedidos
  from public.pedidos, lateral jsonb_object_keys(progresso) as chave
 group by chave
 order by chave;

select
  count(*)                                                          as pedidos_total,
  count(*) filter (where jsonb_typeof(progresso -> 'corte') = 'string') as formato_antigo,
  count(*) filter (where jsonb_typeof(progresso -> 'corte') = 'object') as formato_atual
  from public.pedidos;

-- Quantos pedidos já têm setor marcado como "não se aplica" (Fase C0 em uso):
select count(*) as pedidos_com_nao_se_aplica
  from public.pedidos
 where progresso::text like '%nao_se_aplica%';


-- ---------------------------------------------------------------------------
-- 8. D2.1 — o que já existe em `terceirizadas`
--
-- A migration de prestadores adiciona prestador_id, servico, quantidade e
-- valor_unitario. Este item confirma que nenhuma delas já existe, e mostra
-- os nomes de prestadora digitados até hoje — é a partir deles que o Pedro
-- vai montar o cadastro, em vez de começar de uma tela vazia.
-- ---------------------------------------------------------------------------
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'terceirizadas'
 order by ordinal_position;

select nome, tipo, count(*) as lancamentos, sum(valor_combinado) as total_combinado
  from public.terceirizadas
 group by nome, tipo
 order by lancamentos desc, nome;


-- ---------------------------------------------------------------------------
-- 9. Panorama de RLS, para fechar
--
-- Todas as tabelas de negócio devem estar com relrowsecurity = true.
-- ---------------------------------------------------------------------------
select c.relname as tabela, c.relrowsecurity as rls_ligado
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relkind = 'r'
 order by 1;

select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
