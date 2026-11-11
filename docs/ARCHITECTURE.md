# Architecture

## Overview

```
 Browser (React 19 + TS + Tailwind 4, RTL)            One Node 22 process (Fastify 5)
 ┌──────────────────────────────┐   HTTPS/JSON   ┌─────────────────────────────────────┐
 │ pages, game screens, chat    │ ─────────────▶ │ REST: auth, profile, social, admin, │
 │ lib/api.ts  (fetch + CSRF hdr)│               │       content, rooms, voice tokens  │
 │ lib/socket.ts (one socket)   │ ◀═══ WSS ═══▶ │ Socket.IO: rooms, actions, chat,    │
 │ lib/room.ts (versioned state)│               │            canvas, presence         │
 │ voice/ (LiveKit, lazy chunk) │               │ RoomManager (authoritative state)   │
 └──────────┬───────────────────┘               │ Game engines (7, pure reducers)     │
            │ WebRTC (audio only)               └───────┬─────────────────────┬───────┘
            ▼                                           │ SQL (pg / PGlite)    │ private files
     LiveKit SFU (+TURN)                         PostgreSQL               storage dir (disk)
```

### Why a stateful Node game server instead of Supabase Realtime + Edge Functions

The brief suggested Supabase. I kept **PostgreSQL** (any host, including Supabase Postgres) but replaced Supabase Realtime/Edge Functions with a single authoritative Node server, for these reasons:

- **Timers and phases.** Every game has server deadlines (turns, votes, hints). A long-lived process can schedule them exactly; stateless edge functions would need an external scheduler and a database round trip per tick.
- **Per-player privacy.** The server sends each socket its own projection of the state. Broadcast channels make it easy to leak a secret to everyone; here a secret is never serialized for a viewer who may not see it.
- **Atomicity.** All actions on a room run through a per-room serial lock, so votes, joins and timer ticks cannot interleave.
- **Testability.** The whole stack (including Postgres via PGlite) runs in-process, so multiplayer behaviour is covered by real socket tests.

Trade-off: rooms live in one process. The deployment must run **one instance** (state is snapshotted to Postgres and restored after restarts). Scaling out needs room-sharded routing; see "Scaling" below.

## Source layout

```
src/shared/      protocol types, error codes, game catalogue & settings schema, Arabic normalisation, avatars
src/server/
  app.ts         Fastify + Socket.IO bootstrap, security headers, CSRF, static hosting
  config.ts      environment configuration
  db/            adapter (pg | PGlite), migrations/*.sql, seed/ (content), cli.ts
  auth/          scrypt passwords, opaque session tokens (sha256 at rest)
  rooms/         RoomManager (authoritative state, locking, timers, persistence), sockets.ts
  games/         7 engines + shared voting helpers + registry
  content/       content validation (zod), random selection, bulk import, CSV
  stats/         XP ledger, achievements, leaderboards (idempotent awards)
  routes/        auth, social, rooms/voice/images/packs, admin
  storage/       private/public file storage, signed viewer-bound image tokens
  voice/         LiveKit token minting and participant removal
  security/      rate limiters, text sanitation
src/client/
  lib/           api, session, socket (reconnect), room (versioned state + actions)
  components/    design system (ui.tsx), layout, guest gate, avatar picker
  pages/         every route incl. admin/
  room/          lobby, players, chat, results
  games/         one screen per game (+ shared canvas)
  voice/         VoicePanel + lazy LiveKit client
tests/           vitest suites    e2e/   Playwright journeys
```

## Realtime protocol

Socket.IO events (types in `src/shared/protocol.ts`). Every client→server event uses an acknowledgement `{ok, data} | {ok:false, code, message}`.

| Event | Purpose |
|---|---|
| `room:join {code}` | join/rejoin, returns the personalised `RoomView` |
| `room:action {code, actionId, type, payload, phaseKey?}` | every state change (lobby and `game:*` actions) |
| `room:chat {code, text, clientId}` | chat message (dedup by clientId) |
| `draw:event` / `draw:sync` | canvas segments for draw & guess |
| `room:state` (server→client) | personalised projection with `version` |

Consistency rules:

