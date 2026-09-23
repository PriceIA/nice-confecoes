# Fase I — "Aguardando o cliente" (+ correção de fuso nas datas)

**Spec escrita em 23/09/2026 pelo Claude (Cowork), aprovada pelo Felipe no mesmo dia.**
Este documento é o handoff: o Claude Code lê daqui, executa **SÓ a etapa marcada como ATUAL**,
e depois preenche a seção "Registro" no fim deste arquivo (o que fez, o que viu, o que ficou em
dúvida). O Claude (Cowork) lê o registro e escreve a etapa seguinte aqui mesmo.

Mockup aprovado: artifact "Aguardando o cliente — mockup" (7 telas).

> **ETAPA ATUAL: I0** — nada além dela. Terminou? Preencha o Registro e pare.

---

## 0. Regras desta fase (leia antes de qualquer coisa)

1. **Uma etapa = um commit.** Nunca junte duas.
2. **Commit e push só depois que o Felipe testar em localhost e aprovar.** Até lá, o código fica
   só no disco. `npm run build` (não só `tsc --noEmit`) antes de qualquer push.
3. **`npm run dev` é produção** (CLAUDE.md). Teste de I0 é **só leitura**. Nas etapas que gravam
   (I2 em diante), teste só com pedido real que esteja de verdade na situação, nunca invente.
4. **SQL: o Claude Code nunca executa.** Escreve o arquivo em `supabase/migrations/` e o
   Felipe roda no SQL Editor.
5. **Cores só por tokens semânticos** (`bg-superficie`, `text-conteudo`, `bg-blue-100
   text-blue-700`...). Nunca `bg-white`/`text-gray-500`.
6. **Regras de perfil só em `src/lib/permissoes.ts`.** Regras de "aguardando o cliente" só em
   `src/lib/aguardandoCliente.ts` (etapa I2). Tela nenhuma reimplementa.
7. **CHANGELOG.md e CLAUDE.md só no fim (I6), depois da aprovação do Felipe.**
8. Nada de biblioteca nova. `package.json` não muda.

---

## Decisões já tomadas (não reabrir)

- **"Pronto para retirada"** = status `finalizado` **OU** todas as etapas concluídas/não
  aplicáveis (`pedidoConcluido`). O `/entregas` passa a usar esse mesmo critério.
- **Atraso da Nice** = ativo, prazo vencido e **não** pronto. Pronto + vencido + sem resposta
  vai para o grupo "confirmar entrega", não para atrasados.
- **Quem responde** = só gestor (Pedro) e recepcionista (Kalomira). Nova permissão
  `responderEntrega`. O RLS de `pedidos` já só deixa esses dois gravarem.
- **Lembrete = diário.** Se a última confirmação (ou o registro) foi antes de hoje (dia de
  calendário), aparece "Ainda aguardando o cliente?". Se o cliente combinou um dia pra buscar,
  guarda-se `previsaoRetirada` e o lembrete só volta a partir desse dia.
- **Relatório** = sempre dá pra ver E extrair: seção nova em `/relatorios` + botão "Exportar
  CSV" (abre no Excel).
- Campo JSONB `pedidos.aguardando_cliente` (mesmo padrão de `excecao_pagamento`), **não** um
  status novo. Migration **017** (a 016 já rodou em 29/08).

---

## I0 — Corrigir o fuso das datas (`date` do banco lido como UTC)  ← ATUAL

### O problema

Colunas `date` (`data_entrega`, `data_envio`...) chegam do Supabase como `'2026-09-23'`.
`new Date('2026-09-23')` é **meia-noite UTC**, que em Brasília é **22/09 às 21h**. Resultado:

- `/relatorios`: `new Date(\`${mes}-01\`)` → 31/08 → `startOfMonth` = **01/08**. Com setembro
  escolhido, o relatório calcula **agosto** e o título diz "agosto de 2026". **É o mais grave.**
