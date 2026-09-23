# Fase I — "Aguardando o cliente" (+ correção de fuso nas datas)

**Spec escrita em 23/09/2026 pelo Claude (Cowork), aprovada pelo Felipe no mesmo dia.**
Este documento é o handoff: o Claude Code lê daqui, executa **SÓ a etapa marcada como ATUAL**,
e depois registra em `docs/fase-i-registro.md` (o que fez, o que viu, o que ficou em
dúvida). O Claude (Cowork) lê o registro e escreve a etapa seguinte aqui mesmo.

Mockup aprovado: artifact "Aguardando o cliente — mockup" (7 telas).

> **ETAPA ATUAL: commit da I5 → I6.** Uma de cada vez, na ordem. Terminou a I6?
> Registre em `docs/fase-i-registro.md` e pare.
>
> **Este arquivo é só do Cowork. O Claude Code NÃO edita `docs/fase-i.md`.** O registro de
> cada etapa vai em **`docs/fase-i-registro.md`** (acrescentando no fim).

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

## I0 — Corrigir o fuso das datas (`date` do banco lido como UTC)  — feita (`664fea9`)

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

## I1 — Migration 017 + tipos + store  — feita

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

## I2a — Regras + permissão (sem tela)  — feita (`5e1f0f5`)

Só lógica. Nenhuma tela muda nesta etapa. Um commit.

### 1. Novo arquivo `src/lib/aguardandoCliente.ts`

É o **único** lugar que decide "pronto", "atraso da Nice", "perguntar", "lembrete" e "dias
parado". As telas (I2b, I3, I4, I5) só perguntam, igual `excecaoPagamento.ts`. Copie como está:

