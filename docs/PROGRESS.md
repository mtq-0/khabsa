# Progress checklist

Status legend: ✅ done and tested · 🟡 done, partially tested · ⛔ blocked on external account · ❌ not done

## Phases
- ✅ Foundation: project, TypeScript strict, design tokens, brand (logo, icons, OG image)
- ✅ UI: landing, library, game details, create/join, matchmaking, room (lobby/players/chat/voice/game/results), profiles, friends/invitations, leaderboards, achievements, settings, auth, custom packs, admin (overview, games, content CMS, images, categories, reports, users, settings, audit), 404/error/connection-recovery screens
- ✅ Backend: schema + migrations, constraints, indexes, RLS lockdown, auth (guest + email/password), secure APIs
- ✅ Online system: rooms, codes, links, public/private, capacity, ready, kick, host transfer/migration, leave/rejoin, expiry, presence, versioned authoritative state, dedupe, stale rejection, persistence/restore
- ✅ Communication: text chat (rate limits, dedupe, spoiler masking); 🟡 voice via LiveKit (tested locally only)
- ✅ Seven games with rules, private assignments, timers, voting, scoring, results, rematch, reconnection
- ✅ Social: friends, requests, block, recent players, online status, room invites, share/copy/WhatsApp
- ✅ Gamification: XP ledger, levels/ranks, 13 achievements, weekly/global/per-game leaderboards, history
- ✅ Admin/CMS: games toggle, content CRUD, moderation status, bulk import (JSON/CSV/lines, ≤5,000 rows per request), export, private image upload, picture pairs, categories, reports, users, platform settings, audit log
- ✅ Testing (see TEST_REPORT.md)
- 🟡 Production: build, Dockerfile, Render/Fly configs, env template, docs — ⛔ actual deployment

## Content shipped in seed
| Kind | Items |
|---|---|
| Outsider words (14 categories) | 410 |
| Question pairs | 117 |
| Picture pairs (normal + hard) | 276 |
| Most-likely prompts | 90 |
| Taboo cards | 79 |
| Trivia questions | 87 |
| Draw words | 118 |

The content system accepts 1,000+ question pairs (import of 1,000 tested); the seed itself contains 117 hand-written pairs. Writing the remaining ~900 quality Jordanian pairs is editorial work to do through the admin import.

## Known limitations
- Single server instance (rooms in memory, snapshotted to Postgres).
- No email verification / password reset (needs a mail provider).
- Seed pictures are illustrated scenes (emoji artwork), not photographs; real photo pairs can be uploaded in the admin.
- Custom picture packs are admin-only; user packs cover the six text-based games.
- Taboo "correct" is self-reported by the explainer (opponent buzz + typed guesses mitigate).
- Profanity filter is a small list.
- No Sentry/monitoring SDK bundled (needs your DSN).
- Not tested on real devices, Firefox or Safari.

## External requirements (your accounts)
1. Hosting with HTTPS + persistent disk (Render / Fly.io / VPS).
2. PostgreSQL (`DATABASE_URL`) — e.g. Supabase.
3. LiveKit Cloud project (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) for voice + TURN.
4. Domain name.
5. Optional: Sentry DSN, mail provider for verification/reset.
