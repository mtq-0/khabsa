import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Db, Queryable } from '../db/db.ts';
import type { ContentItem, ContentKind } from '../games/types.ts';
import { AppError } from '../../shared/errors.ts';
import { categoryList } from '../../shared/games.ts';
import { cleanText } from '../security/text.ts';

export const CONTENT_KINDS: ContentKind[] = ['word', 'question-pair', 'picture-pair', 'most-likely', 'taboo-card', 'trivia', 'draw-word'];

const t = (max: number) => z.string().transform((s) => cleanText(s, max)).pipe(z.string().min(1).max(max));
const httpsLink = (hosts: RegExp) => z.url({ protocol: /^https$/, hostname: hosts }).max(400);
const PHOTO_CREDIT = z.object({
  author: t(200),
  license: t(40),
  licenseUrl: httpsLink(/^(creativecommons\.org|commons\.wikimedia\.org|en\.wikipedia\.org)$/).optional(), // none for public domain
  page: httpsLink(/^commons\.wikimedia\.org$/),
});

/** Validation schema for each content kind's data payload. */
export const CONTENT_SCHEMAS: Record<ContentKind, z.ZodType<Record<string, unknown>>> = {
  word: z.object({
    word: t(40),
    alternatives: z.array(t(40)).max(5).optional(),
    image: z.uuid().optional(),
    poster: z.object({ tmdbId: z.number().int().positive(), type: z.enum(['movie', 'tv']), path: z.string().regex(/^\/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png|webp)$/), title: z.string().max(120).optional() }).optional(),
    /** an admin removed the poster: don't add it back automatically */
    posterOff: z.boolean().optional(),
  }),
  'draw-word': z.object({ word: t(30), alternatives: z.array(t(30)).max(5).optional() }),
  'question-pair': z.object({ majority: t(160), outsider: t(160) }).refine((d) => d.majority !== d.outsider, 'السؤالين لازم يكونوا مختلفين'),
  'picture-pair': z.object({
    a: z.uuid(),
    b: z.uuid(),
    labelA: t(60),
    labelB: t(60),
    mode: z.enum(['normal', 'hard']),
    /** attribution for real photos (free licenses), shown when the round is revealed */
    credits: z.object({ a: PHOTO_CREDIT, b: PHOTO_CREDIT }).optional(),
    /** which photo pair this is ("keyA|keyB"), so seeding can add new pairs later without duplicating */
    pairId: z.string().regex(/^[a-z0-9-]{1,80}\|[a-z0-9-]{1,80}$/).optional(),
  }),
  'most-likely': z.object({ text: t(160) }),
  'taboo-card': z.object({ word: t(40), forbidden: z.array(t(30)).min(3).max(6), alternatives: z.array(t(40)).max(5).optional() }),
  trivia: z
    .object({ question: t(200), options: z.array(t(80)).length(4), answer: z.number().int().min(0).max(3) })
    .refine((d) => new Set(d.options).size === 4, 'الخيارات لازم تكون مختلفة'),
};

export { KIND_FOR_GAME } from '../games/kinds.ts';

export function dedupeKey(kind: ContentKind, data: Record<string, unknown>): string {
  const basis =
    kind === 'question-pair'
      ? `${data.majority}|${data.outsider}`
      : kind === 'trivia'
        ? String(data.question)
        : kind === 'most-likely'
          ? String(data.text)
          : kind === 'picture-pair'
            ? `${data.a}|${data.b}`
            : String(data.word);
  return createHash('sha1').update(basis.trim().toLowerCase()).digest('hex');
}

export function validateContent(kind: ContentKind, data: unknown): Record<string, unknown> {
  const r = CONTENT_SCHEMAS[kind].safeParse(data);
  if (!r.success) throw new AppError('VALIDATION', r.error.issues[0]?.message ?? 'محتوى غير صالح', r.error.issues);
  return r.data;
}

interface Row {
  id: string;
  kind: ContentKind;
  category: string;
  difficulty: ContentItem['difficulty'];
  data: Record<string, unknown>;
}

export class ContentRepo {
  private db: Db;
  private categoryCache: { at: number; map: Record<string, string> } | null = null;
  constructor(db: Db) {
    this.db = db;
  }

  async categoryNames(): Promise<Record<string, string>> {
    if (this.categoryCache && Date.now() - this.categoryCache.at < 60_000) return this.categoryCache.map;
    const r = await this.db.query<{ slug: string; name: string }>('select slug, name from categories', []);
    const map = Object.fromEntries(r.rows.map((x) => [x.slug, x.name]));
    this.categoryCache = { at: Date.now(), map };
    return map;
  }

  invalidateCategories() {
    this.categoryCache = null;
  }

