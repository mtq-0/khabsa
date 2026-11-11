import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { Player, startServer, waitFor, type TestServer } from './helpers/server.ts';
import { TmdbService } from '../src/server/content/tmdb.ts';
import { tmdbQueryFor } from '../src/server/db/seed/wordPictures.ts';

// tiny 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let fake: Server;
let fakeUrl = '';
const seen: { auth?: string; query?: string | null }[] = [];

beforeAll(async () => {
  fake = createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    if (u.pathname === '/3/search/multi' && u.searchParams.get('query') !== 'جن') {
      seen.push({ auth: req.headers.authorization, query: u.searchParams.get('query') });
      if (req.headers.authorization !== 'Bearer eyJfake-token') return res.writeHead(401).end('{}');
      const results = u.searchParams.get('query') === 'لا شي' ? [] : [
        { media_type: 'person', id: 1, name: 'x', poster_path: null },
        { media_type: 'tv', id: 1234, name: 'توم وجيري', original_name: 'Tom and Jerry', first_air_date: '1965-09-25', poster_path: '/tomjerryposter.jpg' },
      ];
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ results }));
    }
    if (u.pathname === '/3/search/tv' || (u.pathname === '/3/search/multi' && u.searchParams.get('query') === 'جن')) {
      // a very popular but unrelated result first, the exact title further down
      const tv = u.pathname === '/3/search/tv';
      const results = [
        { ...(tv ? {} : { media_type: 'movie' }), id: 9, title: 'Djinn', name: 'Djinn', poster_path: '/popularwrong.jpg', vote_count: 50000 },
        { ...(tv ? {} : { media_type: 'tv' }), id: 10, name: 'جن', original_name: 'جن', first_air_date: '2019-06-13', poster_path: '/jinnseries.jpg', vote_count: 40 },
      ];
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ results }));
    }
    if (u.pathname.startsWith('/t/p/')) return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', () => r()));
  fakeUrl = `http://127.0.0.1:${(fake.address() as { port: number }).port}`;
  srv = await startServer({ tmdb: { token: 'eyJfake-token', apiBase: `${fakeUrl}/3`, imageBase: `${fakeUrl}/t/p` } });
});
afterAll(async () => {
  await srv?.close();
  fake?.close();
});
let srv: TestServer;

async function admin() {
  const p = new Player(srv.url);
  const r = await p.http('POST', '/api/auth/register', { email: 'admin@khabsa.test', password: 'secret-pass-1', username: 'tmdb_admin', displayName: 'مدير' });
  if (r.status !== 200) await p.http('POST', '/api/auth/login', { email: 'admin@khabsa.test', password: 'secret-pass-1' });
  return p;
}

describe('TMDB matching', () => {
  it('prefers an exact title over a more popular unrelated result, and supports tv:/movie: prefixes', async () => {
    const t = new TmdbService({ token: 'eyJfake-token', apiBase: `${fakeUrl}/3`, imageBase: `${fakeUrl}/t/p` });
    expect((await t.search('جن'))!.posterPath).toBe('/jinnseries.jpg');
    const tv = await t.search('tv:جن');
    expect(tv).toMatchObject({ type: 'tv', tmdbId: 10, year: '2019' });
  });
  it('skips generic words and uses better search terms for known titles', () => {
    expect(tmdbQueryFor('نشرة الأخبار')).toBeNull();
    expect(tmdbQueryFor('أفاتار')).toBe('Avatar');
    expect(tmdbQueryFor('باب الحارة')).toBe('باب الحارة');
  });
});

