# Fase K — Registro

Este arquivo é **só do Claude Code**: ele registra aqui o que fez em cada etapa (arquivos,
tsc/build, dúvidas, hash do commit), sempre **acrescentando no fim**. O Claude do Cowork também
anota aqui as revisões dele, sempre no fim. A spec fica em `docs/fase-k.md`, que é só do Cowork.

### K0
- Arquivo criado:
  - `supabase/migrations/019_almoxarifado.sql` — extraído do bloco ```sql da seção K0 de
    `docs/fase-k.md`, sem alteração (cópia literal das linhas do bloco, 185 linhas).
- Conferências antes de criar o arquivo:
  - **Numeração:** a última migration no repo é a `018` (`018_recados.sql` e
    `018b_recados_limpeza.sql`). A `019_` estava livre. Nada renumerado.
  - Lacuna conhecida, sem mudança: continua **sem** `016_*.sql` no repo (a
    `016_cards_visibilidade.sql` rodou em 29/08, mas o arquivo nunca foi recuperado).
  - **`public.meu_perfil()`:** aparece em `007_kanban.sql` (onde é criada), `009`, `010`,
    `012`, `013`, `014` e `015`.
  - **`public.meu_id_equipe()`:** aparece num `create or replace function` em
    `010_observacoes_producao.sql`, e é usada pela `018_recados.sql`. **Mas o arquivo que
    criou a função no banco de verdade não está no repo:** `014_fase_d_auditoria.sql` (item 6)
    registra que a 010 nunca rodou, e o cabeçalho da `018_recados.sql` diz que a função veio
    da 016 (rodada em 29/08, arquivo faltando). A conferência da 018 (J0) confirmou
    `meu_id_equipe_existe = 1` no banco, então a 019 deve encontrá-la. Só registrado — a
    função **não** foi criada nem copiada.
- Não executei nada no Supabase. Quem roda é o Felipe, no SQL Editor.
- `docs/fase-k.md` não foi editado.
- Sem commit e sem push (vai junto quando o Felipe aprovar).
- Felipe rodou a 019 no SQL Editor, com sucesso — conferência (esperado `2 | true | true | 5 | 2`):
  - `tabelas | rls_materiais | rls_movimentos | policies | triggers` = `2 | true | true | 5 | 2`. Bateu com o esperado.
- Dúvidas / algo diferente do esperado: nenhuma.
- **K0 concluída.** (Commit vai junto com K1 + K2.)

### K1
- Arquivos alterados:
  - `src/types/index.ts` — `CategoriaMaterial`, `UnidadeMaterial`, `TipoMovimento`, `Material` e `MovimentoEstoque` no fim do arquivo, como na spec (só acrescentei comentários de doc).
  - `src/lib/permissoes.ts` — `editarAlmoxarifado` e `retirarMaterial` no tipo `Permissoes`, com comentário; `true` nos dois em `ACESSO_TOTAL` (`RECEPCIONISTA` herda pelo spread), `false` em `LEITURA_PRODUCAO`; objeto `CORTE` novo, igual ao da spec, e `corte: CORTE` em `PERMISSOES`. `rotaInicial` do corte continua `/producao` (herdada).
  - `src/lib/almoxarifado.ts` (novo) — client autenticado, função por função: `CATEGORIA_LABEL`, `UNIDADE_LABEL`, `UNIDADE_PADRAO`, `formatarQuantidade`, `situacaoMaterial`, `getMateriais`, `getMaterial`, `criarMaterial`, `atualizarMaterial`, `registrarMovimentos`, `getMovimentos`.
  - Nenhuma tela mudou.
- Passo 4 (objeto de perfil fora da spec quebrado pelos campos novos): **não houve.** Os únicos objetos `Permissoes` são `ACESSO_TOTAL`, `RECEPCIONISTA` (spread), `LEITURA_PRODUCAO` e o novo `CORTE` (spread); nenhum outro arquivo monta `Permissoes`.
- Decisões de implementação (a spec não desce a esse nível):
  - **Duplicata:** `criarMaterial`/`atualizarMaterial` transformam o `23505` em `ErroMaterialDuplicado` ("Já existe Malha PV Branco cadastrado."). A classe mantém `code = '23505'`, então `classificarErro` continua devolvendo `validacao`, e a `message` já é o texto da tela. Na edição sem nome/cor no payload, o texto cai em "Já existe outro material com esse nome e cor."
  - **`registrarMovimentos` devolve `{ movimentos, falhaCusto }`.** A atualização do último custo roda **depois** do insert, fora da transação dele. Se ela falhar, os movimentos já entraram — lançar erro faria a tela achar que nada foi gravado, e um novo envio duplicaria a entrada no estoque. Então a falha do custo volta em `falhaCusto` em vez de `throw`; a tela da K3 decide o aviso. Com o mesmo material em duas linhas, o último custo vale.
  - Sinal (regra K-4) aplicado em `registrarMovimentos`: entrada/devolução `+`, saída `−`, ajuste como veio. Quantidade ≤ 0 (ou ajuste = 0, ou não numérica) lança erro **antes** de ir ao banco. `feito_por` não é mandado.
  - **`getMovimentos`:** `pagina` começa em 1; `desde` é inclusivo e `ate` exclusivo (instantes ISO — a tela calcula os limites do período em horário local). Devolve `{ movimentos, total }`. A **busca** (nome/cor do material ou fornecedor) faz duas consultas: primeiro os `id` de `materiais` que casam, depois `or(material_id.in.(…), fornecedor.ilike…)` nos movimentos — filtrar pelo recurso embutido filtraria o join, não a linha. O termo perde `, ( ) * % \` antes de entrar no `or`. Ordem `criado_em desc, id desc` (desempate estável entre páginas).
  - `situacaoMaterial`: negativo vem antes de "sem mínimo" — saldo negativo é "conferir" mesmo sem mínimo cadastrado.
- Observação: no início desta etapa, o topo de `docs/fase-k.md` no disco ainda dizia **"ETAPA ATUAL: K0"** (o Felipe disse que tinha mudado para K1). Segui a instrução do Felipe e não editei o arquivo.
- tsc: `npx tsc --noEmit` limpo. `next lint` nos três arquivos: sem warning nem erro.
- Sem commit (vai junto com a K2, como a spec manda). `npm run build` fica para antes do commit da K1+K2.
- Dúvidas / algo diferente do esperado: só o topo do `fase-k.md` acima.

### K0b (15/10/2026)
- Criado `supabase/migrations/020_almoxarifado_corte.sql`, cópia literal do bloco da seção K0b de
  `docs/fase-k.md` (linhas 307–361, 55 linhas): `estoque_mov_insert` refeita aceitando
  gestor, recepcionista e corte (qualquer tipo), e `estoque_aplicar_movimento` com a linha a
  mais que zera `custo_unitario` quando `meu_perfil() = 'corte'`.
- Numeração: a última no repo era a `019_almoxarifado.sql`; `020_` estava livre.
- Não executei nada no Supabase. Quem roda é o Felipe; conferência esperada `5 | true | true`.
- Felipe rodou a 020 no SQL Editor (15/10/2026), com sucesso — conferência `policies | custo_corte | insert_corte` = `5 | true | true`. Bateu com o esperado.
- **K0b concluída.**

### K1b (15/10/2026)
- `src/lib/permissoes.ts`: `retirarMaterial` → **`movimentarEstoque`** (entrada, fechar corte e
  ajuste), com o comentário reescrito; o de `editarAlmoxarifado` agora diz "só cadastrar/editar
  material". `ACESSO_TOTAL` os dois `true` (recepcionista herda), `LEITURA_PRODUCAO` os dois
  `false`, `CORTE` com `movimentarEstoque: true` e `editarAlmoxarifado: false` explícito
  (`verFinanceiro` continua `false`, herdado). Comentário do `CORTE` atualizado.
- `retirarMaterial` não era usado fora de `permissoes.ts` (conferido com grep em `src/`), então
  `almoxarifado.ts` não tinha uso para trocar.
- `src/lib/almoxarifado.ts`: acrescentados `TIPO_LABEL` (`devolucao` → "Sobra"),
  `CATEGORIAS_ATIVAS = ['malha', 'tecido_plano']` e `getMaterialDoPedido(pedidoId)`, que devolve
  por material `{ materialId, material, comprado, jaSaiu, sobrou }`.
  - Decisões: `jaSaiu` é a soma dos valores absolutos das saídas; ajuste é ignorado (não é
    movimento de pedido); a ordem é a do primeiro movimento de cada material; `material` pode
    vir `null` se o join não voltar.
- `npx tsc --noEmit` limpo; `next lint` nos dois arquivos sem warning nem erro.
- Nenhuma tela mudou. `docs/fase-k.md` não foi editado. Sem commit.

### K2 (15/10/2026)
- Arquivos:
  - `src/components/layout/Sidebar.tsx` — item **Almoxarifado** (`/almoxarifado`, ícone `Warehouse`,
    que existe na lucide 0.400) logo depois de Entregas. O filtro por `podeAcessarRota` já esconde
    dos perfis de produção que não são corte.
  - `src/app/almoxarifado/page.tsx` (novo) — Estoque.
  - `src/app/almoxarifado/[id]/page.tsx` (novo) — Detalhe.
  - `src/components/almoxarifado/ui.tsx` (novo) — `AbasAlmoxarifado`, `BadgeSituacao`, `BadgeTipo`,
    `lerNumero`/`numeroParaCampo` (número digitado em pt-BR).
  - `src/components/almoxarifado/MaterialModal.tsx` (novo) — cadastro/edição, um modal só para a
    lista e o detalhe, sobre o `Modal` de `components/kanban/`.
- Permissões: "Registrar entrada" e "Fechar corte" (e as abas Entrada/Corte) com
  `movimentarEstoque`; "+ Novo material", Editar e Desativar/Reativar com `editarAlmoxarifado`;
  card "Valor em estoque", coluna e card de Custo/un. e o campo de custo do modal com
  `verFinanceiro`. Na edição sem `verFinanceiro` o custo nem é mandado (não apaga o da gestão).
- Os botões e as abas Entrada, Corte e Movimentações apontam para `/almoxarifado/entrada`,
  `/corte` e `/movimentacoes`, que **ainda não existem (404 até a K3/K4/K5)** — autorizado pelo Felipe.
- Categorias: chips e seletor só com `CATEGORIAS_ATIVAS`. Ao editar material antigo de outra
  categoria, ela entra como opção extra, para não forçar troca.
- Decisões de implementação:
  - **Cards de resumo** usam o padrão `.card` com ícone em quadrado (o mesmo de
    `/terceirizadas`), não o visual do `/dashboard` — o dashboard usa um CSS próprio
    (`painel.css`, classes `pn-*`) que só vale lá dentro. Os cards olham só materiais
    **ativos** e não seguem o filtro. Malha soma só `malha` em `kg`; Tecido plano soma só
    `tecido_plano` em `m` (malha controlada em metro não entra na soma de kg).
  - O card "Abaixo do mínimo" (conta abaixo + negativo) fica vermelho só se `> 0` e tem o
    atalho "Ver só estes", que liga o chip.
  - `getMateriais({ incluirInativos: true })` sempre; o checkbox "Mostrar desativados" filtra
    na tela.
  - Filtros em `localStorage` (`nice-filtros-almoxarifado`): categoria, "abaixo do mínimo" e
    desativados. A busca não é guardada, igual `/producao`.
  - Ordem: negativo → abaixo → resto, depois nome e cor.
  - Celular: lista de cartões (`md:hidden`); desktop: tabela. A linha da tabela é clicável, e o
    nome é um `Link` (alvo de teclado/leitor de tela).
  - Cadastro novo leva direto para o detalhe do material criado.
  - Desativar pede confirmação num `Modal` (não `confirm()`) e explica que o histórico continua.
  - Movimentos no detalhe: paginação de 50 no banco, colunas da K5 sem a de Material (é o
    próprio). Data/hora com `date-fns` `format` (é `timestamptz`, não coluna `date`).
  - Material com saldo negativo mostra faixa vermelha explicando "conferir e ajustar".
- Auditoria impeccable: o launcher rodou (sem PRODUCT.md/DESIGN.md — usou o código como
  referência), o detector mecânico não achou nada (`[]`). O guia de auditoria da skill não pôde
  ser lido (acesso fora do projeto negado), então a auditoria manual seguiu hierarquia,
  estados, celular, acessibilidade e textos. Corrigido:
  - linha de material desativado usava `opacity-60`, que derruba o texto abaixo de AA → virou
    badge "Desativado" com contraste normal;
  - "Ver só estes" com alvo de toque < 24px → ganhou `py-1`;
  - foco de teclado nos links da lista era só fundo/sublinhado → `outline` 2px `marca`, igual
    aos botões de `globals.css`;
  - texto verde de badge/quantidade em `green-800` (o `green-700` sobre `green-100` fica no limite
    de 4,5:1).
  - Ficou de fora (identidade visual): o visual `pn-*` do dashboard (CSS próprio daquela tela);
    ícones por categoria e cor de amostra do tecido (não existe no padrão, e cor é texto livre);
    animação de entrada. A redundância "Sem mínimo" no card Mínimo e no Situação ficou, por clareza.
- `npx tsc --noEmit` limpo. `npm run build` limpo (com o `npm run dev` parado); os únicos avisos
  de lint são os `<img>` já existentes em `configuracoes`, `pedidos/[id]`, `FotoUpload` e
  `MiniaturaArquivo`.
- Não cadastrei material nem mexi no banco. Teste com `TESTE — não usar` fica com o Felipe.
- Sem commit e sem push (vai junto com a K1, depois do teste).
- **Teste da K2 (Felipe, 15/10/2026): passou tudo.** K2 aprovada; commit K0–K2 junto.
