import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, migrate, type Db } from '../src/server/db/db.ts';
import { ContentRepo, validateContent } from '../src/server/content/content.ts';
import { photoPairs } from '../src/server/db/seed/photoSeed.ts';
import { StatsService } from '../src/server/stats/stats.ts';
import { csvToItems, parseCsv } from '../src/server/content/csv.ts';
import { seed, seedPosters } from '../src/server/db/seed/seed.ts';
import { loadPosters } from '../src/server/db/seed/posters.ts';
import { OUTSIDER_WORDS, parseWord } from '../src/server/db/seed/words.ts';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Storage } from '../src/server/storage/storage.ts';

let db: Db;
const user = async (name: string, guest = false) =>
  (
    await db.query<{ id: string }>(
      `insert into users (username, display_name, is_guest, email, password_hash) values ($1, $1, $2, $3, $4) returning id`,
      [name, guest, guest ? null : `${name}@x.test`, guest ? null : 'scrypt$1$a$b'],
    )
  ).rows[0].id;

beforeAll(async () => {
  // Simulate a hosted provider's API roles (as on Supabase) before migrating
  db = await createDb('pglite:memory');
  await db.query(`create role anon nologin`);
  await db.query(`create role authenticated nologin`);
  await db.query(`grant usage on schema public to anon, authenticated`);
  await migrate(db);
  await seed(db, new Storage(db));
});
afterAll(async () => db?.close());

describe('migrations', () => {
  it('are idempotent', async () => {
    expect(await migrate(db)).toEqual([]);
  });
  it('enable row level security on every table', async () => {
    const r = await db.query<{ tablename: string; rowsecurity: boolean }>(`select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`);
    expect(r.rows.length).toBeGreaterThan(15);
    for (const t of r.rows) expect(t.rowsecurity, t.tablename).toBe(true);
  });
  it('public API roles cannot read secrets (users, sessions, content, rooms)', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['users', 'sessions', 'content_items', 'rooms', 'images']) {
        await expect(db.transaction(async (tx) => {
          await tx.query(`set local role ${role}`);
          await tx.query(`select * from ${table} limit 1`);
        })).rejects.toThrow(/permission denied/);
      }
    }
  });
  it('even with a grant, RLS without policies returns no rows', async () => {
    await db.query('grant select on users to authenticated');
    await user('rls_probe');
    const rows = await db.transaction(async (tx) => {
      await tx.query('set local role authenticated');
      return (await tx.query('select * from users')).rows;
    });
    expect(rows).toEqual([]);
    await db.query('revoke select on users from authenticated');
  });
});

describe('constraints', () => {
  it('enforce unique usernames/emails case-insensitively', async () => {
    await user('Sameer');
    await expect(user('sameer')).rejects.toThrow();
  });
  it('allow only one friendship per unordered pair and no self-friendship', async () => {
    const a = await user('friend_a');
    const b = await user('friend_b');
    await db.query('insert into friendships (requester_id, addressee_id) values ($1, $2)', [a, b]);
    await expect(db.query('insert into friendships (requester_id, addressee_id) values ($1, $2)', [b, a])).rejects.toThrow();
    await expect(db.query('insert into friendships (requester_id, addressee_id) values ($1, $1)', [a])).rejects.toThrow();
  });
  it('allow only one open room per code', async () => {
    await db.query(`insert into rooms (code, status) values ('ABCDEF', 'open')`);
    await expect(db.query(`insert into rooms (code, status) values ('ABCDEF', 'open')`)).rejects.toThrow();
    await db.query(`update rooms set status = 'closed' where code = 'ABCDEF'`);
    await db.query(`insert into rooms (code, status) values ('ABCDEF', 'open')`);
  });
  it('registered users must have email and password', async () => {
    await expect(db.query(`insert into users (username, display_name, is_guest) values ('noemail', 'x', false)`)).rejects.toThrow();
  });
  it('validates usernames', async () => {
    await expect(db.query(`insert into users (username, display_name) values ('a b<', 'x')`)).rejects.toThrow();
  });
});

