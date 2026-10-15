# Fase K — Almoxarifado (estoque de tecidos e insumos)

**Spec escrita em 08/10/2026 pelo Claude (Cowork), com as respostas do Pedro.** Mockup:
artifact "Almoxarifado Nice" (9 telas). O mockup mostra rolos individuais e cálculo automático —
**as duas coisas ficaram FORA desta fase** (ver "Fora desta fase", no fim). Siga esta spec, não
o mockup, onde os dois discordarem.

> **ETAPA ATUAL: K0b + K1b** (migration 020 e ajuste de permissão — ver abaixo).
> K0 concluída em 08/10 (019 rodada, `2 | true | true | 5 | 2`). K1 concluída no código, sem
> commit. **Revisão de 15/10/2026:** a spec foi reescrita com as respostas do Pedro (31
> perguntas). O que mudou: o corte agora dá entrada e ajusta (migration 020), a K4 virou
> **Fechar corte** (lançar sobra), a entrada pode ser ligada a um pedido, e o relatório
> semanal é o de sobras. Uma etapa por vez. Terminou uma etapa? Registre em
> `docs/fase-k-registro.md` e pare.
>
> **Este arquivo é só do Cowork. O Claude Code NÃO edita `docs/fase-k.md`** — e ao commitar,
> commite o arquivo **como está no disco**, sem regravar a partir de cópia antiga. Não rode
> `git checkout`, `restore` ou `stash` em `docs/`.

---

## 0. Regras desta fase

1. **Uma etapa = um commit**, só depois do teste e da aprovação do Felipe. `npm run build` antes
   de cada push — **com o `npm run dev` parado** (os dois brigam pela pasta `.next`).
2. **SQL: o Claude Code nunca executa.** Escreve o arquivo em `supabase/migrations/` e o Felipe roda.
3. **Cores só por tokens semânticos** (`bg-superficie`, `text-suave`…, ver CLAUDE.md). Regras de
   perfil só em `permissoes.ts`. Datas com `dataLocal`/`formatarData`; dinheiro com `moeda`;
   número de tabela com `.num`; exportação com `src/lib/csv.ts`.
4. **Teste cria dado de verdade.** O banco do `npm run dev` é o de produção, e movimento de
   estoque **não se apaga** (é de propósito, ver regra K-2). Para testar, cadastre UM material
   chamado `TESTE — não usar`, faça os movimentos nele e no fim marque `ativo = false`. Nunca
   teste em material real.
5. Nada de biblioteca nova.

## Decisões do Pedro (não reabrir)

- **Malha é controlada em kg. Tecido plano é controlado em metro.** Cada material tem a sua
  unidade; aviamento e insumo também (cone, unidade, litro…).
- **Só o total por tecido + cor.** Não existe rolo individual, etiqueta por rolo nem lote.
  "Malha PV Branco = 64 kg" é o registro inteiro.
- **Consumo é sempre por peça, com variação para tamanho infantil e para tamanho acima do GG.**
  Isso é a Fase K2 (cálculo automático), que só começa quando o Pedro mandar a conta de
  consumo (hoje está "na cabeça"). Nesta fase o lançamento é **manual**.

Respostas de 15/10/2026 (rodada 1, 31 perguntas):

- **Por enquanto só entra malha e tecido.** Nada de aviamento, tinta ou embalagem. As outras
  categorias continuam no banco, mas a tela só oferece `malha` e `tecido_plano`.
- Malha em kg, tecido em metro. Às vezes ele usa malha em metro (pergunta pendente: é sempre a
  mesma malha em metro, ou a mesma alterna?). Por isso a unidade continua escolhível por material.
- Tem diferença de tom entre lotes, mas **não** precisa controlar lote. Peça pronta não fica em
  estoque.
- **Confia no peso da nota.** A única coisa pesada internamente é a sobra. Nunca pesa com tubo.
- **Quem recebe a compra:** Kalomira, Marquinhos e Pedro. **Quem compra:** Kalomira ou Pedro.
- **A compra é "contada" e só quando entra pedido.** O fornecedor entrega no mesmo dia. Por isso
  a entrada pode ser **ligada a um pedido**, e o corte só informa **o que sobrou**.
- **Sobra volta para o estoque** a partir de 80 cm (o mínimo que dá uma camiseta). Abaixo disso
  não é lançada. (Pendente: o equivalente em kg para malha.)
