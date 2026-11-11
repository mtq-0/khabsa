import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { RefreshCw, Zap } from 'lucide-react';
import { GAME_IDS, GAMES, isGameId, type GameId } from '../../shared/games.ts';
import type { PublicRoomSummary } from '../../shared/protocol.ts';
import { api, errorText } from '../lib/api.ts';
import { RequireSession } from '../components/GuestGate.tsx';
import { Avatar, Button, EmptyState, GameArt, PageTitle, Skeleton, cx } from '../components/ui.tsx';

export default function PlayPage() {
  return (
    <RequireSession title="لعب سريع">
      <Matchmaking />
    </RequireSession>
  );
}

function Matchmaking() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initial = params.get('game');
  const [game, setGame] = useState<GameId | null>(isGameId(initial) ? initial : null);
  const [rooms, setRooms] = useState<PublicRoomSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      setRooms((await api<{ rooms: PublicRoomSummary[] }>('/api/rooms/public')).rooms);
    } catch (e) {
      setErr(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const list = rooms?.filter((r) => !game || r.gameId === game) ?? null;

  return (
    <div>
      <PageTitle
        title="لعب سريع"
        emoji="⚡"
        subtitle="ادخل غرفة عامة مع لاعبين من كل مكان"
        action={
          <Button
            size="lg"
            variant="volt"
            loading={busy}
            icon={<Zap className="size-5" />}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ code: string }>('/api/rooms/quick', { body: game ? { gameId: game } : {} });
                nav(`/r/${r.code}`);
              } catch (e) {
                setErr(errorText(e));
                setBusy(false);
              }
            }}
            data-testid="quick-play"
          >
            لاقيلي غرفة
          </Button>
        }
      />
      <div className="scrollbar-thin mb-5 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setGame(null)} className={cx('chip shrink-0 px-4 py-2 text-sm', !game && 'border-brand-400 bg-brand-500/25 text-white')}>
          كل الألعاب
        </button>
        {GAME_IDS.map((id) => (
          <button key={id} onClick={() => setGame(id)} className={cx('chip shrink-0 px-4 py-2 text-sm', game === id && 'border-brand-400 bg-brand-500/25 text-white')}>
            {GAMES[id].emoji} {GAMES[id].name}
          </button>
        ))}
      </div>
      {err && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-zing-500/15 px-4 py-3 text-sm text-zing-400" role="alert">
          {err}
          <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={() => void load()}>
            حاول
          </Button>
        </div>
      )}
      {list == null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState emoji="🦗" title="ما في غرف عامة هلأ" text="كبسة 'لاقيلي غرفة' بتعملك غرفة عامة والناس بتدخل عليها." />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <button key={r.code} onClick={() => nav(`/r/${r.code}`)} className="card flex items-center gap-4 overflow-hidden p-3 text-start transition hover:-translate-y-0.5 hover:shadow-glow">
              <GameArt gameId={r.gameId} className="size-20 shrink-0 rounded-xl [&>span]:text-4xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.name}</p>
                <p className="text-xs text-ink-300">{GAMES[r.gameId].name}</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Avatar avatar={r.host.avatar} size={20} />
                  <span className="truncate text-ink-300">{r.host.name}</span>
                  <span className="chip ms-auto">
                    {r.players}/{r.capacity}
                  </span>
                  <span className={cx('chip', r.status === 'lobby' ? 'text-lime-400' : 'text-sun-400')}>{r.status === 'lobby' ? 'بالانتظار' : 'بيلعبوا'}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
