import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Ban, UserCheck, UserPlus, UserX, Flag } from 'lucide-react';
import { GAMES, isGameId } from '../../shared/games.ts';
import { rankForLevel, xpForLevel, type PublicUser } from '../../shared/protocol.ts';
import { api, errorText } from '../lib/api.ts';
import { useSession } from '../lib/session.ts';
import { Avatar, Button, EmptyState, Skeleton, toast } from '../components/ui.tsx';

interface ProfileData {
  user: PublicUser & { favoriteGames: string[]; createdAt: string };
  relation: 'none' | 'self' | 'friends' | 'incoming' | 'outgoing' | 'blocked';
  stats: {
    games: number;
    wins: number;
    losses: number;
    total_score: number;
    perGame: { game_id: string; games: number; wins: number; best: number }[];
    history: { match_id: string; game_id: string; score: number; place: number; won: boolean; xp_awarded: number; ended_at: string; player_count: number }[];
    achievements: { achievement_id: string; unlocked_at: string }[];
  };
}

export default function ProfilePage() {
  const { username = '' } = useParams();
  const me = useSession((s) => s.user);
  const [data, setData] = useState<ProfileData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    api<ProfileData>(`/api/users/${encodeURIComponent(username)}`)
      .then(setData)
      .catch((e) => setErr(errorText(e)));
  useEffect(() => {
    setData(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  if (err) return <EmptyState emoji="🤷" title={err} action={<Link to="/" className="text-volt-300">الرئيسية</Link>} />;
  if (!data) return <Skeleton className="h-64" />;
  const u = data.user;
  const rank = rankForLevel(u.level);
  const cur = xpForLevel(u.level);
  const next = xpForLevel(u.level + 1);
  const pct = ((u.xp - cur) / (next - cur)) * 100;
  const winRate = data.stats.games ? Math.round((data.stats.wins / data.stats.games) * 100) : 0;

  const relAction = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      void load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="card relative overflow-hidden p-6">
        <div className="absolute -end-16 -top-16 size-56 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <Avatar avatar={u.avatar} url={u.avatarUrl} size={96} ring />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl">{u.displayName}</h1>
            <p className="text-sm text-ink-400" dir="ltr">
              @{u.username}
            </p>
            <p className="mt-2 text-sm">
              {rank.emoji} {rank.name} · المستوى <b>{u.level}</b>
            </p>
            <div className="mt-2 h-2.5 max-w-xs overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-l from-volt-400 to-brand-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-ink-400">
              {u.xp} / {next} XP
            </p>
          </div>
          {me && !me.isGuest && data.relation !== 'self' && !u.isGuest && (
            <div className="flex flex-wrap gap-2">
              {data.relation === 'none' && (
                <Button icon={<UserPlus className="size-4" />} onClick={() => relAction(() => api('/api/friends/request', { body: { userId: u.id } }), 'انبعت طلب الصداقة')}>
                  أضف صديق
                </Button>
              )}
              {data.relation === 'incoming' && (
                <Button icon={<UserCheck className="size-4" />} onClick={() => relAction(() => api('/api/friends/respond', { body: { userId: u.id, accept: true } }), 'صرتوا أصحاب!')}>
                  اقبل الطلب
                </Button>
              )}
              {data.relation === 'outgoing' && <span className="chip">الطلب مبعوث</span>}
              {data.relation === 'friends' && (
                <Button variant="secondary" icon={<UserX className="size-4" />} onClick={() => relAction(() => api(`/api/friends/${u.id}`, { method: 'DELETE' }), 'انحذف من الأصحاب')}>
                  احذف
                </Button>
              )}
              {data.relation === 'blocked' ? (
                <Button variant="secondary" onClick={() => relAction(() => api(`/api/blocks/${u.id}`, { method: 'DELETE' }), 'انفك الحظر')}>
                  فك الحظر
                </Button>
              ) : (
                <Button variant="ghost" icon={<Ban className="size-4" />} onClick={() => confirm('حظر هاللاعب؟') && relAction(() => api('/api/blocks', { body: { userId: u.id } }), 'انحظر')}>
                  حظر
                </Button>
              )}
              <Button variant="ghost" icon={<Flag className="size-4" />} onClick={() => relAction(() => api('/api/reports', { body: { targetUserId: u.id, reason: 'abuse', details: 'بلاغ من صفحة البروفايل' } }), 'وصل البلاغ')}>
                بلاغ
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['🎮', 'ألعاب', data.stats.games],
          ['🏆', 'فوز', data.stats.wins],
          ['😅', 'خسارة', data.stats.losses],
          ['📈', 'نسبة الفوز', `${winRate}%`],
        ].map(([e, l, v]) => (
          <div key={String(l)} className="card p-4 text-center">
            <p className="text-2xl">{e}</p>
            <p className="font-display text-3xl">{v}</p>
            <p className="text-xs text-ink-400">{l}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-bold">حسب اللعبة</h2>
          {data.stats.perGame.length ? (
            <ul className="space-y-2 text-sm">
              {data.stats.perGame.map((g) => (
                <li key={g.game_id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <span>{isGameId(g.game_id) ? GAMES[g.game_id].emoji : '🎲'}</span>
                  <span className="flex-1 truncate">{isGameId(g.game_id) ? GAMES[g.game_id].name : g.game_id}</span>
                  <span className="text-ink-400">
                    {g.wins}/{g.games} فوز
                  </span>
                  <span className="text-volt-300">أعلى {g.best}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">لسا ما لعب.</p>
          )}
          {!!u.favoriteGames.length && (
            <p className="mt-4 text-sm text-ink-300">
              ألعابه المفضلة: {u.favoriteGames.filter(isGameId).map((g) => GAMES[g].emoji + ' ' + GAMES[g].name).join('، ')}
            </p>
          )}
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-bold">آخر الألعاب</h2>
          {data.stats.history.length ? (
            <ul className="space-y-2 text-sm">
              {data.stats.history.map((h) => (
                <li key={h.match_id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <span>{h.won ? '🏆' : `#${h.place}`}</span>
                  <span className="flex-1 truncate">{isGameId(h.game_id) ? GAMES[h.game_id].name : h.game_id}</span>
                  <span className="text-ink-400">{h.score} نقطة</span>
                  <span className="text-lime-400">+{h.xp_awarded}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">ما في سجل لسا.</p>
          )}
        </div>
      </div>
      <p className="text-center text-sm text-ink-400">
        {data.stats.achievements.length} إنجاز ·{' '}
        <Link className="text-volt-300" to="/achievements">
          كل الإنجازات
        </Link>
      </p>
    </div>
  );
}