- O Marquinhos sabe o tecido **lendo o pedido**. Hoje isso não é campo do sistema (pendente:
  onde está escrito). Ele tem celular no corte.
- **Reserva:** se já tem o tecido no estoque, reservar quando o pedido entra; se não tem,
  descontar quando corta. → depende do cálculo de consumo, fica para a Fase K2.
- **Estoque mínimo** só para alguns: Dry Manchester branco, Dry Confort branco, Tactel com
  elastano branco (quantidades pendentes).
- Prateleiras não têm nome; ele topa numerar (A1, A2, B1…). Terceirizadas não levam tecido.
- Contagem física umas 2 vezes por ano (ajuste).
- **Quem pode:** Pedro, Kalomira e Marquinhos fazem tudo (ver, dar entrada, retirar, corrigir).
  **O Marquinhos não vê preço.**
- **Relatório da semana:** o que sobrou de tecido — justamente o que o Marquinhos lança.
- QR code/etiqueta por rolo: depois.

## Acesso (revisado em 15/10 — trocar é só `permissoes.ts` + policy)

- **Quem acessa `/almoxarifado`:** gestor, recepcionista e **corte** (Marquinhos).
  - Gestor e recepcionista: tudo — cadastrar/editar material, entrada, fechar corte, ajustar.
  - Corte: **entrada, fechar corte e ajuste**. Não cadastra nem edita material (pendente:
    pergunta 10 da rodada 2) e **não vê R$**.
  - Os outros perfis de produção não veem a aba.
- **Custo e valor em R$ só para quem tem `verFinanceiro`.** Na tela é controle de interface (a
  coluna trafega para o navegador do corte, como em `pedidos`). No banco, a migration 020 faz o
  trigger **apagar o custo** de qualquer movimento gravado pelo corte — ele não grava preço nem
  por fora da tela.
- **Saldo pode ficar negativo.** Se o Marquinhos pesou e saiu mais do que o sistema tinha, o
  fato aconteceu; o banco aceita e a tela marca o material como **"Negativo — conferir"**.
  Bloquear obrigaria a pessoa a mentir na quantidade para conseguir registrar.

## Regras novas (vão para o CLAUDE.md no fim da fase)

- **K-1. O saldo é derivado dos movimentos, nunca digitado.** `materiais.saldo` só muda pelo
  trigger de `estoque_movimentos` (migration 019). A tela nunca faz `update` em `saldo`; o banco
  recusa se tentar.
- **K-2. Movimento não se edita nem se apaga.** Correção é um movimento novo do tipo `ajuste`,
  com o nome de quem fez. Não existe policy de update/delete em `estoque_movimentos`.
- **K-3. Material nunca é excluído pela tela, só desativado** (`ativo = false`), igual prestador.
- **K-4. Sinal da quantidade é fixo por tipo:** entrada e devolução > 0, saída < 0, ajuste ≠ 0.
  A tela sempre pede o número **positivo** e o `almoxarifado.ts` aplica o sinal. Vale no banco
  (constraint `estoque_movimentos_sinal`).

---

## K0 — Migration 019 (Felipe roda)

Criar o arquivo abaixo em `supabase/migrations/`, exatamente assim, e **parar**. O Felipe roda,
confere com o SELECT do fim e anota o resultado no registro.

### `supabase/migrations/019_almoxarifado.sql`

