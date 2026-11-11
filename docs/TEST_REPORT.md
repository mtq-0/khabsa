# Test report

Environment: Linux sandbox, Node 22.23, Chromium headless shell 158 (Playwright 1.65), embedded Postgres (PGlite 0.5, Postgres 17 compatible), LiveKit server 1.13.11 in dev mode on 127.0.0.1. Date: 2026-11-11.

Final run (all from a clean state):

| Suite | Command | Result |
|---|---|---|
| TypeScript strict typecheck | `npm run typecheck` | **PASSED** |
| Unit + integration + DB + security (83 tests) | `npm test` | **PASSED** 83/83 |
| Production build | `npm run build` | **PASSED** |
| Browser E2E (4 journeys) | `npm run test:e2e` | **PASSED** 4/4 |
| Voice E2E (real SFU, fake mics) | `npm run test:voice` | **PASSED** 1/1 |
| Dependency audit (prod deps) | `npm audit --omit=dev` | **PASSED** 0 vulnerabilities |

## Coverage of the requested journey

| # | Step | Status | Evidence |
|---|---|---|---|
| 1 | Open the website | PASSED | e2e journey (served production build) |
| 2 | Create guest profile | PASSED | e2e |
| 3 | Create room | PASSED | e2e; idempotent create tested in integration |
| 4 | Join from another device | PASSED (simulated) | separate browser contexts with desktop, Pixel 7 and iPad Mini profiles on one machine |
| 5 | Several players | PASSED | 3 players in e2e, 4 in integration/UI smoke |
| 6 | Start each game | PASSED | integration: all 7 games start→finish→rematch→end; UI smoke: all 7 screens with zero page errors |
| 7 | Private information distribution | PASSED | wire-level payload checks (word, outsider, votes, images, draw word) |
| 8 | Complete gameplay | PASSED | e2e plays a full مين برا السالفة round and a draw & guess turn in the browser; engines unit-tested for all games |
| 9 | Vote | PASSED | e2e + integration (duplicate and stale votes rejected) |
| 10 | Results | PASSED | e2e results screen with XP; DB test for exactly-once awards |
| 11 | Another round | PASSED | e2e rematch; integration rematch per game |
| 12 | Disconnect a player | PASSED | e2e (`setOffline`), integration (socket close) |
| 13 | Reconnect | PASSED | e2e + integration (private state restored mid-game) and server-restart recovery |
| 14 | Switch games | PASSED | e2e (to draw & guess) and integration |
| 15 | Voice chat | PASSED (local only) | two Chromium players through local LiveKit: live remote tracks both ways, speaking indicator, mute, leave/rejoin, media element cleanup |
| 16 | Mobile browsers | PASSED (emulated) | iPhone 13 / SE / Pixel 7 emulation in Chromium; no horizontal overflow on 10 pages |

## Not executed

| Item | Status | Reason |
|---|---|---|
| Public HTTPS deployment | **BLOCKED** | needs your hosting account and domain |
| Players on different real networks/countries | **BLOCKED** | needs a public deployment |
| Voice across NAT/mobile networks, TURN relay | **BLOCKED** | needs LiveKit Cloud or a public TURN server; the local test used host candidates only |
| Real physical phones (iOS Safari, Android Chrome) | **NOT TESTED** | no devices in the sandbox; only Chromium emulation |
| Firefox / WebKit engines | **NOT TESTED** | only Chromium installed |
| Docker image build | **NOT TESTED** | Docker daemon unavailable in sandbox |
| Real PostgreSQL / Supabase | **NOT TESTED** | same SQL ran on PGlite (Postgres 17 in WASM); the `pg` adapter path was not executed against a live server |
| Load testing | **NOT TESTED** | no load test was run |

## Bugs found during testing and fixed (with regression tests)

1. **LiveKit grant used a string instead of the `TrackSource` enum** — would throw when minting tokens. Fixed in `voice/voice.ts` (found by code review against SDK source; covered by the voice e2e).
2. **PGlite `rowCount` was 0 for SELECTs**, making `isBlocked` checks always false (blocked users could still be invited / join). Fixed in `db/db.ts`; regression test `db adapter … rowCount` and the social blocking test.
3. **Signed image URLs exceeded Fastify's 100-char param limit** (HTTP 414). Fixed with `maxParamLength`; covered by image privacy test.
4. **Host "skip" did nothing during draw phase** (tick ignored early calls). Fixed with an explicit `advancePhase`; covered by the all-games integration test.
5. **Voice: a departed player's `<audio>` element leaked** on the remaining player's page (LiveKit detaches before `TrackUnsubscribed`). Fixed by tracking our own elements per track sid; regression assertion in `e2e/voice.spec.ts`.
6. **Homepage overflowed 27 px horizontally on 375 px phones.** Fixed hero card sizing; regression test "pages render without horizontal overflow on mobile".
7. **Picture game images rendered blank** in browsers without colour-emoji fonts. Replaced font emoji with inline vector artwork (Twemoji); verified by rendering.
8. **Mobile room header squeezed the room name to one letter.** Layout fixed; verified by screenshot.
9. **Post-login navigation used `history.back()`** (could land on the login page or leave the site). Now navigates to a validated same-site `next` path.
10. Test-side issues fixed without weakening checks: per-IP auth limit made configurable for tests (`IP_RATE_LIMIT_SCALE`, production default unchanged), ambiguous selectors, too-short test usernames.
