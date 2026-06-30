create table tabela_precos (
  id           uuid        primary key default gen_random_uuid(),
  grupo        text        not null,
  produto      text        not null,
  faixa_tamanho text       not null,
  valor        numeric     default 0,
  updated_at   timestamptz default now()
);

alter table tabela_precos disable row level security;