```sql
-- 019 — Almoxarifado (Fase K): materiais e movimentos de estoque.
-- Idempotente. Rodar ANTES de subir qualquer código da Fase K.
--
-- Modelo: o saldo de cada material é a soma dos seus movimentos. O trigger
-- estoque_aplicar_movimento atualiza materiais.saldo a cada insert, dentro da
-- mesma transação (o UPDATE trava a linha do material, então dois movimentos
-- simultâneos no mesmo material entram em fila, não se perdem).
--
-- Decisões do Pedro: malha em kg, tecido plano em metro, só total por
-- tecido + cor (sem rolo, sem lote).
-- Depende de public.meu_perfil() e public.meu_id_equipe() (já existem).

begin;

create table if not exists public.materiais (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (char_length(btrim(nome)) between 1 and 80),
  -- '' = item sem cor (zíper, tinta, embalagem). Não nulo de propósito: o
  -- índice único abaixo não enxerga duplicata quando a coluna é null.
  cor             text not null default '' check (char_length(cor) <= 40),
  categoria       text not null check (categoria in
                    ('malha','tecido_plano','aviamento','estamparia','embalagem','outro')),
  unidade         text not null check (unidade in ('kg','m','un','cone','rolo','l')),
  saldo           numeric(12,3) not null default 0,
  estoque_minimo  numeric(12,3) check (estoque_minimo is null or estoque_minimo >= 0),
  local           text check (local is null or char_length(local) <= 40),
  -- Último custo conhecido por unidade. Só informativo (valor do estoque);
  -- o histórico de preço fica em cada movimento de entrada.
  custo_unitario  numeric(10,2) check (custo_unitario is null or custo_unitario >= 0),
  observacoes     text,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.materiais is
  'Almoxarifado (Fase K): tecido, aviamento e insumo. saldo é DERIVADO de estoque_movimentos — nunca editar à mão pela aplicação.';

create unique index if not exists materiais_nome_cor_key
  on public.materiais (lower(btrim(nome)), lower(btrim(cor)));

create table if not exists public.estoque_movimentos (
  id              uuid primary key default gen_random_uuid(),
  material_id     uuid not null references public.materiais(id),
  tipo            text not null check (tipo in ('entrada','saida','devolucao','ajuste')),
  quantidade      numeric(12,3) not null,
  -- Preenchido pelo trigger: o saldo do material logo depois deste movimento.
  saldo_depois    numeric(12,3),
  pedido_id       uuid references public.pedidos(id) on delete set null,
  fornecedor      text check (fornecedor is null or char_length(fornecedor) <= 80),
  nota_fiscal     text check (nota_fiscal is null or char_length(nota_fiscal) <= 40),
  custo_unitario  numeric(10,2) check (custo_unitario is null or custo_unitario >= 0),
  observacao      text check (observacao is null or char_length(observacao) <= 300),
  feito_por       uuid references public.equipe(id),
  criado_em       timestamptz not null default now(),
  constraint estoque_movimentos_sinal check (
    (tipo in ('entrada','devolucao') and quantidade > 0) or
    (tipo = 'saida'  and quantidade < 0) or
    (tipo = 'ajuste' and quantidade <> 0)
  )
);

comment on table public.estoque_movimentos is
  'Almoxarifado (Fase K): toda entrada, saída, devolução e ajuste. Imutável — correção é um ajuste novo.';

create index if not exists estoque_mov_material_idx on public.estoque_movimentos (material_id, criado_em desc);
create index if not exists estoque_mov_criado_idx   on public.estoque_movimentos (criado_em desc);
create index if not exists estoque_mov_pedido_idx   on public.estoque_movimentos (pedido_id);

-- ---------------------------------------------------------------------------
-- Trigger 1: aplica o movimento no saldo. security definer porque o corte
-- grava movimento mas não tem UPDATE em materiais (RLS).
-- ---------------------------------------------------------------------------
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

drop trigger if exists estoque_movimentos_aplicar on public.estoque_movimentos;
create trigger estoque_movimentos_aplicar
  before insert on public.estoque_movimentos
  for each row execute function public.estoque_aplicar_movimento();

-- ---------------------------------------------------------------------------
-- Trigger 2: protege materiais.saldo (regra K-1). Pela aplicação, o saldo
-- nasce 0 e só muda via trigger 1 (pg_trigger_depth() > 1). No SQL Editor
-- (meu_perfil() nulo) passa — a trava é para o app, não para o dono do banco,
-- mesmo raciocínio do guard da migration 013.
-- ---------------------------------------------------------------------------
create or replace function public.materiais_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.meu_perfil() is not null then
    if tg_op = 'INSERT' then
      new.saldo := 0;
    elsif new.saldo is distinct from old.saldo and pg_trigger_depth() < 2 then
      raise exception 'saldo só muda por movimento de estoque (regra K-1)';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists materiais_guard on public.materiais;
create trigger materiais_guard
  before insert or update on public.materiais
  for each row execute function public.materiais_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.materiais          enable row level security;
alter table public.estoque_movimentos enable row level security;

drop policy if exists materiais_select on public.materiais;
create policy materiais_select on public.materiais
  for select to authenticated
  using (public.meu_perfil() in ('gestor','recepcionista','corte'));

drop policy if exists materiais_insert on public.materiais;
create policy materiais_insert on public.materiais
  for insert to authenticated
  with check (public.meu_perfil() in ('gestor','recepcionista'));

drop policy if exists materiais_update on public.materiais;
create policy materiais_update on public.materiais
  for update to authenticated
  using      (public.meu_perfil() in ('gestor','recepcionista'))
  with check (public.meu_perfil() in ('gestor','recepcionista'));
-- Sem policy de delete: material nunca é excluído (regra K-3).

drop policy if exists estoque_mov_select on public.estoque_movimentos;
create policy estoque_mov_select on public.estoque_movimentos
  for select to authenticated
  using (public.meu_perfil() in ('gestor','recepcionista','corte'));

drop policy if exists estoque_mov_insert on public.estoque_movimentos;
create policy estoque_mov_insert on public.estoque_movimentos
  for insert to authenticated
  with check (
    feito_por = public.meu_id_equipe()
    and (
      public.meu_perfil() in ('gestor','recepcionista')
      or (public.meu_perfil() = 'corte' and tipo in ('saida','devolucao'))
    )
  );
-- Sem policy de update/delete: movimento é imutável (regra K-2).

commit;

-- Conferência (rodar depois, separado). Esperado: 2 | true | true | 5 | 2
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('materiais','estoque_movimentos')) as tabelas,
  (select relrowsecurity from pg_class where relname = 'materiais')                 as rls_materiais,
  (select relrowsecurity from pg_class where relname = 'estoque_movimentos')        as rls_movimentos,
  (select count(*) from pg_policies
    where tablename in ('materiais','estoque_movimentos'))                          as policies,
  (select count(*) from pg_trigger
    where tgname in ('estoque_movimentos_aplicar','materiais_guard'))               as triggers;
```