- `prazoTexto` (helpers.ts): pedido que vence hoje aparece "atrasado 1 dia" no `/dashboard`.
- `format(new Date(pedido.dataEntrega))` mostra **um dia antes** em `/pedidos`, `/pedidos/[id]`
  (tela e impressão), `/relatorios` e no texto sugerido do cartão do Kanban.
- `pedidosStats` (store.ts): pedido que vence hoje não entra em "entregam em 7 dias".

`badgePrazo` (kanban-ui.ts) e as parcelas em `/pedidos/[id]` já fazem certo (`+ 'T00:00:00'`),
por isso `/entregas` e `/dashboard` discordam hoje.

**Confirme o bug antes de mexer** (só leitura, uma linha):

```
node -e "process.env.TZ='America/Sao_Paulo'; console.log(new Date('2026-09-01').toString())"
```

Deve imprimir `Mon Aug 31 2026 21:00:00 ...`. Anote no Registro.

### O que fazer

**1. `src/lib/helpers.ts`** — adicionar, perto de `prazoTexto`:

```ts
/**
 * Lê uma data do banco no fuso LOCAL.
 *
 * Coluna `date` chega como 'AAAA-MM-DD', e `new Date('AAAA-MM-DD')` é meia-noite
 * UTC — em Brasília, 21h do DIA ANTERIOR. Foi o que fazia /relatorios calcular o
 * mês anterior e o dashboard chamar de "atrasado" o pedido que vence hoje (Fase I0).
 * Valor com hora (timestamptz, ISO completo) já traz fuso e passa direto.
 */
export function dataLocal(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `dataLocal` + `format`. Data ausente ou inválida vira '—', nunca "Invalid Date". */
export function formatarData(valor: string | null | undefined, padrao = 'dd/MM/yyyy'): string {
  const d = dataLocal(valor)
  return d ? format(d, padrao) : '—'
}
```

E em `prazoTexto`, trocar:

```ts
  if (!dataEntrega) return { texto: 'sem data', tom: 'sem_data', data: null, dias: null }
  const d = new Date(dataEntrega)
  if (Number.isNaN(d.getTime())) return { texto: 'sem data', tom: 'sem_data', data: null, dias: null }
```

por:

```ts
  const d = dataLocal(dataEntrega)
  if (!d) return { texto: 'sem data', tom: 'sem_data', data: null, dias: null }
```

**2. `src/lib/store.ts`** — `pedidosStats`, o filtro `entregaEm7dias`: trocar a comparação com
`new Date(p.dataEntrega)` por `prazoTexto` (importar de `./helpers`):

```ts
    entregaEm7dias: pedidos.filter(p => {
      if (['entregue', 'cancelado'].includes(p.status)) return false
      const { dias } = prazoTexto(p.dataEntrega)
      return dias !== null && dias >= 0 && dias <= 7
    }).length,
```

(`hoje`/`em7dias` ficam sem uso, então apague as duas.)

**3. Trocar `format(new Date(X), 'padrão')` por `formatarData(X, 'padrão')`** nestes pontos,
e só nestes:

| Arquivo | Linha (aprox.) | Campo |
|---|---|---|
| `src/app/pedidos/[id]/page.tsx` | 83 (impressão) | `pedido.dataEntrega`, `'dd/MM/yy'` |
| `src/app/pedidos/[id]/page.tsx` | 1048 | `pedido.dataEntrega` |
| `src/app/pedidos/page.tsx` | 75 | `p.dataEntrega` |
| `src/app/relatorios/page.tsx` | 123 | `p.dataEntrega`, `'dd/MM'` |
| `src/app/terceirizadas/page.tsx` | 374 | `t.dataEnvio` |
| `src/lib/kanban-ui.ts` | 168 | `pedido.dataEntrega` |

**Não mexa** em `dataEntrada`, `atualizadoEm`, `solicitadoEm` etc.: são `timestamptz`, com
fuso, e já estão certos. Também não mexa nos pontos que já usam `+ 'T00:00:00'`.

