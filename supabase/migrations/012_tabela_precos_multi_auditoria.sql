-- 012 — AUDITORIA (só leitura). Rodar ANTES de 012_tabela_precos_multi.sql.
--
-- O que vai mudar: `tabela_precos` hoje guarda UMA lista de preços
-- (grupo → produto → faixa de tamanho → valor). A Nice trabalha com várias:
-- as escolas têm o mesmo catálogo de peças com valores diferentes conforme o
-- grupo de escolas (o PDF "TABELA 2025" traz no cabeçalho "WF, Olga
-- (Vermelho), WR / N.G. (Jardim Encantado)" — é uma tabela entre outras).
--
-- A migration acrescenta a coluna `tabela` e troca a constraint única de
-- (grupo, produto, faixa_tamanho) para (tabela, grupo, produto, faixa_tamanho).
--
-- Confira ANTES de rodar:
--
-- 1. A coluna `tabela` já existe? Se sim, a migration já foi aplicada.
-- 2. Quantas linhas serão renomeadas para 'Escolar 1'.
-- 3. Que constraint única existe hoje (a 005 criou
--    `tabela_precos_grupo_produto_faixa_key`).
-- 4. Se há duplicata que impediria a constraint nova — deve vir vazio.

-- 1) A coluna já existe?
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'tabela_precos'
order by ordinal_position;

-- 2) O que existe hoje, por grupo. Tudo isso vira tabela 'Escolar 1'.
select grupo, count(*) as linhas, count(valor) as com_valor
from public.tabela_precos
group by grupo
order by grupo;

-- 3) Constraints únicas atuais da tabela.
select c.conname as constraint_name,
       (select array_agg(a.attname order by a.attname)
          from unnest(c.conkey) as k(attnum)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       ) as colunas
from pg_constraint c
where c.conrelid = 'public.tabela_precos'::regclass and c.contype = 'u';

-- 4) Duplicatas que quebrariam a constraint nova. TEM QUE VIR VAZIO.
select grupo, produto, faixa_tamanho, count(*)
from public.tabela_precos
group by grupo, produto, faixa_tamanho
having count(*) > 1;

-- 5) A coluna `tabela_preco` já existe em `pedidos`? O pedido passa a guardar
--    qual tabela foi usada no cálculo — sem isso, reabrir um pedido antigo não
--    tem como saber de qual lista os valores saíram.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'pedidos' and column_name = 'tabela_preco';
