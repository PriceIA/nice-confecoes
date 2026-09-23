# Fase I — "Aguardando o cliente" (+ correção de fuso nas datas)

**Spec escrita em 23/09/2026 pelo Claude (Cowork), aprovada pelo Felipe no mesmo dia.**
Este documento é o handoff: o Claude Code lê daqui, executa **SÓ a etapa marcada como ATUAL**,
e depois preenche a seção "Registro" no fim deste arquivo (o que fez, o que viu, o que ficou em
dúvida). O Claude (Cowork) lê o registro e escreve a etapa seguinte aqui mesmo.

Mockup aprovado: artifact "Aguardando o cliente — mockup" (7 telas).

> **ETAPA ATUAL: I2b-ajustes → commit da I2b → I3.** Uma de cada vez, na ordem. Terminou a I3? Preencha o Registro e pare.
>
> **Ao preencher o Registro, releia o arquivo do disco antes de gravar** — o Cowork também edita este documento.

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

## I2b — Cartão no pedido + modal  — implementada, falta commit (ver I2b-ajustes)

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

## I3 — `/entregas` com o grupo "Aguardando o cliente"  (depois do commit da I2b)

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

## I4 a I6 — resumo (o detalhe é escrito aqui antes de executar)

- **I4** — `/dashboard`: `atrasados` → `atrasoDaNice`; grupos novos no sino com botões
  curtos; selos; badge azul na coluna de prazo; chip "Aguardando cliente".
- **I5** — `/relatorios`: seção "Aguardando o cliente" + "Exportar CSV" (separador `;`, BOM
  UTF-8 pra abrir certo no Excel) + valores com `moeda()` (a receita hoje sai "R$ 4688.00").
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
- Commit (hash), depois da aprovação do Felipe: `664fea9` — `fix: datas do banco lidas no fuso local (relatório mostrava o mês anterior)`. Push feito para `origin/main`.

### I1
- Migration `017_aguardando_cliente.sql` criada exatamente como no documento. Felipe rodou no Supabase SQL Editor; conferência (consulta única): `tipo_coluna = jsonb`, `constraint_existe = 1`, `com_aguardando = 0`. Bateu com o esperado.
- Passos 3–5 executados depois da confirmação do Felipe:
  - `src/types/index.ts` — `MotivoAguardando` e `AguardandoCliente` novos (antes de `Parcela`); `aguardandoCliente?: AguardandoCliente | null` em `Pedido` e em `PedidoLista`.
  - `src/lib/store.ts` — `mapPedido`/`mapPedidoLista` lêem `row.aguardando_cliente ?? undefined`; `getPedidosLista` inclui `aguardando_cliente` no `select`; `atualizarPedido` grava `dados.aguardandoCliente` quando `!== undefined` (o `null` passa e limpa).
  - Nenhuma tela mudou, como previsto.
- tsc / build: `npx tsc --noEmit` limpo. **Não rodei `npm run build`** desta vez — o `npm run dev` ficou de pé o tempo todo, e a I0 já mostrou que os dois brigam pela mesma pasta `.next`.
- Teste de carregamento: sem a extensão do Claude in Chrome conectada, não consegui clicar nas telas eu mesmo. O log do `npm run dev` não mostra nenhum erro depois das mudanças (as últimas requisições registradas, de antes desta etapa, foram 200 em `/dashboard`, `/relatorios`, `/pedidos`, `/pedidos/[id]` e `/terceirizadas`). Pedi para o Felipe confirmar visualmente que as listas continuam carregando.
- Dúvidas / algo diferente do esperado: nenhuma além da já registrada na I0 (extensão do Chrome indisponível).
- Commit (hash), depois da aprovação do Felipe: `062d9eb` — `feat: coluna aguardando_cliente no pedido (migration 017)`. Push feito para `origin/main`.

