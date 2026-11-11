import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Globe, Lock } from 'lucide-react';
import { GAME_IDS, GAMES, isGameId, type GameId } from '../../shared/games.ts';
import { api, errorText, uid } from '../lib/api.ts';
import { useSession } from '../lib/session.ts';
import { RequireSession } from '../components/GuestGate.tsx';
import { Button, GameArt, PageTitle, cx } from '../components/ui.tsx';

export default function CreateRoomPage() {
  return (
    <RequireSession title="اعمل غرفة">
      <CreateRoomForm />
    </RequireSession>
  );
}

function CreateRoomForm() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const user = useSession((s) => s.user)!;
  const initial = params.get('game');
  const [gameId, setGameId] = useState<GameId>(isGameId(initial) ? initial : 'outsider-word');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [capacity, setCapacity] = useState(8);
  const [name, setName] = useState(`غرفة ${user.displayName}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // one request id per form: double submits/retries create only one room
  const requestId = useRef(uid());

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="اعمل غرفة" emoji="🏠" subtitle="اختار اللعبة وطريقة الدخول، وبعدين ابعت الرابط للشلة" />
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ code: string }>('/api/rooms', { body: { gameId, visibility, capacity, name, requestId: requestId.current } });
            nav(`/r/${r.code}`);
          } catch (e2) {
            setErr(errorText(e2));
            setBusy(false);
          }
        }}
      >
        <section className="card p-5">
          <h2 className="mb-4 font-bold">اللعبة</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {GAME_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setGameId(id)}
                aria-pressed={gameId === id}
                className={cx('overflow-hidden rounded-2xl border text-start transition', gameId === id ? 'border-volt-400 shadow-glow-volt' : 'border-white/10 hover:border-white/25')}
              >
                <GameArt gameId={id} className="h-16 [&>span]:text-3xl" />
                <span className="block truncate px-2 py-2 text-xs font-bold">{GAMES[id].name}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-ink-300">
            {GAMES[gameId].tagline} · {GAMES[gameId].minPlayers}-{GAMES[gameId].maxPlayers} لاعبين. بتقدر تغيّر اللعبة من داخل الغرفة.
          </p>
        </section>

        <section className="card grid gap-5 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="room-name">
              اسم الغرفة
            </label>
            <input id="room-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </div>
          <div>
            <span className="label">مين بيقدر يدخل؟</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['private', Lock, 'خاصة', 'بالرمز أو الرابط بس'],
                  ['public', Globe, 'عامة', 'بتظهر بالغرف العامة'],
                ] as const
              ).map(([v, Icon, t, d]) => (
                <button key={v} type="button" onClick={() => setVisibility(v)} aria-pressed={visibility === v} className={cx('rounded-xl border p-3 text-start transition', visibility === v ? 'border-brand-400 bg-brand-500/15' : 'border-white/10')}>
                  <Icon className="mb-1 size-5 text-volt-300" />
                  <span className="block text-sm font-bold">{t}</span>
                  <span className="block text-xs text-ink-400">{d}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="cap">
              أقصى عدد لاعبين: <b className="text-volt-300">{capacity}</b>
            </label>
            <input id="cap" type="range" min={2} max={12} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="w-full accent-brand-500" />
          </div>
        </section>

        {err && <p className="rounded-xl bg-zing-500/15 px-4 py-3 text-sm text-zing-400" role="alert">{err}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="create-submit">
          اعمل الغرفة 🚀
        </Button>
      </form>
    </div>
  );
}
