create table if not exists tratativas (
  id text primary key,
  created_at timestamptz not null default now(),
  foto text,
  gravidade text not null,
  codigo text,
  descricao text not null,
  supervisor text,
  encarregado text,
  lancado_por text,
  frota text,
  placa text,
  email text,
  cc text[] default '{}',
  prazo date,
  status text not null default 'Em andamento',
  approval_token text unique,
  token_used_at timestamptz,
  decision text,
  decision_comment text,
  decision_at timestamptz
);

create index if not exists idx_tratativas_status on tratativas (status);
create index if not exists idx_tratativas_token on tratativas (approval_token);
create index if not exists idx_tratativas_placa on tratativas (placa);

-- Se a tabela "tratativas" já existir no seu Supabase (instalação anterior a estes
-- 3 campos novos), rode as linhas abaixo para adicioná-los sem perder os dados:
alter table tratativas add column if not exists encarregado text;
alter table tratativas add column if not exists frota text;
alter table tratativas add column if not exists placa text;
