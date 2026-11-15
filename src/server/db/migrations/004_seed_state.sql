-- Small key/value store for the seed (e.g. how many built-in content revision steps were applied).
create table if not exists seed_state (
  key text primary key,
  value integer not null,
  updated_at timestamptz not null default now()
);
alter table seed_state enable row level security;
