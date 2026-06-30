-- Coluna adicionada ao tipo Cliente para identificar o responsável da empresa
alter table clientes
  add column if not exists responsavel_empresa text;

-- Colunas adicionadas ao tipo Pedido para consultor e parcelas de pagamento
alter table pedidos
  add column if not exists consultor text default '',
  add column if not exists parcelas  jsonb default '[]';
