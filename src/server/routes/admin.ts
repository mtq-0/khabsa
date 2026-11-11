import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError } from '../../shared/errors.ts';
import { GAME_IDS } from '../../shared/games.ts';
import { toSessionUser, USER_COLUMNS, type UserRow } from '../auth/auth.ts';
import { CONTENT_KINDS, dedupeKey, validateContent } from '../content/content.ts';
import { tmdbQueryFor } from '../db/seed/wordPictures.ts';
import { csvToItems, toCsv } from '../content/csv.ts';
import type { ContentKind } from '../games/types.ts';
import { audit, parse, rateLimit, requireAdmin, type AppContext } from '../context.ts';

const kindEnum = z.enum(CONTENT_KINDS as [ContentKind, ...ContentKind[]]);
const difficulty = z.enum(['easy', 'medium', 'hard']);
const status = z.enum(['active', 'pending', 'disabled']);

export function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/admin')) requireAdmin(req);
  });

  app.get('/api/admin/overview', async () => {
    const q = async (sql: string) => (await ctx.db.query<{ n: number }>(sql, [])).rows[0].n;
    const [users, registered, guests, matches, matchesToday, reportsOpen, content, newUsersWeek] = await Promise.all([
      q('select count(*)::int as n from users'),
      q('select count(*)::int as n from users where not is_guest'),
      q('select count(*)::int as n from users where is_guest'),
      q('select count(*)::int as n from matches where ended_at is not null'),
      q(`select count(*)::int as n from matches where started_at > now() - interval '1 day'`),
      q(`select count(*)::int as n from reports where status = 'open'`),
      q(`select count(*)::int as n from content_items`),
      q(`select count(*)::int as n from users where created_at > now() - interval '7 days'`),
    ]);
    const perGame = (await ctx.db.query(`select game_id, count(*)::int as matches, coalesce(avg(player_count),0)::float as avg_players from matches where ended_at is not null group by game_id`, [])).rows;
    const daily = (
      await ctx.db.query(
        `select to_char(date_trunc('day', started_at), 'YYYY-MM-DD') as day, count(*)::int as matches from matches where started_at > now() - interval '14 days' group by 1 order by 1`,
        [],
      )
    ).rows;
    const contentByKind = (await ctx.db.query(`select kind, status, count(*)::int as n from content_items group by kind, status order by kind`, [])).rows;
    return { users, registered, guests, matches, matchesToday, reportsOpen, content, newUsersWeek, perGame, daily, contentByKind, live: ctx.rooms.stats() };
  });

  // ------------------------------------------------------------------ games
  app.get('/api/admin/games', async () => ({ games: (await ctx.db.query('select id, enabled, featured, sort, updated_at from games order by sort', [])).rows }));
  app.patch('/api/admin/games/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = parse(z.enum(GAME_IDS), (req.params as { id: string }).id);
    const body = parse(z.object({ enabled: z.boolean().optional(), featured: z.boolean().optional(), sort: z.number().int().min(0).max(100).optional() }), req.body);
    await ctx.db.query('update games set enabled = coalesce($2, enabled), featured = coalesce($3, featured), sort = coalesce($4, sort), updated_at = now() where id = $1', [id, body.enabled ?? null, body.featured ?? null, body.sort ?? null]);
    ctx.platform.invalidate();
    await audit(ctx, admin.id, 'game.update', id, body);
    return { ok: true };
  });

  // ------------------------------------------------------------- categories
  app.get('/api/admin/categories', async () => ({
    categories: (await ctx.db.query('select c.slug, c.name, c.emoji, c.sort, count(i.id)::int as items from categories c left join content_items i on i.category = c.slug group by c.slug order by c.sort', [])).rows,
  }));
  app.post('/api/admin/categories', async (req) => {
    const admin = requireAdmin(req);
    const body = parse(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,40}$/), name: z.string().min(1).max(40), emoji: z.string().max(8).optional(), sort: z.number().int().optional() }), req.body);
    await ctx.db.query('insert into categories (slug, name, emoji, sort) values ($1, $2, $3, $4) on conflict (slug) do update set name = excluded.name, emoji = excluded.emoji, sort = excluded.sort', [
      body.slug,
      body.name,
      body.emoji ?? '🎲',
      body.sort ?? 100,
    ]);
    ctx.content.invalidateCategories();
    await audit(ctx, admin.id, 'category.upsert', body.slug, body);
    return { ok: true };
  });
  app.delete('/api/admin/categories/:slug', async (req) => {
    const admin = requireAdmin(req);
    const slug = String((req.params as { slug: string }).slug);
    const used = (await ctx.db.query<{ n: number }>('select count(*)::int as n from content_items where category = $1', [slug])).rows[0].n;
    if (used) throw new AppError('CONFLICT', `التصنيف مستخدم في ${used} عنصر.`);
    await ctx.db.query('delete from categories where slug = $1', [slug]);
    ctx.content.invalidateCategories();
    await audit(ctx, admin.id, 'category.delete', slug);
    return { ok: true };
  });

  // ---------------------------------------------------------------- content
  app.get('/api/admin/content', async (req) => {
    const q = parse(
      z.object({
        kind: kindEnum,
        status: status.optional(),
        category: z.string().max(40).optional(),
        q: z.string().max(80).optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        packs: z.enum(['official', 'all']).default('official'),
      }),
      req.query,
    );
    const params: unknown[] = [q.kind];
    const where = ['i.kind = $1'];
    if (q.packs === 'official') where.push('i.pack_id is null');
    if (q.status) where.push(`i.status = $${params.push(q.status)}`);
    if (q.category) where.push(`i.category = $${params.push(q.category)}`);
    if (q.q) where.push(`i.data::text ilike $${params.push('%' + q.q.replace(/[%_\\]/g, '\\$&') + '%')}`);
    const total = (await ctx.db.query<{ n: number }>(`select count(*)::int as n from content_items i where ${where.join(' and ')}`, params)).rows[0].n;
    const rows = (
      await ctx.db.query(
        `select i.id, i.kind, i.category, i.difficulty, i.data, i.status, i.pack_id, p.name as pack_name, i.created_at, i.updated_at
         from content_items i left join content_packs p on p.id = i.pack_id where ${where.join(' and ')} order by i.created_at desc, i.id limit 50 offset ${(q.page - 1) * 50}`,
        params,
      )
    ).rows;
    return { total, page: q.page, pageSize: 50, items: rows };
  });

  app.post('/api/admin/content', async (req) => {
    const admin = requireAdmin(req);
    const body = parse(z.object({ kind: kindEnum, category: z.string(), difficulty, data: z.unknown(), status: status.optional() }), req.body);
    const res = await ctx.content.bulkInsert([{ ...body, status: body.status ?? 'active' }], admin.id);
    if (res.errors.length) throw new AppError('VALIDATION', res.errors[0].message);
    if (!res.inserted) throw new AppError('CONFLICT', 'هالعنصر موجود قبل.');
    await audit(ctx, admin.id, 'content.create', body.kind, body);
    return res;
  });

  app.patch('/api/admin/content/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = parse(z.uuid(), (req.params as { id: string }).id);
    const body = parse(z.object({ category: z.string().optional(), difficulty: difficulty.optional(), data: z.unknown().optional(), status: status.optional() }), req.body);
    const cur = (await ctx.db.query<{ kind: ContentKind }>('select kind from content_items where id = $1', [id])).rows[0];
    if (!cur) throw new AppError('NOT_FOUND');
    let dataJson: string | null = null;
    let key: string | null = null;
    if (body.data !== undefined) {
      const data = validateContent(cur.kind, body.data);
      dataJson = JSON.stringify(data);
      key = dedupeKey(cur.kind, data);
    }
    if (body.category) {
      const c = await ctx.db.query('select 1 from categories where slug = $1', [body.category]);
      if (!c.rowCount) throw new AppError('VALIDATION', 'تصنيف غير معروف');
    }
    try {
      await ctx.db.query(
        `update content_items set category = coalesce($2, category), difficulty = coalesce($3, difficulty), data = coalesce($4::jsonb, data),
           dedupe_key = coalesce($5, dedupe_key), status = coalesce($6, status), updated_at = now() where id = $1`,
        [id, body.category ?? null, body.difficulty ?? null, dataJson, key, body.status ?? null],
      );
    } catch (e) {
      if (String((e as Error).message).includes('content_items_dedupe_key')) throw new AppError('CONFLICT', 'في عنصر مطابق.');
      throw e;
    }
    await audit(ctx, admin.id, 'content.update', id, body);
    return { ok: true };
  });

  app.delete('/api/admin/content/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = parse(z.uuid(), (req.params as { id: string }).id);
    await ctx.db.query('delete from content_items where id = $1', [id]);
    await audit(ctx, admin.id, 'content.delete', id);
    return { ok: true };
  });

  app.post('/api/admin/content/bulk-status', async (req) => {
    const admin = requireAdmin(req);
    const body = parse(z.object({ ids: z.array(z.uuid()).min(1).max(500), status }), req.body);
    const r = await ctx.db.query('update content_items set status = $2, updated_at = now() where id = any($1::uuid[])', [body.ids, body.status]);
    await audit(ctx, admin.id, 'content.bulk-status', null, { count: r.rowCount, status: body.status });
    return { updated: r.rowCount };
  });

  /** Import JSON ([{kind?, category, difficulty, data}]) or CSV text. Up to 5000 rows per request. */
  app.post('/api/admin/content/import', { bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const admin = requireAdmin(req);
    rateLimit(ctx, 'upload', admin.id);
    const body = parse(
      z.object({ kind: kindEnum, format: z.enum(['json', 'csv']), payload: z.string().max(9_000_000), status: status.optional() }),
      req.body,
    );
    let rows: { category: string; difficulty: string; data: unknown }[];
    if (body.format === 'csv') rows = csvToItems(body.kind, body.payload);
    else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.payload);
      } catch {
        throw new AppError('VALIDATION', 'JSON غير صالح.');
      }
      if (!Array.isArray(parsed)) throw new AppError('VALIDATION', 'لازم يكون مصفوفة JSON.');
      rows = parsed.map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return { category: String(o.category ?? 'custom'), difficulty: String(o.difficulty ?? 'medium'), data: o.data ?? o };
      });
    }
    if (rows.length > 5000) throw new AppError('VALIDATION', 'الحد الأعلى 5000 صف بكل مرة.');
    if (body.kind === 'picture-pair') throw new AppError('VALIDATION', 'أزواج الصور بتنضاف من قسم الصور.');
    const res = await ctx.content.bulkInsert(rows.map((r) => ({ ...r, kind: body.kind, status: body.status ?? 'active' })), admin.id);
    await audit(ctx, admin.id, 'content.import', body.kind, { inserted: res.inserted, skipped: res.skipped, errors: res.errors.length });
    return { ...res, errors: res.errors.slice(0, 50), errorCount: res.errors.length, total: rows.length };
  });

  app.get('/api/admin/content/export', async (req, reply) => {
    const q = parse(z.object({ kind: kindEnum, format: z.enum(['json', 'csv']).default('json') }), req.query);
    const rows = (await ctx.db.query<{ category: string; difficulty: string; data: Record<string, unknown>; status: string }>('select category, difficulty, data, status from content_items where kind = $1 and pack_id is null order by created_at', [q.kind])).rows;
    reply.header('Content-Disposition', `attachment; filename="khabsa-${q.kind}.${q.format}"`);
    if (q.format === 'json') {
      reply.header('Content-Type', 'application/json; charset=utf-8');
      return JSON.stringify(rows, null, 1);
    }
    const lists = (v: unknown) => (Array.isArray(v) ? v.join('|') : String(v ?? ''));
    const fields: Record<string, string[]> = {
      'question-pair': ['majority', 'outsider'],
      word: ['word', 'alternatives'],
      'draw-word': ['word', 'alternatives'],
      'most-likely': ['text'],
      'taboo-card': ['word', 'forbidden'],
      trivia: ['question', 'options', 'answer'],
      'picture-pair': ['labelA', 'labelB', 'mode', 'a', 'b'],
    };
    const f = fields[q.kind];
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    return '\uFEFF' + toCsv([['category', 'difficulty', 'status', ...f], ...rows.map((r) => [r.category, r.difficulty, r.status, ...f.map((k) => lists(r.data[k]))])]);
  });

  // ----------------------------------------------------------------- images
  app.post('/api/admin/images', async (req) => {
    const admin = requireAdmin(req);
    rateLimit(ctx, 'upload', admin.id);
    const file = await req.file();
    if (!file) throw new AppError('VALIDATION', 'ما في ملف.');
    if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.mimetype)) throw new AppError('VALIDATION', 'نوع الملف لازم يكون صورة PNG/JPEG/WebP.');
    const buf = await file.toBuffer();
    let out: Buffer;
    let meta: { width?: number; height?: number };
    try {
      const img = sharp(buf, { limitInputPixels: 50_000_000 }).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true });
      out = await img.webp({ quality: 80 }).toBuffer();
      meta = await sharp(out).metadata();
    } catch {
      throw new AppError('VALIDATION', 'الملف مش صورة صالحة.');
    }
    const id = randomUUID();
    const key = `private/images/${id}.webp`;
    await ctx.storage.put(key, out);
    await ctx.db.query('insert into images (id, storage_key, mime, bytes, width, height, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7)', [id, key, 'image/webp', out.length, meta.width ?? null, meta.height ?? null, admin.id]);
    await audit(ctx, admin.id, 'image.upload', id, { bytes: out.length });
    return { id, width: meta.width, height: meta.height, bytes: out.length };
  });

  app.get('/api/admin/images/:id', async (req, reply) => {
    const id = parse(z.uuid(), (req.params as { id: string }).id);
    const img = (await ctx.db.query<{ storage_key: string; mime: string }>('select storage_key, mime from images where id = $1', [id])).rows[0];
    if (!img) throw new AppError('NOT_FOUND');
    const data = await ctx.storage.get(img.storage_key);
    if (!data) throw new AppError('NOT_FOUND');
    reply.header('Content-Type', img.mime).header('Cache-Control', 'private, no-store').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return reply.send(data);
  });

  app.post('/api/admin/picture-pairs', async (req) => {
    const admin = requireAdmin(req);
    const body = parse(
      z.object({ imageA: z.uuid(), imageB: z.uuid(), labelA: z.string().min(1).max(60), labelB: z.string().min(1).max(60), mode: z.enum(['normal', 'hard']), category: z.string() }),
      req.body,
    );
    if (body.imageA === body.imageB) throw new AppError('VALIDATION', 'لازم صورتين مختلفات.');
    const imgs = await ctx.db.query('select id from images where id = any($1::uuid[])', [[body.imageA, body.imageB]]);
    if (imgs.rowCount !== 2) throw new AppError('NOT_FOUND', 'الصور مش موجودة.');
    const res = await ctx.content.bulkInsert(
      [{ kind: 'picture-pair', category: body.category, difficulty: body.mode === 'hard' ? 'hard' : 'medium', data: { a: body.imageA, b: body.imageB, labelA: body.labelA, labelB: body.labelB, mode: body.mode } }],
      admin.id,
    );
    if (res.errors.length) throw new AppError('VALIDATION', res.errors[0].message);
    await audit(ctx, admin.id, 'picture-pair.create', null, body);
    return res;
  });

  // ------------------------------------------------------------------ TMDB
  const POSTER_CATEGORIES = ['cartoons', 'movies', 'tv'];
  app.get('/api/admin/tmdb/words', async () => {
    const r = await ctx.db.query<{ id: string; category: string; data: { word: string; poster?: unknown; image?: string } }>(
      `select id, category, data from content_items where kind = 'word' and pack_id is null and category = any($1::text[]) order by category, data->>'word'`,
      [POSTER_CATEGORIES],
    );
    return {
      configured: ctx.tmdb.configured,
      words: r.rows.map((w) => ({ id: w.id, category: w.category, word: w.data.word, poster: w.data.poster ?? null, hasPicture: !!w.data.image, suggestedQuery: tmdbQueryFor(w.data.word) })),
    };
  });

  app.post('/api/admin/tmdb/search', async (req) => {
    const admin = requireAdmin(req);
    rateLimit(ctx, 'upload', `tmdb:${admin.id}`);
    const body = parse(z.object({ items: z.array(z.object({ id: z.uuid(), query: z.string().min(1).max(80).optional() })).min(1).max(30) }), req.body);
    const rows = (await ctx.db.query<{ id: string; data: { word: string } }>(`select id, data from content_items where id = any($1::uuid[]) and kind = 'word'`, [body.items.map((i) => i.id)])).rows;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const out: { id: string; query: string; match: unknown; error?: string }[] = [];
    // small concurrency to stay well within TMDB rate limits
    const queue = [...body.items];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let it = queue.shift(); it; it = queue.shift()) {
          const row = byId.get(it.id);
          if (!row) continue;
          const query = it.query ?? tmdbQueryFor(row.data.word);
          if (!query) {
            out.push({ id: it.id, query: '', match: null, error: 'كلمة عامة مش اسم عمل، خليناها على الرسمة. اكتب اسم للبحث إذا بدك.' });
            continue;
          }
          try {
            out.push({ id: it.id, query, match: await ctx.tmdb.search(query) });
          } catch (e) {
            if (e instanceof AppError && (e.code === 'FORBIDDEN' || e.code === 'VALIDATION')) throw e;
            out.push({ id: it.id, query, match: null, error: (e as Error).message });
          }
        }
      }),
    );
    return { results: out };
  });

  app.post('/api/admin/tmdb/apply', async (req) => {
    const admin = requireAdmin(req);
    const body = parse(
      z.object({
        id: z.uuid(),
        poster: z.object({ tmdbId: z.number().int().positive(), type: z.enum(['movie', 'tv']), path: z.string(), title: z.string().max(120).optional() }).nullable(),
      }),
      req.body,
    );
    const cur = (await ctx.db.query<{ data: Record<string, unknown> }>(`select data from content_items where id = $1 and kind = 'word'`, [body.id])).rows[0];
    if (!cur) throw new AppError('NOT_FOUND');
    const next = { ...cur.data };
    if (body.poster) next.poster = body.poster;
    else delete next.poster;
    const data = validateContent('word', next);
    await ctx.db.query('update content_items set data = $2::jsonb, updated_at = now() where id = $1', [body.id, JSON.stringify(data)]);
    await audit(ctx, admin.id, body.poster ? 'tmdb.apply' : 'tmdb.remove', body.id, body.poster ?? {});
    return { ok: true };
  });

  app.get('/api/admin/tmdb/poster', async (req, reply) => {
    const q = parse(z.object({ path: z.string().max(80), size: z.enum(['w185', 'w342', 'w500']).default('w185') }), req.query);
    const p = await ctx.tmdb.poster(q.path, q.size);
    return reply.header('Content-Type', p.mime).header('Cache-Control', 'private, max-age=3600').send(p.data);
  });

  // ---------------------------------------------------------------- reports
  app.get('/api/admin/reports', async (req) => {
    const q = parse(z.object({ status: z.enum(['open', 'resolved', 'dismissed']).default('open') }), req.query);
    const r = await ctx.db.query(
      `select r.id, r.reason, r.details, r.status, r.room_code, r.created_at, r.resolution, r.content_item_id,
              rep.id as reporter_id, rep.display_name as reporter_name, t.id as target_id, t.display_name as target_name, t.username as target_username, t.banned as target_banned,
              ci.kind as content_kind, ci.data as content_data
       from reports r join users rep on rep.id = r.reporter_id left join users t on t.id = r.target_user_id left join content_items ci on ci.id = r.content_item_id
       where r.status = $1 order by r.created_at desc limit 100`,
      [q.status],
    );
    return { reports: r.rows };
  });

  app.patch('/api/admin/reports/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = parse(z.uuid(), (req.params as { id: string }).id);
    const body = parse(z.object({ status: z.enum(['resolved', 'dismissed']), resolution: z.string().max(500).optional() }), req.body);
    await ctx.db.query('update reports set status = $2, resolution = $3, resolved_by = $4, resolved_at = now() where id = $1', [id, body.status, body.resolution ?? null, admin.id]);
    await audit(ctx, admin.id, 'report.' + body.status, id, body);
    return { ok: true };
  });

  // ------------------------------------------------------------------ users
  app.get('/api/admin/users', async (req) => {
    const q = parse(z.object({ q: z.string().max(80).optional() }), req.query);
    const like = '%' + (q.q ?? '').replace(/[%_\\]/g, '\\$&') + '%';
    const r = await ctx.db.query<UserRow>(
      `select ${USER_COLUMNS} from users where ($1 = '%%' or lower(username) like lower($1) or lower(display_name) like lower($1) or lower(coalesce(email,'')) like lower($1)) order by created_at desc limit 100`,
      [like],
    );
    return { users: r.rows.map((u) => ({ ...toSessionUser(u), banned: u.banned, createdAt: u.created_at, lastSeenAt: u.last_seen_at })) };
  });

  app.patch('/api/admin/users/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = parse(z.uuid(), (req.params as { id: string }).id);
    const body = parse(z.object({ banned: z.boolean().optional(), role: z.enum(['user', 'admin']).optional() }), req.body);
    if (id === admin.id && (body.banned || body.role === 'user')) throw new AppError('VALIDATION', 'ما بتقدر توقف أو تنزّل حسابك.');
    await ctx.db.query('update users set banned = coalesce($2, banned), role = coalesce($3, role) where id = $1', [id, body.banned ?? null, body.role ?? null]);
    if (body.banned) await ctx.sessions.revokeAllForUser(id);
    ctx.sessions.invalidateUser(id);
    await audit(ctx, admin.id, 'user.update', id, body);
    return { ok: true };
  });

  // --------------------------------------------------------------- settings
  app.get('/api/admin/settings', async () => ({ settings: await ctx.platform.settings() }));
  app.patch('/api/admin/settings', async (req) => {
    const admin = requireAdmin(req);
    const body = parse(
      z.object({
        maintenance: z.boolean().optional(),
        announcement: z.string().max(300).optional(),
        maxRoomCapacity: z.number().int().min(2).max(12).optional(),
        guestAccess: z.boolean().optional(),
        allowPublicRooms: z.boolean().optional(),
        chatEnabled: z.boolean().optional(),
      }),
      req.body,
    );
    for (const [k, v] of Object.entries(body)) {
      await ctx.db.query('insert into platform_settings (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now()', [k, JSON.stringify(v)]);
    }
    ctx.platform.invalidate();
    await audit(ctx, admin.id, 'settings.update', null, body);
    return { settings: await ctx.platform.settings() };
  });

  app.get('/api/admin/audit', async () => ({
    entries: (await ctx.db.query('select a.id, a.action, a.target, a.details, a.created_at, u.display_name as actor from audit_log a left join users u on u.id = a.actor_id order by a.created_at desc limit 200', [])).rows,
  }));

  app.get('/api/admin/packs', async () => ({
    packs: (
      await ctx.db.query(
        `select p.id, p.kind, p.name, p.official, p.status, p.created_at, u.display_name as owner, count(i.id)::int as items
         from content_packs p left join users u on u.id = p.owner_id left join content_items i on i.pack_id = p.id group by p.id, u.display_name order by p.created_at desc limit 200`,
        [],
      )
    ).rows,
  }));
  app.patch('/api/admin/packs/:id', async (req) => {
    const admin = requireAdmin(req);
    const id = parse(z.uuid(), (req.params as { id: string }).id);
    const body = parse(z.object({ official: z.boolean().optional(), status: status.optional() }), req.body);
    await ctx.db.query('update content_packs set official = coalesce($2, official), status = coalesce($3, status) where id = $1', [id, body.official ?? null, body.status ?? null]);
    await audit(ctx, admin.id, 'pack.update', id, body);
    return { ok: true };
  });
}
