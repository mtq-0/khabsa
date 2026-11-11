import type { Db, Queryable } from '../db/db.ts';
import type { FinalResults } from '../../shared/protocol.ts';
import { levelForXp } from '../../shared/protocol.ts';
import { GAME_IDS } from '../../shared/games.ts';

export const ACHIEVEMENTS = [
  { id: 'first-game', title: 'أول خبصة', description: 'العب أول لعبة إلك', emoji: '🎮', xp: 25 },
  { id: 'first-win', title: 'طعم الفوز', description: 'اربح أول لعبة', emoji: '🥇', xp: 50 },
  { id: 'games-10', title: 'لعّيب دايم', description: 'العب 10 ألعاب', emoji: '🔟', xp: 75 },
  { id: 'games-50', title: 'ساكن بالخبصة', description: 'العب 50 لعبة', emoji: '🏠', xp: 200 },
  { id: 'wins-10', title: 'ما بينغلب', description: 'اربح 10 ألعاب', emoji: '💪', xp: 150 },
  { id: 'wins-25', title: 'أسطورة', description: 'اربح 25 لعبة', emoji: '🐐', xp: 300 },
  { id: 'all-games', title: 'جرّب كل إشي', description: 'العب كل الألعاب السبعة', emoji: '🌈', xp: 150 },
  { id: 'host-5', title: 'صاحب العزيمة', description: 'استضيف 5 ألعاب', emoji: '🎉', xp: 75 },
  { id: 'friends-5', title: 'اجتماعي', description: 'صير عندك 5 أصحاب', emoji: '🤝', xp: 75 },
  { id: 'level-5', title: 'مستوى 5', description: 'وصّل للمستوى 5', emoji: '⭐', xp: 0 },
  { id: 'level-10', title: 'مستوى 10', description: 'وصّل للمستوى 10', emoji: '🌟', xp: 0 },
  { id: 'streak-5', title: 'مخ سريع', description: 'سلسلة 5 أجوبة صح بتحدي السرعة', emoji: '⚡', xp: 100 },
  { id: 'big-room', title: 'لمّة كبيرة', description: 'العب بغرفة فيها 8 لاعبين أو أكثر', emoji: '👨‍👩‍👧‍👦', xp: 50 },
] as const;

export function xpForPlacement(place: number, won: boolean, players: number): number {
  const base = 20;
  const placeBonus = place === 1 ? 30 : place === 2 ? 15 : place === 3 ? 8 : 0;
  const crowd = Math.min(20, Math.max(0, players - 2) * 2);
  return base + placeBonus + (won ? 20 : 0) + crowd;
}

export interface MatchAward {
  userId: string;
  xp: number;
  place: number;
  won: boolean;
  unlocked: string[];
  level: number;
}