- **Authoritative state.** Clients send intents; engines validate them and compute results.
- **Versioning.** Each mutation increments `room.version`. Clients drop any `room:state` older than what they have (`lib/room.ts`).
- **Action ids.** Each action carries a UUID. The server keeps the last 500 per room; a repeated id returns `{duplicate:true}` without re-applying. The client retries once on timeout with the same id.
- **Stale actions.** Game actions include the `phaseKey` the player saw; if the phase has moved on, the server rejects with `STALE_ACTION` (a late vote can never land in the next round).
- **Serial lock.** All room operations, including timer ticks, run inside a per-room promise chain.
- **Clone-mutate-commit.** Engines mutate a `structuredClone` of the state; if they throw, the state is unchanged.
- **Reconnection.** Socket.IO reconnects with capped backoff (12 attempts, then a manual retry button). On every reconnect the client re-joins; membership is keyed by user id, so multiple tabs or a reconnect never duplicate a player.
- **Presence & host migration.** Members show online/offline. If the host is offline for 45 s while others are connected, the earliest-joined connected member becomes host. Disconnected lobby members are removed after 10 minutes; rooms with nobody connected close after `ROOM_IDLE_MINUTES`.
- **Persistence.** After each change the room (members, settings, full game state with absolute deadlines) is snapshotted to `rooms.snapshot` (debounced 300 ms) and restored on boot; overdue deadlines fire immediately.

## Game engine

`src/server/games/types.ts` defines a `GameEngine`: `content()` (what to load), `init()`, `act()`, `tick()`, `view(state, viewer, now)`, `playerLeft()`, plus optional `nextWake()` (sub-deadline wake-ups such as drawing hints), `chatSecrets()` (words masked in room chat) and `canvas()` (who may draw). State is JSON-serialisable; `view()` is the only way state reaches a client.

Scoring rules (implemented and unit-tested):

- **Outsider word/picture:** correct vote +1, undetected outsider +2, correct final guess +2. A tie at the accusation cut-off favours the outsider. Outsider count scales as `min(requested, ⌊(n−1)/2⌋)`.
- **Odd question:** correct vote +1, undetected outsider +2.
- **Most likely:** voting with the top vote-getter +1; titles tracked for awards.
- **Taboo:** correct +1 team (explainer and guesser +1 individually), buzz −1, limited skips; card index guards against double taps.
- **Speed quiz:** 100 + up to 50 speed bonus + 25 first-correct + streak bonus (10 per extra, max 50). Timing measured on the server.
- **Draw & guess:** guesser 50 + up to 100 by time + 20 for first; drawer +25 per correct guesser; optional team totals.

Platform XP per match: 20 + placement bonus (30/15/8) + 20 for a win + up to 20 for room size, recorded in an idempotent ledger.

## Drawing synchronisation

Coordinates are quantised to integers 0–1000; the drawer batches points every 50 ms (≤ 200 points per segment) into `{s, c, w, p[]}` segments (colour and size are palette indexes). The server validates sender/turn/shape, keeps up to 6,000 segments / 120k numbers per turn for late joiners (`draw:sync`) and relays to others. Undo/clear are ops, not bitmaps.

## Voice

LiveKit SFU (no full-mesh). The server mints 2-hour tokens only for verified room members, scoped to one LiveKit room per KHABSA room, microphone-only publishing, no data channel. The client loads the SDK lazily, publishes only its own mic, uses adaptive stream/dynacast, echo cancellation and noise suppression, exposes mute/deafen/per-player volume/device switching, speaking indicators and connection quality, handles autoplay unlock, and removes every listener and media element on leave. Kicked players are removed from voice server-side. Voice never gates joining or playing.

## Data model (PostgreSQL)

`users`, `sessions`, `games`, `categories`, `content_packs`, `content_items` (kind + jsonb data, dedupe key, status), `images`, `rooms` (snapshot), `room_members`, `matches`, `match_players` (PK prevents duplicate awards), `xp_events` (unique source key), `achievements`, `user_achievements`, `friendships` (one row per unordered pair), `blocks`, `recent_players`, `room_invites`, `reports`, `platform_settings`, `audit_log`. See `src/server/db/migrations/001_init.sql` for constraints and indexes. RLS is enabled on every table and the `anon`/`authenticated` roles are revoked, so a Supabase PostgREST endpoint cannot read anything.

## Scaling

One instance comfortably serves hundreds of concurrent rooms (state is small; media goes through LiveKit). To scale horizontally: route each room code to a fixed instance (consistent hashing at the proxy, or a "room directory" table), add the Socket.IO Redis adapter for user-channel events (invites/friend updates), and move rate-limit buckets to Redis. These are not implemented.
