-- 018b — Recados: apaga sozinho o que tem mais de 30 dias (Fase J).
-- Rodar DEPOIS da 018. Se o "create extension" der erro de permissão, ligue o pg_cron em
-- Database → Extensions → pg_cron no painel do Supabase e rode o arquivo de novo.

create extension if not exists pg_cron;

-- Idempotente: tira o agendamento antigo, se existir, e cria de novo.
select cron.unschedule(jobid) from cron.job where jobname = 'limpar-recados';

select cron.schedule(
  'limpar-recados',
  '0 6 * * *',   -- todo dia 06:00 UTC = 03:00 em Brasília
  $$ delete from public.recados where criado_em < now() - interval '30 days' $$
);

-- CONFERÊNCIA — esperado: uma linha, limpar-recados | 0 6 * * * | true
select jobname, schedule, active from cron.job where jobname = 'limpar-recados';
