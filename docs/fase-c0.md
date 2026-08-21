# Fase C0 — Setores não aplicáveis e ordenação em /pedidos

Documento de especificação para a próxima sessão do Claude Code.
Escrito em 21/08/2026, a partir dos testes do Pedro em produção.

**Por que "C0" e não "C2".** Esta fase vem **antes** da Fase C1 (observações de produção)
por um motivo simples: **ela não toca no banco.** Zero migration, zero SQL, zero RLS. É só
código. Num sistema em uso diário, mudança sem SQL é a que dá para subir, testar e reverter
com menos risco — então ela vai primeiro, e a C1 (que precisa da migration 010 e do rito de
auditoria) vem depois, já com o repo estabilizado.

**O que está aqui:** os pedidos 1 e 2 do Pedro.
**O que não está aqui:** o pedido 3 (urgência direcionada) — ele foi dobrado dentro da
Fase C1, porque é a mesma tabela e a mesma migration. Ver
`claude/Fase-C-observacoes-e-push.md`.

---

## 1. O problema real, nas palavras do Pedro

> "Tem algumas camisetas que ele faz que não passam pelo processo de estampa silk ou
> prensa DTF."

O sintoma que ele viu na tela: **esses pedidos nunca chegam em `/entregas`.**

O motivo é a regra 7 do `CLAUDE.md` combinada com o módulo de Entregas: o progresso tem
**8 setores fixos**, e `/entregas` só lista pedido com os 8 concluídos (via `pedidoConcluido`,
`src/lib/kanban-ui.ts`). Uma camiseta lisa nunca passa por `estamparia_silk` nem por
`prensa_dtf` — então esses dois setores ficam `pendente` para sempre, o pedido fica preso na
produção, e nem o botão "Criar cartão no Kanban" aparece em `/pedidos/[id]`.

Não é bug de código. É o modelo dizendo "todo pedido passa pelos 8 setores", o que não é
verdade na fábrica.

### A solução escolhida

Um quarto estado por setor: **`nao_se_aplica`**. E um único ponto de decisão para chegar
nele: **o modal que aparece ao concluir Acabamento/Embalagem.**

Por que no acabamento e não setor a setor: **quem termina o pedido é quem sabe se ele está
pronto.** Perguntar em cada setor obrigaria alguém a antecipar, no corte, que aquele pedido
não vai levar estampa — informação que muitas vezes só existe no fim. Uma pergunta, no
momento certo, com a lista do que vai ser marcado na tela.

---

## 2. Renomear: "Acabamento" → "Acabamento/Embalagem"

Pedido literal do Pedro. É mudança **só de rótulo**.

### A regra que não pode ser quebrada

**A chave `acabamento` continua exatamente como está, em todo lugar.** Só o texto exibido
muda. Renomear a chave quebraria, em silêncio ou não:

| Onde a string `acabamento` vive | Por que não pode mudar |
|---|---|
| `pedidos.progresso` (JSONB), em todos os pedidos do banco | Nenhuma migration vai reescrever o JSONB de pedido antigo. Trocar a chave = todo pedido existente perde o setor |
| `check (perfil in (...))` na tabela `equipe` | É um dos 8 perfis. Mudar exige `alter table` + `UPDATE` nas linhas existentes |
| `Perfil` em `src/lib/permissoes.ts` | Espelha o CHECK do banco (o `CLAUDE.md` manda mexer nos dois no mesmo commit) |
| `Progresso` / `SetorProducao` em `src/types/index.ts` | É a chave do objeto |
| `check (setor in (...))` da futura migration 010 (Fase C1) | Já está escrita com `acabamento` |

### O que muda de fato

- `SETOR_LABELS` em `src/lib/helpers.ts`: `acabamento: 'Acabamento/Embalagem'`.
- O rótulo do **perfil** `acabamento`, onde quer que ele seja exibido (sidebar, `/perfil`,
  seletor de perfil). Procure por um mapa tipo `PERFIL_LABELS` ou equivalente; se o rótulo
  do perfil hoje for derivado da própria string, crie o mapa em vez de espalhar `if`.

**Conferir antes de mexer:** rode um `grep -rn "acabamento" src/` e classifique cada
ocorrência em "é chave" ou "é texto na tela". Só as segundas mudam. Se alguma tela estiver
capitalizando a chave crua (`'Acabamento'` montado de `acabamento`), esse é o lugar que
precisa passar a ler `SETOR_LABELS`.

