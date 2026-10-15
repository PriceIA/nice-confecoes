-- 020 — Almoxarifado (Fase K, revisão de 15/10/2026): o corte movimenta o estoque.
-- Respostas do Pedro: Marquinhos recebe compra, lança sobra e corrige estoque,
-- mas não vê preço. Idempotente. Rodar depois da 019.

begin;

drop policy if exists estoque_mov_insert on public.estoque_movimentos;
create policy estoque_mov_insert on public.estoque_movimentos
  for insert to authenticated
  with check (
    feito_por = public.meu_id_equipe()
    and public.meu_perfil() in ('gestor','recepcionista','corte')
  );

-- Mesmo trigger da 019, com uma linha a mais: custo gravado pelo corte vira null.
create or replace function public.estoque_aplicar_movimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric(12,3);
begin
  new.feito_por := coalesce(new.feito_por, public.meu_id_equipe());

  if public.meu_perfil() = 'corte' then
    new.custo_unitario := null;
  end if;

  update public.materiais
     set saldo = saldo + new.quantidade,
         updated_at = now()
   where id = new.material_id
  returning saldo into v_saldo;

  if not found then
    raise exception 'material % não existe', new.material_id;
  end if;

  new.saldo_depois := v_saldo;
  return new;
end
$$;

commit;

-- Conferência (rodar depois, separado). Esperado: 5 | true | true
select
  (select count(*) from pg_policies
    where tablename in ('materiais','estoque_movimentos'))                       as policies,
  (select pg_get_functiondef('public.estoque_aplicar_movimento'::regproc)
     like '%custo_unitario := null%')                                            as custo_corte,
  (select with_check like '%corte%' from pg_policies
    where policyname = 'estoque_mov_insert')                                     as insert_corte;
