import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../shared/errors.ts';
import { GAME_IDS, isGameId } from '../../shared/games.ts';
import { normalizeRoomCode, ROOM_CODE_RE } from '../../shared/protocol.ts';
import { CONTENT_KINDS, KIND_FOR_GAME } from '../content/content.ts';
import type { ContentKind } from '../games/types.ts';
import { parse, rateLimit, requireRegistered, requireUser, type AppContext } from '../context.ts';
import { cleanText } from '../security/text.ts';

export function roomRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/health', async () => {
    await ctx.db.query('select 1', []);
    return { ok: true, time: new Date().toISOString(), voice: ctx.voice.available };
  });

  // TMDB attribution must show whenever TMDB posters are in use (with or without a TMDB key)
  let postersChecked = 0;
  let postersInUse = false;
  const usesTmdb = async () => {
    if (ctx.tmdb.configured) return true;
    if (Date.now() - postersChecked > 5 * 60_000) {
      postersChecked = Date.now();
      postersInUse = (await ctx.db.query<{ e: boolean }>(`select exists(select 1 from content_items where kind = 'word' and status = 'active' and data ? 'poster') as e`)).rows[0].e;
    }
    return postersInUse;
  };

  app.get('/api/platform', async () => {
    const s = await ctx.platform.settings();
    const games = await ctx.platform.games();
    return {
      announcement: s.announcement,
      maintenance: s.maintenance,
      guestAccess: s.guestAccess,
      allowPublicRooms: s.allowPublicRooms,
      voice: ctx.voice.available,
      tmdb: await usesTmdb(),
      games: GAME_IDS.map((id) => ({ id, enabled: games[id]?.enabled ?? true, featured: games[id]?.featured ?? false, sort: games[id]?.sort ?? 0 })),
      online: ctx.rooms.stats(),
    };
  });

  app.get('/api/categories', async (req) => {
    const q = req.query as { game?: string };
    const kind: ContentKind | null = isGameId(q.game) ? KIND_FOR_GAME[q.game] : null;
    const rows = kind
      ? await ctx.db.query(
          `select c.slug, c.name, c.emoji, count(i.id)::int as items from categories c join content_items i on i.category = c.slug
           where i.kind = $1 and i.status = 'active' and i.pack_id is null group by c.slug order by c.sort`,
          [kind],
        )
      : await ctx.db.query('select slug, name, emoji from categories order by sort', []);
    return { categories: rows.rows };
  });

  app.post('/api/rooms', async (req) => {
    const u = requireUser(req);
    rateLimit(ctx, 'roomCreate', u.id);
    const platform = await ctx.platform.settings();
    if (platform.maintenance && u.role !== 'admin') throw new AppError('FORBIDDEN', 'المنصة تحت الصيانة. ارجعلنا بعد شوي.');
    const body = parse(
      z.object({
        visibility: z.enum(['public', 'private']).optional(),
        capacity: z.number().int().min(2).max(12).optional(),
        gameId: z.enum(GAME_IDS).optional(),
        name: z.string().max(60).optional(),
        requestId: z.string().min(8).max(64).optional(),
      }),
      req.body ?? {},
    );
    if (body.gameId && !(await ctx.platform.gameEnabled(body.gameId))) throw new AppError('GAME_DISABLED');
    return ctx.rooms.create(u, body);
  });

  app.post('/api/rooms/quick', async (req) => {
    const u = requireUser(req);
    rateLimit(ctx, 'roomCreate', u.id);
    const body = parse(z.object({ gameId: z.enum(GAME_IDS).optional() }), req.body ?? {});
    return ctx.rooms.quickPlay(u, body.gameId);
  });

  app.get('/api/rooms/public', async () => ({ rooms: ctx.rooms.listPublic() }));

  /** Lets the join form distinguish "invalid code" / "not found" / "full" before connecting. */
  app.get('/api/rooms/:code', async (req) => {
    const u = requireUser(req);
    rateLimit(ctx, 'roomJoin', u.id);
    const code = normalizeRoomCode(String((req.params as { code: string }).code));
    if (!ROOM_CODE_RE.test(code)) throw new AppError('INVALID_CODE');
    const room = ctx.rooms.roomByCode(code);
    if (!room) throw new AppError('ROOM_NOT_FOUND');
    const member = room.members.has(u.id);
    if (room.kicked.has(u.id)) throw new AppError('KICKED');
    return { code, name: room.name, gameId: room.selectedGame, players: room.members.size, capacity: room.capacity, status: room.status, member, full: !member && room.members.size >= room.capacity };
  });

  // ------------------------------------------------------------------ voice
  app.post('/api/voice/token', async (req) => {
    const u = requireUser(req);
    rateLimit(ctx, 'roomJoin', `voice:${u.id}`);
    if (!ctx.voice.available) throw new AppError('VOICE_NOT_CONFIGURED');
    const body = parse(z.object({ code: z.string().max(12) }), req.body);
    const code = normalizeRoomCode(body.code);
    const room = ctx.rooms.roomByCode(code);
    if (!room) throw new AppError('ROOM_NOT_FOUND');
    if (!room.members.has(u.id)) throw new AppError('NOT_MEMBER');
    return ctx.voice.token(room.id, { id: u.id, name: u.display_name, avatar: u.avatar });
  });

  // ------------------------------------------------------- private images
  app.get('/api/game-image/:token', async (req, reply) => {
    const u = requireUser(req);
    const v = ctx.signer.verify(String((req.params as { token: string }).token));
    // the token is bound to one viewer: another player's session cannot use it
    if (!v || v.viewerId !== u.id) throw new AppError('FORBIDDEN', 'رابط الصورة منتهي أو مش إلك.');
    if (v.imageId.startsWith('tmdb:')) {
      const poster = await ctx.tmdb.poster(v.imageId.slice(5));
      reply
        .header('Content-Type', poster.mime)
        .header('Cache-Control', 'private, max-age=300')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cross-Origin-Resource-Policy', 'same-origin');
      return reply.send(poster.data);
    }
    const img = (await ctx.db.query<{ storage_key: string; mime: string }>('select storage_key, mime from images where id = $1', [v.imageId])).rows[0];
    if (!img) throw new AppError('NOT_FOUND');
    const data = await ctx.storage.get(img.storage_key);
    if (!data) throw new AppError('NOT_FOUND');
    reply
      .header('Content-Type', img.mime)
      .header('Cache-Control', 'private, max-age=300')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .header('X-Content-Type-Options', 'nosniff')
      .header('Cross-Origin-Resource-Policy', 'same-origin');
    return reply.send(data);
  });

  // ---------------------------------------------------------- custom packs
  const packKinds = CONTENT_KINDS.filter((k) => k !== 'picture-pair');
  app.get('/api/packs', async (req) => {
    const u = requireUser(req);
    const q = req.query as { game?: string };
    const kind = isGameId(q.game) ? KIND_FOR_GAME[q.game] : null;
    const r = await ctx.db.query(
      `select p.id, p.kind, p.name, p.description, p.official, p.status, p.owner_id = $1 as mine, count(i.id)::int as items
       from content_packs p left join content_items i on i.pack_id = p.id and i.status = 'active'
       where p.status = 'active' and (p.owner_id = $1 or p.official) ${kind ? 'and p.kind = $2' : ''}
       group by p.id order by p.official desc, p.created_at desc`,
      kind ? [u.id, kind] : [u.id],
    );
    return { packs: r.rows };
  });

  app.post('/api/packs', async (req) => {
    const u = requireRegistered(req);
    rateLimit(ctx, 'social', `pack:${u.id}`);
    const body = parse(z.object({ kind: z.enum(packKinds as [ContentKind, ...ContentKind[]]), name: z.string().max(60), description: z.string().max(300).optional() }), req.body);
    const count = (await ctx.db.query<{ n: number }>('select count(*)::int as n from content_packs where owner_id = $1', [u.id])).rows[0].n;
    if (count >= 30) throw new AppError('VALIDATION', 'وصلت للحد الأعلى من الحزم (30).');
    const name = cleanText(body.name, 60);
    if (!name) throw new AppError('VALIDATION');
    const r = await ctx.db.query<{ id: string }>('insert into content_packs (kind, name, description, owner_id) values ($1, $2, $3, $4) returning id', [body.kind, name, cleanText(body.description ?? '', 300), u.id]);
    return { id: r.rows[0].id };
  });

  const ownPack = async (packId: string, userId: string) => {
    const p = (await ctx.db.query<{ id: string; kind: ContentKind; owner_id: string }>('select id, kind, owner_id from content_packs where id = $1', [packId])).rows[0];
    if (!p) throw new AppError('NOT_FOUND');
    if (p.owner_id !== userId) throw new AppError('FORBIDDEN');
    return p;
  };

  app.get('/api/packs/:id/items', async (req) => {
    const u = requireUser(req);
    const id = parse(z.uuid(), (req.params as { id: string }).id);
    await ownPack(id, u.id);
    const r = await ctx.db.query('select id, category, difficulty, data, status from content_items where pack_id = $1 order by created_at', [id]);
    return { items: r.rows };
  });

  app.post('/api/packs/:id/items', async (req) => {
    const u = requireRegistered(req);
    rateLimit(ctx, 'upload', u.id);
    const id = parse(z.uuid(), (req.params as { id: string }).id);
    const pack = await ownPack(id, u.id);
    const body = parse(z.object({ items: z.array(z.object({ data: z.unknown(), difficulty: z.enum(['easy', 'medium', 'hard']).optional() })).min(1).max(500) }), req.body);
    const existing = (await ctx.db.query<{ n: number }>('select count(*)::int as n from content_items where pack_id = $1', [id])).rows[0].n;
    if (existing + body.items.length > 1000) throw new AppError('VALIDATION', 'الحزمة ما بتساع أكثر من 1000 عنصر.');
    return ctx.content.bulkInsert(
      body.items.map((it) => ({ kind: pack.kind, category: 'custom', difficulty: it.difficulty ?? 'medium', data: it.data, packId: id })),
      u.id,
    );
  });

  app.delete('/api/packs/:id/items/:itemId', async (req) => {
    const u = requireUser(req);
    const p = req.params as { id: string; itemId: string };
    await ownPack(parse(z.uuid(), p.id), u.id);
    await ctx.db.query('delete from content_items where id = $1 and pack_id = $2', [parse(z.uuid(), p.itemId), p.id]);
    return { ok: true };
  });

  app.delete('/api/packs/:id', async (req) => {
    const u = requireUser(req);
    const id = parse(z.uuid(), (req.params as { id: string }).id);
    await ownPack(id, u.id);
    await ctx.db.query('delete from content_packs where id = $1', [id]);
    return { ok: true };
  });

}