---

## 3. O estado `nao_se_aplica`

### Tipos

Em `src/types/index.ts`, o status do setor ganha um quarto valor:

```ts
export type StatusSetor = 'pendente' | 'em_andamento' | 'concluido' | 'nao_se_aplica'
```

**Sem migration.** `progresso` é JSONB sem schema no banco — o valor novo entra como qualquer
outro. É o mesmo mecanismo que já permitiu a autoria por setor
(`{ status, atualizadoPor, atualizadoEm }`) entrar sem SQL nenhum, registrado no CHANGELOG.

### Uma coisa a conferir antes de escrever código

A Fase B criou a função `security definer` **`atualizar_progresso_pedido`**, e é por ela que
os 6 perfis de chão de fábrica gravam o progresso. Se essa função validar os valores de
status por dentro (um `check`, um `case`, um cast para enum), gravar `nao_se_aplica` vai
falhar — e, sendo RLS/função, **pode falhar sem erro visível**.

**Não precisa incomodar ninguém para descobrir isso: a função está versionada no repo**, em
`supabase/migrations/009_rls_fase_b.sql`. Abra o arquivo e leia o corpo dela.

- Se o corpo só faz `update pedidos set progresso = <parâmetro> where id = <id>`, **não há
  nada a fazer** e esta fase segue sem SQL, como planejado. **É o cenário esperado.**
- Se ele valida os status (um `check`, um `case`, um cast para enum), a fase ganha uma
  migration mínima (`010_progresso_nao_se_aplica.sql`, só `create or replace function`) — e aí
  o número 010 fica com ela, e a Fase C1 passa a ser a 011. Entregue o arquivo para o Pedro
  rodar e **avise o Felipe que apareceu SQL onde não devia ter**, porque isso muda o combinado.

Se quiser confirmar contra o banco de verdade (o arquivo do repo é reconstrução em alguns
casos), a query é esta — só leitura, e quem roda é o Pedro:

```sql
select prosrc from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'atualizar_progresso_pedido';
```

### `normalizarProgresso` (`src/lib/store.ts`)

Já é a função que converte os dois formatos históricos de `progresso` na leitura. Ela precisa
deixar `nao_se_aplica` passar. E deve ser **permissiva com o desconhecido**: qualquer status
que ela não reconheça vira `pendente`, nunca `undefined` — pedido antigo não pode quebrar a
tela.

### Como se chega ao estado (e como se sai)

- **O ciclo de clique normal não muda:** `pendente → em_andamento → concluido → pendente`.
  Deliberado. Quem está no chão de fábrica com o celular na mão não pode cair em
  `nao_se_aplica` por um toque a mais.
- **`nao_se_aplica` só é atingido pelo modal** descrito abaixo.
- **Clicar num setor já marcado `nao_se_aplica` volta para `pendente`.** É o desfazer, e ele
  precisa existir: alguém vai marcar errado.
- **Autoria é obrigatória.** A entrada gravada leva `atualizadoPor` e `atualizadoEm` de
  `useMembro()`, igual aos outros cliques. Marcar "não se aplica" é uma decisão de negócio —
  tem que dar para saber quem tomou.

### Visual

Setor `nao_se_aplica` aparece **apagado, não verde**: fundo `bg-superficie-3`, texto
`text-fraco`, rótulo "não se aplica", e o rodapé de autoria que os outros setores já têm.
Nunca a mesma cor de "concluído" — a diferença entre "foi feito" e "não precisava" é
exatamente o que a tela tem que comunicar.

> **Cores semânticas, sempre.** `bg-white` e `text-gray-400` somem no tema escuro. A tabela
> completa está no `CLAUDE.md`, seção "Tema claro/escuro".

---

## 4. O modal "Pronto para envio?"

### Quando abre

Ao concluir o setor **`acabamento`** (transição para `concluido`), **e** existir pelo menos um
setor ainda em `pendente` ou `em_andamento`.

Se os 8 já estiverem resolvidos, o modal **não abre** — não há o que perguntar, e o pedido
cai em `/entregas` como já cai hoje.

Vale nos **dois** lugares em que se clica num setor: `/producao` e o card "Progresso por
Setor" de `/pedidos/[id]`. Componente compartilhado, não duas cópias.