```ts
import { differenceInCalendarDays } from 'date-fns'
import { AguardandoCliente, MotivoAguardando, Pedido } from '@/types'
import { dataLocal, prazoTexto } from '@/lib/helpers'
import { pedidoConcluido } from '@/lib/kanban-ui'

// Fase I — "Aguardando o cliente".
//
// Pedido pronto que o cliente não vem buscar aparecia como ATRASADO, mas o
// atraso não é da Nice. Tudo o que decide isso mora aqui; /pedidos/[id],
// /entregas, /dashboard e /relatorios só perguntam. Não escreva uma segunda
// versão destas regras numa tela.

/** O que as funções daqui precisam. `Pedido` e `PedidoLista` servem os dois. */
type Base = Pick<Pedido, 'status' | 'dataEntrega' | 'progresso' | 'valorTotal' | 'valorPago' | 'aguardandoCliente'>

/** Lembrete "Ainda aguardando o cliente?" a cada quantos dias (decisão do Pedro: todo dia). */
export const DIAS_LEMBRETE = 1
export const OBSERVACAO_MAX = 120

export const MOTIVO_LABEL: Record<MotivoAguardando, string> = {
  pagamento: 'Falta de pagamento',
  sem_tempo: 'Sem tempo / não veio buscar',
  outro: 'Outro',
}

function ativo(p: Pick<Pedido, 'status'>): boolean {
  return p.status !== 'entregue' && p.status !== 'cancelado'
}

function vencido(p: Pick<Pedido, 'dataEntrega'>): boolean {
  const { dias } = prazoTexto(p.dataEntrega)
  return dias !== null && dias < 0
}

/**
 * Pronto para o cliente retirar: status `finalizado` (clique manual em "Alterar
 * Status") OU todas as etapas concluídas/não aplicáveis (`pedidoConcluido`, o
 * critério que /entregas sempre usou). Os dois sentidos de "finalizado" que o
 * sistema tem hoje valem igual.
 */
export function prontoParaRetirada(p: Pick<Pedido, 'status' | 'progresso'>): boolean {
  return ativo(p) && (p.status === 'finalizado' || pedidoConcluido(p))
}

/** Está no grupo "Aguardando o cliente". */
export function estaAguardando(p: Pick<Pedido, 'status' | 'aguardandoCliente'>): boolean {
  return ativo(p) && !!p.aguardandoCliente
}

/** Pronto, vencido e ninguém respondeu ainda: o sistema pergunta "Já foi entregue?". */
export function perguntarEntrega(p: Base): boolean {
  return prontoParaRetirada(p) && vencido(p) && !p.aguardandoCliente
}

/**
 * Atraso DA NICE: ativo, vencido e ainda não pronto. É o que o /dashboard chama
 * de "atrasado". Pronto + vencido sem resposta vai para `perguntarEntrega`, não
 * para cá.
 */
export function atrasoDaNice(p: Base): boolean {
  return ativo(p) && vencido(p) && !prontoParaRetirada(p) && !p.aguardandoCliente
}

/** Quando o pedido ficou pronto: o último `atualizadoEm` das etapas. `null` se nunca houve clique. */
export function prontoEm(p: Pick<Pedido, 'progresso'>): Date | null {
  let maior: Date | null = null
  for (const e of Object.values(p.progresso ?? {})) {
    if (!e?.atualizadoEm) continue
    const d = new Date(e.atualizadoEm)
    if (!Number.isNaN(d.getTime()) && (!maior || d > maior)) maior = d
  }
  return maior
}

/**
 * Há quantos dias o pedido está parado por conta do cliente: desde o que vier
 * DEPOIS entre o prazo e o dia em que ficou pronto. Se ficou pronto depois do
 * prazo, a espera do cliente só começa quando ficou pronto.
 */
export function diasAguardando(p: Pick<Pedido, 'dataEntrega' | 'progresso'>, hoje = new Date()): number {
  const prazo = dataLocal(p.dataEntrega)
  const pronto = prontoEm(p)
  const inicio = prazo && pronto ? (pronto > prazo ? pronto : prazo) : (prazo ?? pronto)
  if (!inicio) return 0
  return Math.max(0, differenceInCalendarDays(hoje, inicio))
}

export function saldoEmAberto(p: Pick<Pedido, 'valorTotal' | 'valorPago'>): number {
  return Math.max(0, (p.valorTotal ?? 0) - (p.valorPago ?? 0))
}

/** Tem saldo? Sugere "falta de pagamento". Sem saldo, não sugere nada. */
export function motivoSugerido(p: Pick<Pedido, 'valorTotal' | 'valorPago'>): MotivoAguardando | null {
  return saldoEmAberto(p) > 0 ? 'pagamento' : null
}

/**
 * Hora de perguntar de novo "Ainda aguardando o cliente?"
 * - com `previsaoRetirada` no futuro: não pergunta até esse dia;
 * - senão: pergunta se a última confirmação (ou o registro) foi há
 *   `DIAS_LEMBRETE` dia(s) de calendário ou mais.
 */
export function lembreteDevido(p: Pick<Pedido, 'status' | 'aguardandoCliente'>, hoje = new Date()): boolean {
  const a = p.aguardandoCliente
  if (!a || !ativo(p)) return false
  const previsao = dataLocal(a.previsaoRetirada)
  if (previsao && differenceInCalendarDays(previsao, hoje) > 0) return false
  const ultima = new Date(a.confirmadoEm ?? a.registradoEm)
  if (Number.isNaN(ultima.getTime())) return true
  return differenceInCalendarDays(hoje, ultima) >= DIAS_LEMBRETE
}

/** Mensagem de erro do formulário, ou `null` se está ok. */
export function validar(motivo: MotivoAguardando | null, observacao: string): string | null {
  if (!motivo) return 'Escolha o motivo.'
  const obs = observacao.trim()
  if (motivo === 'outro' && !obs) return 'Em "Outro", escreva o motivo — é o que fica registrado no pedido.'
  if (obs.length > OBSERVACAO_MAX) return `A observação passa de ${OBSERVACAO_MAX} caracteres.`
  return null
}

/** Primeiro registro ("Não, o cliente não retirou"). */
export function registrar(
  quem: string,
  motivo: MotivoAguardando,
  observacao?: string,
  previsaoRetirada?: string,
): AguardandoCliente {
  const obs = observacao?.trim()
  return {
    motivo,
    ...(obs ? { observacao: obs } : {}),
    ...(previsaoRetirada ? { previsaoRetirada } : {}),
    registradoPor: quem,
    registradoEm: new Date().toISOString(),
  }
}

/**
 * "Mudar motivo": troca motivo/observação/previsão e conta como confirmação de
 * hoje. Preserva quem registrou e quando — "dias parado" não zera.
 */
export function atualizarMotivo(
  atual: AguardandoCliente,
  quem: string,
  motivo: MotivoAguardando,
  observacao?: string,
  previsaoRetirada?: string,
): AguardandoCliente {
  const obs = observacao?.trim()
  const { observacao: _o, previsaoRetirada: _p, ...resto } = atual
  return {
    ...resto,
    motivo,
    ...(obs ? { observacao: obs } : {}),
    ...(previsaoRetirada ? { previsaoRetirada } : {}),
    confirmadoPor: quem,
    confirmadoEm: new Date().toISOString(),
  }
}

/** "Sim, ainda aguardando": só registra a confirmação de hoje. */
export function confirmar(atual: AguardandoCliente, quem: string): AguardandoCliente {
  return { ...atual, confirmadoPor: quem, confirmadoEm: new Date().toISOString() }
}
```

Se o ESLint reclamar de `_o`/`_p` sem uso, troque por uma cópia e `delete`:
`const resto = { ...atual }; delete resto.observacao; delete resto.previsaoRetirada`.

### 2. `src/lib/permissoes.ts`

Novo campo no tipo `Permissoes`, logo depois de `excluirTerceirizada`:

```ts
  /**
   * Responder "Já foi entregue?" e registrar/confirmar/desfazer "Aguardando o
   * cliente" (Fase I). Só gestor e recepcionista — decisão do Pedro. No banco,
   * `pedidos_write` (009) já restringe a escrita a esses dois perfis.
   */
  responderEntrega: boolean
```

`ACESSO_TOTAL`: `responderEntrega: true` (a `RECEPCIONISTA` herda pelo spread).
`LEITURA_PRODUCAO`: `responderEntrega: false`.

### Teste
`npx tsc --noEmit`. Nenhuma tela muda — o Claude do Cowork confere pelo navegador que as
telas continuam abrindo. **Não rode `npm run build` com o dev de pé.**

