create table if not exists tratativas (
  id text primary key,
  created_at timestamptz not null default now(),
  foto text,
  gravidade text not null,
  codigo text,
  descricao text not null,
  supervisor text,
  lancado_por text,
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