**4. `src/app/relatorios/page.tsx`** — o mês:

```ts
  const base = dataLocal(`${mes}-01`) ?? new Date()
  const inicio = startOfMonth(base)
  const fim = endOfMonth(base)
```

e o título (linha ~45): `format(base, "MMMM 'de' yyyy", { locale: ptBR })`.

Se algum `import { format } from 'date-fns'` ficar sem uso, remova (o lint derruba o build).

### Como testar (só leitura, o Felipe confere)

- `/relatorios`: o título mostra **setembro de 2026**, e "Pedidos no mês" muda em relação a
  antes (anote os dois números).
- Um pedido com entrega **hoje** (se houver): `/dashboard` diz "entrega hoje", não "atrasado 1
  dia"; a data em `/pedidos` e em `/pedidos/[id]` bate com o campo de data do modo Editar.
- `/terceirizadas`: a data de envio bate com o que foi lançado.
- `tsc --noEmit` e `npm run build` limpos.

Commit (depois da aprovação): `fix: datas do banco lidas no fuso local (relatório mostrava o mês anterior)`

---

## I1 — Migration 017 + tipos + store  (não executar ainda)

1. Criar `supabase/migrations/017_aguardando_cliente.sql`:

```sql
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
```

2. **Pare e peça ao Felipe para rodar a 017.** Só continue depois que ele confirmar.
3. `src/types/index.ts`:

```ts
export type MotivoAguardando = 'pagamento' | 'sem_tempo' | 'outro'

export interface AguardandoCliente {
  motivo: MotivoAguardando
  /** Até 120 caracteres. Obrigatória quando motivo = 'outro'. */
  observacao?: string
  /** 'AAAA-MM-DD'. Cliente combinou de buscar neste dia: o lembrete só volta a partir dele. */
  previsaoRetirada?: string
  registradoPor: string
  /** ISO 8601. */
  registradoEm: string
  /** Última resposta "ainda aguardando". Base do lembrete diário. */
  confirmadoPor?: string
  confirmadoEm?: string
}
```

   Em `Pedido` **e** `PedidoLista`: `aguardandoCliente?: AguardandoCliente | null`
   (`undefined` = não se aplica; `null` só existe na ESCRITA, para limpar).
4. `src/lib/store.ts`: `mapPedido` e `mapPedidoLista` → `aguardandoCliente:
   row.aguardando_cliente ?? undefined`; `getPedidosLista` → acrescentar `aguardando_cliente`
   ao select; `atualizarPedido` → `if (dados.aguardandoCliente !== undefined)
   update.aguardando_cliente = dados.aguardandoCliente` (o `null` passa e limpa).
5. Nenhuma tela muda. Teste: as telas de lista carregam normalmente.

Commit: `feat: coluna aguardando_cliente no pedido (migration 017)`

---

## I2 a I6 — resumo (o detalhe de cada uma é escrito aqui antes de executar)

- **I2** — `src/lib/aguardandoCliente.ts` (único lugar das regras: `prontoParaRetirada`,
  `perguntarEntrega`, `estaAguardando`, `atrasoDaNice`, `lembreteDevido`, `diasAguardando`,
  `motivoSugerido`, `saldoEmAberto`, `registrar`, `confirmar`), permissão `responderEntrega`
  em `permissoes.ts`, componentes `src/components/entrega/ModalNaoRetirou.tsx` e
  `CartaoEntrega.tsx`, e o cartão + selo em `/pedidos/[id]`.
- **I3** — `/entregas`: critério `prontoParaRetirada`, botão "Não retirou…" nos vencidos, seção
  "Aguardando o cliente" com pílulas (pedidos, peças paradas, a receber).
- **I4** — `/dashboard`: `atrasados` → `atrasoDaNice`; grupos novos no sino com botões
  curtos; selos; badge azul na coluna de prazo; chip "Aguardando cliente".