Commit: `feat: regras de "aguardando o cliente" e permissão responderEntrega`

---

## I2b — Cartão no pedido + modal  — feita (`2441cc0`)

Segue o mockup (telas 1 a 4). Só tokens semânticos. Ícones do `lucide-react` (`CircleHelp`,
`Hourglass`, `Bell`, `Check`, `RotateCcw`).

### 1. `src/components/entrega/ModalNaoRetirou.tsx` (novo)

- Usa o `Modal` de `@/components/kanban/Modal` (título "O cliente ainda não retirou", ou
  "Mudar motivo" no modo `mudar`; rodapé com Cancelar / Confirmar).
- Props: `pedido` (id, numero, cliente.nome, valorTotal, valorPago, aguardandoCliente),
  `aberto`, `modo: 'registrar' | 'mudar'`, `onFechar`, `onGravado`.
- Três rádios (`MOTIVO_LABEL`), cada um num `<label>` clicável inteiro. Pré-seleção:
  modo `mudar` → o motivo atual; modo `registrar` → `motivoSugerido(pedido)` (com o selo
  "sugerido" e a linha "Falta R$ X — pago R$ Y de R$ Z"). Sem sugestão, nenhum marcado.
- Textarea "Observação" (`maxLength={OBSERVACAO_MAX}`, contador `N/120`), com a dica
  "(opcional — obrigatória em Outro)".
- Campo `<input type="date">` opcional "Combinou de buscar em", `min` = hoje. Explicar em
  uma linha: "até esse dia o sistema não pergunta de novo".
- Faixa `bg-blue-100 text-blue-700`: "O pedido sai de Atrasados e vai para Aguardando o
  cliente. O sistema pergunta de novo todo dia (ou a partir do dia combinado)."
- Confirmar: `validar(...)` → erro em `text-red-700` embaixo; ok → `atualizarPedido(id,
  { aguardandoCliente: modo === 'registrar' ? registrar(...) : atualizarMotivo(...) })`,
  com `quem = membro?.nome ?? 'desconhecido'`. Falha de gravação: mensagem
  "Não foi possível gravar. Tente de novo." (mesmo padrão do modal de exceção).

### 2. `src/components/entrega/CartaoEntrega.tsx` (novo)

- Props: `pedido: Pedido`, `onMudou: () => void`. Usa `useMembro()`.
- Retorna `null` se `!permissoes.responderEntrega`, ou se nem `perguntarEntrega(pedido)`
  nem `estaAguardando(pedido)`.