describe('scoring ledger', () => {
  it('awards match XP exactly once and unlocks achievements once', async () => {
    const stats = new StatsService(db);
    const a = await user('xp_a');
    const b = await user('xp_b');
    const room = (await db.query<{ id: string }>(`insert into rooms (code) values ('XPXPXP') returning id`)).rows[0].id;
    const matchId = await stats.startMatch(room, 'speed-quiz', 2, a);
    const results = { ranking: [{ playerId: a, score: 300, place: 1 }, { playerId: b, score: 100, place: 2 }], winners: [a] };
    const first = await stats.finishMatch(matchId, results, [a, b]);
    expect(first).toHaveLength(2);
    expect(first[0].unlocked).toContain('first-game');
    expect(first[0].unlocked).toContain('first-win');
    const second = await stats.finishMatch(matchId, results, [a, b]);
    expect(second).toEqual([]);
    const xp = (await db.query<{ xp: number }>('select xp from users where id = $1', [a])).rows[0].xp;
    // 20 base + 30 first place + 20 win + 0 crowd + achievement bonuses (25 + 50)
    expect(xp).toBe(70 + 25 + 50);
    const ach = (await db.query<{ n: number }>('select count(*)::int as n from user_achievements where user_id = $1', [a])).rows[0].n;
    expect(ach).toBe(2);
    await expect(db.query(`insert into xp_events (user_id, source, source_id, amount) values ($1, 'match', $2, 5)`, [a, matchId])).rejects.toThrow();
  });
});