---

## K0b — Migration 020 (Felipe roda) — feita depois das respostas do Pedro

Corte passa a poder dar entrada e ajustar (não só saída/devolução), e o banco descarta o custo
que vier de um movimento gravado pelo corte. Criar o arquivo exatamente assim e **parar**.

### `supabase/migrations/020_almoxarifado_corte.sql`

```sql
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
```

---

## K1 — Tipos, `almoxarifado.ts` e permissões (sem tela) — FEITA

> **K1b (ajuste depois das respostas do Pedro):** troque o campo `retirarMaterial` por
> **`movimentarEstoque`** em `Permissoes` (entrada, fechar corte e ajuste). `editarAlmoxarifado`
> passa a significar **só** cadastrar/editar material. `ACESSO_TOTAL`: os dois `true`.
> `LEITURA_PRODUCAO`: os dois `false`. `CORTE`: `movimentarEstoque: true`,
> `editarAlmoxarifado: false` (e `verFinanceiro` continua `false`, herdado). Atualize os usos em
> `almoxarifado.ts`, se houver. Em `almoxarifado.ts`, acrescente também:
> - `TIPO_LABEL`: `entrada`→"Entrada", `saida`→"Saída", `devolucao`→**"Sobra"**,
>   `ajuste`→"Ajuste". Na tela, devolução se chama sempre **Sobra**.
> - `CATEGORIAS_ATIVAS: CategoriaMaterial[] = ['malha', 'tecido_plano']` — o que os seletores
>   oferecem. Material antigo de outra categoria continua aparecendo na lista.
> - `getMaterialDoPedido(pedidoId)` → por material: `comprado` (Σ entradas com aquele
>   `pedido_id`), `jaSaiu` (Σ |saídas| com aquele `pedido_id`) e `sobrou` (Σ devoluções). Usado
>   pela K4.
>
> O texto original da K1 continua abaixo como referência; onde ele diz `retirarMaterial`, leia
> `movimentarEstoque`.

### `src/types/index.ts`

```ts
export type CategoriaMaterial = 'malha' | 'tecido_plano' | 'aviamento' | 'estamparia' | 'embalagem' | 'outro'
export type UnidadeMaterial = 'kg' | 'm' | 'un' | 'cone' | 'rolo' | 'l'
export type TipoMovimento = 'entrada' | 'saida' | 'devolucao' | 'ajuste'

export interface Material {
  id: string
  nome: string
  cor: string            // '' = sem cor
  categoria: CategoriaMaterial
  unidade: UnidadeMaterial
  saldo: number
  estoqueMinimo: number | null
  local: string | null
  custoUnitario: number | null
  observacoes: string | null
  ativo: boolean
  updatedAt: string
}

export interface MovimentoEstoque {
  id: string
  materialId: string
  material?: Pick<Material, 'nome' | 'cor' | 'unidade'>
  tipo: TipoMovimento
  quantidade: number     // com sinal, como está no banco
  saldoDepois: number | null
  pedidoId: string | null
  numeroPedido?: string | null
  fornecedor: string | null
  notaFiscal: string | null
  custoUnitario: number | null
  observacao: string | null
  feitoPor: string | null   // nome, via join em equipe
  criadoEm: string
}
```

