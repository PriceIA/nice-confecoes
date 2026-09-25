# Fase I — Registro

Este arquivo é **só do Claude Code**: ele registra aqui o que fez em cada etapa (arquivos,
tsc/build, dúvidas, hash do commit). O Claude do Cowork também anota aqui as revisões dele,
sempre **acrescentando no fim**, nunca reescrevendo o que já existe.

A spec continua em `docs/fase-i.md`, que é **só do Cowork**. O Claude Code **não edita**
`docs/fase-i.md` — nem para marcar etapa como feita. (Motivo: duas vezes o Code gravou a spec a
partir de uma cópia antiga e apagou etapas novas que o Cowork tinha acabado de escrever.)

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
- Commit (hash), depois da aprovação do Felipe: ver "I2b-ajustes" abaixo — o commit da I2b só foi feito depois dos ajustes, como pedido.

### I2b — revisão do Cowork (23/09 ~17:30)
- Testado pelo navegador, sem gravar: PIETRA e HEBERTON mostram a pergunta; #2026-0064 (em produção) não mostra; modal abre com "Falta de pagamento" sugerido ("Falta R$ 90.00") e fecha no Esc.
- Ajustes pedidos: ver seção "I2b-ajustes".

### I2b-ajustes
- Feito:
  - `moeda()` em `src/lib/helpers.ts`, junto de `formatarData`. Trocado por ela nos dois componentes: `ModalNaoRetirou.tsx` (linha do saldo sugerido) e `CartaoEntrega.tsx` (selo âmbar do estado "pergunta" e "Falta receber" do estado "aguardando").
  - Frase do estado "pergunta" trocada para "O prazo era {data} — venceu há N dia(s). O pedido está pronto e ninguém confirmou a retirada ainda.", com `N = Math.abs(prazo.dias ?? 0)`.
  - `erro` (estado + `text-sm text-red-700` abaixo dos botões) em `marcarEntregue`, `desfazer` e `confirmarLembrete` do `CartaoEntrega.tsx`, limpo no início de cada ação.
  - `border-blue-200` nos dois `card` do `CartaoEntrega.tsx` (confirmei que `.card` define a cor da borda como propriedade CSS solta dentro de `@layer components`, então o utilitário Tailwind — `@layer utilities` — vence por ordem de camada, não precisa de `!important`).
- `npx tsc --noEmit` limpo. Parei o `dev`, rodei `npm run build`: compilou limpo, os mesmos 4 warnings pré-existentes, nenhum novo. Subi o `dev` de novo.
- Commit da I2b (hash): `2441cc0` — `feat: pergunta "já foi entregue?" e cartão aguardando o cliente no pedido`. Push feito para `origin/main`.

### I3
- Arquivos alterados:
  - `src/app/entregas/page.tsx` — reescrita. `prontos = ordenarPedidos(pedidos.filter(p => prontoParaRetirada(p) && !estaAguardando(p)), 'entrega_asc')`; `aguardando = pedidos.filter(estaAguardando)` ordenado por `diasAguardando` decrescente. Subtítulo "N prontos pra entrega · M aguardando o cliente". Tabela "Prontos pra entrega": selo vermelho "Venceu há Nd" quando `perguntarEntrega(p)` (senão `badgePrazo` de sempre), linha "falta {moeda(saldo)}" com `verFinanceiro`, botão "Não retirou…" (abre `ModalNaoRetirou` em `registrar`) quando `perguntarEntrega(p)` e `responderEntrega`. Seção "Aguardando o cliente" (só com `aguardando.length > 0`): título com `Hourglass` numa caixinha azul, pílulas (N pedidos, X peças paradas, e — só com `verFinanceiro` — total a receber), tabela com motivo (selo por tipo + observação + "combinou dd/MM"), "confirmado/registrado por" com dias desde a confirmação, "parado há N dias", "falta receber" (só `verFinanceiro`, "quitado" quando saldo 0), e ações (`responderEntrega`: selo+botão "Sim, ainda" quando `lembreteDevido`, botão "Cliente retirou", link "Ver" sempre visível). Erros de gravação caem no `erro` que a tela já tinha.
