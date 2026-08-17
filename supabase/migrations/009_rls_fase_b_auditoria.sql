-- Fase B — AUDITORIA (só leitura, zero efeito no banco).
--
-- Rodar isto no Supabase SQL Editor ANTES de 009_rls_fase_b.sql, pra
-- confirmar que o banco está no estado que a migration espera. Nenhum
-- comando aqui grava, altera ou apaga nada — é só SELECT.
--
-- O que checar em cada bloco está comentado ao lado do resultado esperado.

-- 1. RLS hoje deve estar DESLIGADO nas 4 tabelas (rowsecurity = false).
--    Se alguma já estiver com rowsecurity = true, pare e investigue antes
--    de rodar a migration — pode já ter sido aplicada, ou aplicada por fora.
select relname as tabela, relrowsecurity as rls_ligado
from pg_class
where relname in ('pedidos', 'clientes', 'terceirizadas', 'tabela_precos')
  and relnamespace = 'public'::regnamespace;

-- 2. meu_perfil() precisa existir (criada em 007_kanban.sql). Espera-se 1 linha.
select proname, prosecdef as security_definer
from pg_proc
where proname = 'meu_perfil' and pronamespace = 'public'::regnamespace;

-- 3. equipe precisa ter linhas com auth_user_id preenchido — senão
--    meu_perfil() devolve null pra todo mundo e a Fase B trava o sistema
--    inteiro no primeiro deploy. Espera-se pelo menos as linhas do Pedro e
--    da Kalomira (gestor/recepcionista) com auth_user_id não nulo.
select nome, perfil, (auth_user_id is not null) as tem_auth_user_id
from equipe
order by perfil;

-- 4. Nenhuma policy deve existir ainda nestas 4 tabelas (a migration cria
--    com "drop policy if exists" antes de cada "create", então não trava
--    se já existir alguma — mas se aparecer algo aqui, vale entender o
--    porquê antes de prosseguir).
select tablename, policyname
from pg_policies
where tablename in ('pedidos', 'clientes', 'terceirizadas', 'tabela_precos');

-- 5. Contagem de linhas nas 4 tabelas — só pra ter um "antes" registrado,
--    e comparar depois que o app estiver rodando com RLS ligado (se o
--    número de pedidos visíveis cair, algo na policy está errado).
select 'pedidos' as tabela, count(*) from pedidos
union all
select 'clientes', count(*) from clientes
union all
select 'terceirizadas', count(*) from terceirizadas
union all
select 'tabela_precos', count(*) from tabela_precos;

-- 6. Função atualizar_progresso_pedido NÃO deve existir ainda (a migration
--    cria com "create or replace", então não quebra se já existir — mas,
--    de novo, se aparecer aqui antes de rodar 009, vale saber por quê).
select proname, prosecdef as security_definer
from pg_proc
where proname = 'atualizar_progresso_pedido' and pronamespace = 'public'::regnamespace;
