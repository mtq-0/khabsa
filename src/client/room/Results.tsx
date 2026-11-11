import { Link } from 'react-router';
import { RotateCcw, LayoutGrid } from 'lucide-react';
import { GAMES } from '../../shared/games.ts';
import type { RoomView } from '../../shared/protocol.ts';
import { useRoomContext } from '../lib/room.ts';
import { useSession } from '../lib/session.ts';
import { Avatar, Button, cx, toast } from '../components/ui.tsx';
import { useMembers } from './common.tsx';

const ACH_NAMES: Record<string, string> = {
  'first-game': '🎮 أول خبصة',
  'first-win': '🥇 طعم الفوز',
  'games-10': '🔟 لعّيب دايم',
  'games-50': '🏠 ساكن بالخبصة',
  'wins-10': '💪 ما بينغلب',
  'wins-25': '🐐 أسطورة',
  'all-games': '🌈 جرّب كل إشي',
  'host-5': '🎉 صاحب العزيمة',
  'friends-5': '🤝 اجتماعي',
  'level-5': '⭐ مستوى 5',
  'level-10': '🌟 مستوى 10',
  'streak-5': '⚡ مخ سريع',
  'big-room': '👨‍👩‍👧‍👦 لمّة كبيرة',
};
const TEAM = ['البنفسجي', 'الكهربائي'];

export function Results({ view }: { view: RoomView }) {
  const room = useRoomContext();
  const user = useSession((s) => s.user);
  const res = view.game?.results;
  const { byId, name } = useMembers(view);
  if (!res) return null;
  const isHost = view.hostId === view.you;
  const podium = res.ranking.slice(0, 3);
  const order = [1, 0, 2].filter((i) => podium[i]);
  const iWon = res.winners.includes(view.you);

  return (
    <div className="space-y-5" data-testid="results">
      <div className="text-center">
        <p className="text-5xl">{iWon ? '🏆' : '🎊'}</p>
        <h2 className="mt-2 font-display text-5xl">{iWon ? 'مبروك! إنت الفايز' : 'خلصت اللعبة!'}</h2>
        <p className="text-ink-300">{GAMES[view.game!.gameId].name}</p>
      </div>

      {res.teamScores && (
        <div className="grid grid-cols-2 gap-3">
          {res.teamScores.map((t) => (
            <div key={t.team} className={cx('card p-4 text-center', res.winningTeam === t.team && 'border-sun-400 shadow-glow')}>
              <p className="font-bold">الفريق {TEAM[t.team]}</p>
              <p className="font-display text-5xl">{t.score}</p>
              {res.winningTeam === t.team && <p className="text-sun-400">👑 الفايز</p>}
            </div>
          ))}
          {res.winningTeam == null && <p className="col-span-2 text-center text-ink-300">تعادل! 🤝</p>}
        </div>
      )}

      <div className="flex items-end justify-center gap-3">
        {order.map((i) => {
          const r = podium[i];
          const m = byId.get(r.playerId);
          const h = ['h-32', 'h-24', 'h-16'][i];
          return (
            <div key={r.playerId} className="flex w-24 animate-rise flex-col items-center gap-2 sm:w-28" style={{ animationDelay: `${i * 120}ms` }}>
              {m ? <Avatar avatar={m.avatar} url={m.avatarUrl} size={i === 0 ? 64 : 52} ring={i === 0} /> : <span className="size-12 rounded-full bg-white/10" />}
              <p className="w-full truncate text-center text-sm font-bold">{name(r.playerId)}</p>
              <div className={cx('flex w-full items-start justify-center rounded-t-2xl pt-2 font-display text-2xl', h, i === 0 ? 'bg-gradient-to-b from-sun-400 to-amber-600 text-ink-950' : i === 1 ? 'bg-gradient-to-b from-ink-200 to-ink-400 text-ink-950' : 'bg-gradient-to-b from-orange-400 to-orange-700')}>
                {r.place}
              </div>
              <p className="-mt-1 text-sm font-bold text-volt-300">{r.score}</p>
            </div>
          );
        })}
      </div>

      <div className="card p-4">
        <ol className="space-y-1.5">
          {res.ranking.map((r) => (
            <li key={r.playerId} className={cx('flex items-center gap-3 rounded-xl px-3 py-2', r.playerId === view.you ? 'bg-brand-500/20' : 'bg-white/5')}>
              <span className="w-6 text-center font-bold text-ink-400">{r.place}</span>
              <span className="flex-1 truncate">{name(r.playerId)}</span>
              {res.winners.includes(r.playerId) && <span>👑</span>}
              <span className="font-bold tabular-nums text-volt-300">{r.score}</span>
            </li>
          ))}
        </ol>
        {!!res.awards?.length && (
          <div className="mt-4 flex flex-wrap gap-2">
            {res.awards.map((a) => (
              <span key={a.playerId + a.title} className="chip text-sun-400">
                {a.emoji} {name(a.playerId)}: {a.title}
              </span>
            ))}
          </div>
        )}
      </div>

      {view.awards ? (
        <div className="card flex flex-wrap items-center justify-center gap-3 p-4 text-center">
          <span className="chip text-lime-400">+{view.awards.xp} XP</span>
          <span className="chip">المستوى {view.awards.level}</span>
          {view.awards.unlocked.map((a) => (
            <span key={a} className="chip animate-pop border-sun-400/40 text-sun-400">
              🏅 إنجاز جديد: {ACH_NAMES[a] ?? a}
            </span>
          ))}
          {user?.isGuest && (
            <Link to="/register" className="w-full text-xs text-volt-300 underline">
              سجّل حساب لتحفظ نقاطك وتظهر بالمتصدرين
            </Link>
          )}
        </div>
      ) : (
        <p className="text-center text-xs text-ink-400">عم نحسب النقاط...</p>
      )}

      {isHost ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            size="lg"
            icon={<RotateCcw className="size-5" />}
            onClick={async () => {
              const r = await room.act('rematch');
              if (!r.ok) toast.error(r.message);
            }}
            data-testid="rematch"
          >
            جولة ثانية!
          </Button>
          <Button size="lg" variant="secondary" icon={<LayoutGrid className="size-5" />} onClick={() => void room.act('back-to-lobby')} data-testid="back-to-lobby">
            غيّر اللعبة
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-ink-300">المضيف بيقرر شو بعدين...</p>
      )}
    </div>
  );
}
