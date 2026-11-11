import { randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import type { Storage } from '../../storage/storage.ts';
import { ContentRepo } from '../../content/content.ts';
import type { ContentKind } from '../../games/types.ts';
import { GAME_IDS } from '../../../shared/games.ts';
import { ACHIEVEMENTS } from '../../stats/stats.ts';
import { CATEGORIES } from './categories.ts';
import { DRAW_WORDS, OUTSIDER_WORDS, parseWord } from './words.ts';
import { QUESTION_PAIRS } from './questionPairs.ts';
import { MOST_LIKELY, TABOO_CARDS } from './party.ts';
import { TRIVIA } from './trivia.ts';
import { generatePicturePairs } from './pictures.ts';

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
  for (const [cat, d, majority, outsider] of QUESTION_PAIRS) items.push({ kind: 'question-pair', category: cat, difficulty: DIFF[d], data: { majority, outsider } });
  for (const [cat, text] of MOST_LIKELY) items.push({ kind: 'most-likely', category: cat, difficulty: 'medium', data: { text } });
  for (const [cat, d, word, forbidden] of TABOO_CARDS) items.push({ kind: 'taboo-card', category: cat, difficulty: DIFF[d], data: { word, forbidden } });
  for (const [cat, d, question, ...opts] of TRIVIA) items.push({ kind: 'trivia', category: cat, difficulty: DIFF[d], data: { question, options: opts, answer: 0 } });
  const res = await repo.bulkInsert(items, null);
  if (res.inserted) log(`seeded ${res.inserted} content items`);
  if (res.errors.length) log(`seed validation errors: ${JSON.stringify(res.errors.slice(0, 5))}`);

  const havePictures = (await db.query<{ n: number }>(`select count(*)::int as n from content_items where kind = 'picture-pair' and pack_id is null`, [])).rows[0].n;
  if (!havePictures) {
    const pairs = generatePicturePairs();
    const pictureItems: typeof items = [];
    for (const p of pairs) {
      const ids = [randomUUID(), randomUUID()];
      for (const [j, svg] of [p.svgA, p.svgB].entries()) {
        const key = `private/images/${ids[j]}.svg`;
        await storage.put(key, svg);
        await db.query('insert into images (id, storage_key, mime, bytes, width, height) values ($1, $2, $3, $4, 800, 600)', [ids[j], key, 'image/svg+xml', Buffer.byteLength(svg)]);
      }
      pictureItems.push({ kind: 'picture-pair', category: p.category, difficulty: p.mode === 'hard' ? 'hard' : 'medium', data: { a: ids[0], b: ids[1], labelA: p.labelA, labelB: p.labelB, mode: p.mode } });
    }
    const r = await repo.bulkInsert(pictureItems, null);
    log(`seeded ${r.inserted} picture pairs`);
  }
}