  /**
   * Random selection for a game. Official content plus, when a pack id is
   * given, only that pack's items. Recently used ids are excluded where possible.
   */
  async pick(opts: { kind: ContentKind; count: number; category?: string; difficulty?: string; packId?: string | null; exclude?: string[]; extraWhere?: string }): Promise<ContentItem[]> {
    const cats = categoryList(opts.category);
    if (cats.length < 2) return this.pickRaw({ ...opts, categories: cats });
    // several categories: take an equal share from each so a small category is not drowned by a big one
    const share = Math.ceil(opts.count / cats.length);
    const parts: ContentItem[][] = [];
    for (const c of cats) parts.push(await this.pickRaw({ ...opts, categories: [c], count: share }));
    const picked: ContentItem[] = [];
    const seen = new Set<string>();
    for (let i = 0; picked.length < opts.count && parts.some((p) => i < p.length); i++)
      for (const p of parts) if (i < p.length && picked.length < opts.count && !seen.has(p[i].id)) {
        seen.add(p[i].id);
        picked.push(p[i]);
      }
    if (picked.length < opts.count) {
      // some categories ran dry: fill from all selected ones
      const more = await this.pickRaw({ ...opts, categories: cats, count: opts.count - picked.length, exclude: [...(opts.exclude ?? []), ...seen] });
      for (const m of more) if (!seen.has(m.id) && picked.length < opts.count) picked.push(m);
    }
    // mix the categories up
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    return picked;
  }

  private async pickRaw(opts: { kind: ContentKind; count: number; categories: string[]; difficulty?: string; packId?: string | null; exclude?: string[]; extraWhere?: string }): Promise<ContentItem[]> {
    const params: unknown[] = [opts.kind];
    const where = [`kind = $1`, `status = 'active'`];
    if (opts.packId) {
      params.push(opts.packId);
      where.push(`pack_id = $${params.length}`);
    } else where.push('pack_id is null');
    if (opts.categories.length) {
      params.push(opts.categories);
      where.push(`category = any($${params.length}::text[])`);
    }
    if (opts.difficulty && opts.difficulty !== 'mixed') {
      params.push(opts.difficulty);
      where.push(`difficulty = $${params.length}`);
    }
    if (opts.extraWhere) where.push(opts.extraWhere);
    const base = where.join(' and ');
    params.push(Math.max(1, Math.min(500, opts.count)));
    const limitIdx = params.length;
    let rows: Row[] = [];
    if (opts.exclude?.length) {
      const p2 = [...params, opts.exclude.slice(-300)];
      rows = (await this.db.query<Row>(`select id, kind, category, difficulty, data from content_items where ${base} and not (id = any($${p2.length}::uuid[])) order by random() limit $${limitIdx}`, p2)).rows;
    }
    if (rows.length < opts.count) {
      const have = new Set(rows.map((r) => r.id));
      const more = (await this.db.query<Row>(`select id, kind, category, difficulty, data from content_items where ${base} order by random() limit $${limitIdx}`, params)).rows;
      for (const m of more) if (!have.has(m.id) && rows.length < opts.count) rows.push(m);
    }
    return rows.map((r) => ({ id: r.id, kind: r.kind, category: r.category, difficulty: r.difficulty, data: r.data }));
  }

  /** Insert many items in one transaction; duplicates are skipped. */
  async bulkInsert(
    items: { kind: ContentKind; category: string; difficulty: string; data: unknown; packId?: string | null; status?: string }[],
    createdBy: string | null,
    q?: Queryable,
  ): Promise<{ inserted: number; skipped: number; errors: { index: number; message: string }[] }> {
    const errors: { index: number; message: string }[] = [];
    const cats = new Set(Object.keys(await this.categoryNames()));
    const valid: { kind: ContentKind; category: string; difficulty: string; data: Record<string, unknown>; packId: string | null; status: string; key: string }[] = [];
    items.forEach((it, index) => {
      try {
        if (!CONTENT_KINDS.includes(it.kind)) throw new AppError('VALIDATION', 'نوع غير معروف');
        if (!cats.has(it.category)) throw new AppError('VALIDATION', `تصنيف غير معروف: ${it.category}`);
        if (!['easy', 'medium', 'hard'].includes(it.difficulty)) throw new AppError('VALIDATION', 'صعوبة غير صالحة');
        const data = validateContent(it.kind, it.data);
        valid.push({ kind: it.kind, category: it.category, difficulty: it.difficulty, data, packId: it.packId ?? null, status: it.status ?? 'active', key: dedupeKey(it.kind, data) });
      } catch (e) {
        errors.push({ index, message: (e as Error).message });
      }
    });
    let inserted = 0;
    const run = async (tx: Queryable) => {
      for (let i = 0; i < valid.length; i += 200) {
        const chunk = valid.slice(i, i + 200);
        const params: unknown[] = [];
        const values = chunk.map((v) => {
          params.push(v.kind, v.category, v.difficulty, JSON.stringify(v.data), v.packId, v.status, v.key, createdBy);
          const b = params.length - 8;
          return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}::jsonb, $${b + 5}::uuid, $${b + 6}, $${b + 7}, $${b + 8}::uuid)`;
        });
        const r = await tx.query(
          `insert into content_items (kind, category, difficulty, data, pack_id, status, dedupe_key, created_by) values ${values.join(',')}
           on conflict (kind, coalesce(pack_id, '00000000-0000-0000-0000-000000000000'::uuid), dedupe_key) do nothing`,
          params,
        );
        inserted += r.rowCount;
      }
    };
    if (q) await run(q);
    else await this.db.transaction(run);
    return { inserted, skipped: valid.length - inserted, errors };
  }
}
