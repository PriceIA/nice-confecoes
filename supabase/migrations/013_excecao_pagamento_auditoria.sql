-- 013 — AUDITORIA (só leitura). Rodar ANTES de 013_excecao_pagamento.sql.
--
-- O que vai mudar: `pedidos` ganha a coluna `excecao_pagamento` (jsonb), onde
-- fica registrada a liberação para o cliente pagar só na retirada — quem
-- pediu, por quê, quem decidiu e quando. Junto vem um TRIGGER que impede
-- qualquer perfil que não seja gestor de aprovar ou recusar.
--
-- Confira antes:
--
-- 1. A coluna já existe? Se sim, a migration já foi aplicada.
-- 2. A função `meu_perfil()` existe? O trigger depende dela (veio na Fase B).
-- 3. Já existe trigger com esse nome em `pedidos`?
-- 4. Quem está cadastrado como gestor hoje — é quem vai poder aprovar.

-- 1) A coluna já existe?
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'pedidos'
  and column_name = 'excecao_pagamento';

-- 2) A função meu_perfil() existe? Deve devolver uma linha.
select p.proname, pg_get_function_result(p.oid) as retorno, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'meu_perfil';

-- 3) Triggers atuais em pedidos.
select tgname, pg_get_triggerdef(oid) as definicao
from pg_trigger
where tgrelid = 'public.pedidos'::regclass and not tgisinternal;

-- 4) Quem é gestor hoje. Só estas pessoas poderão aprovar.
select nome, perfil from public.equipe order by perfil, nome;
