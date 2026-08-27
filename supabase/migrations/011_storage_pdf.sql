-- 011 — Bucket `pedido-fotos` passa a aceitar PDF além de imagem.
--
-- RODAR SÓ SE a auditoria (011_storage_pdf_auditoria.sql) mostrar
-- `tipos_permitidos` PREENCHIDO e sem 'application/pdf'. Se vier NULL, o
-- bucket já aceita qualquer tipo e este arquivo não tem o que fazer.
--
-- Contexto: a arte do pedido chega em PDF com frequência (é o formato em que
-- o vetor sai do designer). Antes, `accept="image/*"` no seletor de arquivo
-- escondia o PDF na janela do Windows; agora o front aceita, e o bucket
-- precisa acompanhar — senão o bloqueio só muda de lugar.
--
-- Não mexe em policy nem em RLS: buckets de Storage não usam RLS de tabela, e
-- `pedido-fotos` continua público por URL, exatamente como antes (ver a seção
-- "Estado de segurança atual" no CLAUDE.md — isto não é regressão, é o mesmo
-- comportamento que as fotos já tinham).

update storage.buckets
set allowed_mime_types = array[
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'image/bmp',
      'image/tiff',
      'image/heic',
      'image/heif',
      'application/pdf'
    ]
where id = 'pedido-fotos';

-- Conferência: rode junto e confirme que 'application/pdf' aparece na lista.
select id as bucket, allowed_mime_types as tipos_permitidos
from storage.buckets
where id = 'pedido-fotos';
