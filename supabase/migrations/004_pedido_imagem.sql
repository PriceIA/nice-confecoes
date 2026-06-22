alter table pedidos add column if not exists imagem text;
alter table pedidos add column if not exists vetorizacao jsonb default '{"necessaria": false, "valor": 50}';