- **I5** — `/relatorios`: seção "Aguardando o cliente" + "Exportar CSV" (separador `;`, BOM
  UTF-8 pra abrir certo no Excel).
- **I6** — CHANGELOG.md e CLAUDE.md (só depois da aprovação final).

---

## Registro (o Claude Code preenche)

### I0
- Confirmação do bug (saída do `node -e`): `Mon Aug 31 2026 21:00:00 GMT-0300 (Horário Padrão de Brasília)` — bateu com o esperado.
- Antes de mexer (Felipe conferiu em localhost, campo mês = setembro/2026): título "Agosto De 2026", Pedidos no mês = 31, Entregues = 16, Cancelados = 0, Receita = R$ 4688.00.
- Arquivos alterados:
  - `src/lib/helpers.ts` — `dataLocal`/`formatarData` novos; `prazoTexto` lê a data com `dataLocal`.
  - `src/lib/store.ts` — import de `prazoTexto`; `pedidosStats.entregaEm7dias` agora usa `prazoTexto` em vez de comparar `Date` direto; `hoje`/`em7dias` removidos.
  - `src/app/pedidos/[id]/page.tsx` — `formatarData` para `pedido.dataEntrega` (linhas do cabeçalho impresso e do card de entrega). `dataEntrada` e os timestamps de exceção/parcela não foram tocados.
  - `src/app/pedidos/page.tsx` — `formatarData` para `p.dataEntrega` na tabela.
  - `src/app/relatorios/page.tsx` — `base = dataLocal(`${mes}-01`) ?? new Date()`; `inicio`/`fim` derivados de `base`; título usa `format(base, ...)`; linha da tabela usa `formatarData(p.dataEntrega, 'dd/MM')`.
  - `src/app/terceirizadas/page.tsx` — `formatarData(t.dataEnvio)`; import de `format`/`date-fns` removido (ficou sem outro uso).
  - `src/lib/kanban-ui.ts` — `formatarData(pedido.dataEntrega)` em `descricaoSugerida`; `badgePrazo` não mudou (já usava `+'T00:00:00'`).
- tsc / build: `npx tsc --noEmit` limpo. `npm run build` compilou sem erro — só os 4 warnings de lint que já existiam antes (`react-hooks/exhaustive-deps` em configuracoes e pedidos/[id], `no-img-element` em pedidos/[id], FotoUpload e MiniaturaArquivo), nenhum novo.
- "Pedidos no mês" em /relatorios, antes → depois (testado pelo Claude do Cowork pelo navegador, campo mês = setembro/2026):
  - antes: título "Agosto De 2026" — 31 pedidos / 16 entregues / 0 cancelados / R$ 4688.
  - depois: título "Setembro De 2026" — 26 pedidos / 2 entregues / 1 cancelado / R$ 390. Escolhendo agosto agora mostra os números antigos (31/16/0/4688) — confirma que era mesmo o mês anterior sendo calculado.
  - Data de pedido conferida: #2026-0063 TOKA era 25/10 e passou a 26/10 (valor real do banco); #2026-0064 mostra 11/09/2026 igual na lista, no detalhe e na impressão.
- Dúvidas / algo diferente do esperado:
  - A extensão do Claude in Chrome não conectou nesta sessão, então a checagem "antes" do passo 2 foi feita pelo Felipe manualmente, não por mim.
  - Rodar `npm run build` com o `npm run dev` ainda de pé (mesma pasta `.next`) derrubou o dev server (`Cannot find module './426.js'`, 500 em qualquer rota) — tive que matar o processo (PID na porta 3002) e subir o `npm run dev` de novo. Não é um problema do código da I0; é o build de produção e o dev server disputando o mesmo `.next`. Registrando para não repetir a sequência build→dev sem reiniciar nas próximas etapas.
- Commit (hash), depois da aprovação do Felipe:
