import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GAME_IDS, GAMES, type GameId } from '../../shared/games.ts';
import { rankForLevel } from '../../shared/protocol.ts';
import { api, errorText } from '../lib/api.ts';
import { useSession } from '../lib/session.ts';
import { Avatar, EmptyState, PageTitle, Skeleton, Tabs, cx } from '../components/ui.tsx';

interface Entry {
  rank: number;
  user: { id: string; username: string; displayName: string; avatar: string; avatarUrl: string | null; level: number };
  xp: number;
  weeklyXp: number | null;
  wins: number | null;
  games: number | null;
}

export default function LeaderboardPage() {
  const me = useSession((s) => s.user);
  const [kind, setKind] = useState<'global' | 'weekly'>('weekly');
  const [game, setGame] = useState<GameId | ''>('');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setEntries(null);
    setErr(null);
    api<{ entries: Entry[] }>(`/api/leaderboard?kind=${kind}${game ? `&game=${game}` : ''}`)
      .then((r) => setEntries(r.entries))
      .catch((e) => setErr(errorText(e)));
  }, [kind, game]);
  const metric = (e: Entry) => (game ? `${e.wins} فوز` : kind === 'weekly' ? `${e.weeklyXp} XP` : `${e.xp} XP`);
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="المتصدرين" emoji="🏆" subtitle="مين ملك الخبصة؟" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={kind} onChange={setKind} tabs={[{ value: 'weekly', label: 'هالأسبوع' }, { value: 'global', label: 'كل الأوقات' }]} />
        <select className="field w-auto py-2" value={game} onChange={(e) => setGame(e.target.value as GameId | '')} aria-label="اللعبة">
          <option value="">كل الألعاب (XP)</option>
          {GAME_IDS.map((id) => (
            <option key={id} value={id}>
              {GAMES[id].emoji} {GAMES[id].name}
            </option>
          ))}
        </select>
      </div>
      {me?.isGuest && <p className="mb-4 rounded-xl bg-sun-400/10 px-4 py-2 text-sm text-sun-400">الضيوف ما بيظهروا بالمتصدرين. <Link to="/register" className="underline">سجّل حساب</Link> لتنافس.</p>}
      {err && <p className="text-zing-400">{err}</p>}
      {!entries ? (
        <Skeleton className="h-80" />
      ) : !entries.length ? (
        <div className="card">
          <EmptyState emoji="🌱" title="القائمة فاضية" text="العب وكون أول واحد هون!" />
        </div>
      ) : (
        <ol className="space-y-2">
          {entries.map((e) => (
            <li key={e.user.id} className={cx('card flex items-center gap-3 p-3', e.user.id === me?.id && 'border-volt-400', e.rank <= 3 && 'bg-gradient-to-l from-sun-400/10 to-transparent')}>
              <span className="w-8 text-center font-display text-2xl">{['🥇', '🥈', '🥉'][e.rank - 1] ?? e.rank}</span>
              <Avatar avatar={e.user.avatar} url={e.user.avatarUrl} size={40} />
              <Link to={`/u/${e.user.username}`} className="min-w-0 flex-1 hover:underline">
                <p className="truncate font-semibold">{e.user.displayName}</p>
                <p className="text-xs text-ink-400">
                  {rankForLevel(e.user.level).emoji} {rankForLevel(e.user.level).name} · م{e.user.level}
                </p>
              </Link>
              <span className="font-bold tabular-nums text-volt-300">{metric(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