- **Estado "pergunta"** (`perguntarEntrega`) — mockup tela 1: título "Este pedido já foi
  entregue?", texto com o prazo e há quantos dias venceu (`prazoTexto`), selo âmbar de
  saldo se `saldoEmAberto > 0` e `permissoes.verFinanceiro`. Botões: **"Sim, foi
  entregue"** (`confirm()` igual ao /entregas → `atualizarPedido(id, { status:
  'entregue' })`) e **"Não, o cliente não retirou"** (abre o modal em `registrar`).
- **Estado "aguardando"** (`estaAguardando`) — mockup tela 3: título "Aguardando o
  cliente há N dias" (`diasAguardando`), linha "Pronto desde dd/MM · prazo era dd/MM. Não
  conta como atraso da Nice." (`prontoEm` + `formatarData`), grade com Motivo (+
  observação), Falta receber (só com `verFinanceiro`), Registrado por, e "Combinou de
  buscar em" se houver `previsaoRetirada`. Botões: **"Cliente retirou — marcar entregue"**,
  **"Mudar motivo"** (modal em `mudar`), **"Desfazer"** (`confirm()` → `atualizarPedido(id,
  { aguardandoCliente: null })`).
- **Lembrete** (`lembreteDevido`) — mockup tela 4: faixa acima do estado "aguardando",
  "Ainda aguardando o cliente?", com **"Sim, ainda aguardando"** (`confirmar`) e **"Já
  retirou"** (entregue).
- Toda gravação: botão desabilitado enquanto grava, e `onMudou()` no fim.
- Ao marcar entregue, **não** apague o `aguardandoCliente`: fica de histórico (a I5 usa).

### 3. `src/app/pedidos/[id]/page.tsx`

- Cabeçalho: selo `bg-blue-100 text-blue-700` com `Hourglass` "Aguardando o cliente"
  quando `estaAguardando(pedido)`, ao lado do selo de status.
- `<CartaoEntrega pedido={pedido} onMudou={carregar} />` logo depois do bloco do cabeçalho
  e antes do `{editando && ...}`, e **só quando `!editando`**.

### Teste (Claude do Cowork, pelo navegador)
- Visual, sem gravar: #2026-0015 PIETRA (Finalizado, prazo 31/08) tem que mostrar a
  pergunta; um pedido em produção vencido (ex.: #2026-0064) **não** mostra nada.
- Gravação: só com caso real confirmado pela Kalomira ou pelo Pedro (ex.: se a PIETRA de
  fato ainda não buscou, registrar de verdade). Nada de dado inventado.

Commit: `feat: pergunta "já foi entregue?" e cartão aguardando o cliente no pedido`

---

## I2b-ajustes — revisão do Cowork (fazer antes do commit da I2b)

Testado pelo Cowork no navegador, sem gravar: PIETRA (#2026-0015) e HEBERTON (#2026-0012)
mostram a pergunta; MERCADO SANTA FE (#2026-0064, em produção) não mostra nada; o modal abre
com "Falta de pagamento" sugerido e fecha no Esc. Está certo. Três ajustes:

1. **`moeda()` em `src/lib/helpers.ts`** (junto de `formatarData`), e usar nos dois
   componentes no lugar de `R$ {x.toFixed(2)}`:

   ```ts
   /** Valor em reais no formato brasileiro: 4688 → "R$ 4.688,00". */
   export function moeda(v: number): string {
     return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
   }
   ```

2. **Frase do estado "pergunta"** (`CartaoEntrega.tsx`). Hoje sai "O prazo era 31/08/2026 e
   atrasado 23 dias". Trocar por:
   `O prazo era {prazo.data} — venceu há {N} {N === 1 ? 'dia' : 'dias'}. O pedido está pronto e ninguém confirmou a retirada ainda.`
   com `N = Math.abs(prazo.dias ?? 0)`.

3. **Erro não pode ser silencioso** (`CartaoEntrega.tsx`): `marcarEntregue`, `desfazer` e
   `confirmarLembrete` ganham `catch` que põe num estado `erro` a frase "Não foi possível
   gravar. Tente de novo." e mostra embaixo dos botões em `text-sm text-red-700`. Limpar o
   erro no início de cada ação.

4. Opcional de visual (bate com o mockup): `border-blue-200` no `card` dos dois estados,
   para o cartão se destacar dos outros cards da tela.

"Falta receber" só com saldo > 0: **mantenha assim** (decisão do Cowork, está certo).

Depois: `npx tsc --noEmit`; pare o dev; `npm run build`; suba o dev; commit
`feat: pergunta "já foi entregue?" e cartão aguardando o cliente no pedido`; push.

---

## I3 — `/entregas` com o grupo "Aguardando o cliente"  — feita (`8ec3bed`)

Mockup tela 6. Só `src/app/entregas/page.tsx` (e o que precisar importar). Nada de regra nova
na tela — tudo vem de `@/lib/aguardandoCliente`.

1. **Recortes** (a query continua a mesma, `statusExcluir: ['entregue','cancelado']`):
   - `prontos = pedidos.filter(p => prontoParaRetirada(p) && !estaAguardando(p))`, ordenado
     com `ordenarPedidos(..., 'entrega_asc')` (troca o `sort` com `new Date(...)` atual).
     **Isso muda o critério da tela**: pedido com status `finalizado` e etapa pendente
     passa a aparecer (ex.: PIETRA). É a decisão aprovada — ver "Decisões já tomadas".
   - `aguardando = pedidos.filter(estaAguardando)`, ordenado por `diasAguardando` decrescente.
   - Subtítulo: `N prontos pra entrega · M aguardando o cliente`.

2. **Tabela "Prontos pra entrega"** (a atual, com título de seção `h2`):
   - Coluna Prazo: se `perguntarEntrega(p)` → selo `bg-red-100 text-red-700`
     "Venceu há Nd"; senão o `badgePrazo` de hoje.
   - Embaixo do nome do cliente, com `permissoes.verFinanceiro` e saldo > 0:
     `falta {moeda(saldoEmAberto(p))}` em `text-xs text-fraco`.
   - Ações: além de "Ver" e "Marcar como entregue", quando `perguntarEntrega(p)` e
     `permissoes.responderEntrega`, botão `btn-secondary` **"Não retirou…"** que abre o
     `ModalNaoRetirou` em modo `registrar` (reuso direto; `PedidoLista` serve nas props).
     `onGravado` = `carregar`.
   - Vazio: mantém a mensagem atual.

3. **Seção "Aguardando o cliente"** (só aparece se `aguardando.length > 0`):
   - Título com ícone `Hourglass` numa caixinha `bg-blue-100 text-blue-700`.
   - Pílulas à direita (`bg-superficie border border-borda rounded-full`): `N pedidos`,
     `X peças paradas` (soma de `totalPecas`), e — só com `verFinanceiro` —
     `{moeda(soma dos saldos)} a receber`.
   - Tabela: **Nº** · **Cliente** (embaixo, `text-xs text-fraco`: "confirmado por X há N
     dias" se tiver `confirmadoEm`, senão "registrado por X") · **Motivo** (selo:
     `pagamento` → `bg-amber-100 text-amber-700`; `sem_tempo` → `bg-blue-100 text-blue-700`;
     `outro` → `bg-superficie-3 text-suave`; observação embaixo em `text-xs text-fraco`;
     "combinou dd/MM" se tiver `previsaoRetirada`) · **Parado há** (`diasAguardando` + "dias")
     · **Falta receber** (só com `verFinanceiro`: `moeda(saldo)` em `text-amber-700`, ou
     "quitado" em `text-fraco`) · **Ações**.
   - Ações (só com `responderEntrega`): se `lembreteDevido(p)` → selo `bg-blue-100
     text-blue-700` "confirmar" + `btn-secondary` "Sim, ainda" (`confirmar(...)`); sempre
     `btn-primary` **"Cliente retirou"** (mesmo `confirm()` + `status: 'entregue'` do botão
     atual); e o link "Ver".
   - Gravação com falha → usa o `setErro` que a tela já tem.

4. Tokens semânticos só. Nada de cor literal.

### Teste (Cowork, pelo navegador, sem gravar)
- PIETRA e HEBERTON aparecem em "Prontos" com "Venceu há…" e o botão "Não retirou…";
  o modal abre e fecha.
- A seção "Aguardando o cliente" não aparece (ninguém registrado ainda). O primeiro registro
  real é da Kalomira/Pedro, com caso de verdade.

Commit: `feat: /entregas com o grupo aguardando o cliente`

---

## I4 — `/dashboard`: atraso da Nice, sino e tabela  — feita (`421aa99`)

Mockup telas 5 e 7. Arquivos: `src/app/dashboard/page.tsx`, `src/app/dashboard/painel.css` e
`src/lib/helpers.ts` (só o chip). Regras só de `@/lib/aguardandoCliente`.

### 1. Recortes (`page.tsx`)
- `atrasados` passa a ser `ativos.filter(atrasoDaNice)` — **é a mudança que resolve o
  problema original**: pedido pronto parado não conta mais como atraso da Nice.
- Novos: `confirmarEntrega = ativos.filter(perguntarEntrega)`,
  `aguardando = ativos.filter(estaAguardando)`, `lembretes = aguardando.filter(p => lembreteDevido(p))`.
- `mostrarEntrega = permissoes.responderEntrega`.
- `avisos = atrasados.length + (mostrarAprovacao ? aguardandoAprovacao.length : 0)
  + (mostrarEntrega ? confirmarEntrega.length + lembretes.length : 0)`.
- O carregamento de hoje está dentro do `useEffect`: extraia para uma função `carregar()`
  (mesma lógica) para poder recarregar depois de gravar pelo sino.

### 2. Sino (popover) — ordem dos grupos
1. "Aguardando sua aprovação" (já existe, não muda).
2. **"Pronto e vencido — já foi entregue?"** (`confirmarEntrega`, só com `mostrarEntrega`,
   até 4 + "+ N"). Cada item: ícone `CircleHelp` em `var(--pn-azul-fundo)/--pn-azul-texto`,
   título `#numero cliente` como `Link` para o pedido, sub "Venceu há Nd" + (com
   `verFinanceiro` e saldo) "· falta {moeda}". Embaixo, dois botões pequenos:
   **"Foi entregue"** (`confirm()` → `status: 'entregue'` → `carregar()`) e
   **"Não retirou…"** (abre o `ModalNaoRetirou` em `registrar`; `onGravado={carregar}`).
