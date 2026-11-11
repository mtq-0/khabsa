import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Shuffle } from 'lucide-react';
import { AVATAR_CHARACTERS, AVATAR_PALETTES, randomAvatar } from '../../shared/avatars.ts';
import { useSession } from '../lib/session.ts';
import { errorText } from '../lib/api.ts';
import { reconnectSocket } from '../lib/socket.ts';
import { Avatar, Button, cx, Spinner } from './ui.tsx';

export function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [c, p] = value.split('-').map(Number);
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Avatar avatar={value} size={64} />
        <Button type="button" variant="secondary" size="sm" icon={<Shuffle className="size-4" />} onClick={() => onChange(randomAvatar())}>
          عشوائي
        </Button>
      </div>
      <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="الشخصية">
        {AVATAR_CHARACTERS.map((ch, i) => (
          <button
            key={ch}
            type="button"
            role="radio"
            aria-checked={i === c}
            aria-label={`شخصية ${i + 1}`}
            onClick={() => onChange(`${i}-${p}`)}
            className={cx('grid aspect-square place-items-center rounded-xl text-xl transition', i === c ? 'bg-brand-500/40 ring-2 ring-brand-400' : 'bg-white/5 hover:bg-white/10')}
          >
            {ch}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="اللون">
        {AVATAR_PALETTES.map((pal, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === p}
            aria-label={`لون ${i + 1}`}
            onClick={() => onChange(`${c}-${i}`)}
            className={cx('size-8 rounded-full transition', i === p && 'ring-2 ring-white ring-offset-2 ring-offset-ink-850')}
            style={{ background: `linear-gradient(135deg, ${pal[0]}, ${pal[1]})` }}
          />
        ))}
      </div>
    </div>
  );
}

export function GuestForm({ onDone, cta = 'يلا نلعب!' }: { onDone?: () => void; cta?: string }) {
  const guest = useSession((s) => s.guest);
  const [name, setName] = useState(() => localStorage.getItem('khabsa:lastName') ?? '');
  const [avatar, setAvatar] = useState<string>(() => randomAvatar());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await guest(name, avatar);
          localStorage.setItem('khabsa:lastName', name);
          reconnectSocket();
          onDone?.();
        } catch (e2) {
          setErr(errorText(e2));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="nick">
          شو اسمك بالخبصة؟
        </label>
        <input id="nick" className="field text-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: أبو سند" maxLength={24} required minLength={2} autoComplete="nickname" />
      </div>
      <div>
        <span className="label">اختار شكلك</span>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </div>
      {err && <p className="rounded-xl bg-zing-500/15 px-3 py-2 text-sm text-zing-400">{err}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {cta}
      </Button>
      <p className="text-center text-xs text-ink-400">
        بتلعب كضيف بدون تسجيل. عندك حساب؟{' '}
        <Link to="/login" className="text-volt-300 underline">
          سجّل دخول
        </Link>
      </p>
    </form>
  );
}

/** Renders children only once a (guest or registered) session exists. */
export function RequireSession({ children, title = 'قبل ما نبلّش...' }: { children: ReactNode; title?: string }) {
  const { user, loading } = useSession();
  if (loading) return <Spinner label="لحظة..." />;
  if (user) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md py-6">
      <div className="card p-6">
        <h2 className="mb-1 font-display text-3xl">{title}</h2>
        <p className="mb-5 text-sm text-ink-300">اختار اسم وشكل وخلّينا نخبّص.</p>
        <GuestForm />
      </div>
    </div>
  );
}
