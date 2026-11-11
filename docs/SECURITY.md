# Security review

Scope: the code in this repository as of this review. Method: design review of every trust boundary plus automated tests (`tests/security.test.ts`, `tests/database.test.ts`, `tests/multiplayer.test.ts`, e2e).

## Trust model
- The browser is untrusted. It sends intents; the server decides roles, validity and scores.
- Only the Node server talks to Postgres and storage. Provider API roles have no access.
- LiveKit only carries audio; tokens are minted per verified member.

## Controls

| Area | Control | Verified by |
|---|---|---|
| Authentication | scrypt (N=16384) passwords, constant-time compare, dummy hash on unknown email; 32-byte opaque session tokens stored as sha256; `HttpOnly; SameSite=Lax; Secure` (when HTTPS) cookies; expiry + purge; password change revokes other sessions; ban revokes all sessions and live sockets re-check sessions per event | security tests |
| CSRF | Every mutating request needs header `x-khabsa: 1` (forces CORS preflight cross-site) and, in production, an allowed `Origin`; SameSite cookies | security test |
| Authorization | Room membership on every room/chat/draw/voice/image call; host-only actions (`NOT_HOST`); admin-only `/api/admin/*`; registered-only social and packs; packs usable only by owner unless official | security + multiplayer tests |
| Role/secret privacy | Each socket gets `engine.view(state, viewer)`; secrets (words, questions, outsider identity, votes, correct quiz option, draw word) are absent from other players' payloads until reveal; chat masks the current secret word | wire-level tests assert raw payloads never contain the secret |
| Picture privacy | Images stored outside the static root; served only via HMAC-signed, viewer-bound, 5–10 min tokens that also require the matching session; `Cache-Control: private`, CSP `default-src 'none'`, `nosniff`, CORP same-origin | multiplayer + unit tests (stolen/forged/expired/anonymous) |
| Votes & scores | Engines validate phase, voter, target, single vote/answer, card index; timings measured server-side; `match_players` PK + `xp_events` unique key make awards idempotent; match row locked `FOR UPDATE` | engine + DB tests |
| Replay / duplicates | Action UUID de-duplication (500 per room), `phaseKey` stale rejection, chat clientId de-dup, idempotent room creation by request id | multiplayer tests |
| Input validation | zod on REST bodies; clamped game settings; content schemas per kind; draw segments validated (ints 0–1000, ≤ 400 numbers, palette/size ranges); text stripped of control/bidi-override chars, length-limited, profanity masked | tests |
| Injection | Parameterised SQL everywhere; `LIKE` patterns escaped; storage keys regex-validated (no traversal) | traversal test |
| XSS | React escaping only (no `dangerouslySetInnerHTML`); strict CSP (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`) | header test |
| Uploads | 6 MB limit, single file, images decoded and re-encoded by sharp (strips metadata, rejects polyglots/non-images), pixel limit; SVG uploads not accepted | upload tests |
| Rate limiting / abuse | Token buckets: auth/IP, API/IP, room create/join, actions, chat (8/10 s + duplicate-message block), canvas, uploads, social; reports + admin moderation; blocks prevent invites and joining a blocker's room | tests |
| Secrets | No credentials in code; `SESSION_SECRET` required in production; LiveKit secret server-only | review |
| Transport | HSTS when HTTPS; Socket.IO origin check in production | review |
| Database exposure | RLS enabled on all tables, `anon`/`authenticated` revoked | DB test with simulated Supabase roles |
| Audit | Admin actions written to `audit_log` | review |

## Residual risks / not done
- **Taboo self-reporting:** the explainer marks "correct"; a dishonest explainer can inflate their team's score. Typed guesses are auto-verified, and opponents see the card and can buzz.
- **Collusion over voice:** players can share secrets outside the app. Inherent to party games.
- **Email verification and password reset** are not implemented (no mail provider configured). Accounts are not email-verified.
- **Rate limits are per process.** Fine for the single-instance deployment; move to Redis if you scale out.
- **Profanity filter** is a short word list, not a moderation service.
- **Session cookie in a guest browser** is the guest's only identity; clearing cookies loses the guest account (by design; registration fixes it).
- No automated dependency scanning in CI (`npm audit --omit=dev` reported 0 vulnerabilities at time of writing).

No known critical vulnerability remains in the reviewed code.