### A regra de ouro: o modal nunca segura o progresso

Mesma regra da Fase C1, e pelo mesmo motivo:

1. O clique grava `acabamento: concluido` **primeiro**, pela rota que já existe
   (`atualizarPedido` → `.rpc('atualizar_progresso_pedido')`).
2. Só **depois** de a gravação voltar OK o modal abre.
3. Se a pessoa fechar o modal, se a internet cair, se a segunda gravação falhar — o
   acabamento **continua concluído**. Nunca o contrário.

### O conteúdo

> **Acabamento/Embalagem concluído.**
> Este pedido está pronto para envio?
>
> Estes setores ainda não foram concluídos. Marque os que **não se aplicam** a este pedido:
>
> - [x] Estamparia Silk
> - [x] Prensa DTF
> - [x] Prensa Sublimação
> - [ ] Corte  ⚠️
>
> _Marcados como "não se aplica" por Alex, hoje. Isso não apaga nada e pode ser desfeito._
>
> `[ Pular ]`  `[ Liberar para envio ]`

Detalhes que importam:

- **Marcação inicial.** Vêm pré-marcados os setores de estampa —
  `estamparia_silk`, `prensa_dtf`, `prensa_sublimacao`. É o caso real que o Pedro descreveu,
  e é o que vai acontecer na maioria das vezes. Vêm **desmarcados**, e com um ⚠️ discreto,
  `compra`, `corte` e `costura`: dizer que uma camiseta não passou pela costura é uma
  afirmação grande, e merece um toque consciente.
- **O botão principal muda de texto conforme o estado.** Com todos os pendentes marcados:
  **"Liberar para envio"**. Com algum desmarcado: **"Salvar"**, mais uma linha em
  `text-suave`: _"O pedido continua na produção porque Corte ainda está pendente."_ A tela
  nunca deixa a pessoa achar que liberou quando não liberou — é a mesma lição do rollback do
  Kanban (regra 10 do `CLAUDE.md`).
- **"Pular" tem o mesmo peso visual de "Salvar".** Ninguém é obrigado a responder.
- **Precisa existir uma segunda porta — nas duas telas onde se clica em setor, não só
  numa.** Quem clicar em "Pular" só veria o modal de novo ciclando o acabamento três vezes
  (`concluido → pendente → em_andamento → concluido`) — e esta spec já assume que alguém vai
  errar. Uma tela nunca pode ter um caminho de ida sem caminho de volta. Correção de
  21/08/2026: a primeira versão desta spec só previa a segunda porta em `/pedidos/[id]`, mas
  é exatamente ali que o chão de fábrica **não** opera — quem aperta "Pular" no acabamento é
  o pessoal do próprio acabamento, e eles só usam `/producao`. Então a segunda porta existe
  nas duas telas, cada uma com a permissão que já tinha (nenhuma permissão nova em nenhuma
  das duas):
  - Em `/pedidos/[id]`, no card "Progresso por Setor": sempre que `acabamento` estiver
    concluído **e** houver setor pendente, aparece um link discreto **"Este pedido está
    pronto para envio?"** que abre o modal. Atrás de `permissoes.editarPedido`, igual aos
    botões de setor que já existem nesse card.
  - Em `/producao`, no card do pedido: mesma condição, botão discreto **"Pronto para
    envio?"**. Sem gate de permissão próprio — quem já pode clicar nos setores daquela tela
    (todo perfil com `editarProducao`) pode clicar nesse botão também.
- **Mobile-first.** Quem vai usar é o freelancer de acabamento com o celular na mão:
  checkboxes com área de toque grande, rodapé fixo com os dois botões.
- Reaproveite `src/components/kanban/Modal.tsx` (fecha por Esc e por clique no fundo) em vez
  de escrever outro modal.

### Quem pode

Todos os perfis com `editarProducao` — os mesmos 8 que já clicam nos setores. Ninguém precisa
chamar o Pedro para liberar um pedido às 18h.

O contrapeso é a rastreabilidade: fica gravado quem marcou e quando, aparece na tela, e
gestor/recepcionista podem desfazer com um clique.

**Decidido pelo Felipe em 21/08: segue assim, sem flag nova.** Se o Pedro depois preferir
restringir a gestor/recepcionista, é uma flag em `permissoes.ts` e meia hora de trabalho —
mas não faça isso agora, e não pare para perguntar.

