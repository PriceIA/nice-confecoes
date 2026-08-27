-- 012 — Várias tabelas de preço + peça e grupo editáveis pela tela.
--
-- Rodar DEPOIS de 012_tabela_precos_multi_auditoria.sql, e só se a auditoria
-- não tiver apontado duplicata no item 4.
--
-- Contexto. A Nice não tem uma tabela de preços, tem várias: o mesmo catálogo
-- de peças escolares vale para grupos de escolas diferentes, com valores
-- diferentes. O que existe hoje no banco é UMA dessas listas — a do PDF
-- "TABELA 2025" (WF, Olga/Vermelho, WR/N.G. Jardim Encantado) — e ela vira
-- 'Escolar 1'. As demais o Pedro cria pela própria tela /tabela-precos, que
-- copia a estrutura de peças e deixa os valores em branco para ele digitar.
--
-- Três mudanças:
--
--   1. `tabela_precos.tabela`  — qual lista de preços a linha pertence.
--   2. constraint única passa a incluir `tabela`, senão o mesmo produto não
--      poderia ter preço em duas listas.
--   3. `pedidos.tabela_preco`  — registra qual lista foi usada no pedido.
--      Sem isso, reabrir um pedido antigo não teria como saber de onde os
--      valores saíram, e recalcular usaria a lista errada.
--
-- Idempotente: pode rodar duas vezes sem estragar nada.
--
-- Sobre RLS: `tabela_precos` já está sob RLS desde a Fase B (009), com escrita
-- restrita a gestor/recepcionista via `meu_perfil()`. As policies são por
-- linha e não citam colunas, então a coluna nova entra coberta pelas mesmas
-- policies — não há nada a recriar aqui.

-- ---------------------------------------------------------------------------
-- 1) Coluna `tabela` em tabela_precos
-- ---------------------------------------------------------------------------
alter table public.tabela_precos
  add column if not exists tabela text not null default 'Escolar 1';

-- Linhas antigas (anteriores ao default) recebem o nome explicitamente.
update public.tabela_precos
set tabela = 'Escolar 1'
where tabela is null or btrim(tabela) = '';

-- ---------------------------------------------------------------------------
-- 2) Constraint única passa a considerar a tabela
-- ---------------------------------------------------------------------------
-- A antiga (grupo, produto, faixa_tamanho) impediria 'Camiseta M Curta' de ter
-- preço em Escolar 1 e Escolar 2 ao mesmo tempo. Some, e entra a de 4 colunas.
--
-- A verificação é pelas COLUNAS, não pelo nome, porque a 005 registra que a
-- constraint pode ter sido criada à mão com outro nome.
do $$
declare
  nome_antiga text;
begin
  -- Derruba qualquer unique que seja exatamente (faixa_tamanho, grupo, produto).
  --
  -- `a.attname` é do tipo `name` (catálogo do Postgres), não `text` — comparar
  -- direto com `array['faixa_tamanho', ...]` (que o Postgres lê como text[])
  -- dá erro 42883 (`operator does not exist: name[] = text[]`). O `::text`
  -- dentro do array_agg resolve, convertendo cada elemento antes de agregar.
  select c.conname into nome_antiga
  from pg_constraint c
  where c.conrelid = 'public.tabela_precos'::regclass
    and c.contype = 'u'
    and (
      select array_agg(a.attname::text order by a.attname)
      from unnest(c.conkey) as k(attnum)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    ) = array['faixa_tamanho', 'grupo', 'produto'];

  if nome_antiga is not null then
    execute format('alter table public.tabela_precos drop constraint %I', nome_antiga);
  end if;

  -- Cria a nova, se ainda não existir com essas 4 colunas.
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.tabela_precos'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) = array['faixa_tamanho', 'grupo', 'produto', 'tabela']
  ) then
    alter table public.tabela_precos
      add constraint tabela_precos_tabela_grupo_produto_faixa_key
      unique (tabela, grupo, produto, faixa_tamanho);
  end if;
end
$$;

-- Busca por tabela é o filtro de toda a tela e do cálculo do pedido.
create index if not exists tabela_precos_tabela_idx
  on public.tabela_precos (tabela);

-- ---------------------------------------------------------------------------
-- 3) Qual tabela de preço o pedido usou
-- ---------------------------------------------------------------------------
-- Sem default e aceitando null de propósito: pedido gravado antes desta
-- mudança não usou tabela nenhuma explicitamente, e inventar 'Escolar 1' para
-- todos eles seria afirmar uma coisa que ninguém escolheu. A tela trata null
-- como "não registrado".
alter table public.pedidos
  add column if not exists tabela_preco text;

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — rode junto e leia o resultado
-- ---------------------------------------------------------------------------

-- Deve listar 'Escolar 1' com o total de linhas que a auditoria mostrou.
select tabela, count(*) as linhas, count(valor) as com_valor
from public.tabela_precos
group by tabela
order by tabela;

-- Deve aparecer a unique com as 4 colunas, e NÃO a de 3.
select c.conname,
       (select array_agg(a.attname order by a.attname)
          from unnest(c.conkey) as k(attnum)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       ) as colunas
from pg_constraint c
where c.conrelid = 'public.tabela_precos'::regclass and c.contype = 'u';

-- Deve devolver uma linha: tabela_preco / text.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'pedidos' and column_name = 'tabela_preco';