### `src/lib/almoxarifado.ts` (novo)

Client autenticado função por função (`criarClienteBrowser()`), igual `kanban.ts` e `prestadores.ts`.
Mapeamento snake_case ↔ camelCase aqui dentro.

- `CATEGORIA_LABEL`, `UNIDADE_LABEL` (`kg`→"kg", `m`→"m", `un`→"un", `cone`→"cone", `rolo`→"rolo", `l`→"L")
  e `UNIDADE_PADRAO: Record<CategoriaMaterial, UnidadeMaterial>` (`malha`→`kg`, `tecido_plano`→`m`,
  o resto→`un`). O padrão só preenche o campo; a pessoa pode trocar.
- `formatarQuantidade(valor, unidade)` — pt-BR. `kg`: até 1 casa ("64,5 kg"); `m` e `l`: até 2;
  o resto: inteiro. Sempre com a unidade no fim.
- `situacaoMaterial(m)` → `'negativo' | 'abaixo' | 'ok' | 'sem_minimo'`. Negativo: `saldo < 0`.
  Abaixo: `estoqueMinimo != null && saldo < estoqueMinimo`. **Uma função só** — a lista, o
  detalhe e o card de resumo usam a mesma.
- `getMateriais({ incluirInativos? })` — ordem `categoria, nome, cor`.
- `getMaterial(id)`.
- `criarMaterial(dados)` / `atualizarMaterial(id, dados)` — **nunca** mandam `saldo` (regra K-1).
  Erro de duplicata (índice `materiais_nome_cor_key`, código `23505`) vira mensagem própria:
  "Já existe Malha PV Branco cadastrado."
- `registrarMovimentos(lista)` — recebe `{ materialId, tipo, quantidade (positiva), pedidoId?,
  fornecedor?, notaFiscal?, custoUnitario?, observacao? }[]`, aplica o sinal (regra K-4)
  e faz **um único `insert` do array** (não mande `feito_por`: o trigger preenche com quem está logado, e a policy confere)
  — um insert com várias linhas é uma transação só: ou entram todas, ou nenhuma. Ajuste recebe
  quantidade já com sinal (ver K5).
  - Em entrada com `custoUnitario`, depois do insert atualiza `materiais.custo_unitario` daquele
    material para o valor novo (último custo conhecido).
- `getMovimentos({ materialId?, tipo?, desde?, ate?, busca?, pagina, porPagina = 50 })` —
  paginação no banco com `.range()` e `count: 'exact'`. Join: `materiais(nome,cor,unidade)`,
  `equipe(nome)` via `feito_por`, `pedidos(numero)` via `pedido_id`.

### `src/lib/permissoes.ts`

Dois campos novos no tipo `Permissoes`, com comentário no estilo dos outros:

- `editarAlmoxarifado` — cadastrar/editar material, dar entrada, ajustar estoque.
- `retirarMaterial` — registrar saída e devolução.

`ACESSO_TOTAL`: os dois `true` (`RECEPCIONISTA` herde pelo spread). `LEITURA_PRODUCAO`: os dois
`false`. **Novo objeto `CORTE`**, porque o corte passa a divergir do resto da produção (é o caso
previsto no comentário do `LEITURA_PRODUCAO`):

```ts
const CORTE: Permissoes = {
  ...LEITURA_PRODUCAO,
  rotas: [...(LEITURA_PRODUCAO.rotas as string[]), '/almoxarifado'],
  retirarMaterial: true,
}
```

e `corte: CORTE` em `PERMISSOES`. `rotaInicial` do corte continua `/producao`.

Nenhuma tela muda nesta etapa. `npx tsc --noEmit` limpo. Não commitar sozinha — vai junto com a K2.

---

## K2 — Estoque, cadastro e detalhe do material

### Sidebar

Item **Almoxarifado** (`/almoxarifado`, ícone `Warehouse` do lucide — se não existir na 0.400,
use `Boxes`), logo depois de **Entregas**. A sidebar já filtra por `podeAcessarRota`.

### `/almoxarifado` — Estoque (tela principal)

Cabeçalho: título "Almoxarifado", subtítulo curto. Botões à direita conforme permissão:
**Registrar entrada** e **Fechar corte** (os dois `movimentarEstoque`).

