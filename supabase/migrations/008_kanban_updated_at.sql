-- Coluna updated_at nas tabelas do Kanban.
--
-- NÃO EXECUTADO PELO CLAUDE CODE. Rodar manualmente no Supabase SQL Editor.
--
-- Contexto: mudar a cor de uma lista falhava com
--   PGRST204: Could not find the 'updated_at' column of 'listas'
-- porque `atualizarLista` (src/lib/kanban.ts) sempre manda `updated_at` no
-- update, e a coluna não existia. O `007_kanban.sql` declara essa coluna nas
-- três tabelas, mas ele é RECONSTRUÇÃO — o banco real foi criado sem ela.
--
-- Decisões:
--
-- 1. A linha de `listas` o dono JÁ RODOU (foi assim que o erro de cor sumiu).
--    Está aqui como registro histórico, com `if not exists` para ser
--    re-executável sem erro.
--
-- 2. `quadros` e `cards` entram junto NÃO por precaução vaga, mas porque as
--    outras duas funções de update mandam exatamente o mesmo campo:
--      atualizarQuadro  → src/lib/kanban.ts:172
--      atualizarLista   → src/lib/kanban.ts:272
--      atualizarCartao  → src/lib/kanban.ts:334
--    Se `listas` não tinha a coluna, as outras duas provavelmente também não
--    têm — e aí renomear um quadro, editar um cartão e, principalmente,
--    ARRASTAR um cartão falhariam com o mesmo PGRST204. Como o arrasto é
--    otimista com rollback, o sintoma seria o cartão voltar sozinho para o
--    lugar de origem com o banner de erro.
--
-- 3. `not null default now()` (e não nullable) para as linhas que já existem
--    receberem um valor na hora do alter, em vez de ficarem com null.

alter table public.quadros add column if not exists updated_at timestamptz not null default now();
alter table public.listas  add column if not exists updated_at timestamptz not null default now();
alter table public.cards   add column if not exists updated_at timestamptz not null default now();

-- Conferência rápida depois de rodar: as três linhas devem aparecer.
--
--   select table_name, column_name
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('quadros', 'listas', 'cards')
--      and column_name = 'updated_at'
--    order by table_name;