---

## 5. O efeito dominó — a parte que quebra se for esquecida

Introduzir um quarto estado quebra toda contagem que hoje assume "8 setores, concluído ou
não". Cada item abaixo precisa ser encontrado no repo e conferido.

| # | Onde | O que muda |
|---|---|---|
| 1 | **`pedidoConcluido`** (`src/lib/kanban-ui.ts`) | Pedido está pronto quando **todo setor é `concluido` OU `nao_se_aplica`**. É o ponto mais importante da fase inteira: é ele que libera `/entregas` **e** o botão "Criar cartão no Kanban" em `/pedidos/[id]`. Uma correção, dois lugares consertados — por isso a função é compartilhada, e por isso não se faz uma cópia |
| 2 | **Barra/percentual de progresso** em `/producao` e em `/pedidos/[id]` | Setor `nao_se_aplica` sai **do numerador e do denominador**. 6 aplicáveis com 6 concluídos = **100%**, não 75%. Progresso que empaca em 75% num pedido pronto é exatamente a confusão que esta fase existe para acabar. **Guarde o denominador zero explicitamente** (`total === 0 ? 100 : ...`): pelo fluxo do modal isso não deveria acontecer, mas essa conta é código reusado e `NaN%` na tela é feio demais para depender de sorte |
| 3 | **`/dashboard`** (`pedidosStats`) | Conferir se algum KPI ("em produção", "urgentes") deriva de contagem de setor. Se derivar, aplicar a mesma regra do item 2 |
| 4 | **Filtro por status em `/pedidos`** | Mesma conferência do item 3, se houver algum estado calculado a partir do progresso |
| 5 | **Ficha A4 de impressão** (`/pedidos/[id]`, bloco `print:block`) | Setor não aplicável imprime como "—" ou some da lista. Não pode sair "Estamparia Silk: pendente" numa ficha que vai junto com o pedido pronto |
| 6 | **`SETOR_LABELS` e qualquer `switch` sobre status** | TypeScript vai apontar os `switch` não exaustivos ao adicionar o valor no tipo. **Deixe ele apontar** — rode `npx tsc --noEmit` logo depois de mudar o tipo, antes de mexer nas telas, e use a lista de erros como o mapa do que falta |

O item 6 é a melhor ferramenta desta fase: mude o tipo **primeiro**, rode o `tsc`, e o
compilador entrega a lista dos lugares a visitar. Não saia procurando de memória.

---

## 6. Ordenação em /pedidos

### O problema

> "Ele estava querendo ver os pedidos mais antigos, porém, por padrão os pedidos ficam dos
> mais recentes para o mais antigos e não tem como inverter."

### O que fazer

Um seletor de ordenação ao lado da busca e do filtro de status, com **4 opções**:

| Opção | Campo | Direção |
|---|---|---|
| Mais recentes primeiro _(padrão — o de hoje)_ | `dataEntrada` | desc |
| Mais antigos primeiro | `dataEntrada` | asc |
| Entrega mais próxima | `dataEntrega` | asc |
| Entrega mais distante | `dataEntrega` | desc |

As duas primeiras são o pedido literal. As duas últimas custam a mesma linha de código e
provavelmente são o que o Pedro mais vai usar — "o que vence primeiro" é a pergunta de todo
dia numa confecção.

### Detalhes de implementação

- **Ordenação no cliente**, sobre a lista já carregada. Não mexa no `select` do `store.ts`:
  ordenar no banco significa outra query, outra passada pelo RLS e outro caminho para
  divergir. A tela já tem os pedidos em mãos.
- **Ordene por último**, depois da busca e do filtro de status. A ordem é apresentação; os
  outros dois são recorte.
- **Nunca mutar o estado:** `[...pedidos].sort(...)`, jamais `pedidos.sort(...)`. `Array.sort`
  ordena no lugar e mutar o array do `useState` dá bug de render que só aparece depois.
- **`dataEntrega` nula vai sempre para o fim**, nas duas direções. Pedido sem data não é
  "o mais urgente do mundo" nem "o mais distante" — é um pedido sem data, e o lugar dele é no
  fim da fila, sempre.