describe('content system', () => {
  it('imports 1,000 question pairs, skips duplicates and reports invalid rows', async () => {
    const repo = new ContentRepo(db);
    const items = Array.from({ length: 1000 }, (_, i) => ({
      kind: 'question-pair' as const,
      category: 'everyday',
      difficulty: 'medium',
      data: { majority: `شو أكثر إشي بتحبه رقم ${i}؟`, outsider: `شو أكثر إشي بتكرهه رقم ${i}؟` },
    }));
    const r1 = await repo.bulkInsert(items, null);
    expect(r1.inserted).toBe(1000);
    const r2 = await repo.bulkInsert(items.slice(0, 10), null);
    expect(r2.inserted).toBe(0);
    expect(r2.skipped).toBe(10);
    const bad = await repo.bulkInsert(
      [
        { kind: 'question-pair', category: 'everyday', difficulty: 'medium', data: { majority: 'نفس', outsider: 'نفس' } },
        { kind: 'question-pair', category: 'nope', difficulty: 'medium', data: { majority: 'a', outsider: 'b' } },
        { kind: 'trivia', category: 'general', difficulty: 'easy', data: { question: 'q', options: ['a', 'a', 'b', 'c'], answer: 0 } },
      ],
      null,
    );
    expect(bad.inserted).toBe(0);
    expect(bad.errors).toHaveLength(3);
    const total = (await db.query<{ n: number }>(`select count(*)::int as n from content_items where kind = 'question-pair'`)).rows[0].n;
    expect(total).toBeGreaterThanOrEqual(1100);
  });
  it('picks random content honoring filters and exclusions', async () => {
    const repo = new ContentRepo(db);
    const a = await repo.pick({ kind: 'word', count: 5, category: 'food' });
    expect(a).toHaveLength(5);
    for (const x of a) expect(x.category).toBe('food');
    // several categories: only those, and an equal share of each (a small category is not drowned by a big one)
    const multi = await repo.pick({ kind: 'word', count: 20, category: 'food,jordan,cartoons' });
    expect(multi).toHaveLength(20);
    const byCat = multi.reduce<Record<string, number>>((m, x) => ((m[x.category] = (m[x.category] ?? 0) + 1), m), {});
    expect(Object.keys(byCat).sort()).toEqual(['cartoons', 'food', 'jordan']);
    for (const n of Object.values(byCat)) expect(n).toBeGreaterThanOrEqual(6);
    expect(new Set(multi.map((x) => x.id)).size).toBe(20);
    const b = await repo.pick({ kind: 'word', count: 5, category: 'food', exclude: a.map((x) => x.id) });
    for (const x of b) expect(a.map((y) => y.id)).not.toContain(x.id);
  });
  it('parses CSV with quotes, commas and BOM', () => {
    expect(parseCsv('\uFEFFa,b\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
    const items = csvToItems('taboo-card', 'category,difficulty,word,forbidden\nfood,easy,منسف,جميد|رز|لحمة');
    expect(items[0].data).toEqual({ word: 'منسف', forbidden: ['جميد', 'رز', 'لحمة'] });
  });
  it('cartoon, movie and TV words have a picture: a drawn private card, or (new words) a TMDB poster', async () => {
    const r = await db.query<{ n: number; with_img: number }>(
      `select count(*)::int n, count(*) filter (where i.id is not null)::int with_img
       from content_items c left join images i on i.id = (c.data->>'image')::uuid
       where c.kind = 'word' and c.category in ('cartoons','movies','tv')`,
    );
    expect(r.rows[0].n).toBeGreaterThan(200);
    expect(r.rows[0].with_img).toBeGreaterThanOrEqual(79); // the drawn cards (89, minus 10 words removed in the word clean-up)
    // with the real poster list, every word has a drawn card or a poster, except a few generic ones
    const real = loadPosters(new URL('../src/server/db/seed/posters.json', import.meta.url).pathname);
    const words = await db.query<{ word: string; img: boolean; poster: boolean }>(
      `select data->>'word' word, data->>'image' is not null img, data ? 'poster' poster from content_items where kind = 'word' and category in ('cartoons','movies','tv')`,
    );
    const missing = words.rows.filter((w) => !w.img && !w.poster && !real.has(w.word)).map((w) => w.word);
    expect(missing.length, `words with no picture or poster: ${missing.join('، ')}`).toBeLessThanOrEqual(12);
    // seeding again does not duplicate pictures
    const before = (await db.query<{ n: number }>('select count(*)::int n from images')).rows[0].n;
    await seed(db, new Storage(db));
    expect((await db.query<{ n: number }>('select count(*)::int n from images')).rows[0].n).toBe(before);
  });

  it('ممنوع تحكي!: 450+ cards, one per word, and old duplicate cards are switched off on upgrade', async () => {
    const rows = (await db.query<{ w: string }>(`select data->>'word' as w from content_items where kind = 'taboo-card' and pack_id is null and status = 'active'`)).rows.map((r) => r.w);
    expect(rows.length).toBeGreaterThanOrEqual(450);
    expect(new Set(rows).size).toBe(rows.length); // no word twice
    // an older database had the same word twice (different forbidden lists): the extra one is switched off, the cards stay one per word
    await db.query(`insert into content_items (kind, category, difficulty, data, dedupe_key) values ('taboo-card', 'food', 'medium', '{"word":"منسف","forbidden":["أ","ب","ج","د"]}'::jsonb, 'old-dup-taboo')`);
    await seed(db, new Storage(db));
    const after = (await db.query<{ w: string; n: number }>(`select data->>'word' as w, count(*)::int n from content_items where kind = 'taboo-card' and pack_id is null and status = 'active' group by 1 having count(*) > 1`)).rows;
    expect(after).toEqual([]);
  });

  it('drawing words are Modern Standard Arabic: many words, and old built-in ones are switched off on upgrade', async () => {
    const n = (await db.query<{ n: number }>(`select count(*)::int n from content_items where kind = 'draw-word' and status = 'active'`)).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(1000);
    // a word from the previous (dialect) list that is not in the new list
    await db.query(
      `insert into content_items (kind, category, difficulty, data, dedupe_key) values ('draw-word', 'household', 'medium', '{"word":"كنباية"}'::jsonb, 'old-dialect-test')`,
    );
    await seed(db, new Storage(db));
    const old = await db.query<{ status: string }>(`select status from content_items where dedupe_key = 'old-dialect-test'`);
    expect(old.rows[0].status).toBe('disabled');
    expect((await db.query<{ n: number }>(`select count(*)::int n from content_items where kind = 'draw-word' and status = 'active'`)).rows[0].n).toBe(n);
  });

  it('مين برا السالفة words: no word twice, and on upgrade removed words are switched off and moved words change category', async () => {
    // the list itself: every word once across all categories (normalised: hamza, ال, ة, spaces)
    const norm = (s: string) => s.replace(/[ًٌٍَُِّْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/^ال/, '').replace(/ة$/, 'ه').replace(/\s+/g, '');
    const seen = new Map<string, string>();
    for (const [cat, ws] of Object.entries(OUTSIDER_WORDS))
      for (const w of ws) {
        const word = parseWord(w).word;
        const k = norm(word);
        if (seen.has(k) && !['عمان'].includes(k)) throw new Error(`${word} (${cat}) repeats ${seen.get(k)}`);
        seen.set(k, `${word} (${cat})`);
      }
    for (const ws of Object.values(OUTSIDER_WORDS)) expect(ws.length).toBeGreaterThanOrEqual(40);
    // an old database: a removed word, a renamed word, and a word in its old category
    const ins = (word: string, cat: string, key: string) =>
      db.query(`insert into content_items (kind, category, difficulty, data, dedupe_key) values ('word', $2, 'medium', jsonb_build_object('word', $1::text), $3)`, [word, cat, key]);
    await db.query(`delete from content_items where kind = 'word' and data->>'word' in ('حلاق', 'سبونج بوب')`);
    await ins('المتحري كونان', 'tv', 'old-word-1');
    await ins('بارلبي', 'movies', 'old-word-2');
    await ins('حلاق', 'places', 'old-word-3');
    await ins('سبونج بوب', 'tv', 'old-word-4');
    await seed(db, new Storage(db));
    const row = async (key: string) => (await db.query<{ status: string; category: string }>(`select status, category from content_items where dedupe_key = $1`, [key])).rows[0];
    expect((await row('old-word-1')).status).toBe('disabled');
    expect((await row('old-word-2')).status).toBe('disabled');
    expect(await row('old-word-3')).toEqual({ status: 'active', category: 'professions' });
    expect(await row('old-word-4')).toEqual({ status: 'active', category: 'cartoons' });
    // the renamed word is there under its new name
    expect((await db.query(`select 1 from content_items where kind = 'word' and status = 'active' and data->>'word' = 'باربي'`)).rows).toHaveLength(1);
  });

  it('مين برا الصورة؟ is real photos only: every pair has WebP photos stored in the database and their credits', async () => {
    const photos = await db.query<{ n: number; hard: number; bad: number }>(
      `select count(*)::int n, count(*) filter (where c.data->>'mode' = 'hard')::int hard,
              count(*) filter (where ia.mime <> 'image/webp' or ib.mime <> 'image/webp' or fa.key is null or fb.key is null
                               or c.data->'credits'->'a'->>'author' is null or c.data->'credits'->'b'->>'page' not like 'https://commons.wikimedia.org/%'
                               or c.data->>'pairId' is null)::int bad
         from content_items c
         left join images ia on ia.id = (c.data->>'a')::uuid left join files fa on fa.key = ia.storage_key
         left join images ib on ib.id = (c.data->>'b')::uuid left join files fb on fb.key = ib.storage_key
        where c.kind = 'picture-pair' and c.pack_id is null and c.status = 'active'`,
    );
    expect(photos.rows[0].n).toBe(photoPairs().length);
    expect(photos.rows[0].n).toBeGreaterThanOrEqual(120);
    expect(photos.rows[0].hard).toBeGreaterThanOrEqual(10); // look-alike pairs for the hard mode
    expect(photos.rows[0].bad).toBe(0);
    // no drawn (SVG) pair is active
    const drawn = await db.query<{ n: number }>(`select count(*)::int n from content_items c join images i on i.id = (c.data->>'a')::uuid where c.kind = 'picture-pair' and c.status = 'active' and i.mime = 'image/svg+xml'`);
    expect(drawn.rows[0].n).toBe(0);
    // idempotent: seeding again adds nothing
    const before = (await db.query<{ n: number }>('select count(*)::int n from images')).rows[0].n;
    const pairsBefore = (await db.query<{ n: number }>(`select count(*)::int n from content_items where kind = 'picture-pair'`)).rows[0].n;
    await seed(db, new Storage(db));
    expect((await db.query<{ n: number }>('select count(*)::int n from images')).rows[0].n).toBe(before);
    expect((await db.query<{ n: number }>(`select count(*)::int n from content_items where kind = 'picture-pair'`)).rows[0].n).toBe(pairsBefore);
    // the picker serves normal pairs for normal mode and look-alikes for hard mode
    const repo = new ContentRepo(db);
    const normal = await repo.pick({ kind: 'picture-pair', count: 300, difficulty: 'medium' });
    const hard = await repo.pick({ kind: 'picture-pair', count: 300, difficulty: 'hard' });
    expect(normal.every((i) => i.data.mode === 'normal' && 'credits' in i.data)).toBe(true);
    expect(hard.every((i) => i.data.mode === 'hard' && i.data.labelA !== i.data.labelB)).toBe(true);
  });

  it('upgrading an old database: drawn pairs are switched off, old photo pairs are recognised (not duplicated), new ones are added', async () => {
    const old = await createDb('pglite:memory');
    await migrate(old); // (fresh DB: migration 003 runs on an empty table)
    const storage = new Storage(old);
    await old.query(`insert into categories (slug, name, emoji, sort) values ('food', 'أكل', '🍔', 0), ('animals', 'حيوانات', '🐶', 1) on conflict do nothing`);
    // what version 1.x seeded: a drawn pair, and one real-photo pair without pairId and with random image ids
    const svgA = randomUUID(), svgB = randomUUID(), pa = randomUUID(), pb = randomUUID();
    for (const [id, mime] of [[svgA, 'image/svg+xml'], [svgB, 'image/svg+xml'], [pa, 'image/webp'], [pb, 'image/webp']] as const)
      await old.query(`insert into images (id, storage_key, mime, bytes, width, height) values ($1, $2, $3, 10, 800, 600)`, [id, `private/images/${id}.${mime === 'image/webp' ? 'webp' : 'svg'}`, mime]);
    const first = photoPairs().find((p) => p.mode === 'normal')!;
    const credit = { author: 'x', license: 'CC0', page: 'https://commons.wikimedia.org/wiki/File:X.jpg' };
    await old.query(`insert into content_items (kind, category, difficulty, data, dedupe_key) values ('picture-pair', 'food', 'medium', $1::jsonb, 'k1'), ('picture-pair', $2, 'medium', $3::jsonb, 'k2')`, [
      JSON.stringify({ a: svgA, b: svgB, labelA: 'قديم', labelB: 'قديم٢', mode: 'normal' }),
      first.category,
      JSON.stringify({ a: pa, b: pb, labelA: first.labelA, labelB: first.labelB, mode: 'normal', credits: { a: credit, b: credit } }),
    ]);
    // run migration 003's statement as the real migrator would on an old database
    const { readFileSync } = await import('node:fs');
    await old.query(readFileSync(new URL('../src/server/db/migrations/003_photos_only.sql', import.meta.url), 'utf8'), []);
    await seed(old, storage);
    const rows = await old.query<{ status: string; label: string; pair: string | null }>(`select status, data->>'labelA' label, data->>'pairId' pair from content_items where kind = 'picture-pair'`);
    expect(rows.rows.find((r) => r.label === 'قديم')!.status).toBe('disabled');
    expect(rows.rows.filter((r) => r.label === first.labelA)).toHaveLength(1); // not duplicated
    expect(rows.rows.find((r) => r.label === first.labelA)!.pair).toBe(`${first.keyA}|${first.keyB}`); // now recognised
    expect(rows.rows.filter((r) => r.status === 'active').length).toBe(photoPairs().length);
    await old.close();
  });

  it('photos stay varied: no Commons file is used twice and no two photos are near-duplicates', async () => {
    const { analyse } = await import('../scripts/check-photos.ts');
    const r = await analyse();
    expect(r.samePage, 'the same Commons file is used for two subjects').toEqual([]);
    expect(r.near.map((n) => `${n.a} ~ ${n.b}`), 'near-duplicate photos').toEqual([]);
    expect(r.orphans, 'photo files no pair uses (run: node scripts/check-photos.ts --prune)').toEqual([]);
    // all pairs have clearly different subjects (a pair of look-alikes is still two different photos)
    for (const p of r.pairs) expect(p.keyA).not.toBe(p.keyB);
  });

  it('rejects photo credits with non-https or foreign links', () => {
    const base = { a: crypto.randomUUID(), b: crypto.randomUUID(), labelA: 'أ', labelB: 'ب', mode: 'normal' };
    const credit = { author: 'x', license: 'CC0', page: 'https://commons.wikimedia.org/wiki/File:X.jpg' };
    expect(() => validateContent('picture-pair', { ...base, credits: { a: credit, b: credit } })).not.toThrow();
    expect(() => validateContent('picture-pair', { ...base, credits: { a: { ...credit, page: 'javascript:alert(1)' }, b: credit } })).toThrow();
    expect(() => validateContent('picture-pair', { ...base, credits: { a: { ...credit, page: 'https://evil.example/x' }, b: credit } })).toThrow();
  });

  it('TMDB posters from posters.json go to cartoon/movie/TV words, once, and respect an admin removal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'posters-'));
    const file = join(dir, 'posters.json');
    writeFileSync(
      file,
      JSON.stringify({
        'تايتانيك': { tmdbId: 597, type: 'movie', path: '/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg', title: 'Titanic' },
        'سبونج بوب': { tmdbId: 387, type: 'tv', path: '/maFEWU41jdUOzDfRVkojq7fluIm.jpg', title: 'SpongeBob' },
        'باب الحارة': { tmdbId: 61224, type: 'tv', path: '/bab1234567.jpg' },
        'الهيبة': { tmdbId: 1, type: 'tv', path: 'javascript:alert(1)' }, // invalid: ignored
        'منسف': { tmdbId: 2, type: 'movie', path: '/aaaaaaaaaa.jpg' }, // not a poster category
        'هاري بوتر': null,
      }),
    );
    const posters = loadPosters(file);
    expect([...posters.keys()].sort()).toEqual(['باب الحارة', 'تايتانيك', 'سبونج بوب', 'منسف'].sort());
    const q = (w: string) => db.query<{ category: string; poster: any; off: any }>(`select category, data->'poster' as poster, data->'posterOff' as off from content_items where kind = 'word' and data->>'word' = $1`, [w]);
    // an admin had removed the SpongeBob poster
    await db.query(`update content_items set data = data || '{"posterOff": true}'::jsonb where kind = 'word' and data->>'word' = 'سبونج بوب'`);
    await seedPosters(db, posters);
    expect((await q('تايتانيك')).rows[0].poster).toMatchObject({ tmdbId: 597, type: 'movie' });
    expect((await q('باب الحارة')).rows[0].poster).toMatchObject({ tmdbId: 61224, type: 'tv' });
    expect((await q('سبونج بوب')).rows[0].poster).toBeNull();
    expect((await q('الهيبة')).rows[0].poster).toBeNull();
    expect((await q('منسف')).rows.every((r) => r.poster === null)).toBe(true);
    // idempotent, and the stored data still validates
    const before = (await db.query<{ n: number }>(`select count(*)::int n from content_items where data ? 'poster'`)).rows[0].n;
    await seedPosters(db, posters);
    expect((await db.query<{ n: number }>(`select count(*)::int n from content_items where data ? 'poster'`)).rows[0].n).toBe(before);
    const row = (await db.query<{ data: Record<string, unknown> }>(`select data from content_items where kind = 'word' and data->>'word' = 'تايتانيك'`)).rows[0];
    expect(() => validateContent('word', row.data)).not.toThrow();
  });

  it('seeded content covers every game', async () => {
    const r = await db.query<{ kind: string; n: number }>(`select kind, count(*)::int as n from content_items where pack_id is null group by kind`);
    const by = Object.fromEntries(r.rows.map((x) => [x.kind, x.n]));
    for (const k of ['word', 'question-pair', 'picture-pair', 'most-likely', 'taboo-card', 'trivia', 'draw-word']) expect(by[k], k).toBeGreaterThan(50);
    expect(by['picture-pair']).toBeGreaterThanOrEqual(120);
  });
});

describe('db adapter', () => {
  it('reports rowCount like node-postgres for selects and DML (regression: block checks)', async () => {
    const id = await user('rowcount_user');
    expect((await db.query('select 1 from users where id = $1', [id])).rowCount).toBe(1);
    expect((await db.query('select 1 from users where id = $1', ['00000000-0000-0000-0000-000000000000'])).rowCount).toBe(0);
    expect((await db.query('update users set xp = xp where id = $1', [id])).rowCount).toBe(1);
    const tx = await db.transaction((q) => q.query('select 1 from users where id = $1', [id]));
    expect(tx.rowCount).toBe(1);
  });
});

describe('file storage in Postgres (no disk needed)', () => {
  it('round-trips binary files, rejects unsafe keys, deletes', async () => {
    const st = new Storage(db);
    const key = 'private/images/00000000-0000-4000-8000-000000000001.webp';
    const data = Buffer.from([0, 1, 2, 250, 255, 0, 10]);
    await st.put(key, data);
    expect(Buffer.compare((await new Storage(db).get(key))!, data)).toBe(0); // fresh instance: read from DB, not cache
    await expect(st.put('../../etc/passwd', 'x')).rejects.toThrow();
    await expect(st.get('private/images/x.webp')).rejects.toThrow();
    await st.delete(key);
    expect(await st.get(key)).toBeNull();
    expect(await new Storage(db).get(key)).toBeNull();
  });
  it('seeded picture images are stored in the database', async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from files f join images i on i.storage_key = f.key`);
    expect(r.rows[0].n).toBeGreaterThanOrEqual(350); // 290 photos + the drawn word cards
  });
});

describe('real poster list', () => {
  it('posters.json is valid: every entry passes validation and covers most cartoon/movie/TV words', async () => {
    const { POSTERS_FILE } = await import('../src/server/db/seed/posters.ts');
    expect(POSTERS_FILE).toContain('fixtures-no-posters'); // the env override is active in tests
    const real = loadPosters(new URL('../src/server/db/seed/posters.json', import.meta.url).pathname);
    expect(real.size).toBeGreaterThanOrEqual(70);
    for (const [word, p] of real) expect(() => validateContent('word', { word, poster: p }), word).not.toThrow();
  });
});

describe('e2e poster fixture', () => {
  it('covers every movie word, so the browser test always gets a poster (regenerate it when movie words are added)', async () => {
    const { OUTSIDER_WORDS, parseWord } = await import('../src/server/db/seed/words.ts');
    const fx = loadPosters(new URL('../e2e/fixtures/posters.json', import.meta.url).pathname);
    const missing = OUTSIDER_WORDS.movies.map((w) => parseWord(w).word).filter((w) => !fx.has(w));
    expect(missing, 'run: node scripts/make-poster-fixture.ts').toEqual([]);
  });
});