### I1 — teste de carregamento (Claude do Cowork, pelo navegador, 23/09 ~16:40)
- /pedidos (64), /dashboard, /entregas (1 pronto: #2026-0012), /producao (30 em andamento), /relatorios (setembro: 26) e /terceirizadas abriram sem erro de carregamento e sem 42703.
- Console: só avisos que já existiam — chave duplicada ("Bordado") na tabela de impressão de /pedidos/[id] e dois 404 de recurso. Nada da I1.

### I2a
- Arquivos alterados:
  - `src/lib/aguardandoCliente.ts` (novo) — copiado do documento, sem alteração: `prontoParaRetirada`, `estaAguardando`, `perguntarEntrega`, `atrasoDaNice`, `prontoEm`, `diasAguardando`, `saldoEmAberto`, `motivoSugerido`, `lembreteDevido`, `validar`, `registrar`, `atualizarMotivo`, `confirmar`, mais `DIAS_LEMBRETE`, `OBSERVACAO_MAX`, `MOTIVO_LABEL`.
  - `src/lib/permissoes.ts` — campo `responderEntrega: boolean` no tipo `Permissoes` (depois de `excluirTerceirizada`); `ACESSO_TOTAL.responderEntrega = true` (a `RECEPCIONISTA` herda pelo spread); `LEITURA_PRODUCAO.responderEntrega = false`.
- tsc: `npx tsc --noEmit` limpo. Não precisei trocar `_o`/`_p` por `delete` em `atualizarMotivo` — sem `noUnusedLocals` no `tsconfig.json`, o `tsc` não reclamou. Antes do push parei o `dev`, rodei `npm run build`: compilou limpo, o ESLint **não** reclamou dos `_o`/`_p`, só os mesmos 4 warnings pré-existentes (nenhum novo). Subi o `dev` de novo depois.
- Dúvidas / algo diferente do esperado: nenhuma. Servidor (`localhost:3002`) continuou respondendo depois das mudanças — só os avisos de sempre no log (`Fast Refresh had to perform a full reload`, cache do webpack), nada de erro.
- Commit (hash), depois da aprovação do Felipe: `5e1f0f5` — `feat: regras de "aguardando o cliente" e permissão responderEntrega`. Push feito para `origin/main`.

### I2b
- Arquivos alterados:
  - `src/components/entrega/ModalNaoRetirou.tsx` (novo) — modal com os 3 rádios de `MOTIVO_LABEL`, textarea de observação (contador N/120), campo de previsão de retirada (`min` = hoje) e a faixa azul explicando o efeito. Pré-seleção: `motivoSugerido` no modo `registrar` (com selo "sugerido" e a linha de saldo), motivo atual no modo `mudar`. Confirmar chama `validar` e, se ok, `registrar`/`atualizarMotivo` + `atualizarPedido(id, { aguardandoCliente })`.
  - `src/components/entrega/CartaoEntrega.tsx` (novo) — `null` se `!responderEntrega` ou se nem `perguntarEntrega` nem `estaAguardando`. Estado "pergunta" (selo amber de saldo quando `verFinanceiro`), estado "aguardando" (grade com motivo/observação, falta receber, registrado por, previsão), faixa de lembrete quando `lembreteDevido`. Todos os botões desabilitam durante a gravação; `marcarEntregue` nunca apaga `aguardandoCliente`.
  - `src/app/pedidos/[id]/page.tsx` — selo `bg-blue-100 text-blue-700` com `Hourglass` no cabeçalho quando `estaAguardando(pedido)`; `<CartaoEntrega pedido={pedido} onMudou={carregar} />` logo depois do cabeçalho, só com `!editando`.
- tsc: `npx tsc --noEmit` limpo. Também rodei `npx eslint` direto nos 5 arquivos (sem tocar a pasta `.next`, com o `dev` de pé) — 0 erros, só os 2 warnings que já existiam em `pedidos/[id]/page.tsx` (nenhum novo).
- Dúvidas / algo diferente do esperado:
  - Não tinha acesso ao artifact do mockup do Cowork (7 telas) — segui o texto da I2b ao pé da letra e o padrão visual já usado no cartão "Pagar na retirada" e no `ModalProntoParaEnvio.tsx` (mesmo `Modal`, mesmas classes de badge/card). Vale conferir visualmente se bateu com o mockup.
  - "Falta receber" na grade do estado "aguardando" só aparece quando o saldo é `> 0` (não coloquei "R$ 0,00") — mesma condição que já uso no selo âmbar do estado "pergunta". Não estava 100% explícito no documento; se quiser sempre mostrar a linha, é só tirar o `&& saldo > 0`.
  - Não gravei nada em pedido real — nenhuma tela testada pelo navegador (extensão do Chrome segue indisponível aqui).
- Commit (hash), depois da aprovação do Felipe:

### I2b — revisão do Cowork (23/09 ~17:30)
- Testado pelo navegador, sem gravar: PIETRA e HEBERTON mostram a pergunta; #2026-0064 (em produção) não mostra; modal abre com "Falta de pagamento" sugerido ("Falta R$ 90.00") e fecha no Esc.
- Ajustes pedidos: ver seção "I2b-ajustes".

### I2b-ajustes
- Feito:
- Commit da I2b (hash):

### I3
- Arquivos alterados:
- tsc / build:
- Dúvidas / algo diferente do esperado:
- Commit (hash), depois da aprovação do Felipe:
