-- 011 — AUDITORIA (só leitura). Rodar ANTES de 011_storage_pdf.sql.
--
-- Objetivo: descobrir se o bucket `pedido-fotos` aceita PDF hoje.
--
-- O upload de arte passou a aceitar `application/pdf` no código
-- (src/components/FotoUpload.tsx + uploadFotoPeca em src/lib/store.ts). Mas
-- quem decide o que entra no bucket é o Storage, não o front: se
-- `allowed_mime_types` estiver preenchido só com tipos de imagem, o PDF volta
-- como erro de upload e a tela mostra "Não foi possível enviar o arquivo".
--
-- Como ler o resultado:
--
--   allowed_mime_types = NULL  -> o bucket aceita QUALQUER tipo. Nada a fazer,
--                                 não precisa rodar 011_storage_pdf.sql.
--   allowed_mime_types = {...} -> lista fechada. Se 'application/pdf' não
--                                 estiver nela, rode 011_storage_pdf.sql.
--
-- `file_size_limit` em bytes: NULL = usa o padrão do projeto (50 MB no free).
-- O front barra acima de 45 MB para dar mensagem em português antes disso.

select
  id                as bucket,
  public            as publico,
  file_size_limit   as limite_bytes,
  allowed_mime_types as tipos_permitidos
from storage.buckets
where id = 'pedido-fotos';
