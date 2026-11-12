import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Player, startServer, waitFor, type TestServer } from './helpers/server.ts';
import { GAME_IDS, type GameId } from '../src/shared/games.ts';
import { createDb, type Db } from '../src/server/db/db.ts';

let srv: TestServer;

beforeAll(async () => {
  srv = await startServer();
});
afterAll(async () => {
  await srv?.close();
});

async function players(n: number, prefix = 'لاعب') {
  const out: Player[] = [];
  for (let i = 0; i < n; i++) {
    const p = new Player(srv.url);
    await p.guest(`${prefix}${i + 1}`);
    await p.connect();
    out.push(p);
  }
  return out;
}

async function roomWith(n: number, gameId: GameId = 'outsider-word') {
  const ps = await players(n);
  const { data } = await ps[0].http('POST', '/api/rooms', { gameId });
  const code = data.code as string;
  for (const p of ps) await p.join(code);
  return { ps, code, host: ps[0] };
}

async function readyAll(ps: Player[], code: string) {
  for (const p of ps.slice(1)) expect((await p.act(code, 'ready', { ready: true })).ok).toBe(true);
}

/** Skip through phases as host until the game finishes. */
async function skipToEnd(host: Player, code: string, max = 400) {
  for (let i = 0; i < max; i++) {
    const g = host.last.game;
    if (!g || g.finished) return;
    const r = await host.act(code, 'game:host:skip');
    if (!r.ok && r.code !== 'INVALID_ACTION') throw new Error(r.code + ' ' + r.message);
    if (!r.ok) await host.act(code, 'game:host:next');
    await waitFor(() => host.last.version > 0, 1000);
  }
  throw new Error('game did not finish');
}

