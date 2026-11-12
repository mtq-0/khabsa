import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../../shared/errors.ts';
import { isValidAvatar, randomAvatar } from '../../shared/avatars.ts';
import { GAME_IDS } from '../../shared/games.ts';
import { DEFAULT_USER_SETTINGS } from '../../shared/protocol.ts';
import { guestUsername, hashPassword, sha256, toPublicUser, toSessionUser, USER_COLUMNS, verifyPassword, type UserRow } from '../auth/auth.ts';
import { parse, rateLimit, requireRegistered, requireUser, SESSION_COOKIE, setSessionCookie, type AppContext } from '../context.ts';
import { cleanText, containsProfanity } from '../security/text.ts';

const nickname = z
  .string()
  .transform((s) => cleanText(s, 24))
  .pipe(z.string().min(2, 'الاسم لازم يكون حرفين على الأقل').max(24))
  .refine((s) => !containsProfanity(s), 'اختار اسم ألطف 🙂');
const email = z.string().trim().toLowerCase().pipe(z.email('إيميل غير صالح').max(254));
const password = z.string().min(8, 'كلمة السر لازم تكون 8 أحرف على الأقل').max(200);
const username = z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/, 'اسم المستخدم: 3-24 حرف إنجليزي أو رقم أو _');

export function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const issue = async (reply: Parameters<typeof setSessionCookie>[1], userId: string, ua: string | undefined) => {
    const s = await ctx.sessions.create(userId, ua);
    setSessionCookie(ctx, reply, s.token, s.expiresAt);
  };
  const loadUser = async (id: string) => (await ctx.db.query<UserRow>(`select ${USER_COLUMNS} from users where id = $1`, [id])).rows[0];

  app.get('/api/auth/me', async (req) => ({ user: req.user ? toSessionUser(req.user) : null }));

  app.post('/api/auth/guest', async (req, reply) => {
    rateLimit(ctx, 'auth', req.ip);
    const platform = await ctx.platform.settings();
    if (!platform.guestAccess) throw new AppError('FORBIDDEN', 'الدخول كضيف متوقف حالياً. سجّل حساب.');
    const body = parse(z.object({ nickname, avatar: z.string().optional() }), req.body);
    const avatar = isValidAvatar(body.avatar) ? body.avatar : randomAvatar();
    // an existing guest session keeps its identity (and stats) — just update it
    if (req.user) {
      await ctx.db.query('update users set display_name = $2, avatar = $3 where id = $1', [req.user.id, body.nickname, avatar]);
      ctx.sessions.invalidateUser(req.user.id);
      return { user: toSessionUser(await loadUser(req.user.id)) };
    }
    const r = await ctx.db.query<UserRow>(`insert into users (username, display_name, avatar, is_guest) values ($1, $2, $3, true) returning ${USER_COLUMNS}`, [guestUsername(), body.nickname, avatar]);
    await issue(reply, r.rows[0].id, req.headers['user-agent']);
    return { user: toSessionUser(r.rows[0]) };
  });

  app.post('/api/auth/register', async (req, reply) => {
    rateLimit(ctx, 'auth', req.ip);
    const body = parse(z.object({ email, password, username, displayName: nickname, avatar: z.string().optional() }), req.body);
    const hash = await hashPassword(body.password);
    const role = ctx.config.adminEmails.includes(body.email) ? 'admin' : 'user';
    const avatar = isValidAvatar(body.avatar) ? body.avatar : randomAvatar();
    try {
      let user: UserRow;
      if (req.user?.is_guest) {
        // upgrade the current guest in place so history, XP and friends carry over
        const r = await ctx.db.query<UserRow>(
          `update users set email = $2, password_hash = $3, username = $4, display_name = $5, is_guest = false, role = $6 where id = $1 returning ${USER_COLUMNS}`,
          [req.user.id, body.email, hash, body.username, body.displayName, role],
        );
        user = r.rows[0];
        await ctx.sessions.revokeAllForUser(user.id);
      } else {
        const r = await ctx.db.query<UserRow>(
          `insert into users (email, password_hash, username, display_name, avatar, is_guest, role) values ($1, $2, $3, $4, $5, false, $6) returning ${USER_COLUMNS}`,
          [body.email, hash, body.username, body.displayName, avatar, role],
        );
        user = r.rows[0];
      }
      await issue(reply, user.id, req.headers['user-agent']);
      return { user: toSessionUser(user) };
    } catch (e) {
      const msg = String((e as Error).message);
      if (msg.includes('users_email_key')) throw new AppError('CONFLICT', 'الإيميل مستخدم.');
      if (msg.includes('users_username_key')) throw new AppError('CONFLICT', 'اسم المستخدم محجوز.');
      throw e;
    }
  });

  app.post('/api/auth/login', async (req, reply) => {
    rateLimit(ctx, 'auth', req.ip);
    const body = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body);
    rateLimit(ctx, 'auth', `email:${body.email}`);
    const r = await ctx.db.query<UserRow>(`select ${USER_COLUMNS} from users where lower(email) = $1 and not is_guest`, [body.email]);
    const user = r.rows[0];
    // always run a hash comparison so timing does not reveal whether the email exists
    const ok = await verifyPassword(body.password, user?.password_hash ?? 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86));
    if (!user || !ok) throw new AppError('UNAUTHENTICATED', 'الإيميل أو كلمة السر غلط.');
    if (user.banned) throw new AppError('FORBIDDEN', 'هالحساب موقوف.');
    if (ctx.config.adminEmails.includes(body.email) && user.role !== 'admin') await ctx.db.query(`update users set role = 'admin' where id = $1`, [user.id]);
    await issue(reply, user.id, req.headers['user-agent']);
    return { user: toSessionUser({ ...user, role: ctx.config.adminEmails.includes(body.email) ? 'admin' : user.role }) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await ctx.sessions.revoke(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/password', async (req) => {
    const u = requireRegistered(req);
    rateLimit(ctx, 'auth', `pw:${u.id}`);
    const body = parse(z.object({ current: z.string().max(200), next: password }), req.body);
    if (!(await verifyPassword(body.current, u.password_hash))) throw new AppError('UNAUTHENTICATED', 'كلمة السر الحالية غلط.');
    await ctx.db.query('update users set password_hash = $2 where id = $1', [u.id, await hashPassword(body.next)]);
    const token = req.cookies[SESSION_COOKIE]!;
    // revoke every other session
    await ctx.db.query('delete from sessions where user_id = $1 and token_hash <> $2', [u.id, sha256(token)]);
    ctx.sessions.invalidateUser(u.id);
    return { ok: true };
  });

  // ---------------------------------------------------------------- profile
  app.patch('/api/me', async (req) => {
    const u = requireUser(req);
    const body = parse(
      z.object({
        displayName: nickname.optional(),
        avatar: z.string().refine(isValidAvatar, 'أفاتار غير صالح').optional(),
        username: username.optional(),
        removeAvatarImage: z.boolean().optional(),
        favoriteGames: z.array(z.enum(GAME_IDS)).max(GAME_IDS.length).optional(),
        settings: z
          .object({
            sound: z.boolean().optional(),
            music: z.boolean().optional(),
            reducedMotion: z.boolean().optional(),
            allowInvites: z.enum(['everyone', 'friends', 'none']).optional(),
            showOnline: z.boolean().optional(),
          })
          .optional(),
      }),
      req.body,
    );
    if (body.username && u.is_guest) throw new AppError('FORBIDDEN', 'سجّل حساب لتختار اسم مستخدم.');
    const settings = { ...DEFAULT_USER_SETTINGS, ...(u.settings ?? {}), ...(body.settings ?? {}) };
    try {
      await ctx.db.query(
        `update users set display_name = coalesce($2, display_name), avatar = coalesce($3, avatar), username = coalesce($4, username),
           settings = $5::jsonb, favorite_games = coalesce($6, favorite_games), avatar_url = case when $7 then null else avatar_url end
         where id = $1`,
        [u.id, body.displayName ?? null, body.avatar ?? null, body.username ?? null, JSON.stringify(settings), body.favoriteGames ?? null, body.removeAvatarImage === true],
      );
    } catch (e) {
      if (String((e as Error).message).includes('users_username_key')) throw new AppError('CONFLICT', 'اسم المستخدم محجوز.');
      throw e;
    }
    ctx.sessions.invalidateUser(u.id);
    return { user: toSessionUser(await loadUser(u.id)) };
  });

  app.post('/api/me/avatar', async (req) => {
    const u = requireRegistered(req);
    rateLimit(ctx, 'upload', u.id);
    const file = await req.file();
    if (!file) throw new AppError('VALIDATION', 'ما في ملف.');
    const buf = await file.toBuffer();
    let out: Buffer;
    try {
      // decoding + re-encoding strips metadata and rejects non-images/polyglots
      out = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
    } catch {
      throw new AppError('VALIDATION', 'الملف مش صورة صالحة.');
    }
    const id = randomUUID();
    const key = `public/avatars/${id}.webp`;
    await ctx.storage.put(key, out);
    const old = u.avatar_url?.match(/\/media\/avatars\/([a-f0-9-]{36})\.webp$/)?.[1];
    if (old) await ctx.storage.delete(`public/avatars/${old}.webp`);
    await ctx.db.query('update users set avatar_url = $2 where id = $1', [u.id, `/media/avatars/${id}.webp`]);
    ctx.sessions.invalidateUser(u.id);
    return { user: toSessionUser(await loadUser(u.id)) };
  });

  app.get('/api/me/stats', async (req) => {
    const u = requireUser(req);
    return ctx.stats.profileStats(u.id);
  });

  app.get('/api/users/:username', async (req) => {
    const { username: name } = req.params as { username: string };
    const r = await ctx.db.query<UserRow>(`select ${USER_COLUMNS} from users where lower(username) = lower($1) and not banned`, [String(name).slice(0, 40)]);
    const user = r.rows[0];
    if (!user) throw new AppError('NOT_FOUND', 'اللاعب مش موجود.');
    const stats = await ctx.stats.profileStats(user.id);
    let relation: string = 'none';
    if (req.user && req.user.id !== user.id) {
      const f = await ctx.db.query<{ requester_id: string; status: string }>(
        'select requester_id, status from friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)',
        [req.user.id, user.id],
      );
      const b = await ctx.db.query('select 1 from blocks where blocker_id = $1 and blocked_id = $2', [req.user.id, user.id]);
      if (b.rowCount) relation = 'blocked';
      else if (f.rows[0]) relation = f.rows[0].status === 'accepted' ? 'friends' : f.rows[0].requester_id === req.user.id ? 'outgoing' : 'incoming';
    } else if (req.user?.id === user.id) relation = 'self';
    return { user: { ...toPublicUser(user), favoriteGames: user.favorite_games, createdAt: user.created_at }, stats, relation };
  });
}
