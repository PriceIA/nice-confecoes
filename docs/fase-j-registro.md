# Fase J — Registro

Este arquivo é **só do Claude Code**: ele registra aqui o que fez em cada etapa (arquivos,
tsc/build, dúvidas, hash do commit), sempre **acrescentando no fim**. O Claude do Cowork também
anota aqui as revisões dele, sempre no fim. A spec fica em `docs/fase-j.md`, que é só do Cowork.

### J0
- Arquivos criados:
  - `supabase/migrations/018_recados.sql` — copiado do documento, sem alteração.
  - `supabase/migrations/018b_recados_limpeza.sql` — copiado do documento, sem alteração.
- Felipe rodou a 018 — conferência: `tabela=1, rls_ligado=true, policies=2, funcoes=2, realtime=1, meu_id_equipe_existe=1`. Bateu com o esperado (`1 | true | 2 | 2 | 1 | 1`).
- Felipe rodou a 018b — pg_cron ligado pelo painel (Database → Extensions) antes de rodar o arquivo; conferência: `limpar-recados | 0 6 * * * | true`. Bateu com o esperado.
- `npm run build`: compilou limpo, com o `npm run dev` parado — só os 4 warnings pré-existentes (`react-hooks/exhaustive-deps` em `configuracoes` e `pedidos/[id]`, `no-img-element` em `pedidos/[id]`, `FotoUpload` e `MiniaturaArquivo`), nenhum novo.
- Commit (hash): `17f853c` — `feat: tabela de recados com RLS, realtime e limpeza de 30 dias (migrations 018 e 018b)` (inclui a anotação pendente da I6 em `docs/fase-i-registro.md` e os docs desta fase). Push feito para `origin/main`.

### J1
- Arquivos alterados:
  - `src/types/index.ts` — `Recado` e `Conversa` novos, depois de `MembroEquipe`.
  - `src/lib/permissoes.ts` — campo `usarRecados: boolean` no tipo `Permissoes` (depois de `responderEntrega`); `true` em `ACESSO_TOTAL` e em `LEITURA_PRODUCAO`. `RECEPCIONISTA` herda `true` pelo spread, sem precisar listar.
  - `src/lib/recados.ts` (novo) — client autenticado, função por função, como `kanban.ts`: `TEXTO_MAX`, `RESPOSTAS_RAPIDAS`, `getEquipeRecados` (via `rpc('listar_equipe')`, sem a própria pessoa), `getMeusRecados`, `agruparConversas`, `enviarRecado`, `marcarLidos` (via `rpc('marcar_recados_lidos')`), `assinarRecados` (dois `postgres_changes` — INSERT em mim, UPDATE de mim — devolve a função de `removeChannel`).
  - Nenhuma tela mudou, como previsto.
- Uma diferença do documento: não recriei/reexportei `numerosDePedidos` dentro de `recados.ts` — deixei só um comentário apontando para `kanban.ts`. O documento pede "reusar", não duplicar nem repassar; quem for montar o balão do pedido (J3) importa direto de `kanban.ts`, igual o resto do código já faz noutros lugares.
- tsc: `npx tsc --noEmit` limpo. **Não commitei esta etapa**, como pedido.
- Dúvidas / algo diferente do esperado: nenhuma.