- tsc / build: `npx tsc --noEmit` limpo em todas as passagens. `npx eslint src/app/entregas/page.tsx` direto (dev de pé, sem tocar `.next`) deu 0 erros/0 warnings antes da aprovação. Depois da aprovação do Felipe: parei o `dev`, `npm run build` compilou limpo (mesmos 4 warnings pré-existentes, nenhum novo), subi o `dev` de novo.
- Dúvidas / algo diferente do esperado:
  - "Ver" na seção "Aguardando o cliente" ficou fora do `permissoes.responderEntrega` — é só navegação, sem gravação, e a tabela "Prontos pra entrega" já trata o link assim. O documento lista "Ver" dentro do mesmo item de bullet das ações restritas, mas não deixa claro se ele também deveria ser restrito; segui o padrão já existente na outra tabela.
  - "Combinou dd/MM" usa `formatarData(a.previsaoRetirada, 'dd/MM')`, não um parse manual — mesma função da I0/I2b, evita reabrir o bug de fuso.
  - Não gravei nada em pedido real. O Cowork testou pelo navegador antes da aprovação (ver mensagem do Felipe) e aprovou.
  - **Nota sobre este mesmo Registro:** entre o preenchimento anterior (I2b-ajustes/I3) e agora, o `docs/fase-i.md` em disco voltou para uma versão sem essas duas seções preenchidas (parecia ser a versão de antes do commit `2441cc0`) — reescrevi o conteúdo de memória desta conversa. Se o Cowork reescreve o arquivo inteiro a cada atualização (em vez de só adicionar a etapa nova), isso vai continuar derrubando o Registro já preenchido; talvez valha ele só acrescentar, não substituir o arquivo todo.
- Commit (hash), depois da aprovação do Felipe: `8ec3bed` — `feat: /entregas com o grupo aguardando o cliente`. Push feito para `origin/main`.

