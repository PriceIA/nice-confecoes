# Changelog

> **Toda sessão de trabalho registra aqui o que fez antes de encerrar.** Adicione as
> mudanças em `[Não lançado]`, agrupadas por Adicionado / Alterado / Corrigido / Removido /
> Segurança. Ao publicar uma versão, mova o bloco para uma seção com data ISO (AAAA-MM-DD).

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

### Adicionado
- `CLAUDE.md` na raiz: contexto permanente do projeto — stack, identidade visual, módulos,
  modelo de dados, regras de negócio, convenções de trabalho e estado de segurança.
- `CHANGELOG.md` (este arquivo).
- `supabase/migrations/005_tabela_precos_unique.sql`: registro histórico da constraint
  `unique (grupo, produto, faixa_tamanho)` em `tabela_precos`, aplicada manualmente no banco.
  Bloco `do $$` idempotente que verifica pelas colunas, não pelo nome.
- `supabase/migrations/006_povoar_tabela_precos.sql`: povoamento da `tabela_precos` com a
  tabela de preços oficial vigente (2025) — 142 linhas, executado manualmente no Supabase
  SQL Editor. `produto` usa os nomes exatos do `CATALOGO` (`src/lib/helpers.ts`) e
  `faixa_tamanho` as strings que o código gera (`0-02`…`P/M/G`, `GG`), não a grafia da
  imagem original. A linha oficial "Manga Curta/Regata" virou duas (`Camiseta M Curta` e
  `Regata`, mesmo preço); "Bailarina" e "Legging" viraram uma (`Bailarina/Legging`); as
  Jardineiras não têm linha `GG`. Re-executável via `on conflict do update`.

- **Autenticação (Fase A).** Login por usuário e senha com Supabase Auth + `@supabase/ssr`
  (sessão em cookies), cobrindo:
  - `/login` — usuário curto sem `@`; o e-mail é montado como `usuario@niceconfec.app`.
    Erro sempre genérico ("usuário ou senha incorretos"), sem expor detalhe do Supabase.
  - `src/middleware.ts` — exige sessão em tudo que não seja `/login`, valida com `getUser()`
    e aplica a matriz de permissões por URL. `/api/keep-alive` fica fora do matcher para o
    cron da Vercel continuar funcionando sem sessão.
  - `src/lib/permissoes.ts` — **fonte única** das regras de perfil (`gestor`,
    `recepcionista`, `costureira`), consumida por middleware, sidebar e telas.
  - `src/components/AuthProvider.tsx` — contexto com o membro logado, resolvido no servidor
    pelo layout raiz (sem flash de carregamento). `useMembro()` devolve
    `{ membro, permissoes, sair }`.
  - `/perfil` — troca da própria senha, aberta a todos os perfis.
  - Botão "Sair" na sidebar.
- **Perfil costureira**: leitura em `/pedidos` e `/pedidos/[id]` (sem botões de criar, editar
  ou excluir), leitura e escrita em `/producao`, e bloqueio das demais rotas com redirect
  para `/producao`. Gestor e recepcionista seguem com acesso total, sem mudança.

### Alterado
- **"Pedro"/"Administrador" deixaram de ser hardcoded.** Nome e perfil na sidebar e o
  consultor responsável em `/novo-pedido` passam a vir do usuário autenticado
  (`src/components/layout/Sidebar.tsx`, `src/app/novo-pedido/page.tsx`).
- **Tabela de preços — gravação reescrita** (`src/app/tabela-precos/page.tsx`). O salvar
  usava `.delete().not('grupo','is',null)` seguido de `insert` em lote, ou seja, apagava a
  tabela inteira antes de reinserir; falha no meio deixava a tabela vazia. Agora usa
  `upsert` com `onConflict: 'grupo,produto,faixa_tamanho'`.
- Preço deixado em branco não grava nada: a linha é pulada (sem `insert` e sem `delete`), o
  valor que já está no banco é mantido e o usuário é avisado de quais linhas ficaram de
  fora, sem bloquear o salvamento das demais. Antes, campo vazio gravava `0` — que virava
  um preço real de R$ 0,00.
- Mensagens de erro do salvar diferenciam falha de rede (laranja) de erro de
  permissão/RLS, constraint ausente (`42P10`) e validação (`22xxx`/`23xxx`) (vermelho).
  Toda falha diz explicitamente que as alterações ficaram só no navegador e **não** no banco.

### Corrigido
- **O cálculo automático de preço por peça nunca funcionou** (`src/app/novo-pedido/page.tsx`).
  O `select` pedia a coluna `preco_unitario`, que não existe em `tabela_precos` — o nome real
  é `valor`. O PostgREST devolvia `42703`, `data` vinha `null` e o guard `if (data)` engolia
  o erro em silêncio, então todo pedido caía no `PRECO_FALLBACK` fixo por complexidade.
- **Preços deslocados uma linha na grade** (`src/app/tabela-precos/page.tsx`). No grupo
  `CAMISETA/REGATA`, `Regata` exibia o preço de Manga Longa, `Manga Longa` o de Camiseta
  Algodão, `Camiseta Algodão` o de Jardineira Curta e `Jardineira Curta` o de Jardineira
  Longa — que por sua vez não aparecia na tela. Realinhado com a tabela oficial 2025.
  Impacto: `Camiseta Algodão` era exibida a R$ 48,40 quando o correto é R$ 29,80.

