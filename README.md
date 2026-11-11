# خَبْصَة | KHABSA

**اللعب بلّش... والخبصة علينا!**

KHABSA is an Arabic-first (RTL, Jordanian dialect) online multiplayer party-games platform. Friends create a private room, share a code or link, talk over voice and text chat, and play seven server-authoritative games.

| Game | Arabic | Players |
|---|---|---|
| Who is outside the topic? | مين برا السالفة؟ 🕵️ | 3–12 |
| The impostor question | مين الأطرش بالزفة؟ 🎭 | 3–12 |
| Who is outside the picture? | مين برا الرسمة؟ 🎨 | 3–12 |
| Most likely to | مين غالباً؟ 😂 | 3–12 |
| Taboo (teams) | ممنوع تحكي! 🚫 | 4–12 |
| Speed quiz | تحدي السرعة ⚡ | 1–12 |
| Draw & guess | ارسم وخمّن ✏️ | 2–12 |

## Put it online (one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mtq-0/khabsa)

Sign in to Render with GitHub, enter your email in `ADMIN_EMAILS` (leave the LiveKit fields empty to start without voice) and click **Apply**. Render builds the game, creates the database and gives you a public HTTPS address like `https://khabsa.onrender.com`. Cost: about $7/month for the web service plus about $6/month for the database (Render pricing at time of writing). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for other hosts and for enabling voice.

## Quick start (local, zero external services)

Requires Node.js ≥ 22.18 (runs TypeScript directly via Node's type stripping).

```bash
npm install
npm run build          # build the web client
npm start              # http://localhost:3000  (embedded Postgres in ./data, uploads in ./storage)
```

For development with hot reload: `npm run dev` (Vite on :5173 proxying the API/realtime server on :3000).

The first boot runs migrations and seeds categories, achievements, ~900 content items and 276 generated picture pairs. Set `ADMIN_EMAILS=you@example.com` and register with that email to get the admin dashboard at `/admin`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | server (watch) + Vite dev server |
| `npm run build` | production client build into `dist/client` |
| `npm start` | production server (serves client + API + Socket.IO on one origin) |
| `npm run typecheck` | TypeScript strict check of server, client and tests |
| `npm test` | Vitest: engine unit tests, socket multiplayer integration, DB/RLS, security |
| `npm run test:e2e` | Playwright browser journeys (multiple isolated players/devices) |
| `npm run test:voice` | Playwright voice test against a local LiveKit SFU (`.tools/livekit-server`) |
| `npm run migrate` / `npm run seed` | apply migrations / seed content against `DATABASE_URL` |
| `npm run make-admin -- email` | promote a registered user |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, realtime protocol, game engine, data model
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production setup, HTTPS, Postgres/Supabase, LiveKit/TURN, troubleshooting, monitoring
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, anti-cheat and privacy review
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md) — what was executed and the results (PASSED / FAILED / BLOCKED / NOT TESTED)
- [docs/PROGRESS.md](docs/PROGRESS.md) — task checklist, known limitations, external requirements
- [docs/CONTENT.md](docs/CONTENT.md) — content formats and bulk import
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## External services you must provide for a public launch

1. **A host with HTTPS** for one Node container (Render, Fly.io, Railway, a VPS behind Caddy/Nginx). Requires your account.
2. **PostgreSQL** (Supabase, Neon, RDS, Render Postgres). Requires your account; put the connection string in `DATABASE_URL`.
3. **LiveKit** for voice (LiveKit Cloud or self-hosted). Requires your account; set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. LiveKit Cloud includes TURN. Without it, voice is disabled and everything else works.
4. A **domain name** pointed at the host.

No credentials are included in this repository.