### I3 — revisão do Cowork (23/09 ~17:40)
- Testado pelo navegador, sem gravar: /entregas mostra "5 prontos pra entrega · 0 aguardando o cliente". PIETRA (venceu há 23d, falta R$ 90,00), LUANA (7d) e HEBERTON (1d) com "Não retirou…"; BOLETTA 0024 e 0023 no prazo (2 dias). Seção "Aguardando o cliente" oculta (ninguém registrado). Valores em formato brasileiro. Aprovada.
- LUANA (#2026-0022) está com status "Aprovado" mas todas as etapas concluídas — entra como pronta pela regra `pedidoConcluido`, correto. Link "Ver" sempre visível: ok.

### I4
- Arquivos alterados:
  - `src/lib/helpers.ts` — `FiltroDashboard` ganhou `'aguardando_cliente'`; `FILTROS_DASHBOARD` ganhou o chip "Aguardando cliente" depois de "Finalizado".
  - `src/app/dashboard/page.tsx`:
    - Imports novos: ícones `CircleHelp`/`Hourglass`; `atualizarPedido` de `store.ts`; `MOTIVO_LABEL`, `atrasoDaNice`, `confirmar` (como `confirmarAguardando`), `diasAguardando`, `estaAguardando`, `lembreteDevido`, `perguntarEntrega`, `saldoEmAberto` de `@/lib/aguardandoCliente`; `ModalNaoRetirou`.
    - `useEffect` do carregamento inicial virou `carregar()` (reaproveitado pelas ações do sino).
    - `atrasados` agora é `ativos.filter(atrasoDaNice)`. Novos: `confirmarEntrega`, `aguardando`, `lembretes` (`aguardando.filter(lembreteDevido)`), `mostrarEntrega = permissoes.responderEntrega`.
    - `avisos` soma `confirmarEntrega.length + lembretes.length` quando `mostrarEntrega`.
    - `marcarEntregueSino`/`confirmarLembreteSino` (estados `erroSino`/`salvandoSino`/`modalNaoRetirou`), com `catch` gravando a mensagem de erro em vez de `alert()`.
    - Sino: erro no topo do popover; texto do vazio atualizado; dois grupos novos ("Pronto e vencido — já foi entregue?" e "Ainda aguardando o cliente?") como `<div className="pn-rail-item">` com só o título em `<Link>` e os botões em `.pn-mini-acoes`/`.pn-mini` (não há botão dentro de link); grupo "Prazo vencido" renomeado para "Atrasado na produção"; rodapé com link para `/entregas` quando `aguardando.length > 0`.
    - Hero: os dois selos antigos (`ok`/`alerta`) mais os dois novos (`azul`/`ambar`) dentro de um `<div className="pn-selos">` (wrapper que criei para eles quebrarem linha juntos — não estava no documento, só necessário pro layout).
    - Tabela: coluna Prazo mostra "Aguardando cliente · Nd" (`tom-aguardando`) ou "Venceu · confirmar entrega" (`tom-confirmar`) antes do texto de atraso normal; barra de progresso força verde nesses dois casos; filtro novo `aguardando_cliente` no `matchFiltro`.
    - `ModalNaoRetirou` (modo `registrar`) renderizado no fim do componente, para o botão "Não retirou…" do sino.
  - `src/app/dashboard/painel.css` — `.pn-selo.azul`/`.pn-selo.ambar`, `.pn-selos` (wrapper, ver acima), `.pn-prazo.tom-aguardando`/`.tom-confirmar`, e o bloco `.pn-mini-acoes`/`.pn-mini` exatamente como no documento.
- tsc / build: `npx tsc --noEmit` limpo. `npx eslint src/app/dashboard/page.tsx src/lib/helpers.ts` direto (dev de pé, sem tocar `.next`) — 0 erros, 0 warnings (esses dois arquivos não tinham warning nenhum antes também). Não rodei `npm run build` porque não vou commitar a I4 ainda.
- Dúvidas / algo diferente do esperado:
  - O documento não deixa explícito o texto do "+N" do grupo "Pronto e vencido" nem do grupo "Ainda aguardando" — usei "+ N pra confirmar" e "+ N aguardando", no mesmo estilo dos grupos existentes ("+ N aguardando", "+ N atrasados — veja todos na tabela abaixo").
  - `mostrarEntrega` (a flag que eu criei) é só `permissoes.responderEntrega` — segue a nomenclatura do próprio documento ("só com mostrarEntrega").
  - Não gravei nada em pedido real, nenhuma tela testada pelo navegador (extensão do Chrome segue indisponível aqui).
- Commit (hash), depois da aprovação do Felipe:

### I4 — revisão do Cowork (23/09 ~17:55)
- Testado pelo navegador, sem gravar. Hero: "3 atrasados · 3 pra confirmar entrega" (antes: "6 atrasados" — o problema original resolvido). Sino "8 avisos": 2 aguardando aprovação (TOKA, IMPERADOR GLASS), 3 "já foi entregue?" (LUANA, HEBERTON, PIETRA — "falta R$ 90"), 3 "atrasado na produção" (MERCADO SANTA FE 12d, CASA CLARA 7d, KARINA 1d). Nenhum botão dentro de link. Tabela: tom-confirmar nos 3 prontos, tom-atrasado só nos de produção. Chip "Aguardando cliente" presente.
- Ajuste pedido: ordem do grupo "já foi entregue?" (ver "I4-ajuste" em fase-i.md). Aprovada com esse ajuste.

### I4-ajuste
- `confirmarEntrega` agora é `ordenarPedidos(ativos.filter(perguntarEntrega), 'entrega_asc')` (vencido há mais tempo primeiro); `lembretes` agora ordena por `diasAguardando` decrescente (mais dias parado primeiro), com um `.sort` numa cópia do array (`[...aguardando.filter(...)]`, sem mutar `aguardando`).
- `npx tsc --noEmit` limpo. Parei o `dev`, `npm run build` compilou limpo (mesmos 4 warnings pré-existentes, nenhum novo), subi o `dev` de novo.
- Commit (hash): incluído no mesmo commit da I4 (`421aa99`), como o documento pediu (ajuste antes do commit da I4, não um commit à parte). Não commitei `docs/fase-i.md` — só o código e este registro, como combinado.

### I5
- Arquivos alterados:
  - `src/lib/csv.ts` (novo) — copiado do documento. Única diferença: troquei o BOM literal (o caractere invisível colado direto no código) por `'﻿'` escapado, pra não arriscar perder esse caractere num copy/paste ou numa troca de encoding do editor — o byte gerado no Blob é o mesmo.
  - `src/app/relatorios/page.tsx`:
    - Imports novos: `Download`/`Hourglass`; `moeda` de `helpers.ts`; `MOTIVO_LABEL`, `diasAguardando`, `estaAguardando`, `prontoEm`, `saldoEmAberto` de `@/lib/aguardandoCliente`; `baixarCsv`/`Celula` de `@/lib/csv`; `useMembro`; `MotivoAguardando` de `@/types`.
    - `registradoNoMes(p)`, `listaAguardando` (aguardando agora OU registrado no mês), `listaAguardandoOrdenada` (por `diasAguardando` decrescente), `situacaoDe(p)` (Aguardando/Entregue/Cancelado), `aguardandoAgora` (só quem está aguardando de verdade — base dos 4 números e do "Por motivo"), `porMotivo` (com `COR_MOTIVO` — amber/blue/gray, mesma paleta pedida).
    - Seção nova "Aguardando o cliente", entre os KPIs e a grade Complexidade/Em Andamento: 4 números (pedidos, peças paradas, valor parado, a receber — os dois de dinheiro atrás de `permissoes.verFinanceiro`), barra "Por motivo", tabela (Nº/Cliente/Situação/Motivo+observação/Parado há/Valor/Falta receber atrás de `verFinanceiro`/Registrado (por + "confirmado por X, dd/MM" quando tem)/Combinou), vazio quando `listaAguardando.length === 0`.
    - `exportarAguardandoCliente()` e `exportarPedidosDoMes()`, cada uma com seu botão "Exportar CSV" (`btn-secondary`, ícone `Download`, `print:hidden`) — o primeiro só aparece com `listaAguardando.length > 0`, o segundo com `doMes.length > 0`.
    - `moeda()` no card "Receita (entregues)" e na coluna Valor da tabela do mês (troquei `R$ {x.toFixed(2)}` pelas duas).
  - Não toquei em `bg-green-50`/`bg-red-50`/`bg-blue-50` dos cards de KPI nem em `dataEntrada`/timestamps.
- **Um cuidado com fuso que o documento não detalhou:** nas colunas de data do CSV, usei `format(new Date(x), 'dd/MM/yyyy')` direto para os campos `timestamptz` (`registradoEm`, `confirmadoEm`, `dataEntrada` — já vêm com fuso certo) e `formatarData(x)` só para os campos `date` puros (`previsaoRetirada`, `dataEntrega`). Cheguei a escrever errado numa primeira passada (`formatarData(registradoEm.slice(0,10))`, que reabriria o bug da I0 — tratar timestamp como se fosse só data), me corrigi antes de rodar qualquer teste.
- tsc / build: `npx tsc --noEmit` limpo. `npx eslint src/app/relatorios/page.tsx src/lib/csv.ts` direto (dev de pé, sem tocar `.next`) — 0 erros, 0 warnings. Depois da aprovação do Felipe: parei o `dev`, `npm run build` compilou limpo (mesmos 4 warnings pré-existentes, nenhum novo), subi o `dev` de novo.
- Dúvidas / algo diferente do esperado:
  - O documento não especifica exatamente o layout dos "4 números" nem da tabela — usei o mesmo padrão visual de `/entregas` (pílulas/cartõezinhos com `bg-superficie-2`, badge de motivo, "quitado" em cinza quando saldo zero) pra manter consistência entre as duas telas que mostram a mesma informação.
  - Coluna "Parado há" mostra "—" para pedido que já saiu (entregue/cancelado) — só faz sentido pra quem `estaAguardando` de verdade, como o documento pede ("só para 'Aguardando'").
  - Não gravei nada em pedido real. O Felipe testou o CSV no Excel (ok) antes de aprovar.
  - **Nota sobre este mesmo Registro:** de novo o `docs/fase-i-registro.md` em disco voltou pro estado do commit anterior (`421aa99`), sem as seções "I4-ajuste" e "I5" que eu tinha escrito — restaurei o conteúdo de memória desta conversa antes de seguir.
- Commit (hash), depois da aprovação do Felipe: `efd2d6d` — `feat: relatório de pedidos aguardando o cliente e exportação CSV`. Push feito para `origin/main`.

### I6
- Arquivos alterados:
  - `CHANGELOG.md` — bloco "Fase I" acrescentado no topo de `[Não lançado]`, acima da "Fase H", exatamente como no documento, com `<hash>` trocado por `efd2d6d` (hash real da I5).
  - `CLAUDE.md` — os seis pontos do documento: (a) as 3 linhas da tabela "Módulos existentes" (`/dashboard`, `/entregas`, `/relatorios`); (b) `src/lib/aguardandoCliente.ts`, `src/lib/csv.ts` e `src/components/entrega/` na lista de "Código compartilhado" (logo depois de `excecaoPagamento.ts`), mais o complemento no item de `helpers.ts` sobre `dataLocal`/`formatarData`/`moeda`; (c) `aguardando_cliente jsonb` na lista de colunas de `pedidos` + parágrafo explicando; (d) "Convenções e pendências do schema" atualizado pra `017_`/`018_` com a nota sobre a `016_cards_visibilidade.sql` que rodou mas não está versionada; (e) regra de negócio 13 nova, depois da 12; (f) item novo em "Convenções de trabalho" sobre o handoff em dois arquivos.
  - `docs/fase-i.md` e `docs/fase-i-registro.md` commitados como estavam no disco (não editei nenhum dos dois).
- tsc / build: `npx tsc --noEmit` limpo (rodei antes de mexer no `dev`, é só doc). Parei o `dev`, `npm run build` compilou limpo (mesmos 4 warnings pré-existentes, nenhum novo), subi o `dev` de novo.
- Dúvidas / algo diferente do esperado: nenhuma — os textos do documento eram literais, só troquei o `<hash>` da I5.
- Commit (hash), depois da aprovação do Felipe: `b688fe6` — `docs: fase I no CHANGELOG e no CLAUDE.md`. Push feito para `origin/main`.

**Fase I fechada** (I0 a I6, commits `664fea9` · `062d9eb` · `5e1f0f5` · `2441cc0` · `8ec3bed` · `421aa99` · `efd2d6d` · `b688fe6`).