describe('rooms', () => {
  it('creates rooms idempotently per request id', async () => {
    const [p] = await players(1);
    const requestId = randomUUID();
    const a = await p.http('POST', '/api/rooms', { requestId });
    const b = await p.http('POST', '/api/rooms', { requestId });
    expect(a.data.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(b.data.code).toBe(a.data.code);
    const c = await p.http('POST', '/api/rooms', { requestId: randomUUID() });
    expect(c.data.code).not.toBe(a.data.code);
    p.disconnect();
  });

  it('distinguishes invalid code, not found, full and kicked', async () => {
    const [p] = await players(1);
    expect((await p.emit('room:join', { code: 'abc' })).code).toBe('INVALID_CODE');
    expect((await p.emit('room:join', { code: 'ZZZZZZ' })).code).toBe('ROOM_NOT_FOUND');
    expect((await p.http('GET', '/api/rooms/ZZZZZZ')).data.code).toBe('ROOM_NOT_FOUND');
    expect((await p.http('GET', '/api/rooms/ab')).data.code).toBe('INVALID_CODE');

    const { ps, code, host } = await roomWith(2);
    await host.act(code, 'room-settings', { capacity: 2 });
    expect((await p.emit('room:join', { code })).code).toBe('ROOM_FULL');
    expect((await p.http('GET', `/api/rooms/${code}`)).data.full).toBe(true);
    const kicked = ps[1];
    expect((await host.act(code, 'kick', { userId: kicked.user!.id })).ok).toBe(true);
    expect((await kicked.emit('room:join', { code })).code).toBe('KICKED');
    expect((await kicked.act(code, 'ready')).code).toBe('KICKED');
    for (const x of [...ps, p]) x.disconnect();
  });

  it('does not duplicate a player who joins from two tabs, and tracks presence', async () => {
    const { ps, code } = await roomWith(2);
    const tab2 = new Player(srv.url);
    tab2.cookie = ps[1].cookie;
    await tab2.connect();
    await tab2.join(code);
    expect(tab2.last.members).toHaveLength(2);
    ps[1].disconnect();
    // still connected through the second tab
    await new Promise((r) => setTimeout(r, 150));
    expect(ps[0].last.members.find((m) => m.id === ps[1].user!.id)!.connected).toBe(true);
    tab2.disconnect();
    await waitFor(() => ps[0].last.members.find((m) => m.id === ps[1].user!.id)!.connected === false, 3000, 'offline');
    ps[0].disconnect();
  });

  it('enforces host permissions and supports host transfer and leave with host migration', async () => {
    const { ps, code, host } = await roomWith(3);
    expect((await ps[1].act(code, 'select-game', { gameId: 'taboo' })).code).toBe('NOT_HOST');
    expect((await ps[1].act(code, 'kick', { userId: host.user!.id })).code).toBe('NOT_HOST');
    expect((await ps[1].act(code, 'start')).code).toBe('NOT_HOST');
    expect((await host.act(code, 'transfer-host', { userId: ps[1].user!.id })).ok).toBe(true);
    await waitFor(() => ps[2].last.hostId === ps[1].user!.id, 2000, 'host transfer');
    expect((await ps[1].emit('room:leave', { code })).ok).toBe(true);
    await waitFor(() => ps[2].last.hostId === host.user!.id && ps[2].last.members.length === 2, 2000, 'host migration');
    for (const p of ps) p.disconnect();
  });

  it('requires ready players and enough players', async () => {
    const { ps, code, host } = await roomWith(2);
    expect((await host.act(code, 'start')).code).toBe('NOT_ENOUGH_PLAYERS');
    for (const p of ps) p.disconnect();
    const r = await roomWith(3);
    expect((await r.host.act(r.code, 'start')).code).toBe('INVALID_ACTION');
    await readyAll(r.ps, r.code);
    expect((await r.host.act(r.code, 'start')).ok).toBe(true);
    for (const p of r.ps) p.disconnect();
  });

  it('validates input on actions', async () => {
    const { ps, code, host } = await roomWith(1);
    expect((await host.emit('room:action', { code, type: 'ready' })).code).toBe('VALIDATION'); // no action id
    expect((await host.act(code, 'nonsense')).code).toBe('INVALID_ACTION');
    expect((await host.act(code, 'select-game', { gameId: 'hack' })).code).toBe('VALIDATION');
    const s = await host.act(code, 'settings', { settings: { rounds: 999, evil: '<script>' } });
    expect(s.ok).toBe(true);
    await waitFor(() => host.last.settings.rounds === 10);
    expect(host.last.settings).not.toHaveProperty('evil');
    for (const p of ps) p.disconnect();
  });
});

describe('مين برا السالفة over the network', () => {
  it('keeps secrets private on the wire, rejects duplicates/stale actions, scores on the server', async () => {
    const { ps, code, host } = await roomWith(4, 'outsider-word');
    await host.act(code, 'settings', { settings: { rounds: 1, outsiders: 1 } });
    await readyAll(ps, code);
    expect((await host.act(code, 'start')).ok).toBe(true);
    await waitFor(() => ps.every((p) => p.last.game?.phase === 'reveal'), 3000, 'reveal');

    const outsider = ps.find((p) => (p.last.game!.me as any).role === 'outsider')!;
    const insiders = ps.filter((p) => p !== outsider);
    const word = (insiders[0].last.game!.me as any).word as string;
    expect(word).toBeTruthy();
    for (const p of insiders) expect((p.last.game!.me as any).word).toBe(word);
    // the outsider never receives the word; insiders never learn the outsider
    expect(outsider.raw.join('')).not.toContain(word);
    for (const p of insiders) expect(p.raw.join('')).not.toContain(`"outsiders":["${outsider.user!.id}"]`);

    for (const p of ps) await p.act(code, 'game:seen');
    await waitFor(() => host.last.game!.phase === 'turns', 2000, 'turns');
    for (let i = 0; i < 4; i++) await host.act(code, 'game:host:skip');
    await waitFor(() => host.last.game!.phase === 'discuss', 2000, 'discuss');
    await host.act(code, 'game:host:skip');
    await waitFor(() => ps.every((p) => p.last.game!.phase === 'vote'), 2000, 'vote');
    const votePhase = host.last.game!.phaseKey;

    // duplicate action id is ignored
    const actionId = randomUUID();
    const first = await insiders[0].emit('room:action', { code, actionId, type: 'game:vote', payload: { target: outsider.user!.id }, phaseKey: votePhase });
    const dup = await insiders[0].emit('room:action', { code, actionId, type: 'game:vote', payload: { target: outsider.user!.id }, phaseKey: votePhase });
    expect(first.ok).toBe(true);
    expect(dup.data?.duplicate).toBe(true);
    // votes stay secret while voting
    await waitFor(() => outsider.last.game!.votedCount === 1);
    expect(JSON.stringify(outsider.last.game)).not.toContain(`"votes"`);

    for (const p of insiders.slice(1)) await p.act(code, 'game:vote', { target: outsider.user!.id }, { phaseKey: votePhase });
    await outsider.act(code, 'game:vote', { target: insiders[0].user!.id }, { phaseKey: votePhase });
    await waitFor(() => host.last.game!.phase === 'verdict', 2000, 'verdict');
    // a late vote with the old phase key is rejected as stale
    expect((await outsider.act(code, 'game:vote', { target: insiders[1].user!.id }, { phaseKey: votePhase })).code).toBe('STALE_ACTION');
    // clients cannot award themselves points
    expect((await outsider.act(code, 'game:score', { points: 100 })).ok).toBe(false);

    await host.act(code, 'game:host:skip');
    await waitFor(() => outsider.last.game!.phase === 'guess', 2000, 'guess');
    const opts = (outsider.last.game!.me as any).guessOptions as string[];
    expect(opts).toContain(word);
    expect((insiders[0].last.game!.me as any).guessOptions).toBeUndefined();
    await outsider.act(code, 'game:guess', { choice: word });
    await waitFor(() => host.last.game!.phase === 'roundEnd', 2000, 'roundEnd');
    const scores = host.last.game!.scores;
    for (const p of insiders) expect(scores[p.user!.id]).toBe(1);
    expect(scores[outsider.user!.id]).toBe(2);

    await host.act(code, 'game:host:next');
    await waitFor(() => host.last.status === 'results', 3000, 'results');
    expect(host.last.game!.results!.ranking).toHaveLength(4);
    // match recorded exactly once with XP
    await waitFor(() => host.last.awards, 3000, 'awards');
    const rows = await srv.built.ctx.db.query<{ n: number }>('select count(*)::int as n from match_players mp join matches m on m.id = mp.match_id where m.room_id = $1', [host.last.id]);
    expect(rows.rows[0].n).toBe(4);
    const again = await srv.built.ctx.stats.finishMatch(
      (await srv.built.ctx.db.query<{ id: string }>('select id from matches where room_id = $1', [host.last.id])).rows[0].id,
      host.last.game!.results!,
      ps.map((p) => p.user!.id),
    );
    expect(again).toEqual([]);
    const me = await host.http('GET', '/api/me/stats');
    expect(me.data.games).toBe(1);
    for (const p of ps) p.disconnect();
  });
});

describe('reconnection and game switching', () => {
  it('a disconnected player rejoins mid-game with their private state, then the room switches games', async () => {
    const { ps, code, host } = await roomWith(3, 'odd-question');
    await host.act(code, 'settings', { settings: { rounds: 1 } });
    await readyAll(ps, code);
    await host.act(code, 'start');
    await waitFor(() => ps[2].last.game?.phase === 'answer', 2000, 'answer');
    const q = (ps[2].last.game!.me as any).question;
    ps[2].disconnect();
    await waitFor(() => host.last.members.find((m) => m.id === ps[2].user!.id)?.connected === false, 2000, 'offline');
    await ps[0].act(code, 'game:answer', { text: 'منسف' });
    // reconnect as the same guest
    await ps[2].connect();
    const view = await ps[2].join(code);
    expect(view.status).toBe('playing');
    expect((view.game!.me as any).question).toBe(q);
    await waitFor(() => host.last.members.find((m) => m.id === ps[2].user!.id)?.connected === true, 2000, 'online');
    await skipToEnd(host, code);
    await waitFor(() => host.last.status === 'results', 3000);
    expect((await host.act(code, 'select-game', { gameId: 'most-likely' })).ok).toBe(true);
    await waitFor(() => ps[1].last.selectedGame === 'most-likely' && ps[1].last.status === 'lobby');
    await readyAll(ps, code);
    expect((await host.act(code, 'start')).ok).toBe(true);
    await waitFor(() => ps[1].last.game?.gameId === 'most-likely', 2000);
    for (const p of ps) p.disconnect();
  });

  it('restores rooms and in-progress games after a server restart', async () => {
    const db: Db = await createDb('pglite:memory');
    const s1 = await startServer({}, db);
    const a = new Player(s1.url);
    const b = new Player(s1.url);
    const c = new Player(s1.url);
    for (const [p, n] of [[a, 'أ'], [b, 'ب'], [c, 'ج']] as const) {
      await p.guest('لاعب ' + n);
      await p.connect();
    }
    const { data } = await a.http('POST', '/api/rooms', { gameId: 'most-likely' });
    for (const p of [a, b, c]) await p.join(data.code);
    for (const p of [b, c]) await p.act(data.code, 'ready');
    await a.act(data.code, 'start');
    await waitFor(() => a.last.game?.phase === 'vote');
    await b.act(data.code, 'game:vote', { target: c.user!.id });
    await new Promise((r) => setTimeout(r, 50));
    for (const p of [a, b, c]) p.disconnect();
    await s1.close();

    const s2 = await startServer({}, db);
    b.base = s2.url;
    await b.connect();
    const view = await b.join(data.code);
    expect(view.status).toBe('playing');
    expect((view.game!.me as any).voted).toBe(c.user!.id);
    b.disconnect();
    await s2.close();
    await db.close();
  });
});

describe('مين برا الرسمة image privacy', () => {
  it('only the assigned player can load their picture', async () => {
    const { ps, code, host } = await roomWith(3, 'outsider-picture');
    await host.act(code, 'settings', { settings: { mode: 'normal', rounds: 1 } });
    await readyAll(ps, code);
    await host.act(code, 'start');
    await waitFor(() => ps.every((p) => p.last.game?.phase === 'reveal'), 3000);
    const urls = ps.map((p) => (p.last.game!.me as any).image as string);
    for (const u of urls) expect(u).toMatch(/^\/api\/game-image\//);
    const own = await ps[0].http('GET', urls[0]);
    expect(own.status).toBe(200);
    expect(String(own.data)).toMatch(/<svg|^RIFF....WEBP/s); // illustration or real photo
    const stolen = await ps[1].http('GET', urls[0]);
    expect(stolen.status).toBe(403);
    const anon = await fetch(srv.url + urls[0]);
    expect(anon.status).toBe(401);
    const forged = await ps[0].http('GET', urls[0].slice(0, -3) + 'abc');
    expect(forged.status).toBe(403);
    for (const p of ps) p.disconnect();
  });
});

describe('مين برا السالفة word pictures over the network', () => {
  it('insiders get a viewer-bound picture link; the outsider gets nothing', async () => {
    // words with a drawn picture only (TMDB posters need the network, which tests don't use)
    await srv.built.ctx.db.query(`update content_items set status = 'disabled' where kind = 'word' and category = 'cartoons' and data->>'image' is null`);
    const { ps, code, host } = await roomWith(4, 'outsider-word');
    await host.act(code, 'settings', { settings: { rounds: 1, category: 'cartoons' } });
    await readyAll(ps, code);
    await host.act(code, 'start');
    await waitFor(() => ps.every((p) => p.last.game?.phase === 'reveal'), 3000);
    const outsider = ps.find((p) => (p.last.game!.me as any).role === 'outsider')!;
    const insiders = ps.filter((p) => p !== outsider);
    const urls = insiders.map((p) => (p.last.game!.me as any).wordImage as string);
    for (const u of urls) expect(u).toMatch(/^\/api\/game-image\//);
    expect((outsider.last.game!.me as any).wordImage).toBeUndefined();
    expect(outsider.raw.join('')).not.toContain('/api/game-image/');
    const img = await insiders[0].http('GET', urls[0]);
    expect(img.status).toBe(200);
    expect(String(img.data)).toContain('<svg');
    expect((await outsider.http('GET', urls[0])).status).toBe(403);
    for (const p of ps) p.disconnect();
  });
});

describe('ارسم وخمّن canvas', () => {
  it('only the drawer can draw; segments relay and resync; chat cannot leak the word', async () => {
    const { ps, code, host } = await roomWith(3, 'draw-guess');
    await host.act(code, 'settings', { settings: { rounds: 1 } });
    await readyAll(ps, code);
    await host.act(code, 'start');
    await waitFor(() => host.last.game?.phase === 'choose', 2000);
    const drawerId = host.last.game!.drawer as string;
    const drawer = ps.find((p) => p.user!.id === drawerId)!;
    const others = ps.filter((p) => p !== drawer);
    await waitFor(() => (drawer.last.game?.choices as string[] | null)?.length === 3, 2000, 'choices');
    await waitFor(() => others[0].last.game, 2000);
    expect(others[0].last.game!.choices).toBeNull();
    await drawer.act(code, 'game:choose', { choice: 0 });
    await waitFor(() => drawer.last.game!.phase === 'draw' && others.every((o) => o.last.game?.phase === 'draw'));
    const word = drawer.last.game!.word as string;
    const turnKey = drawer.last.game!.turnKey as string;
    expect(others[0].raw.join('')).not.toContain(word);

    const seg = { s: 1, c: 0, w: 1, p: [10, 10, 500, 500, 900, 100] };
    expect((await others[0].emit('draw:event', { code, turnKey, op: 'seg', seg })).code).toBe('FORBIDDEN');
    expect((await drawer.emit('draw:event', { code, turnKey, op: 'seg', seg: { ...seg, p: [5000, 1] } })).code).toBe('VALIDATION');
    expect((await drawer.emit('draw:event', { code, turnKey: 't999', op: 'seg', seg })).code).toBe('STALE_ACTION');
    expect((await drawer.emit('draw:event', { code, turnKey, op: 'seg', seg })).ok).toBe(true);
    await waitFor(() => others[1].draws.length === 1, 2000, 'relay');
    const sync = await others[1].emit('draw:sync', { code });
    expect(sync.data.segments).toHaveLength(1);

    await others[0].emit('room:chat', { code, text: `الجواب ${word}`, clientId: randomUUID() });
    await waitFor(() => others[1].chats.some((c) => c.kind === 'user'), 2000, 'chat');
    const msg = others[1].chats.filter((c) => c.kind === 'user').at(-1)!;
    expect(msg.text).not.toContain(word);

    await others[0].act(code, 'game:guess', { text: word });
    await waitFor(() => (others[0].last.game!.guessed as string[]).includes(others[0].user!.id));
    expect(others[1].last.game!.word).toBeNull();
    expect(others[0].last.game!.word).toBe(word);
    for (const p of ps) p.disconnect();
  });
});

describe('chat', () => {
  it('delivers messages, dedupes retries, rejects floods', async () => {
    const { ps, code } = await roomWith(2);
    const clientId = randomUUID();
    expect((await ps[0].emit('room:chat', { code, text: 'مرحبا يا شباب 😄', clientId })).ok).toBe(true);
    expect((await ps[0].emit('room:chat', { code, text: 'مرحبا يا شباب 😄', clientId })).ok).toBe(true);
    await waitFor(() => ps[1].chats.some((c) => c.text === 'مرحبا يا شباب 😄'));
    await new Promise((r) => setTimeout(r, 100));
    expect(ps[1].chats.filter((c) => c.text === 'مرحبا يا شباب 😄')).toHaveLength(1);
    expect((await ps[0].emit('room:chat', { code, text: 'مرحبا يا شباب 😄', clientId: randomUUID() })).code).toBe('RATE_LIMITED');
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const r = await ps[0].emit('room:chat', { code, text: `رسالة ${i}`, clientId: randomUUID() });
      if (r.code === 'RATE_LIMITED') limited = true;
    }
    expect(limited).toBe(true);
    // a non-member cannot post
    const [stranger] = await players(1, 'غريب');
    expect((await stranger.emit('room:chat', { code, text: 'hi', clientId: randomUUID() })).code).toBe('NOT_MEMBER');
    for (const p of [...ps, stranger]) p.disconnect();
  });
});

describe('every game starts and finishes end-to-end with seeded content', () => {
  for (const gameId of GAME_IDS) {
    it(gameId, async () => {
      const n = gameId === 'taboo' ? 4 : 3;
      const { ps, code, host } = await roomWith(n, gameId);
      await host.act(code, 'settings', { settings: { rounds: 1, turnsPerPlayer: 1 } });
      await readyAll(ps, code);
      const r = await host.act(code, 'start');
      expect(r.ok, r.message).toBe(true);
      await waitFor(() => host.last.game?.gameId === gameId, 2000);
      await skipToEnd(host, code);
      await waitFor(() => host.last.status === 'results', 3000);
      expect(host.last.game!.results!.ranking.length).toBe(n);
      // rematch reuses the same game
      expect((await host.act(code, 'rematch')).ok).toBe(true);
      await waitFor(() => host.last.status === 'playing' && host.last.matchNumber === 2, 2000);
      expect((await host.act(code, 'end-game')).ok).toBe(true);
      await waitFor(() => host.last.status === 'lobby');
      for (const p of ps) p.disconnect();
    });
  }
});

describe('sockets require a session', () => {
  it('rejects unauthenticated socket connections', async () => {
    const p = new Player(srv.url);
    await expect(p.connect()).rejects.toThrow(/UNAUTHENTICATED/);
  });
});
