import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { DoorOpen } from 'lucide-react';
import { normalizeRoomCode, ROOM_CODE_RE } from '../../shared/protocol.ts';
import { GAMES, type GameId } from '../../shared/games.ts';
import { api, ApiError, errorText } from '../lib/api.ts';
import { RequireSession } from '../components/GuestGate.tsx';
import { Button, PageTitle } from '../components/ui.tsx';

export default function JoinRoomPage() {
  return (
    <RequireSession title="ادخل غرفة">
      <JoinForm />
    </RequireSession>
  );
}

function JoinForm() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [code, setCode] = useState(params.get('code')?.toUpperCase() ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; retry: boolean } | null>(null);
  const [preview, setPreview] = useState<{ name: string; gameId: GameId; players: number; capacity: number } | null>(null);

  const submit = async () => {
    const c = normalizeRoomCode(code);
    if (!ROOM_CODE_RE.test(c)) {
      setErr({ text: 'رمز الغرفة لازم يكون 6 أحرف أو أرقام إنجليزية (بدون O و I و 0 و 1).', retry: false });
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ name: string; gameId: GameId; players: number; capacity: number; full: boolean }>(`/api/rooms/${c}`);
      setPreview(r);
      if (r.full) {
        setErr({ text: 'الغرفة مليانة. اطلب من المضيف يكبّر عدد اللاعبين.', retry: true });
        return;
      }
      nav(`/r/${c}`);
    } catch (e) {
      // network failures are reported as such, never as "room not found"
      const retry = e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'TIMEOUT' || e.code === 'SERVER_ERROR');
      setErr({ text: errorText(e), retry });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="ادخل غرفة" emoji="🚪" subtitle="اكتب الرمز اللي بعتلك إياه صاحبك" />
      <form
        className="card space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="label" htmlFor="code">
          رمز الغرفة
        </label>
        <input
          id="code"
          className="field h-16 text-center font-mono text-3xl tracking-[0.4em] uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="ABC234"
          autoComplete="off"
          inputMode="text"
          dir="ltr"
          autoFocus
          data-testid="join-code"
        />
        {preview && (
          <p className="text-sm text-ink-300">
            {GAMES[preview.gameId].emoji} {preview.name} · {preview.players}/{preview.capacity}
          </p>
        )}
        {err && (
          <div className="rounded-xl bg-zing-500/15 px-4 py-3 text-sm text-zing-400" role="alert">
            {err.text}
            {err.retry && (
              <Button type="button" size="sm" variant="secondary" className="ms-2" onClick={() => void submit()}>
                جرّب مرة ثانية
              </Button>
            )}
          </div>
        )}
        <Button type="submit" size="lg" className="w-full" loading={busy} icon={<DoorOpen className="size-5" />} data-testid="join-submit">
          ادخل
        </Button>
      </form>
    </div>
  );
}
