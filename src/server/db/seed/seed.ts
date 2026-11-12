import { createHash, randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import type { Storage } from '../../storage/storage.ts';
import { ContentRepo } from '../../content/content.ts';
import type { ContentKind } from '../../games/types.ts';
import { GAME_IDS } from '../../../shared/games.ts';
import { ACHIEVEMENTS } from '../../stats/stats.ts';
import { CATEGORIES } from './categories.ts';
import { DRAW_WORDS, DRAW_WORD_SET, OUTSIDER_WORDS, parseWord } from './words.ts';
import { QUESTION_PAIRS } from './questionPairs.ts';
import { MORE_QUESTION_PAIRS } from './more/questions.ts';
import { MORE_MOST_LIKELY, MORE_TABOO_CARDS } from './more/party.ts';
import { MORE_TRIVIA } from './more/trivia.ts';
import { MOST_LIKELY, TABOO_CARDS } from './party.ts';
import { TRIVIA } from './trivia.ts';
import { WORD_PICTURES, renderWordPicture } from './wordPictures.ts';
import { itemCredit, photoPairs, readPhoto } from './photoSeed.ts';
import { POSTER_CATEGORIES, loadPosters, type PosterEntry } from './posters.ts';

const DIFF = { e: 'easy', m: 'medium', h: 'hard' } as const;

export const DEFAULT_PLATFORM_SETTINGS: Record<string, unknown> = {
  maintenance: false,
  announcement: '',
  maxRoomCapacity: 12,
  guestAccess: true,
  allowPublicRooms: true,
  chatEnabled: true,
};

/** Idempotent: safe to run on every boot. */
export async function seed(db: Db, storage: Storage, log: (m: string) => void = () => {}) {
  for (const [i, c] of CATEGORIES.entries()) {
    await db.query('insert into categories (slug, name, emoji, sort) values ($1, $2, $3, $4) on conflict (slug) do nothing', [c.slug, c.name, c.emoji, i]);
  }
  for (const [i, g] of GAME_IDS.entries()) {
    await db.query('insert into games (id, sort, featured) values ($1, $2, $3) on conflict (id) do nothing', [g, i, i < 3]);
  }
  for (const [i, a] of ACHIEVEMENTS.entries()) {
    await db.query(
      'insert into achievements (id, title, description, emoji, xp, sort) values ($1, $2, $3, $4, $5, $6) on conflict (id) do update set title = excluded.title, description = excluded.description, emoji = excluded.emoji, xp = excluded.xp, sort = excluded.sort',
      [a.id, a.title, a.description, a.emoji, a.xp, i],
    );
  }
  for (const [k, v] of Object.entries(DEFAULT_PLATFORM_SETTINGS)) {
    await db.query('insert into platform_settings (key, value) values ($1, $2::jsonb) on conflict (key) do nothing', [k, JSON.stringify(v)]);
  }

  const repo = new ContentRepo(db);
  const items: { kind: ContentKind; category: string; difficulty: string; data: unknown }[] = [];
  for (const [cat, words] of Object.entries(OUTSIDER_WORDS)) {
    for (const w of words) {
      const p = parseWord(w);
      items.push({ kind: 'word', category: cat, difficulty: p.difficulty, data: { word: p.word, ...(p.alternatives.length ? { alternatives: p.alternatives } : {}) } });
    }
  }
  for (const [cat, words] of Object.entries(DRAW_WORDS)) {
    for (const w of words) {
      const p = parseWord(w);
      items.push({ kind: 'draw-word', category: cat, difficulty: p.difficulty, data: { word: p.word, ...(p.alternatives.length ? { alternatives: p.alternatives } : {}) } });
    }
  }
  for (const [cat, d, majority, outsider] of [...QUESTION_PAIRS, ...MORE_QUESTION_PAIRS]) items.push({ kind: 'question-pair', category: cat, difficulty: DIFF[d], data: { majority, outsider } });
  for (const [cat, text] of [...MOST_LIKELY, ...MORE_MOST_LIKELY]) items.push({ kind: 'most-likely', category: cat, difficulty: 'medium', data: { text } });
  for (const [cat, d, word, forbidden] of [...TABOO_CARDS, ...MORE_TABOO_CARDS]) items.push({ kind: 'taboo-card', category: cat, difficulty: DIFF[d], data: { word, forbidden } });
  for (const [cat, d, question, ...opts] of [...TRIVIA, ...MORE_TRIVIA]) items.push({ kind: 'trivia', category: cat, difficulty: DIFF[d], data: { question, options: opts, answer: 0 } });
  const res = await repo.bulkInsert(items, null);
  if (res.inserted) log(`seeded ${res.inserted} content items`);
  if (res.errors.length) log(`seed validation errors: ${JSON.stringify(res.errors.slice(0, 5))}`);

  // drawing words are Modern Standard Arabic only: switch off older built-in ones that are not in the current list
  const oldDraw = await db.query(
    `update content_items set status = 'disabled', updated_at = now()
      where kind = 'draw-word' and pack_id is null and created_by is null and status = 'active' and not (data->>'word' = any($1::text[]))`,
    [[...DRAW_WORD_SET]],
  );
  if (oldDraw.rowCount) log(`switched off ${oldDraw.rowCount} old drawing words`);

  // illustrated cards for cartoon / movie / TV words (also added to databases seeded before this existed)
  const missingWordPictures = await db.query<{ id: string; word: string; data: Record<string, unknown> }>(
    `select id, data->>'word' as word, data from content_items where kind = 'word' and pack_id is null and data->>'image' is null and data->>'word' = any($1::text[])`,
    [Object.keys(WORD_PICTURES)],
  );
  for (const row of missingWordPictures.rows) {
    const svg = renderWordPicture(row.word);
    if (!svg) continue;
    const imageId = randomUUID();
    const key = `private/images/${imageId}.svg`;
    await storage.put(key, svg);
    await db.query('insert into images (id, storage_key, mime, bytes, width, height) values ($1, $2, $3, $4, 800, 600)', [imageId, key, 'image/svg+xml', Buffer.byteLength(svg)]);
    await db.query(`update content_items set data = $2::jsonb, updated_at = now() where id = $1`, [row.id, JSON.stringify({ ...row.data, image: imageId })]);
  }
  if (missingWordPictures.rows.length) log(`added pictures to ${missingWordPictures.rows.length} words`);

  await seedPhotoPairs(db, storage, repo, log);
  await seedPosters(db, loadPosters(), log);
}

/**
 * TMDB posters (from posters.json) for built-in cartoon / movie / TV words that don't have one yet.
 * Words where an admin removed the poster (`posterOff`) are left alone. Idempotent.
 */
export async function seedPosters(db: Db, posters: Map<string, PosterEntry>, log: (m: string) => void = () => {}) {
  if (!posters.size) return;
  const rows = await db.query<{ id: string; word: string; data: Record<string, unknown> }>(
    `select id, data->>'word' as word, data from content_items
      where kind = 'word' and pack_id is null and category = any($1::text[]) and data->'poster' is null and coalesce((data->>'posterOff')::boolean, false) = false`,
    [POSTER_CATEGORIES],
  );
  let n = 0;
  for (const r of rows.rows) {
    const p = posters.get(r.word);
    if (!p) continue;
    await db.query(`update content_items set data = $2::jsonb, updated_at = now() where id = $1`, [r.id, JSON.stringify({ ...r.data, poster: p })]);
    n++;
  }
  if (n) log(`added TMDB posters to ${n} words`);
}

/** Same UUID for the same photo on every server and every boot (so images are never duplicated). */
const photoUuid = (key: string) => {
  const h = createHash('sha1').update(`khabsa-photo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/**
 * Real photos (Wikimedia Commons, free licenses) for مين برا الصورة؟. Idempotent and incremental:
 * every pair carries a `pairId` ("keyA|keyB"), so pairs added in later releases are inserted on the
 * next boot, and pairs seeded by older versions (no pairId) are recognised by their labels.
 * (The built-in drawn pairs are switched off by migration 003.)
 */
export async function seedPhotoPairs(db: Db, storage: Storage, repo: ContentRepo, log: (m: string) => void = () => {}) {
  const pairs = photoPairs();
  if (!pairs.length) return;
  const pairId = (p: { keyA: string; keyB: string }) => `${p.keyA}|${p.keyB}`;
  // pairs seeded before ids existed: tag them so they are not added a second time
  const legacy = await db.query<{ id: string; data: Record<string, unknown> }>(`select id, data from content_items where kind = 'picture-pair' and pack_id is null and data ? 'credits' and not (data ? 'pairId')`, []);
  for (const row of legacy.rows) {
    const p = pairs.find((x) => x.labelA === row.data.labelA && x.labelB === row.data.labelB && x.mode === (row.data.mode ?? 'normal'));
    if (p) await db.query(`update content_items set data = $2::jsonb where id = $1`, [row.id, JSON.stringify({ ...row.data, pairId: pairId(p) })]);
  }
  const have = new Set((await db.query<{ id: string | null }>(`select data->>'pairId' as id from content_items where kind = 'picture-pair' and pack_id is null`, [])).rows.map((r) => r.id));
  const todo = pairs.filter((p) => !have.has(pairId(p)));
  if (!todo.length) return;
  const ensureImage = async (key: string) => {
    const id = photoUuid(key);
    const buf = readPhoto(key);
    const storageKey = `private/images/${id}.webp`;
    const ins = await db.query(`insert into images (id, storage_key, mime, bytes, width, height) values ($1, $2, 'image/webp', $3, 800, 600) on conflict (id) do nothing returning id`, [id, storageKey, buf.length]);
    if (ins.rows.length) await storage.put(storageKey, buf);
    return id;
  };
  const items: { kind: ContentKind; category: string; difficulty: string; data: unknown }[] = [];
  for (const p of todo) {
    const a = await ensureImage(p.keyA);
    const b = await ensureImage(p.keyB);
    items.push({
      kind: 'picture-pair',
      category: p.category,
      difficulty: p.mode === 'hard' ? 'hard' : 'medium',
      data: { a, b, labelA: p.labelA, labelB: p.labelB, mode: p.mode, pairId: pairId(p), credits: { a: itemCredit(p.creditA), b: itemCredit(p.creditB) } },
    });
  }
  const r = await repo.bulkInsert(items, null);
  if (r.errors.length) log(`photo pair validation errors: ${JSON.stringify(r.errors.slice(0, 5))}`);
  log(`seeded ${r.inserted} real-photo pairs`);
}