3. **"Ainda aguardando o cliente?"** (`lembretes`, só com `mostrarEntrega`). Ícone
   `Hourglass`, sub "{MOTIVO_LABEL} · parado há Nd". Botões **"Sim, ainda"**
   (`confirmar(...)`) e **"Já retirou"** (entregue).
4. **"Atrasado na produção"** — o grupo que hoje se chama "Prazo vencido", agora só com
   `atrasoDaNice` (renomeie o título do grupo).
5. Rodapé do popover, se `aguardando.length > 0`: link para `/entregas`
   "Ver os N aguardando o cliente em Entregas →".
- **Atenção a HTML inválido:** hoje cada item é um `<Link className="pn-rail-item">`
  inteiro. Botão dentro de link não pode. Nos grupos 2 e 3 o item vira `<div
  className="pn-rail-item">` com só o título como `Link`, e os botões ao lado/abaixo.
- Texto do vazio: "Nenhum aviso agora. Nada atrasado, nada para confirmar e nenhuma
  liberação esperando você."
- Falha ao gravar pelo sino: mostrar a frase de erro no topo do popover (`text-red-700`),
  não `alert()`.

### 3. Hero
- Subtítulo e selo "N atrasados"/"Tudo em dia" continuam usando `atrasados` (agora só a Nice).
- Ao lado, selos novos quando > 0 (só com `mostrarEntrega`): `pn-selo azul`
  "N aguardando o cliente" (ícone `Hourglass`) e `pn-selo ambar` "N pra confirmar entrega".
- `painel.css`, junto de `.pn-selo.ok/.alerta` (o hero é verde escuro nos dois temas, por
  isso ali a cor é fixa, como os selos existentes):
  `.pn-selo.azul { color: #bcdcff; }` e `.pn-selo.ambar { color: #ffe29a; }`.

### 4. Tabela "Pedidos Ativos"
- Coluna Prazo: se `estaAguardando(p)` → em vez do texto de atraso, `<strong>` "Aguardando
  cliente · {diasAguardando}d" com a classe nova `tom-aguardando`; se `perguntarEntrega(p)`
  → "Venceu · confirmar entrega" com `tom-confirmar`. Senão, como hoje.
  CSS: `.pn-prazo.tom-aguardando strong { color: var(--pn-azul-texto); }` e
  `.pn-prazo.tom-confirmar strong { color: var(--pn-ambar-texto); }`.
