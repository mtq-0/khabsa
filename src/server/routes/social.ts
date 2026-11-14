import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../shared/errors.ts';
import { isGameId } from '../../shared/games.ts';
import { DEFAULT_USER_SETTINGS, levelForXp, normalizeRoomCode, type InviteView } from '../../shared/protocol.ts';
import { toPublicUser, USER_COLUMNS, type UserRow } from '../auth/auth.ts';
import { parse, rateLimit, requireRegistered, requireUser, type AppContext } from '../context.ts';
import { cleanMultiline } from '../security/text.ts';

const uuid = z.uuid();

export interface Presence {
  isOnline(userId: string): boolean;
}

export function socialRoutes(app: FastifyInstance, ctx: AppContext, presence: Presence) {
  const userCols = USER_COLUMNS.split(', ').map((c) => 'u.' + c).join(', ');
  const pub = (u: UserRow) => {
    const showOnline = (u.settings?.showOnline ?? DEFAULT_USER_SETTINGS.showOnline) !== false;
    return { ...toPublicUser(u), online: showOnline && presence.isOnline(u.id) };
  };
  const isBlocked = async (a: string, b: string) =>
    (await ctx.db.query('select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)', [a, b])).rowCount > 0;
  const notify = (userId: string) => ctx.io.to(`user:${userId}`).emit('friends:update');

  app.get('/api/friends', async (req) => {
    const me = requireUser(req);
    const rows = await ctx.db.query<UserRow & { requester_id: string; status: string; created_at_f: string }>(
      `select ${userCols}, f.requester_id, f.status, f.created_at as created_at_f from friendships f
       join users u on u.id = case when f.requester_id = $1 then f.addressee_id else f.requester_id end
       where (f.requester_id = $1 or f.addressee_id = $1) and not u.banned order by u.display_name`,
      [me.id],
    );
    const recent = await ctx.db.query<UserRow & { last_played_at: string; game_id: string }>(
      `select ${userCols}, r.last_played_at, r.game_id from recent_players r join users u on u.id = r.other_id
       where r.user_id = $1 and not u.banned order by r.last_played_at desc limit 20`,
      [me.id],
    );
    const blocked = await ctx.db.query<UserRow>(`select ${userCols} from blocks b join users u on u.id = b.blocked_id where b.blocker_id = $1`, [me.id]);
    return {
      friends: rows.rows.filter((r) => r.status === 'accepted').map(pub),
      incoming: rows.rows.filter((r) => r.status === 'pending' && r.requester_id !== me.id).map(pub),
      outgoing: rows.rows.filter((r) => r.status === 'pending' && r.requester_id === me.id).map(pub),
      recent: recent.rows.map((r) => ({ ...pub(r), lastPlayedAt: r.last_played_at, gameId: r.game_id })),
      blocked: blocked.rows.map((u) => toPublicUser(u)),
    };
  });

  app.get('/api/users/search', async (req) => {
    requireUser(req);
    const q = String((req.query as { q?: string }).q ?? '').trim().slice(0, 24);
    if (q.length < 2) return { users: [] };
    const like = q.replace(/[%_\\]/g, '\\$&') + '%';
    const r = await ctx.db.query<UserRow>(
      `select ${USER_COLUMNS} from users where not is_guest and not banned and (lower(username) like lower($1) or lower(display_name) like lower($1)) order by xp desc limit 15`,
      [like],
    );
    return { users: r.rows.map(pub) };
  });

  app.post('/api/friends/request', async (req) => {
    const me = requireRegistered(req);
    rateLimit(ctx, 'social', me.id);
    const body = parse(z.object({ userId: uuid.optional(), username: z.string().max(40).optional() }), req.body);
    // the ID is the username: "@sara_j", " Sara_J " and "sara_j" are the same
    const uname = (body.username ?? '').trim().replace(/^@+/, '').trim();
    if (!body.userId && !/^[A-Za-z0-9_]{3,24}$/.test(uname)) throw new AppError('VALIDATION', 'اكتب الـID بالإنجليزي (حروف وأرقام و _ بس)، مثل sara_j');
    const target = (
      await ctx.db.query<UserRow>(`select ${USER_COLUMNS} from users where ${body.userId ? 'id = $1' : 'lower(username) = lower($1)'} and not banned`, [body.userId ?? uname])
    ).rows[0];
    if (!target) throw new AppError('NOT_FOUND', 'ما لقينا لاعب بهالـID. تأكد من الاسم (بين @ وبدون مسافات).');
    if (target.id === me.id) throw new AppError('VALIDATION', 'ما بتقدر تضيف حالك 😄');
    if (target.is_guest) throw new AppError('VALIDATION', 'الضيوف ما بينضافوا كأصحاب. خلّيه يسجّل حساب.');
    if (await isBlocked(me.id, target.id)) throw new AppError('FORBIDDEN');
    const existing = (
      await ctx.db.query<{ requester_id: string; status: string }>(
        'select requester_id, status from friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)',
        [me.id, target.id],
      )
    ).rows[0];
    if (existing?.status === 'accepted') return { status: 'friends', user: pub(target) };
    if (existing && existing.requester_id === target.id) {
      // they already asked me: accept
      await ctx.db.query(`update friendships set status = 'accepted', responded_at = now() where requester_id = $1 and addressee_id = $2`, [target.id, me.id]);
      await ctx.stats.checkAchievements(ctx.db, me.id);
      await ctx.stats.checkAchievements(ctx.db, target.id);
      notify(target.id);
      return { status: 'friends', user: pub(target) };
    }
    if (!existing) await ctx.db.query('insert into friendships (requester_id, addressee_id) values ($1, $2) on conflict do nothing', [me.id, target.id]);
    notify(target.id);
    return { status: 'outgoing', user: pub(target) };
  });

  app.post('/api/friends/respond', async (req) => {
    const me = requireRegistered(req);
    const body = parse(z.object({ userId: uuid, accept: z.boolean() }), req.body);
    if (body.accept) {
      const r = await ctx.db.query(`update friendships set status = 'accepted', responded_at = now() where requester_id = $1 and addressee_id = $2 and status = 'pending'`, [body.userId, me.id]);
      if (!r.rowCount) throw new AppError('NOT_FOUND', 'ما في طلب صداقة.');
      await ctx.stats.checkAchievements(ctx.db, me.id);
      await ctx.stats.checkAchievements(ctx.db, body.userId);
    } else {
      await ctx.db.query(`delete from friendships where requester_id = $1 and addressee_id = $2 and status = 'pending'`, [body.userId, me.id]);
    }
    notify(body.userId);
    return { ok: true };
  });

  app.delete('/api/friends/:userId', async (req) => {
    const me = requireUser(req);
    const id = parse(uuid, (req.params as { userId: string }).userId);
    await ctx.db.query('delete from friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)', [me.id, id]);
    notify(id);
    return { ok: true };
  });

  app.post('/api/blocks', async (req) => {
    const me = requireUser(req);
    const body = parse(z.object({ userId: uuid }), req.body);
    if (body.userId === me.id) throw new AppError('VALIDATION');
    await ctx.db.transaction(async (tx) => {
      await tx.query('insert into blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing', [me.id, body.userId]);
      await tx.query('delete from friendships where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)', [me.id, body.userId]);
      await tx.query(`update room_invites set status = 'declined' where status = 'pending' and ((from_user = $1 and to_user = $2) or (from_user = $2 and to_user = $1))`, [me.id, body.userId]);
    });
    return { ok: true };
  });

  app.delete('/api/blocks/:userId', async (req) => {
    const me = requireUser(req);
    const id = parse(uuid, (req.params as { userId: string }).userId);
    await ctx.db.query('delete from blocks where blocker_id = $1 and blocked_id = $2', [me.id, id]);
    return { ok: true };
  });

  // ------------------------------------------------------------ invitations
  app.post('/api/invites', async (req) => {
    const me = requireUser(req);
    rateLimit(ctx, 'social', me.id);
    const body = parse(z.object({ code: z.string().max(12), userId: uuid }), req.body);
    const code = normalizeRoomCode(body.code);
    if (!ctx.rooms.isMember(code, me.id)) throw new AppError('NOT_MEMBER');
    const target = (await ctx.db.query<UserRow>(`select ${USER_COLUMNS} from users where id = $1 and not banned`, [body.userId])).rows[0];
    if (!target || target.id === me.id) throw new AppError('NOT_FOUND');
    if (await isBlocked(me.id, target.id)) throw new AppError('FORBIDDEN');
    // invitations only go to ACCEPTED friends (everybody else can still join with the room link/code)
    const f = await ctx.db.query(`select 1 from friendships where status = 'accepted' and ((requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1))`, [me.id, target.id]);
    if (!f.rowCount) throw new AppError('FORBIDDEN', 'بتقدر تعزم أصحابك بس. ضيفه كصديق أول (من صفحة الأصحاب).');
    if ((target.settings?.allowInvites ?? 'friends') === 'none') throw new AppError('FORBIDDEN', 'هاللاعب مسكّر الدعوات.');
    const r = await ctx.db.query<{ id: string; created_at: string }>(
      `insert into room_invites (room_code, from_user, to_user) values ($1, $2, $3)
       on conflict (room_code, from_user, to_user) where status = 'pending' do update set created_at = now() returning id, created_at`,
      [code, me.id, target.id],
    );
    const room = ctx.rooms.roomByCode(code)!;
    const invite: InviteView = { id: r.rows[0].id, roomCode: code, roomName: room.name, gameId: room.selectedGame, from: toPublicUser(me), createdAt: r.rows[0].created_at };
    ctx.io.to(`user:${target.id}`).emit('invite:new', invite);
    return { ok: true };
  });

  app.get('/api/invites', async (req) => {
    const me = requireUser(req);
    await ctx.db.query(`update room_invites set status = 'expired' where to_user = $1 and status = 'pending' and created_at < now() - interval '2 hours'`, [me.id]);
    const r = await ctx.db.query<UserRow & { invite_id: string; room_code: string; invite_created: string }>(
      `select i.id as invite_id, i.room_code, i.created_at as invite_created, ${userCols} from room_invites i join users u on u.id = i.from_user
       where i.to_user = $1 and i.status = 'pending'
         and exists (select 1 from friendships f where f.status = 'accepted' and ((f.requester_id = i.from_user and f.addressee_id = i.to_user) or (f.requester_id = i.to_user and f.addressee_id = i.from_user)))
       order by i.created_at desc limit 30`,
      [me.id],
    );
    const invites: InviteView[] = [];
    for (const row of r.rows) {
      const room = ctx.rooms.roomByCode(row.room_code);
      if (!room) {
        await ctx.db.query(`update room_invites set status = 'expired' where id = $1`, [row.invite_id]);
        continue;
      }
      invites.push({ id: row.invite_id, roomCode: row.room_code, roomName: room.name, gameId: room.selectedGame, from: toPublicUser(row), createdAt: row.invite_created });
    }
    return { invites };
  });

  app.post('/api/invites/:id/respond', async (req) => {
    const me = requireUser(req);
    const id = parse(uuid, (req.params as { id: string }).id);
    const body = parse(z.object({ accept: z.boolean() }), req.body);
    const r = await ctx.db.query<{ room_code: string }>(
      `update room_invites i set status = $3 where i.id = $1 and i.to_user = $2 and i.status = 'pending'
         and exists (select 1 from friendships f where f.status = 'accepted' and ((f.requester_id = i.from_user and f.addressee_id = i.to_user) or (f.requester_id = i.to_user and f.addressee_id = i.from_user)))
       returning i.room_code`,
      [id, me.id, body.accept ? 'accepted' : 'declined'],
    );
    if (!r.rowCount) throw new AppError('NOT_FOUND', 'الدعوة انتهت.');
    return { code: r.rows[0].room_code };
  });

  // ---------------------------------------------------------------- reports
  app.post('/api/reports', async (req) => {
    const me = requireUser(req);
    rateLimit(ctx, 'social', me.id, 3);
    const body = parse(
      z.object({
        targetUserId: uuid.optional(),
        contentItemId: uuid.optional(),
        roomCode: z.string().max(12).optional(),
        reason: z.enum(['abuse', 'cheating', 'spam', 'inappropriate', 'content', 'other']),
        details: z.string().max(1000).optional(),
      }),
      req.body,
    );
    if (!body.targetUserId && !body.contentItemId) throw new AppError('VALIDATION');
    if (body.targetUserId === me.id) throw new AppError('VALIDATION');
    await ctx.db.query('insert into reports (reporter_id, target_user_id, content_item_id, room_code, reason, details) values ($1, $2, $3, $4, $5, $6)', [
      me.id,
      body.targetUserId ?? null,
      body.contentItemId ?? null,
      body.roomCode ? normalizeRoomCode(body.roomCode) : null,
      body.reason,
      cleanMultiline(body.details ?? '', 1000),
    ]);
    return { ok: true };
  });

  // ----------------------------------------------------------- leaderboards
  app.get('/api/leaderboard', async (req) => {
    const q = req.query as { kind?: string; game?: string };
    const kind = q.kind === 'weekly' ? 'weekly' : 'global';
    const game = isGameId(q.game) ? q.game : undefined;
    const rows = (await ctx.stats.leaderboard(kind, game)) as unknown as (UserRow & { weekly_xp?: number; wins?: number; games?: number })[];
    return {
      kind,
      game: game ?? null,
      entries: rows.map((r, i) => ({
        rank: i + 1,
        user: { id: r.id, username: r.username, displayName: r.display_name, avatar: r.avatar, avatarUrl: r.avatar_url, level: levelForXp(r.xp) },
        xp: r.xp,
        weeklyXp: r.weekly_xp ?? null,
        wins: r.wins ?? null,
        games: r.games ?? null,
      })),
    };
  });

  app.get('/api/achievements', async (req) => {
    const all = (await ctx.db.query('select id, title, description, emoji, xp from achievements order by sort', [])).rows;
    const mine = req.user ? (await ctx.db.query<{ achievement_id: string; unlocked_at: string }>('select achievement_id, unlocked_at from user_achievements where user_id = $1', [req.user.id])).rows : [];
    const counts = (await ctx.db.query<{ achievement_id: string; n: number }>('select achievement_id, count(*)::int as n from user_achievements group by achievement_id', [])).rows;
    return { achievements: all, unlocked: Object.fromEntries(mine.map((m) => [m.achievement_id, m.unlocked_at])), counts: Object.fromEntries(counts.map((c) => [c.achievement_id, c.n])) };
  });

}