- **Empate resolvido por `numero` desc**, para a lista não dançar entre renders.
- **Guarde a escolha em `localStorage`**, chave `nice-ordem-pedidos`, mesmo padrão do
  `nice-tema`. Sem valor guardado, o padrão é "Mais recentes primeiro" — ou seja, quem não
  mexer em nada vê exatamente a tela de hoje.
- Use o `.input` do `globals.css` e cores semânticas. `print:hidden` no seletor, como todo
  controle de navegação.

---

## 7. Ordem de execução

1. `git pull` — sempre, antes de qualquer coisa. São dois PCs.
2. Ler `supabase/migrations/009_rls_fase_b.sql` e conferir o corpo de
   `atualizar_progresso_pedido` (seção 3). **Isso decide se a fase tem ou não SQL** — e dá para
   fazer sozinho, sem esperar ninguém.
3. `src/types/index.ts` — adicionar `nao_se_aplica` ao tipo.
4. `npx tsc --noEmit` → **a lista de erros é o roteiro do resto do trabalho.**
5. `src/lib/helpers.ts` (`SETOR_LABELS`) e o rótulo do perfil.
6. `src/lib/store.ts` (`normalizarProgresso`).
7. `src/lib/kanban-ui.ts` (`pedidoConcluido`) — o item 1 da seção 5.
8. Componente do modal, compartilhado.
9. `/producao` e `/pedidos/[id]` — clique, modal, visual do estado, percentual, impressão.
10. `/dashboard` e `/pedidos` — conferir contagens (itens 3 e 4 da seção 5).
11. Seletor de ordenação em `/pedidos`.
12. `npx tsc --noEmit` limpo + teste local (`npm run dev`).
13. Commits separados, em português:
    `feat: setor "não se aplica" e liberação de envio no acabamento`
    `feat: ordenação por data em /pedidos`
14. Pedro confere → push → deploy "Ready" na Vercel.
15. **Teste em produção, com pedido de verdade** (seção 8).
16. `CHANGELOG.md` + `CLAUDE.md` atualizados antes de encerrar. No `CLAUDE.md`, são **quatro**
    pontos, não um:
    - **Regra 7** ("progresso tem 8 setores fixos") ganha o quarto estado.
    - **Regra 9** — hoje diz que o botão "Criar cartão no Kanban" *"só aparece com os 8 setores
      concluídos"*. Passa a ser "concluídos **ou não aplicáveis**". Deixar uma regra marcada
      como inviolável em desacordo com o código é como o projeto cria a próxima confusão.
    - **Tabela de módulos** — a linha de `/entregas` precisa dizer que ela aceita setores não
      aplicáveis.
    - **Numeração de migration** — o `CLAUDE.md` ainda manda *"numere a próxima a partir de
      `008_`"*, mas a Fase B já gastou a `009_`. Corrija para `010_`, senão a próxima sessão
      que ler só o `CLAUDE.md` sobrescreve a migration da Fase B.

---

## 8. Teste em produção — não é opcional

A Fase B só foi dada como concluída depois de um teste com perfil real, e foi bom que tenha
sido. Mesma coisa aqui.

Com um pedido real de camiseta lisa:

1. Marcar `acabamento` como concluído, com silk e DTF pendentes → **o modal abre**.
2. Confirmar "Liberar para envio" → os dois setores ficam apagados, com o nome de quem marcou.
3. **O pedido aparece em `/entregas`.** Este é o teste que importa — é o problema original do
   Pedro.
4. Em `/pedidos/[id]`, o botão "Criar cartão no Kanban" aparece.
5. O percentual mostra **100%**, não 75%.
6. **Imprimir a ficha A4** e conferir que não sai "pendente" nos setores não aplicáveis.
7. Clicar num setor "não se aplica" → volta para pendente, e o pedido **sai** de `/entregas`.
8. Entrar como um perfil de chão de fábrica (o Alex) e repetir o passo 1 — confirmar que a
   gravação passa pela função `atualizar_progresso_pedido` sem ser barrada pelo RLS. **RLS
   que barra não dá erro, dá zero linhas** — então confira o resultado na tela, não a
   ausência de mensagem vermelha.
9. Em `/pedidos`, trocar para "Mais antigos primeiro" e conferir que o pedido mais antigo
   está no topo; recarregar a página e conferir que a escolha voltou.

O passo 8 é o que a Fase B ensinou a nunca pular.
