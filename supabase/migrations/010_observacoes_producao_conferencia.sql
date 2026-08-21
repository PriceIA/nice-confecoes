-- Confirmar antes de afirmar.
select relrowsecurity from pg_class
where relname = 'observacoes_producao' and relnamespace = 'public'::regnamespace;
-- esperado: true

select tablename, policyname, cmd from pg_policies
where tablename in ('observacoes_producao','observacoes_ciencia')
order by tablename, policyname;
-- esperado, e SÓ isso:
--   observacoes_ciencia   ciencia_select        SELECT
--   observacoes_producao  observacoes_insert    INSERT
--   observacoes_producao  observacoes_select    SELECT
-- Se aparecer qualquer policy de UPDATE ou DELETE, algo saiu errado:
-- a imutabilidade do registro depende de elas NÃO existirem.

select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('meu_id_equipe','listar_equipe','marcar_ciente',
                  'marcar_resolvida','posso_ver_observacao');
-- esperado: as cinco

select public.meu_id_equipe();
-- rodando pelo SQL Editor isso volta null (não há auth.uid()) — é esperado.
-- O teste real é pela aplicação, logado.