describe('TMDB posters', () => {
  it('admin searches, approves a poster, and only insiders receive it during the game', async () => {
    const a = await admin();
    const words = (await a.http('GET', '/api/admin/tmdb/words')).data;
    expect(words.configured).toBe(true);
    const tom = words.words.find((w: { word: string }) => w.word === 'توم وجيري');
    expect(tom).toBeTruthy();
    const s = await a.http('POST', '/api/admin/tmdb/search', { items: [{ id: tom.id }] });
    expect(s.data.results[0].match).toMatchObject({ tmdbId: 1234, type: 'tv', posterPath: '/tomjerryposter.jpg', year: '1965' });
    expect(seen.at(-1)).toEqual({ auth: 'Bearer eyJfake-token', query: 'توم وجيري' });
    // invalid poster paths are rejected
    expect((await a.http('POST', '/api/admin/tmdb/apply', { id: tom.id, poster: { tmdbId: 1, type: 'tv', path: '../../etc/passwd' } })).status).toBe(400);
    expect((await a.http('POST', '/api/admin/tmdb/apply', { id: tom.id, poster: { tmdbId: 1234, type: 'tv', path: '/tomjerryposter.jpg', title: 'توم وجيري' } })).status).toBe(200);
    expect((await a.http('GET', '/api/admin/tmdb/poster?path=%2Ftomjerryposter.jpg')).status).toBe(200);

    // force the round to use that word: disable every other cartoon word
    const others = (await srv.built.ctx.db.query<{ id: string }>(`select id from content_items where kind = 'word' and category = 'cartoons' and id <> $1`, [tom.id])).rows.map((r) => r.id);
    await a.http('POST', '/api/admin/content/bulk-status', { ids: others, status: 'disabled' });

    const ps: Player[] = [];
    for (let i = 0; i < 3; i++) {
      const p = new Player(srv.url);
      await p.guest(`لاعب${i}`);
      await p.connect();
      ps.push(p);
    }
    const { data } = await ps[0].http('POST', '/api/rooms', { gameId: 'outsider-word' });
    for (const p of ps) await p.join(data.code);
    await ps[0].act(data.code, 'settings', { settings: { rounds: 1, category: 'cartoons' } });
    for (const p of ps.slice(1)) await p.act(data.code, 'ready');
    await ps[0].act(data.code, 'start');
    await waitFor(() => ps.every((p) => p.last.game?.phase === 'reveal'), 3000);
    const outsider = ps.find((p) => (p.last.game!.me as any).role === 'outsider')!;
    const insider = ps.find((p) => p !== outsider)!;
    const url = (insider.last.game!.me as any).wordImage as string;
    expect(url).toMatch(/^\/api\/game-image\//);
    const img = await fetch(srv.url + url, { headers: { cookie: insider.cookie } });
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await img.arrayBuffer()).equals(PNG)).toBe(true);
    // the outsider has no link and cannot use the insider's link; the TMDB path never reaches players
    expect((outsider.last.game!.me as any).wordImage).toBeUndefined();
    expect((await fetch(srv.url + url, { headers: { cookie: outsider.cookie } })).status).toBe(403);
    for (const p of ps) expect(p.raw.join('')).not.toContain('tomjerryposter');
    for (const p of ps) p.disconnect();

    // removing the poster falls back to the drawn picture
    expect((await a.http('POST', '/api/admin/tmdb/apply', { id: tom.id, poster: null })).status).toBe(200);
    const after = (await srv.built.ctx.db.query<{ data: Record<string, unknown> }>('select data from content_items where id = $1', [tom.id])).rows[0].data;
    expect(after.poster).toBeUndefined();
    expect(after.image).toBeTruthy();
  });

  it('TMDB endpoints are admin-only and the footer flag is exposed', async () => {
    const g = new Player(srv.url);
    await g.guest('ضيف');
    expect((await g.http('GET', '/api/admin/tmdb/words')).status).toBe(403);
    expect((await g.http('POST', '/api/admin/tmdb/search', { items: [] })).status).toBe(403);
    expect((await g.http('GET', '/api/admin/tmdb/poster?path=%2Ftomjerryposter.jpg')).status).toBe(403);
    expect((await g.http('GET', '/api/platform')).data.tmdb).toBe(true);
  });
});
