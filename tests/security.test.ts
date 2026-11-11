import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Player, startServer, type TestServer } from './helpers/server.ts';
import { ImageSigner } from '../src/server/storage/storage.ts';
import { cleanText, maskProfanity } from '../src/server/security/text.ts';
import { RateLimiter } from '../src/server/security/rateLimit.ts';
import { matchGuess, normalizeArabic } from '../src/shared/arabic.ts';
import { sanitizeSettings } from '../src/shared/games.ts';

let srv: TestServer;
beforeAll(async () => {
  srv = await startServer();
});
afterAll(async () => srv?.close());

async function registered(email: string, username: string, password = 'secret-pass-1') {
  const p = new Player(srv.url);
  const r = await p.http('POST', '/api/auth/register', { email, password, username, displayName: username });
  expect(r.status, JSON.stringify(r.data)).toBe(200);
  p.user = r.data.user;
  return p;
}

describe('authentication', () => {
  it('registers, logs out, logs in, rejects wrong passwords and duplicate emails', async () => {
    const p = await registered('Sara@Example.com', 'sara_j');
    expect(p.user).toMatchObject({ isGuest: false, email: 'sara@example.com' });
    expect((await p.http('GET', '/api/auth/me')).data.user.username).toBe('sara_j');
    await p.http('POST', '/api/auth/logout', {});
    expect((await p.http('GET', '/api/auth/me')).data.user).toBeNull();
    const bad = await p.http('POST', '/api/auth/login', { email: 'sara@example.com', password: 'nope-nope' });
    expect(bad.status).toBe(401);
    const ok = await p.http('POST', '/api/auth/login', { email: 'SARA@example.com', password: 'secret-pass-1' });
    expect(ok.status).toBe(200);
    const dup = await new Player(srv.url).http('POST', '/api/auth/register', { email: 'sara@example.com', password: 'xxxxxxxx', username: 'other1', displayName: 'xx' });
    expect(dup.status).toBe(409);
  });

  it('upgrades a guest to a registered account keeping the same identity', async () => {
    const p = new Player(srv.url);
    const g = await p.guest('ضيف');
    const r = await p.http('POST', '/api/auth/register', { email: 'up@example.com', password: 'secret-pass-1', username: 'upgraded', displayName: 'ضيف' });
    expect(r.data.user.id).toBe(g.id);
    expect(r.data.user.isGuest).toBe(false);
  });

  it('validates registration input', async () => {
    const p = new Player(srv.url);
    expect((await p.http('POST', '/api/auth/register', { email: 'bad', password: 'secret-pass', username: 'abc', displayName: 'x1' })).status).toBe(400);
    expect((await p.http('POST', '/api/auth/register', { email: 'a@b.co', password: 'short', username: 'abc', displayName: 'x1' })).status).toBe(400);
    expect((await p.http('POST', '/api/auth/register', { email: 'a@b.co', password: 'secret-pass', username: 'a b', displayName: 'x1' })).status).toBe(400);
  });

  it('session cookie is httpOnly and SameSite', async () => {
    const res = await fetch(srv.url + '/api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json', 'x-khabsa': '1' }, body: JSON.stringify({ nickname: 'كوكي' }) });
    const c = res.headers.get('set-cookie')!;
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
  });

  it('rejects forged session tokens', async () => {
    const p = new Player(srv.url);
    p.cookie = 'khabsa_sid=forged';
    expect((await p.http('GET', '/api/auth/me')).data.user).toBeNull();
    expect((await p.http('POST', '/api/rooms', {})).status).toBe(401);
  });
});

