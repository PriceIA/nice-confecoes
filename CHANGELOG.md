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

### Alterado
- **Tabela de preços — gravação reescrita** (`src/app/tabela-precos/page.tsx`). O salvar
  usava `.delete().not('grupo','is',null)` seguido de `insert` em lote, ou seja, apagava a
  tabela inteira antes de reinserir; falha no meio deixava a tabela vazia. Agora usa
  `upsert` com `onConflict: 'grupo,produto,faixa_tamanho'`.
- Limpar o campo de um preço passou a **remover a linha no banco** por `delete().in('id', …)`
  com os ids exatos, em vez de gravar `0` — que virava um preço real de R$ 0,00. O
  carregamento passou a trazer `id` no `select` para viabilizar isso.
- Mensagens de erro do salvar diferenciam falha de rede (laranja) de erro de
  permissão/RLS, constraint ausente (`42P10`) e validação (`22xxx`/`23xxx`) (vermelho).
  Toda falha diz explicitamente que as alterações ficaram só no navegador e **não** no banco.
  Mensagem de sucesso passou a informar quantos preços foram salvos e removidos.

### Segurança
- Removida a operação de `DELETE` em massa em `tabela_precos` disparada do browser com a
  anon key. O `DELETE` que restou é pontual, por `id`, e só nas linhas que o usuário limpou.

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
