-- Adiciona colunas updated_at e campos de cliente estendidos
-- Execute este arquivo no Supabase SQL Editor

alter table clientes
  add column if not exists responsavel text,
  add column if not exists endereco text,
  add column if not exists documento text,
  add column if not exists updated_at timestamptz;

alter table pedidos
  add column if not exists updated_at timestamptz;
