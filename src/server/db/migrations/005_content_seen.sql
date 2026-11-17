-- Which built-in / pack content each player has already seen, so new games prefer content
-- nobody in the room has seen yet (then the least recently seen). One row per player and item.
create table if not exists content_seen (
  user_id uuid not null references users(id) on delete cascade,
  content_id uuid not null references content_items(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, content_id)
);
create index if not exists content_seen_content_idx on content_seen (content_id);
create index if not exists content_seen_user_time_idx on content_seen (user_id, seen_at);
alter table content_seen enable row level security;
