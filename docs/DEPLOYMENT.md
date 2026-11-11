# Deployment

KHABSA runs as **one Node container** serving the SPA, REST API and Socket.IO on the same HTTPS origin, plus a PostgreSQL database and (optionally) LiveKit for voice.

## 1. Database (PostgreSQL)

Any PostgreSQL 14+ works. With **Supabase**:

1. Create a project at supabase.com.
2. Project Settings → Database → Connection string → **Session pooler** or direct connection (not the transaction pooler; the server uses transactions and `SELECT … FOR UPDATE`).
3. `DATABASE_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres?sslmode=require`
4. Migrations run automatically at boot (or `npm run migrate`). They enable RLS on all tables and revoke the `anon`/`authenticated` roles, so the Supabase REST API exposes nothing. Do not add RLS policies; the server connects as the table owner.

Supabase Auth, Realtime and Edge Functions are **not used** (see ARCHITECTURE.md for why).

Backups: enable your provider's daily backups / PITR. Before upgrading, take a backup; migrations are forward-only SQL files tracked in `schema_migrations`.

## 2. Storage

Uploaded avatars (public) and game images (private) live under `STORAGE_DIR`. Mount a **persistent volume** there (`/data/storage` in the Docker image). Seeded picture pairs are regenerated only when the database has none, so keep the volume and database together.

## 3. Host + HTTPS

### Render (one click)
Use the **Deploy to Render** button in the README. The blueprint creates the web service, a 1 GB disk and a managed Postgres database (`DATABASE_URL` is wired automatically; `PUBLIC_URL` falls back to Render's `RENDER_EXTERNAL_URL`).

Everything is in Frankfurt (closest Render region to Jordan). You only fill `ADMIN_EMAILS` and, optionally, the LiveKit variables; `SESSION_SECRET` is generated. Render terminates TLS; add a custom domain later in the service's **Settings → Custom Domains**.

### Fly.io
See comments in `fly.toml` (create a volume, set secrets, `fly deploy`). Keep exactly one machine (`min_machines_running = 1`, no autostop).

### VPS
```bash
docker build -t khabsa .
docker run -d --restart=always -p 127.0.0.1:3000:3000 -v khabsa-data:/data --env-file .env khabsa
```
Put Caddy in front for automatic HTTPS:
```
khabsa.example.com {
  reverse_proxy 127.0.0.1:3000
}
```
WebSockets pass through Caddy/Nginx automatically (for Nginx set `proxy_http_version 1.1`, `Upgrade`/`Connection` headers and `proxy_read_timeout 120s`).

Required production variables (see `.env.example`): `NODE_ENV=production`, `PUBLIC_URL=https://…`, `SESSION_SECRET` (≥ 32 chars), `DATABASE_URL`, `STORAGE_DIR`, `TRUST_PROXY=true` behind a proxy. When `PUBLIC_URL` is https the server sets `Secure` cookies and HSTS; Socket.IO and mutating REST requests only accept `PUBLIC_URL`/`ALLOWED_ORIGINS` origins.

**Run one instance only.** Rooms are in process memory (snapshotted to Postgres). Rolling deploys briefly disconnect players; clients reconnect automatically and the room/game is restored.

## 4. Voice (LiveKit) and TURN

### LiveKit Cloud (recommended)
1. Create a project at cloud.livekit.io → Settings → Keys.
2. Set `LIVEKIT_URL=wss://<project>.livekit.cloud`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
3. LiveKit Cloud provides TURN over UDP/TLS with short-lived credentials embedded in the connection; nothing else to configure. This is what makes voice work behind strict NATs and corporate/mobile networks.

### Self-hosted LiveKit
Run `livekit-server` with a config like:
```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
keys:
  <API_KEY>: <API_SECRET>
turn:
  enabled: true
  domain: turn.example.com
  tls_port: 5349
  udp_port: 3478
  cert_file: /certs/turn.crt
  key_file: /certs/turn.key
```
Open UDP 50000–60000, TCP 7881, UDP 3478, TCP 5349 and serve 7880 behind TLS (`wss://`). LiveKit issues TURN credentials per session automatically. The CSP `connect-src` automatically includes `LIVEKIT_URL`.

## 5. First admin
Set `ADMIN_EMAILS=you@example.com`, then register with that email (or `npm run make-admin -- you@example.com`).

## 6. Monitoring recommendations
- Uptime check on `GET /api/health` (checks DB connectivity).
- Collect container stdout/stderr (errors are logged with `[http]`, `[rooms]`, `[socket]`, `[db]` prefixes).
- Add Sentry (`@sentry/node` in `src/server/index.ts`, `@sentry/react` in `main.tsx`'s ErrorBoundary) — not bundled because it needs your DSN.
- LiveKit Cloud dashboard for voice quality; alert on database connection errors and on memory > 80%.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Players see "انقطع الاتصال، عم نحاول نرجع" forever | Proxy is not forwarding WebSockets, or idle timeout < 60 s. Enable upgrade headers; Socket.IO falls back to long-polling otherwise. |
| `SESSION_SECRET is required in production` at boot | Set a 32+ character secret. |
| Login works but every action says "طلب غير موثوق" | `PUBLIC_URL` does not match the browser origin; add aliases to `ALLOWED_ORIGINS`. |
| All players from one office get `RATE_LIMITED` | Shared NAT IP: raise `IP_RATE_LIMIT_SCALE` and set `TRUST_PROXY=true`. |
| Voice panel says voice is disabled | LiveKit variables missing. |
| Voice connects on Wi-Fi but not on mobile data | TURN unreachable: use LiveKit Cloud or open TURN/TLS 5349 on self-hosted. |
| "اكبس لتسمع الباقي" button appears | Browser autoplay policy; tapping it calls `room.startAudio()`. |
| Pictures missing after redeploy | Storage volume not persistent; keep `/data` mounted. |
| `too many connections` from Postgres | Lower `DATABASE_POOL_MAX` or use the session pooler. |