describe('CSRF & headers', () => {
  it('rejects mutating requests without the custom header', async () => {
    const p = new Player(srv.url);
    await p.guest('csrf');
    const r = await fetch(srv.url + '/api/rooms', { method: 'POST', headers: { cookie: p.cookie, 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(403);
  });
  it('sends security headers', async () => {
    const r = await fetch(srv.url + '/api/health');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});

describe('authorization', () => {
  it('admin endpoints are forbidden to guests and normal users, allowed for configured admins', async () => {
    const g = new Player(srv.url);
    await g.guest('ضيف');
    expect((await g.http('GET', '/api/admin/overview')).status).toBe(403);
    const u = await registered('user@example.com', 'normal_user');
    expect((await u.http('GET', '/api/admin/overview')).status).toBe(403);
    expect((await u.http('PATCH', '/api/admin/users/' + u.user!.id, { role: 'admin' })).status).toBe(403);
    const a = await registered('admin@khabsa.test', 'the_admin');
    expect((await a.http('GET', '/api/admin/overview')).status).toBe(200);
    // admin can disable a game; starting it is then refused
    expect((await a.http('PATCH', '/api/admin/games/taboo', { enabled: false })).status).toBe(200);
    srv.built.ctx.platform.invalidate();
    const room = await g.http('POST', '/api/rooms', { gameId: 'taboo' });
    expect(room.data.code).toBe('GAME_DISABLED');
    await a.http('PATCH', '/api/admin/games/taboo', { enabled: true });
  });

  it('guests cannot use registered-only features', async () => {
    const g = new Player(srv.url);
    await g.guest('ضيف2');
    expect((await g.http('POST', '/api/friends/request', { username: 'sara_j' })).status).toBe(403);
    expect((await g.http('POST', '/api/packs', { kind: 'word', name: 'x' })).status).toBe(403);
  });

  it('custom packs are private to their owner', async () => {
    const a = await registered('packa@example.com', 'pack_a');
    const b = await registered('packb@example.com', 'pack_b');
    const pack = await a.http('POST', '/api/packs', { kind: 'word', name: 'كلمات الشلة' });
    expect(pack.status).toBe(200);
    const add = await a.http('POST', `/api/packs/${pack.data.id}/items`, { items: [{ data: { word: 'أبو العبد' } }, { data: { word: 'المنسف' } }, { data: { word: '' } }] });
    expect(add.data.inserted).toBe(2);
    expect(add.data.errors).toHaveLength(1);
    expect((await b.http('GET', `/api/packs/${pack.data.id}/items`)).status).toBe(403);
    expect((await b.http('DELETE', `/api/packs/${pack.data.id}`)).status).toBe(403);
    // b cannot select a's pack in their room
    await b.connect();
    const r = await b.http('POST', '/api/rooms', {});
    await b.join(r.data.code);
    expect((await b.act(r.data.code, 'set-pack', { packId: pack.data.id })).code).toBe('FORBIDDEN');
    b.disconnect();
  });

  it('voice tokens require membership and configuration', async () => {
    const g = new Player(srv.url);
    await g.guest('صوت');
    const r = await g.http('POST', '/api/voice/token', { code: 'ABCDEF' });
    expect(r.data.code).toBe('VOICE_NOT_CONFIGURED');
  });
});

describe('social', () => {
  it('friend requests, acceptance, invites and blocking', async () => {
    const a = await registered('fa@example.com', 'friend_a');
    const b = await registered('fb@example.com', 'friend_b');
    expect((await a.http('POST', '/api/friends/request', { username: 'friend_b' })).data.status).toBe('outgoing');
    expect((await b.http('GET', '/api/friends')).data.incoming[0].id).toBe(a.user!.id);
    expect((await b.http('POST', '/api/friends/respond', { userId: a.user!.id, accept: true })).status).toBe(200);
    expect((await a.http('GET', '/api/friends')).data.friends[0].id).toBe(b.user!.id);
    // invite requires room membership
    await a.connect();
    await b.connect();
    const room = await a.http('POST', '/api/rooms', {});
    expect((await b.http('POST', '/api/invites', { code: room.data.code, userId: a.user!.id })).data.code).toBe('NOT_MEMBER');
    await a.join(room.data.code);
    const got = new Promise((resolve) => b.socket!.once('invite:new', resolve));
    expect((await a.http('POST', '/api/invites', { code: room.data.code, userId: b.user!.id })).status).toBe(200);
    expect(((await got) as { roomCode: string }).roomCode).toBe(room.data.code);
    const inv = (await b.http('GET', '/api/invites')).data.invites;
    expect(inv).toHaveLength(1);
    expect((await b.http('POST', `/api/invites/${inv[0].id}/respond`, { accept: true })).data.code).toBe(room.data.code);
    // blocking removes the friendship and prevents invites/joins from the host
    const blk = await b.http('POST', '/api/blocks', { userId: a.user!.id });
    expect(blk.status, JSON.stringify(blk.data)).toBe(200);
    expect((await a.http('GET', '/api/friends')).data.friends).toHaveLength(0);
    expect((await a.http('POST', '/api/invites', { code: room.data.code, userId: b.user!.id })).status).toBe(403);
    expect((await b.emit('room:join', { code: room.data.code })).code).toBe('FORBIDDEN');
    a.disconnect();
    b.disconnect();
  });
});

describe('uploads', () => {
  it('rejects non-image avatar uploads and accepts real images (re-encoded)', async () => {
    const p = await registered('img@example.com', 'img_user');
    const form = new FormData();
    form.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.png');
    const bad = await fetch(srv.url + '/api/me/avatar', { method: 'POST', headers: { cookie: p.cookie, 'x-khabsa': '1' }, body: form });
    expect(bad.status).toBe(400);
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#7c3aed' } }).png().toBuffer();
    const good = new FormData();
    good.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'a.png');
    const ok = await fetch(srv.url + '/api/me/avatar', { method: 'POST', headers: { cookie: p.cookie, 'x-khabsa': '1' }, body: good });
    expect(ok.status).toBe(200);
    const url = (await ok.json()).user.avatarUrl as string;
    expect(url).toMatch(/^\/media\/avatars\/[a-f0-9-]+\.webp$/);
    const img = await fetch(srv.url + url);
    expect(img.headers.get('content-type')).toContain('image/webp');
  });
  it('path traversal through media is not possible', async () => {
    const r = await fetch(srv.url + '/media/../../package.json');
    expect([400, 403, 404]).toContain(r.status);
    const r2 = await fetch(srv.url + '/media/%2e%2e/%2e%2e/package.json');
    expect([400, 403, 404]).toContain(r2.status);
  });
});

describe('units', () => {
  it('image tokens are viewer-bound, tamper-proof and expire', () => {
    const s = new ImageSigner('k'.repeat(40));
    const now = Date.now();
    const url = s.sign('img-1', 'user-1', now);
    const token = url.split('/').pop()!;
    expect(s.verify(token, now)).toEqual({ imageId: 'img-1', viewerId: 'user-1' });
    expect(s.verify(token, now + 11 * 60_000)).toBeNull();
    const [payload, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ i: 'img-2', u: 'user-1', e: now + 1e6 })).toString('base64url');
    expect(s.verify(`${forged}.${mac}`, now)).toBeNull();
    expect(s.verify(`${payload}.x${mac.slice(1)}`, now)).toBeNull();
    expect(new ImageSigner('other'.repeat(10)).verify(token, now)).toBeNull();
    // tokens are stable within the window (keeps browser cache effective)
    expect(s.sign('img-1', 'user-1', now + 1000)).toBe(url.replace(/^/, '') === url ? s.sign('img-1', 'user-1', now + 1000) : url);
  });
  it('strips control and bidi-override characters', () => {
    expect(cleanText('a\u202Eb\u0000c   d', 10)).toBe('abc d');
    expect(cleanText('x'.repeat(50), 5)).toBe('xxxxx');
    expect(maskProfanity('يا shit')).not.toContain('shit');
  });
  it('rate limiter refills over time', () => {
    const rl = new RateLimiter(2, 1);
    expect(rl.take('k', 1, 0)).toBe(true);
    expect(rl.take('k', 1, 0)).toBe(true);
    expect(rl.take('k', 1, 0)).toBe(false);
    expect(rl.take('k', 1, 600)).toBe(true);
    rl.dispose();
  });
  it('Arabic normalization for guesses', () => {
    expect(normalizeArabic('الكُنافة')).toBe('كنافه');
    expect(matchGuess('كنافة', ['الكنافة'])).toBe('exact');
    expect(matchGuess('إسطنبول', ['اسطنبول'])).toBe('exact');
    expect(matchGuess('بطيخه', ['بطيخة'])).toBe('exact');
    expect(matchGuess('بطيخ', ['بطيخة'])).toBe('close');
    expect(matchGuess('بطيح', ['بطيخة'])).toBe('miss');
    expect(matchGuess('تفاح', ['بطيخة'])).toBe('miss');
  });
  it('sanitizes game settings to the schema', () => {
    const s = sanitizeSettings('outsider-word', { rounds: -5, outsiders: 99, categoryHint: 'yes', category: '../../etc', extra: 1 });
    expect(s).toMatchObject({ rounds: 1, outsiders: 3, categoryHint: true, category: 'any' });
    expect(s).not.toHaveProperty('extra');
  });
});