Abas (links simples, mesma barra em todas as telas da fase): **Estoque** · **Entrada** ·
**Corte** · **Movimentações**. Cada aba só aparece para quem pode usá-la.

Categorias nos chips e no modal: só `CATEGORIAS_ATIVAS` (malha e tecido plano). Campo **Local**
com placeholder "Ex.: A1" — as prateleiras vão ser numeradas assim.

Cards de resumo (4, mesmo estilo do `/dashboard`):
1. **Malha** — soma dos saldos em kg das categorias `malha` (ex.: "2.184 kg").
2. **Tecido plano** — soma em m.
3. **Abaixo do mínimo** — contagem de `situacaoMaterial ∈ {abaixo, negativo}`; vermelho só se `> 0`.
4. **Valor em estoque** — Σ `saldo × custoUnitario` (só materiais com custo e saldo > 0).
   **Só aparece com `verFinanceiro`**; sem ele, ficam 3 cards.

Filtros: busca (nome, cor, local), chips de categoria, chip **"Abaixo do mínimo"**, checkbox
"Mostrar desativados". Guardar filtro em `localStorage` como `/producao` faz.

Tabela: Material · Cor (texto) · Saldo
(`formatarQuantidade`) · Mínimo · Local · Custo/un. (só `verFinanceiro`) · Situação (badge:
Negativo — conferir / Abaixo / Ok; nada quando `sem_minimo`). Ordem padrão: situação (negativo,
abaixo, resto) e depois nome. Clique na linha abre o detalhe. No celular vira lista de cartões.

Botão **+ Novo material** (`editarAlmoxarifado`) abre o `Modal` (o de `components/kanban/`, já
usado fora do Kanban): nome, cor, categoria, unidade (pré-preenchida por `UNIDADE_PADRAO`),
estoque mínimo, local, custo/un. (só `verFinanceiro`), observações. **Saldo não é campo** — o
material nasce com 0 e o saldo inicial entra pela tela de Entrada ou por ajuste (K5).

Estado vazio (nenhum material ainda): texto curto "Nenhum material cadastrado" + botão de
cadastrar. Skeleton com `useSkeletonDelay` + `EsqueletoBarra`, erro de carga com
`classificarErro`, igual às outras listas.

### `/almoxarifado/[id]` — Detalhe

Topo: nome + cor, categoria, local. Cards: **Saldo**, **Mínimo**, **Situação**, **Custo/un.**
(este só `verFinanceiro`). Botões: **Editar** (mesmo modal), **Desativar/Reativar**
(`editarAlmoxarifado`; desativar pede confirmação e explica que o histórico continua).

Abaixo: últimos movimentos deste material via `getMovimentos({ materialId })`, paginado, mesmas
colunas da tela de Movimentações (K5). O botão **Ajustar estoque** entra aqui na K5.

**Teste da K2:** cadastrar `TESTE — não usar` (malha, kg), conferir que nasce com saldo 0, que
nome+cor repetido dá a mensagem de duplicata, que o login do Marquinhos vê a aba com
"Registrar entrada" e "Fechar corte", mas sem "+ Novo material", sem Editar/Desativar e sem
nenhum R$. Commit K1 + K2 juntos.

---

## K3 — Entrada (compra recebida)

`/almoxarifado/entrada` — `movimentarEstoque` (Pedro, Kalomira e Marquinhos recebem compra).

- Cabeçalho da compra: **Fornecedor** (texto livre, com sugestão dos fornecedores já usados —
  `distinct fornecedor` dos movimentos), **Nota fiscal** (opcional), **Data** = hoje, só leitura
  (o movimento grava `criado_em = now()`; não existe entrada retroativa nesta fase).
- **Comprado para o pedido** (opcional, mesmo seletor de pedido da K4): a compra é "contada" e
  quase sempre é para um pedido. Quando escolhido, todas as linhas gravam esse `pedido_id`, e é
  isso que a tela de Fechar corte usa para pré-preencher. Sem pedido = compra para estoque
  (ex.: os brancos de estoque mínimo).
- Quem não tem `verFinanceiro` (corte) **não vê** os campos de custo nem subtotal; a entrada
  dele grava sem custo (e o banco descarta se vier, migration 020).
- O atalho "Cadastrar material" só aparece com `editarAlmoxarifado`. Para o corte, o texto é
  "Não achou o tecido? Peça para o Pedro ou a Kalomira cadastrar."