### Segurança
- **O acesso à aplicação passou a exigir login.** Antes, qualquer pessoa com a URL abria o
  sistema inteiro.
- **RLS continua desabilitado** em `pedidos`, `clientes`, `terceirizadas` e `tabela_precos`,
  e o `store.ts` continua gravando com a anon key exposta no bundle. **O login protege a
  aplicação, não o banco**: quem extrair a anon key ainda lê e escreve em qualquer tabela
  pela API do Supabase, sem passar pelo login. Fechar o RLS é a Fase B e **não foi feita**.
- Removida a operação de `DELETE` em massa em `tabela_precos` disparada do browser com a
  anon key. A tela de preços não emite mais nenhum `DELETE`.

### Dívida técnica
- **`/tabela-precos` e o cálculo automático de `/novo-pedido` usam taxonomias diferentes.**
  O cálculo busca o preço por `tabelaPrecos[peca.tipo]`, onde `peca.tipo` é um nome do
  `CATALOGO` (`src/lib/helpers.ts`) e o `grupo` é ignorado. A tela de preços monta a chave
  como `grupo + produto + faixa` a partir do `DADOS_PADRAO` (`src/app/tabela-precos/page.tsx`),
  que tem outros nomes de grupo e de produto. Consequência prática: **editar um preço pela
  tela não altera o valor usado no cálculo automático**, e vice-versa — as linhas gravadas
  pelos dois caminhos convivem em paralelo na mesma tabela. Unificar exige eleger a
  identidade canônica do produto, extrair `CATALOGO` e `DADOS_PADRAO` para um módulo único
  (junto com as faixas, hoje duplicadas entre `FAIXAS` e `getFaixaTamanho`) e migrar as
  chaves já gravadas.

---

## [2026-07-22]

### Adicionado
- Endpoint `GET /api/keep-alive` e cron diário às 06:00 UTC em `vercel.json`, para evitar a
  pausa automática do projeto Supabase por inatividade (plano free pausa após 7 dias). (`d4ec7b3`)

---

## [2026-06-30]

### Adicionado
- Campo **responsável** no cadastro de cliente.
- Campos **endereço** e **CNPJ/CPF** (`documento`) no cliente.
- **Fotos por peça**, com upload para o bucket `pedido-fotos` e lightbox
  (`src/components/FotoUpload.tsx`).

### Alterado
- Edição ampla do pedido na tela de detalhe: passou a permitir alterar praticamente todos os
  campos, não só o status. (`e157baa`, merge `1d87f67`)

---

## [2026-06-22]

### Adicionado
- Imagem por peça e controle de **vetorização** no pedido (`necessaria` / `valor`). (`e6223c2`)

### Alterado
- Layout de impressão do pedido reescrito para saída A4 profissional, com bloco dedicado
  `print:block` e regras `@page` em `globals.css`. (`05c8809`)

---

## [2026-06-21]

### Adicionado
- **Tabela de preços** Escolar/Empresarial (tabela `tabela_precos` + tela `/tabela-precos`) e
  catálogo de peças configurável em `/configuracoes`. (`032ff07`)
- Cálculo automático do valor da peça a partir da tabela de preços. (`ec04459`)
- Valor unitário editável por peça, com subtotal automático. (`04fbc19`)
- Upload de imagem e campo de vetorização no pedido. (`b1bbfe4`)
- Campo **consultor responsável** no pedido. (`683b8db`)
- Pagamentos flexíveis por parcelas e tamanhos infantis (01 a 14). (`6a43bd5`)

### Corrigido
- Catálogo escolar completado com todos os itens da tabela de preços. (`6d47354`)
- Query de clientes no Supabase. (`ab859ba`)
- Erro ao salvar pedido. (`fcdc629`)

---

## [2026-06-19]

### Alterado
- **Persistência migrada de `localStorage` para Supabase.** Passou a ser a mudança estrutural
  do projeto: `src/lib/store.ts` virou a única camada de acesso a dados. (`4ea1df3`)

### Adicionado
- Módulo de **clientes** com histórico de pedidos e autocomplete no novo pedido. (`5fa4696`)

---

## [2026-06-18]

### Adicionado
- Versão inicial do sistema: dashboard, pedidos, novo pedido, produção, terceirizadas e
  relatórios. (`9528efa`)

### Alterado
- Sidebar tornada responsiva: topbar + drawer no mobile, sidebar fixa a partir de `md:`. (`302f895`)

---

## Anterior ao changelog

Itens sem data confiável, verdadeiros desde o início do projeto.

### Segurança
- O aplicativo **nasceu sem autenticação** e assim permanece: não há `supabase.auth`,
  `middleware.ts` nem rota de login.
- **RLS desabilitado em todas as tabelas** por migration explícita
  (`supabase/migrations/001_initial.sql`, `002_tabela_precos.sql`). Não é regressão — é o
  estado original, conhecido e pendente de correção.
- Todo o acesso ao banco usa a **anon key** exposta no bundle via `NEXT_PUBLIC_*`. Não existe
  `SUPABASE_SERVICE_ROLE_KEY` no projeto.
- Fotos de peças são servidas por **URL pública** do Storage.
- Há `DELETE` disparado do browser em `pedidos` e em `tabela_precos` (este último apaga a
  tabela inteira a cada gravação de preços).

Detalhes e evidências com arquivo:linha em `CLAUDE.md`, seção "Estado de segurança atual".
