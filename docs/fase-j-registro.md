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
- Commit (hash):