- Linhas: **Material** (seletor com busca por nome e cor, só ativos), **Quantidade** (positiva,
  na unidade do material, mostrada ao lado do campo), **Custo/un.** (só `verFinanceiro`,
  opcional), **Subtotal** (só `verFinanceiro`). "+ Adicionar item". Remover linha.
  Atalho "Material não está na lista? Cadastrar" abre o modal da K2 e já seleciona o novo.
- Resumo lateral "Como o estoque fica": para cada linha, `saldo atual → saldo depois`, e aviso
  verde quando o material sai de "abaixo do mínimo".
- **Confirmar entrada** → `registrarMovimentos` (um insert só). Sucesso: volta para
  `/almoxarifado` com aviso "Entrada registrada: 3 itens". Erro: a tela **não** limpa o formulário
  e diz o que falhou (regra 10 do sistema: a tela nunca mostra o que o banco não tem).
- Validação: quantidade > 0, material escolhido, sem o mesmo material em duas linhas (junta ou avisa).

**Teste:** entrada de 10 kg no material TESTE → saldo 10; conferir no detalhe o movimento com
`saldo_depois = 10` e o nome de quem fez.

---

## K4 — Fechar corte (lançar sobra) — revisada em 15/10

`/almoxarifado/corte` — `movimentarEstoque`. **Feita para o celular primeiro** (é a tela do
Marquinhos no corte): campos grandes, um material por vez visível, botão de confirmar no fim.

Por que mudou: a compra é "contada" para o pedido, e o Marquinhos não pesa o que pega — ele
**só informa o que sobrou**. Então a tela pergunta a sobra, não a retirada.

- **Pedido**: seletor com busca por número/cliente, só pedidos ativos (status `aprovado`,
  `aguardando_pagamento`, `em_producao`) — use `getPedidosLista({ status… })`. Opção
  **"Sem pedido (uso interno)"**, que então exige uma observação (amostra, teste, conserto…).
- Ao escolher o pedido, `getMaterialDoPedido` pré-preenche uma linha por material comprado para
  ele, mostrando **"Comprado para este pedido: 50,0 kg"** (menos o que já saiu, se o corte foi
  fechado em partes).
- Cada linha tem dois campos, na unidade do material:
  - **Usou do estoque** — pré-preenchido com o comprado − já saiu; editável. É a saída.
  - **Sobrou** — o que ele mediu/pesou e volta para a prateleira. Padrão 0. É a sobra
    (movimento `devolucao`, chamado de **Sobra** na tela).
  - Abaixo do "Sobrou", texto fixo: **"Só lance sobra que dá pelo menos 1 peça (80 cm). Retalho
    menor não entra."**
- "+ Outro material do estoque": linha nova com Material + Usou + Sobrou, para tecido que ele
  pegou da prateleira (não comprado para o pedido).
- Ao lado de cada linha: saldo atual. Se a saída deixar o saldo negativo, aviso amarelo
  **"O sistema tem só 6,0 kg. Confira — vai ficar negativo."** e o botão continua habilitado
  (decisão: saldo pode ficar negativo).
- Resumo antes de confirmar: "Usou 45,5 kg · Sobrou 4,5 kg volta para o estoque".
- Confirmar → **um** `registrarMovimentos` com a saída (`saida`, Usou) e a sobra (`devolucao`,
  Sobrou > 0) de cada linha, todas com o `pedido_id`. Linha com Usou = 0 e Sobrou = 0 é ignorada.
  Erro: não limpa o formulário (regra 10).
- No detalhe do pedido (`/pedidos/[id]`) **não** mexer nesta fase.

**Teste:** entrada de 10 kg no TESTE ligada a um pedido existente (só leitura do pedido) →
fechar corte desse pedido: o "Usou" vem 10, digitar Sobrou 2 → saldo 2 (10 − 10 + 2); fechar de
novo o mesmo pedido: o pré-preenchido vem 0; "+ Outro material" TESTE com Usou 20 → aviso de
negativo e saldo −18 com badge "Negativo — conferir". Testar também com o login do Marquinhos.

---

## K5 — Movimentações, ajuste e CSV

### `/almoxarifado/movimentacoes`