- Barra de progresso: nesses dois casos, cor verde (não vermelha) — pronto não é atraso.
- Chip novo em `FILTROS_DASHBOARD` (`helpers.ts`), depois de "Finalizado":
  `{ value: 'aguardando_cliente', label: 'Aguardando cliente' }`, e `FiltroDashboard`
  ganha `| 'aguardando_cliente'`. No filtro da tabela: `filtro === 'aguardando_cliente' ?
  estaAguardando(p)`.

### 5. `painel.css` — botões pequenos do sino
```css
.pn-mini-acoes { display: flex; gap: 6px; margin-top: 6px; }
.pn-mini { font: inherit; font-size: 11.5px; font-weight: 600; border-radius: 8px; padding: 5px 10px; min-height: 30px; cursor: pointer; border: 1px solid var(--borda-forte); background: var(--superficie); color: var(--texto); }
.pn-mini:hover { background: var(--superficie-2); }
.pn-mini.primario { background: var(--marca); border-color: var(--marca); color: #fff; }
.pn-mini.primario:hover { background: var(--marca-hover); }
.pn-mini:disabled { opacity: .5; cursor: not-allowed; }
.pn-mini:focus-visible { outline: 2px solid var(--marca); outline-offset: 2px; }
```

### Teste (Cowork, pelo navegador, sem gravar)
- O hero deve dizer só os atrasos da produção (antes: 6 atrasados, que incluíam pedidos
  prontos). PIETRA, LUANA e HEBERTON saem de "atrasado" e aparecem no sino em "já foi
  entregue?". O chip "Aguardando cliente" filtra (hoje, vazio).

Commit: `feat: dashboard separa atraso da Nice de pedido esperando o cliente`

---

## I4-ajuste — ordem do grupo "já foi entregue?" (antes do commit da I4)

No sino, o grupo "Pronto e vencido — já foi entregue?" aparece fora de ordem (7d, 1d, 23d).
Ordene `confirmarEntrega` com `ordenarPedidos(..., 'entrega_asc')` — o vencido há mais tempo
primeiro. O mesmo vale para `lembretes` (maior `diasAguardando` primeiro). Depois: pare o dev →
`npm run build` → suba o dev → commit `feat: dashboard separa atraso da Nice de pedido esperando o cliente` → push.

---

## I5 — `/relatorios`: "Aguardando o cliente" + exportar CSV  — implementada, aprovada pelo Cowork

Pedido do Pedro: **relatório sempre para ver E para extrair.** Arquivos:
`src/lib/csv.ts` (novo), `src/app/relatorios/page.tsx`.

### 1. `src/lib/csv.ts` (novo) — exportação que abre certo no Excel brasileiro

```ts
// Exporta CSV que o Excel em português abre direto, com acento e colunas certas:
// separador ';' (o Excel pt-BR usa vírgula como decimal), BOM UTF-8 (sem ele o
// Excel lê "Ã§" no lugar de "ç") e aspas em todo campo com ; " ou quebra de linha.

export type Celula = string | number | null | undefined

function celula(v: Celula): string {
  if (v === null || v === undefined) return ''
  const t = typeof v === 'number' ? String(v).replace('.', ',') : v
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function montarCsv(cabecalho: string[], linhas: Celula[][]): string {
  return [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n')
}

export function baixarCsv(nomeArquivo: string, cabecalho: string[], linhas: Celula[][]): void {
  const blob = new Blob(['﻿' + montarCsv(cabecalho, linhas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
```

Valores em dinheiro vão como **número** (ex.: `480.5` → `480,5`), não como texto "R$ …",
para o Pedro conseguir somar no Excel.

### 2. `/relatorios` — seção nova "Aguardando o cliente"

Entre os cards de KPI e a grade "Complexidade / Em Andamento".

- **Quem entra:** `lista = pedidos.filter(p => p.aguardandoCliente && (estaAguardando(p) ||
  registradoNoMes(p)))`, onde `registradoNoMes` = `registradoEm` dentro de `inicio`/`fim` do
  mês escolhido. Ou seja: todo pedido que **está** aguardando agora, mais os que **foram**
  registrados no mês e já saíram (entregues/cancelados) — é o histórico.
- **Coluna "Situação":** "Aguardando" (`estaAguardando`) · "Entregue" · "Cancelado".
- **4 números no topo da seção** (só dos que estão aguardando AGORA): pedidos, peças paradas
  (`totalPecas`), valor parado (soma de `valorTotal`) e a receber (soma de `saldoEmAberto`).
  Os dois de dinheiro com `moeda()`.
- **Por motivo:** uma linha por `MOTIVO_LABEL` com quantidade e valor a receber (só os
  aguardando agora). Pode ser uma lista simples com barra, igual "Distribuição por
  Complexidade" (barra `bg-amber-400` para pagamento, `bg-blue-400` sem tempo,
  `bg-gray-400` outro).
- **Tabela:** Nº · Cliente · Situação · Motivo (+ observação em `text-xs text-fraco`) ·
  Parado há (`diasAguardando`, só para "Aguardando"; senão "—") · Valor · Falta receber ·
  Registrado por/em · Combinou (`previsaoRetirada`). Ordenada por dias parado decrescente.
