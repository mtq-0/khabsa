import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, migrate, type Db } from '../src/server/db/db.ts';
import { ContentRepo } from '../src/server/content/content.ts';
import { StatsService } from '../src/server/stats/stats.ts';
import { csvToItems, parseCsv } from '../src/server/content/csv.ts';
import { seed } from '../src/server/db/seed/seed.ts';
import { Storage } from '../src/server/storage/storage.ts';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

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
  await seed(db, new Storage(join(mkdtempSync(join(process.cwd(), '.tools', 'db-')), 'storage')));
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
    const b = await repo.pick({ kind: 'word', count: 5, category: 'food', exclude: a.map((x) => x.id) });
    for (const x of b) expect(a.map((y) => y.id)).not.toContain(x.id);
  });
  it('parses CSV with quotes, commas and BOM', () => {
    expect(parseCsv('\uFEFFa,b\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
    const items = csvToItems('taboo-card', 'category,difficulty,word,forbidden\nfood,easy,منسف,جميد|رز|لحمة');
    expect(items[0].data).toEqual({ word: 'منسف', forbidden: ['جميد', 'رز', 'لحمة'] });
  });
  it('seeded content covers every game', async () => {
    const r = await db.query<{ kind: string; n: number }>(`select kind, count(*)::int as n from content_items where pack_id is null group by kind`);
    const by = Object.fromEntries(r.rows.map((x) => [x.kind, x.n]));
    for (const k of ['word', 'question-pair', 'picture-pair', 'most-likely', 'taboo-card', 'trivia', 'draw-word']) expect(by[k], k).toBeGreaterThan(50);
    expect(by['picture-pair']).toBeGreaterThanOrEqual(200);
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
