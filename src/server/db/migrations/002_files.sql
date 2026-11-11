-- Store uploaded/generated files in Postgres so the app runs on hosts without
-- a persistent disk (e.g. free tiers). Keys keep the same format as before:
--   private/images/<uuid>.<ext>   secret game images (never public)
--   public/avatars/<uuid>.webp    profile pictures (served under /media)
create table files (
  key text primary key check (key ~ '^(private|public)/[a-z0-9-]+/[a-f0-9-]{36}\.(webp|svg|png|jpg)$'),
  mime text not null,
  data bytea not null,
  bytes integer not null check (bytes > 0 and bytes <= 8388608),
  created_at timestamptz not null default now()
);

alter table files enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.files from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.files from authenticated';
  end if;
end $$;
