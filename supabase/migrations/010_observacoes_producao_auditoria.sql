-- AUDITORIA — só SELECT. Não altera nada. Rode e mande o resultado.

-- 1. As tabelas já existem?
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('observacoes_producao','observacoes_ciencia');

-- 2. Como está a tabela equipe (RLS ligado? quais policies?)
select relname, relrowsecurity
from pg_class
where relname = 'equipe' and relnamespace = 'public'::regnamespace;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'equipe';

-- 3. Quantas pessoas estão realmente cadastradas hoje, e todas têm auth_user_id?
select perfil, count(*) as total, count(auth_user_id) as com_login
from public.equipe
group by perfil
order by perfil;

-- 4. As funções auxiliares que já existem
select proname, prosecdef as security_definer, proconfig
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('meu_perfil', 'meu_id_equipe', 'listar_equipe', 'marcar_ciente',
                  'marcar_resolvida', 'posso_ver_observacao',
                  'atualizar_progresso_pedido');

-- 5. gen_random_uuid disponível?
select gen_random_uuid();
