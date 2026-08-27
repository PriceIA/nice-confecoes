-- 013 — "Pagar na retirada": exceção à regra 1, com aprovação do gestor.
--
-- Rodar DEPOIS de 013_excecao_pagamento_auditoria.sql.
--
-- Contexto. A regra 1 do sistema é que pedido não avança para produção sem
-- pagamento registrado. O Pedro abre exceção para cliente fiel — e, até aqui,
-- isso era feito lançando um pagamento que não aconteceu, porque não havia
-- outro jeito de destravar a tela. Esta migration dá um lugar próprio para a
-- exceção: quem pediu, por quê, quem decidiu, quando.
--
-- Fluxo:
--   gestor        -> libera direto, status já nasce 'aprovada'
--   recepcionista -> solicita, status nasce 'pendente'
--   pendente ou recusada -> o pedido continua barrado
--
-- Duas mudanças:
--   1. coluna `pedidos.excecao_pagamento` (jsonb)
--   2. TRIGGER que recusa a aprovação de quem não é gestor
--
-- Por que trigger e não RLS. RLS é por LINHA, não por coluna: gestor e
-- recepcionista já têm UPDATE liberado em `pedidos`, e não existe policy que
-- diga "pode alterar tudo menos este campo". O mesmo raciocínio que levou a
-- 009 a criar `atualizar_progresso_pedido` (security definer) para o chão de
-- fábrica leva aqui a um trigger BEFORE UPDATE.
--
-- Sem isso, a trava seria só de interface — a recepcionista não veria o botão,
-- mas um POST direto no PostgREST com a anon key autenticada gravaria
-- 'aprovada' do mesmo jeito.
--
-- Idempotente: pode rodar duas vezes.

-- ---------------------------------------------------------------------------
-- 1) Coluna
-- ---------------------------------------------------------------------------
-- Nullable e sem default: `null` significa "nunca foi pedida", que é o estado
-- de praticamente todos os pedidos. Um default '{}' faria todo pedido nascer
-- com uma exceção vazia e obrigaria a tela a distinguir vazio de ausente.
alter table public.pedidos
  add column if not exists excecao_pagamento jsonb;

comment on column public.pedidos.excecao_pagamento is
  'Liberação para pagar na retirada. {status, motivo, solicitadoPor, solicitadoEm, decididoPor, decididoEm, decisaoObservacao}. null = nunca solicitada.';

-- ---------------------------------------------------------------------------
-- 2) Só gestor decide
-- ---------------------------------------------------------------------------
create or replace function public.validar_excecao_pagamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  status_novo  text := new.excecao_pagamento ->> 'status';
  status_velho text := old.excecao_pagamento ->> 'status';
  perfil_atual text := public.meu_perfil();
begin
  -- Só interessa a TRANSIÇÃO para uma decisão. Reescrever a mesma linha com o
  -- mesmo status (um update de outro campo qualquer do pedido) passa livre.
  if status_novo is distinct from status_velho
     and status_novo in ('aprovada', 'recusada')
     and perfil_atual is not null
     and perfil_atual <> 'gestor'
  then
    raise exception
      'Somente o gestor pode aprovar ou recusar pagamento na retirada (perfil atual: %).', perfil_atual
      using errcode = '42501';
  end if;

  return new;
end
$$;

comment on function public.validar_excecao_pagamento() is
  'Impede que perfil diferente de gestor grave excecao_pagamento com status aprovada/recusada. Ver migration 013.';

-- `perfil_atual is not null` acima é deliberado: no SQL Editor do Supabase
-- não há auth.uid(), meu_perfil() devolve null, e o dono continua conseguindo
-- corrigir dados à mão. A trava é para o aplicativo, não para o administrador
-- do banco.

drop trigger if exists pedidos_excecao_pagamento_guard on public.pedidos;

create trigger pedidos_excecao_pagamento_guard
  before update on public.pedidos
  for each row
  execute function public.validar_excecao_pagamento();

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------

-- Deve devolver uma linha: excecao_pagamento / jsonb.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'pedidos'
  and column_name = 'excecao_pagamento';

-- Deve aparecer pedidos_excecao_pagamento_guard.
select tgname
from pg_trigger
where tgrelid = 'public.pedidos'::regclass and not tgisinternal
order by tgname;

-- Nenhum pedido deve ter exceção ainda.
select count(*) as pedidos_com_excecao
from public.pedidos
where excecao_pagamento is not null;