- Vazio: "Nenhum pedido aguardando o cliente neste mês."
- A tela `/relatorios` já é só de gestor/recepcionista (rotas), mas mantenha os valores atrás
  de `permissoes.verFinanceiro` como no resto do sistema.

### 3. Botões "Exportar CSV" (`btn-secondary`, ícone `Download`, `print:hidden`)

- Na seção nova: arquivo `aguardando-cliente-AAAA-MM.csv` com as colunas da tabela, mais
  "Prazo" (`formatarData`), "Pronto desde" (`prontoEm`) e "Confirmado por/em".
- Na tabela "Todos os Pedidos do Mês": arquivo `pedidos-AAAA-MM.csv` com Nº, Cliente,
  Empresa, Peças, Status (`STATUS_CONFIG[..].label`), Entrada, Entrega, Valor total, Valor
  pago, Falta receber.
- Datas no CSV como `dd/MM/yyyy`.

### 4. Formato brasileiro no que já existe
- Card "Receita (entregues)": `moeda(receitaTotal)` (hoje sai "R$ 4688.00").
- Coluna Valor da tabela do mês: `moeda(p.valorTotal)`.
- De passagem, nesses mesmos cards: `bg-green-50`/`bg-red-50`/`bg-blue-50` etc. já são
  variáveis do tema — não mexer.

### Teste (Cowork, pelo navegador, sem gravar)
- Setembro: seção vazia (ninguém registrado ainda); exportar os pedidos do mês baixa um CSV.
  Abrir o CSV no Excel é com o Felipe/Pedro (acento e colunas certas).
- Receita em "R$ 390,00".

Commit: `feat: relatório de pedidos aguardando o cliente e exportação CSV`

---

## I6 — CHANGELOG.md e CLAUDE.md  ← ATUAL (depois do commit da I5)

Aprovado pelo Felipe. Só documentação. Um commit: `docs: fase I no CHANGELOG e no CLAUDE.md`.
Incluir no mesmo commit `docs/fase-i.md` e `docs/fase-i-registro.md` (o `fase-i.md` você pode
commitar como está no disco — só não edite).

### 1. `CHANGELOG.md` — acrescentar no topo de `[Não lançado]` (acima da Fase H)

```markdown
### Fase I — "Aguardando o cliente" + correção de fuso nas datas

Sessão de 23/09/2026. Spec em `docs/fase-i.md` (Claude do Cowork), registro em
`docs/fase-i-registro.md` (Claude Code). Migration `017_aguardando_cliente.sql`, rodada pelo
Felipe no mesmo dia. Commits: I0 `664fea9` · I1 `062d9eb` · I2a `5e1f0f5` · I2b `2441cc0` ·
I3 `8ec3bed` · I4 `421aa99` · I5 `<hash>`.

**O problema:** pedido pronto que o cliente não vem buscar (falta de dinheiro, de tempo, outro
motivo) aparecia como ATRASADO no dashboard, mas o atraso não é da Nice.

**Corrigido (I0):**
- Coluna `date` do banco (`data_entrega`, `data_envio`) era lida como meia-noite UTC — em
  Brasília, 21h do dia anterior. Efeitos reais: **`/relatorios` calculava o mês anterior**
  (com setembro escolhido, título "Agosto" e 31 pedidos em vez de 26); datas de entrega
  apareciam um dia antes em `/pedidos`, `/pedidos/[id]` e na impressão; o pedido que vence
  hoje aparecia "atrasado 1 dia" no dashboard. Novas `dataLocal`/`formatarData` em `helpers.ts`.

**Adicionado:**
- Coluna `pedidos.aguardando_cliente` (jsonb, migration 017): motivo (`pagamento` /
  `sem_tempo` / `outro`), observação, previsão de retirada, quem registrou/confirmou e quando.
  Não é status novo — mesmo padrão de `excecao_pagamento`.
- `src/lib/aguardandoCliente.ts`: ponto único das regras — `prontoParaRetirada` (status
  `finalizado` OU todas as etapas concluídas), `atrasoDaNice`, `perguntarEntrega`,
  `estaAguardando`, `lembreteDevido` (todo dia, ou a partir da data combinada),
  `diasAguardando`, `motivoSugerido` (saldo em aberto → falta de pagamento).
- Permissão `responderEntrega` (só gestor e recepcionista).
- `/pedidos/[id]`: pergunta "Este pedido já foi entregue?" para pedido pronto e vencido; modal
  "O cliente ainda não retirou"; cartão "Aguardando o cliente há N dias" com lembrete diário,
  mudar motivo e desfazer. Selo no cabeçalho.
- `/entregas`: botão "Não retirou…" nos vencidos e seção "Aguardando o cliente" com pedidos,
  peças paradas e valor a receber.
- `/dashboard`: sino com "Pronto e vencido — já foi entregue?" e "Ainda aguardando o
  cliente?" (botões direto no sino); selos no topo; prazo "aguardando cliente" na tabela;
  chip "Aguardando cliente".
- `/relatorios`: seção "Aguardando o cliente" (agora + histórico do mês, por motivo) e
  **Exportar CSV** (aguardando e pedidos do mês) — abre direto no Excel.
- `src/lib/csv.ts` e `moeda()` em `helpers.ts` (valores no formato R$ 1.234,56).

**Alterado:**
- `/dashboard`: "atrasados" agora é só atraso da produção. No dia da entrega: de "6 atrasados"
  para "3 atrasados · 3 pra confirmar entrega".
- `/entregas`: critério passou a `prontoParaRetirada` — pedido `finalizado` com etapa pendente
  também entra (de 1 para 5 pedidos no dia).

**Processo:** handoff em dois arquivos — `docs/fase-i.md` só do Cowork, `docs/fase-i-registro.md`
só do Code. Motivo: duas vezes um lado gravou o documento inteiro a partir de uma cópia antiga
e apagou o que o outro tinha escrito.
```