export class StatsService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async startMatch(roomId: string, gameId: string, playerCount: number, hostId: string): Promise<string> {
    const r = await this.db.query<{ id: string }>('insert into matches (room_id, game_id, player_count, host_id) values ($1, $2, $3, $4) returning id', [roomId, gameId, playerCount, hostId]);
    return r.rows[0].id;
  }

  /**
   * Records final results exactly once. The match row is locked and checked
   * for ended_at; match_players and xp_events primary keys make retries no-ops.
   */
  async finishMatch(matchId: string, results: FinalResults, participants: string[], extra: { streaks?: Record<string, number> } = {}): Promise<MatchAward[]> {
    return this.db.transaction(async (tx) => {
      const m = await tx.query<{ ended_at: string | null }>('select ended_at from matches where id = $1 for update', [matchId]);
      if (!m.rows[0] || m.rows[0].ended_at) return [];
      await tx.query('update matches set ended_at = now(), results = $2::jsonb where id = $1', [matchId, JSON.stringify(results)]);
      const awards: MatchAward[] = [];
      const winners = new Set(results.winners);
      for (const uid of participants) {
        const rank = results.ranking.find((r) => r.playerId === uid);
        const place = rank?.place ?? results.ranking.length;
        const won = winners.has(uid);
        const xp = xpForPlacement(place, won, participants.length);
        const ins = await tx.query('insert into match_players (match_id, user_id, score, place, won, xp_awarded) values ($1, $2, $3, $4, $5, $6) on conflict do nothing', [matchId, uid, rank?.score ?? 0, place, won, xp]);
        if (!ins.rowCount) continue;
        await this.grantXp(tx, uid, 'match', matchId, xp);
        const unlocked = await this.checkAchievements(tx, uid, { players: participants.length, streak: extra.streaks?.[uid] ?? 0 });
        const u = await tx.query<{ xp: number }>('select xp from users where id = $1', [uid]);
        awards.push({ userId: uid, xp, place, won, unlocked, level: levelForXp(u.rows[0]?.xp ?? 0) });
      }
      return awards;
    });
  }

  async grantXp(q: Queryable, userId: string, source: string, sourceId: string, amount: number): Promise<boolean> {
    const r = await q.query('insert into xp_events (user_id, source, source_id, amount) values ($1, $2, $3, $4) on conflict do nothing', [userId, source, sourceId, amount]);
    if (r.rowCount) await q.query('update users set xp = xp + $2 where id = $1', [userId, amount]);
    return r.rowCount > 0;
  }

  private async unlock(q: Queryable, userId: string, id: string): Promise<boolean> {
    const r = await q.query('insert into user_achievements (user_id, achievement_id) values ($1, $2) on conflict do nothing', [userId, id]);
    if (!r.rowCount) return false;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a && a.xp) await this.grantXp(q, userId, 'achievement', id, a.xp);
    return true;
  }

  async checkAchievements(q: Queryable, userId: string, ctx: { players?: number; streak?: number } = {}): Promise<string[]> {
    const s = (
      await q.query<{ games: number; wins: number; distinct_games: number }>(
        `select count(*)::int as games,
                count(*) filter (where mp.won)::int as wins,
                count(distinct m.game_id)::int as distinct_games
         from match_players mp join matches m on m.id = mp.match_id where mp.user_id = $1`,
        [userId],
      )
    ).rows[0];
    const friends = (await q.query<{ n: number }>(`select count(*)::int as n from friendships where status = 'accepted' and (requester_id = $1 or addressee_id = $1)`, [userId])).rows[0].n;
    const hosted = (await q.query<{ n: number }>(`select count(*)::int as n from matches where host_id = $1 and ended_at is not null`, [userId])).rows[0].n;
    const want: string[] = [];
    if (s.games >= 1) want.push('first-game');
    if (s.wins >= 1) want.push('first-win');
    if (s.games >= 10) want.push('games-10');
    if (s.games >= 50) want.push('games-50');
    if (s.wins >= 10) want.push('wins-10');
    if (s.wins >= 25) want.push('wins-25');
    if (s.distinct_games >= GAME_IDS.length) want.push('all-games');
    if (friends >= 5) want.push('friends-5');
    if ((ctx.players ?? 0) >= 8) want.push('big-room');
    if ((ctx.streak ?? 0) >= 5) want.push('streak-5');
    if (hosted >= 5) want.push('host-5');
    const unlocked: string[] = [];
    for (const id of want) if (await this.unlock(q, userId, id)) unlocked.push(id);
    const xp = (await q.query<{ xp: number }>('select xp from users where id = $1', [userId])).rows[0]?.xp ?? 0;
    const level = levelForXp(xp);
    if (level >= 5 && (await this.unlock(q, userId, 'level-5'))) unlocked.push('level-5');
    if (level >= 10 && (await this.unlock(q, userId, 'level-10'))) unlocked.push('level-10');
    return unlocked;
  }

  async profileStats(userId: string) {
    const totals = (
      await this.db.query<{ games: number; wins: number; total_score: number }>(
        `select count(*)::int as games, count(*) filter (where won)::int as wins, coalesce(sum(score),0)::int as total_score from match_players where user_id = $1`,
        [userId],
      )
    ).rows[0];
    const perGame = (
      await this.db.query<{ game_id: string; games: number; wins: number; best: number }>(
        `select m.game_id, count(*)::int as games, count(*) filter (where mp.won)::int as wins, max(mp.score)::int as best
         from match_players mp join matches m on m.id = mp.match_id where mp.user_id = $1 group by m.game_id`,
        [userId],
      )
    ).rows;
    const history = (
      await this.db.query<{ match_id: string; game_id: string; score: number; place: number; won: boolean; xp_awarded: number; ended_at: string; player_count: number }>(
        `select mp.match_id, m.game_id, mp.score, mp.place, mp.won, mp.xp_awarded, m.ended_at, m.player_count
         from match_players mp join matches m on m.id = mp.match_id where mp.user_id = $1 order by m.ended_at desc nulls last limit 20`,
        [userId],
      )
    ).rows;
    const achievements = (await this.db.query<{ achievement_id: string; unlocked_at: string }>('select achievement_id, unlocked_at from user_achievements where user_id = $1', [userId])).rows;
    return { ...totals, losses: totals.games - totals.wins, perGame, history, achievements };
  }

  async leaderboard(kind: 'global' | 'weekly', gameId?: string, limit = 50) {
    if (gameId) {
      return (
        await this.db.query(
          `select u.id, u.username, u.display_name, u.avatar, u.avatar_url, u.xp, count(*) filter (where mp.won)::int as wins, count(*)::int as games
           from match_players mp join matches m on m.id = mp.match_id join users u on u.id = mp.user_id
           where m.game_id = $1 and not u.is_guest and not u.banned ${kind === 'weekly' ? `and mp.created_at > now() - interval '7 days'` : ''}
           group by u.id order by wins desc, games desc limit $2`,
          [gameId, limit],
        )
      ).rows;
    }
    if (kind === 'weekly') {
      return (
        await this.db.query(
          `select u.id, u.username, u.display_name, u.avatar, u.avatar_url, u.xp, sum(e.amount)::int as weekly_xp
           from xp_events e join users u on u.id = e.user_id
           where e.created_at > now() - interval '7 days' and not u.is_guest and not u.banned
           group by u.id order by weekly_xp desc limit $1`,
          [limit],
        )
      ).rows;
    }
    return (
      await this.db.query(
        `select id, username, display_name, avatar, avatar_url, xp from users where not is_guest and not banned order by xp desc, created_at asc limit $1`,
        [limit],
      )
    ).rows;
  }
}
