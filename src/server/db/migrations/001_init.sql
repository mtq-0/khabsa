-- KHABSA initial schema
-- All access goes through the trusted Node server. Row level security is
-- enabled on every table with no permissive policies for the public API
-- roles (anon / authenticated) so a hosted provider's auto-generated REST
-- API (e.g. Supabase PostgREST) can never read secrets directly.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text,
  password_hash text,
  username text not null,
  display_name text not null,
  avatar text not null default '0-0',
  avatar_url text,
  is_guest boolean not null default true,
  role text not null default 'user' check (role in ('user', 'admin')),
  xp integer not null default 0 check (xp >= 0),
  settings jsonb not null default '{}'::jsonb,
  banned boolean not null default false,
  favorite_games text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint users_username_format check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  constraint users_display_name_len check (char_length(display_name) between 1 and 24),
  constraint users_registered_has_email check (is_guest or (email is not null and password_hash is not null))
);
create unique index users_email_key on users (lower(email)) where email is not null;
create unique index users_username_key on users (lower(username));
create index users_xp_idx on users (xp desc) where not is_guest;

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  user_agent text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

create table games (
  id text primary key,
  enabled boolean not null default true,
  featured boolean not null default false,
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

create table categories (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null,
  emoji text not null default '🎲',
  sort integer not null default 0
);

create table content_packs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  owner_id uuid references users(id) on delete cascade,
  official boolean not null default false,
  status text not null default 'active' check (status in ('active', 'pending', 'disabled')),
  created_at timestamptz not null default now()
);
create index content_packs_owner_idx on content_packs (owner_id);

create table content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('word', 'question-pair', 'picture-pair', 'most-likely', 'taboo-card', 'trivia', 'draw-word')),
  category text not null references categories(slug) on update cascade,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  data jsonb not null,
  pack_id uuid references content_packs(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'pending', 'disabled')),
  dedupe_key text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_items_lookup_idx on content_items (kind, status, category, difficulty);
create index content_items_pack_idx on content_items (pack_id);
create unique index content_items_dedupe_key on content_items (kind, coalesce(pack_id, '00000000-0000-0000-0000-000000000000'::uuid), dedupe_key);

create table images (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null unique,
  mime text not null check (mime in ('image/webp', 'image/svg+xml', 'image/png', 'image/jpeg')),
  bytes integer not null check (bytes > 0),
  width integer,
  height integer,
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  host_id uuid references users(id) on delete set null,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  status text not null default 'open' check (status in ('open', 'closed')),
  snapshot jsonb not null default '{}'::jsonb,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
-- one open room per code; closed codes may be reused later
create unique index rooms_open_code_key on rooms (code) where status = 'open';
create index rooms_status_idx on rooms (status, updated_at);

create table room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  kicked boolean not null default false,
  primary key (room_id, user_id)
);
create index room_members_user_idx on room_members (user_id);

create table matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete set null,
  game_id text not null,
  host_id uuid references users(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  results jsonb,
  player_count integer not null default 0
);
create index matches_game_idx on matches (game_id, started_at desc);
create index matches_host_idx on matches (host_id) where ended_at is not null;

create table match_players (
  match_id uuid not null references matches(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  score integer not null,
  place integer not null,
  won boolean not null,
  xp_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index match_players_user_idx on match_players (user_id, created_at desc);
create index match_players_created_idx on match_players (created_at);

-- XP ledger: the unique key makes awards idempotent (no duplicate awards)
create table xp_events (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  source text not null,
  source_id text not null,
  amount integer not null check (amount between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index xp_events_created_idx on xp_events (created_at, user_id);

create table achievements (
  id text primary key,
  title text not null,
  description text not null,
  emoji text not null,
  xp integer not null default 0,
  sort integer not null default 0
);

create table user_achievements (
  user_id uuid not null references users(id) on delete cascade,
  achievement_id text not null references achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table friendships (
  requester_id uuid not null references users(id) on delete cascade,
  addressee_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- one relationship per unordered pair
create unique index friendships_pair_key on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on friendships (addressee_id);

create table blocks (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table recent_players (
  user_id uuid not null references users(id) on delete cascade,
  other_id uuid not null references users(id) on delete cascade,
  last_played_at timestamptz not null default now(),
  game_id text,
  primary key (user_id, other_id),
  check (user_id <> other_id)
);

create table room_invites (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  from_user uuid not null references users(id) on delete cascade,
  to_user uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index room_invites_to_idx on room_invites (to_user, status, created_at desc);
create unique index room_invites_pending_key on room_invites (room_code, from_user, to_user) where status = 'pending';

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users(id) on delete cascade,
  target_user_id uuid references users(id) on delete cascade,
  content_item_id uuid references content_items(id) on delete cascade,
  room_code text,
  reason text not null check (reason in ('abuse', 'cheating', 'spam', 'inappropriate', 'content', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution text,
  resolved_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (target_user_id is not null or content_item_id is not null)
);
create index reports_status_idx on reports (status, created_at desc);

create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);

-- Defense in depth for hosted Postgres providers that expose an automatic
-- REST API: enable RLS everywhere and revoke the public API roles.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
  end if;
end $$;
