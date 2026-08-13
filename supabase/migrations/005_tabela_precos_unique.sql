-- Constraint UNIQUE (grupo, produto, faixa_tamanho) em tabela_precos.
--
-- REGISTRO HISTÓRICO: esta constraint JÁ FOI APLICADA MANUALMENTE no banco pelo
-- dono. Este arquivo existe para que o schema versionado reflita o estado real —
-- a migration 002_tabela_precos.sql criou a tabela sem nenhuma unique.
--
-- Por que ela importa: a tela /tabela-precos grava os preços com
-- supabase.upsert(..., { onConflict: 'grupo,produto,faixa_tamanho' })
-- (src/app/tabela-precos/page.tsx). Sem esta constraint o PostgREST rejeita o
-- ON CONFLICT com o erro 42P10 e nenhum preço é salvo.
--
-- O PostgreSQL não suporta "alter table ... add constraint if not exists", então
-- a idempotência vem do bloco condicional abaixo. A verificação é feita pelas
-- COLUNAS, não pelo nome, para não duplicar a constraint caso ela tenha sido
-- criada à mão com outro nome.
--
-- Nota: num banco novo que já contivesse linhas duplicadas para a mesma
-- combinação (grupo, produto, faixa_tamanho), seria preciso remover as
-- duplicatas antes — a criação da constraint falha enquanto elas existirem.

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.tabela_precos'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by a.attname)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = k.attnum
      ) = array['faixa_tamanho', 'grupo', 'produto']
  ) then
    alter table public.tabela_precos
      add constraint tabela_precos_grupo_produto_faixa_key
      unique (grupo, produto, faixa_tamanho);
  end if;
end
$$;