Lista paginada no banco (50 por página, `getMovimentos`). Colunas: Quando · Tipo (badge:
Entrada verde, Saída vermelho, Sobra azul, Ajuste amarelo) · Material · Quantidade (com sinal
e unidade, verde/vermelho) · Saldo depois · Pedido/NF (número do pedido vira link) · Quem ·
Observação. Filtros: tipo, período (este mês / mês passado / últimos 7 dias / tudo), busca por
material ou fornecedor. Corte vê a tela também (só leitura, sem custo).

Cards no topo, do período filtrado: **Entradas**, **Saídas**, **Sobras**, **Ajustes** —
separados por unidade quando houver mais de uma ("+1.240 kg · +85 m"), nunca somando kg com m.

**Exportar CSV** (`baixarCsv`) com o filtro atual — busca todas as páginas do filtro, não só a
visível. Custo/un. no CSV só com `verFinanceiro`.

**Atalho "Sobras da semana"** (o relatório que o Pedro pediu para olhar toda semana): botão
no topo que aplica tipo = Sobra + período = últimos 7 dias, e mostra embaixo um resumo **por
material** ("Malha PV Branco: 4,5 kg · Tactel Azul: 2,3 m") somando as sobras do período. O CSV
desse filtro serve de relatório. Nada de tela nova — é filtro + resumo na mesma tela.

### Ajustar estoque (no detalhe do material)

Botão **Ajustar estoque** (`movimentarEstoque` — o Marquinhos também corrige). Modal: "Quanto tem na prateleira agora?"
(valor contado, ≥ 0) + motivo obrigatório (seletor: Contagem / Saldo inicial / Perda / Outro +
texto). Mostra "Sistema: 64,0 kg → Contado: 63,2 kg → Ajuste: −0,8 kg". Diferença zero = botão
desabilitado. Grava um movimento `ajuste` com `quantidade = contado − saldo` (aqui já vai com
sinal) e observação = motivo.

É por aqui que o Pedro lança o **saldo inicial** de cada material quando for começar a usar.

**Teste:** ajustar TESTE de −12 para 0 com motivo "Contagem"; conferir que aparece na lista com
o nome de quem fez. No fim, **desativar o material TESTE**.

### Fechamento da fase

- `CLAUDE.md`: módulo `/almoxarifado` na tabela de módulos, `materiais` e `estoque_movimentos`
  em "Modelo de dados" (atualize a contagem de tabelas: +2), `almoxarifado.ts` em "Código
  compartilhado", regras K-1 a K-4 em "Regras de negócio".
- `CHANGELOG.md` depois da aprovação do Felipe.
- Próxima migration livre: `021_` (a 020 é da K0b).

---

## Fora desta fase (próximas)

- **Fase K2 — Cálculo de consumo + reserva.** Começa quando o Pedro responder a rodada 2
  (enviada em 15/10). Já sabemos a forma: **existe uma conta para cada tipo de peça, por
  tamanho, com média**, e com três faixas — infantil (`01`–`14`), adulto (`PP`–`GG`) e acima do
  GG (`XGG`, `EXG`, `G1`+). O modelo muda o consumo. Existe uma % de perda (valor pendente).
  Provável tabela `material_consumo (tipo_peca, material_id, faixa, consumo_por_peca)`.
  - **Pré-requisito:** o tecido vira **campo de cada peça** no `/novo-pedido` (o Marquinhos já
    lê o tecido no pedido — hoje fora do sistema). Sem isso não dá para calcular nem reservar.
  - **Reserva:** quando o pedido entra e o tecido já existe no estoque, reservar; quando não
    existe, desconta só ao fechar o corte (resposta do Pedro). Pendente: e se tiver só parte?
- **Sobra mínima em kg para malha** (80 cm vale para tecido; pergunta 7 da rodada 2).
- **Etiqueta/QR por rolo** — o Pedro quer, mas depois.
- **Alerta de mínimo no sino do dashboard** e **lista de compra**.

### Rodada 2 de perguntas ao Pedro (enviada em 15/10/2026, aguardando)

1. Conta de consumo por peça × faixa de tamanho (kg ou m). 2. % de perda. 3. 2–3 pedidos reais
(peças, comprado, sobrou). 4. Onde o tecido da peça está escrito hoje + ok para campo "Tecido".
5. Malha em metro: sempre a mesma ou alterna? 6. Compra contada é sempre para um pedido só?
7. Sobra mínima de malha em kg. 8. Reserva parcial. 9. Quantidades do estoque mínimo dos 3
brancos. 10. Marquinhos cadastra tecido novo? 11. Quem faz a primeira contagem e numera as
prateleiras.