(Troque `<hash>` pelo hash da I5.)

### 2. `CLAUDE.md` — mudanças pontuais (não reescrever o arquivo)

a) **Tabela "Módulos existentes"**, 3 linhas:
- `/dashboard`: acrescentar no fim da descrição: "Sino com avisos (liberações, pedidos prontos
  e vencidos pra confirmar entrega, lembretes de aguardando o cliente, atrasos da produção) —
  'atrasados' é `atrasoDaNice`, nunca 'prazo vencido' puro (Fase I)."
- `/entregas`: trocar por "Pedidos prontos para retirada (`prontoParaRetirada`: status
  `finalizado` OU todas as etapas concluídas/não aplicáveis), ainda não entregues; 'Marcar como
  entregue' e 'Não retirou…'. Seção 'Aguardando o cliente'. Só gestor/recepcionista".
- `/relatorios`: trocar por "Fechamento mensal: receita, unidades, complexidade, 'Aguardando o
  cliente' (agora + histórico do mês) e Exportar CSV".

b) **Código compartilhado**, novos itens (depois de `excecaoPagamento.ts`):
- `src/lib/aguardandoCliente.ts` — **ponto único** das regras de "aguardando o cliente" e de
  "atraso da Nice" (Fase I). Ver regra 13.
- `src/lib/csv.ts` — `baixarCsv`/`montarCsv`: `;`, BOM UTF-8, número com vírgula. Use para
  toda exportação nova.
- `src/components/entrega/` — `CartaoEntrega` (pedido) e `ModalNaoRetirou` (pedido, /entregas
  e sino do dashboard). Não duplique.
- No item de `helpers.ts`, acrescentar: "Desde a Fase I: **`dataLocal`/`formatarData`** (toda
  coluna `date` do banco passa por elas — nunca `new Date('AAAA-MM-DD')`, que é UTC e volta um
  dia no Brasil) e **`moeda`** (R$ no formato brasileiro — nunca `toFixed(2)`)."

c) **Modelo de dados / `pedidos`:** acrescentar `aguardando_cliente jsonb` na lista de colunas
e uma linha: "`aguardando_cliente` (migration 017, Fase I): nullable; `null` = não se aplica.
Constraint `pedidos_aguardando_cliente_motivo_check` limita `motivo` a pagamento/sem_tempo/outro.
Marcar entregue **não** limpa o campo — fica de histórico para o relatório."

d) **Convenções do schema:** trocar "Numere a próxima a partir de `016_`" por "Já foram usadas
até a `017_` (Fase I). Numere a próxima a partir de `018_`. **Atenção:** a `016_cards_visibilidade.sql`
rodou em 29/08 mas o arquivo não está em `supabase/migrations/` — recuperar se possível."

e) **Regras de negócio**, nova regra 13 (depois da 12):

```markdown
13. **Atraso da Nice ≠ pedido esperando o cliente** (Fase I, 23/09/2026). Toda a decisão vive
    em `src/lib/aguardandoCliente.ts`; as telas só perguntam.

    - **Pronto para retirada** = status `finalizado` OU todas as etapas concluídas/não
      aplicáveis. Os dois sentidos de "finalizado" que o sistema tem valem igual.
    - **Atraso da Nice** = ativo, vencido e **não** pronto. É o único "atrasado" do dashboard.
    - **Pronto + vencido + sem resposta** → o sistema pergunta "já foi entregue?" (pedido,
      /entregas, sino). Não conta como atraso.
    - **Aguardando o cliente** = `aguardando_cliente` preenchido. Lembrete **todo dia**
      ("Ainda aguardando?"), ou só a partir de `previsaoRetirada` se o cliente combinou um dia.
    - **Dias parado** contam desde o que vier depois: prazo ou dia em que ficou pronto.
    - Quem responde: só gestor e recepcionista (`responderEntrega`; no banco, `pedidos_write`).
```

f) **Convenções de trabalho**, novo item: "Handoff de fase: `docs/fase-X.md` é a spec (só o
Claude do Cowork edita); `docs/fase-X-registro.md` é o registro (só o Claude Code, sempre
acrescentando no fim). Nunca grave um desses arquivos a partir de cópia antiga."

### Teste
`npx tsc --noEmit` e build (só doc, mas confirma que nada quebrou). Push.

Depois disso a Fase I está fechada. O Cowork atualiza os documentos do projeto no claude.ai.

---

## Registro

Fica em **`docs/fase-i-registro.md`** (desde 23/09, ~17:45). Este arquivo (`fase-i.md`) é só do
Cowork; o Claude Code não edita aqui.
