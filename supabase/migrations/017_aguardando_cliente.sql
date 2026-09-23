-- 017 — "Aguardando o cliente" (Fase I).
-- Pedido pronto e vencido que o cliente não retirou: tira do "atrasado" e registra o motivo.
-- Rodar ANTES de subir o código da I1: getPedidosLista lista as colunas por nome e
-- quebraria /pedidos, /entregas e /producao com erro 42703 se a coluna não existir.
-- Idempotente. Sem trigger e sem policy: pedidos_write (009) já restringe a escrita a
-- gestor/recepcionista, que são exatamente quem responde.

alter table public.pedidos
  add column if not exists aguardando_cliente jsonb;

comment on column public.pedidos.aguardando_cliente is
  'Pedido pronto e vencido que o cliente não retirou. {motivo, observacao, previsaoRetirada, registradoPor, registradoEm, confirmadoPor, confirmadoEm}. null = não se aplica.';

alter table public.pedidos drop constraint if exists pedidos_aguardando_cliente_motivo_check;
alter table public.pedidos add constraint pedidos_aguardando_cliente_motivo_check
  check (aguardando_cliente is null
         or aguardando_cliente->>'motivo' in ('pagamento', 'sem_tempo', 'outro'));

-- CONFERÊNCIA
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'pedidos' and column_name = 'aguardando_cliente';
select conname from pg_constraint
 where conrelid = 'public.pedidos'::regclass and conname = 'pedidos_aguardando_cliente_motivo_check';
select count(*) as com_aguardando from public.pedidos where aguardando_cliente is not null; -- 0
