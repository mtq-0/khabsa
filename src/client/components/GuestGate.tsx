import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Shuffle } from 'lucide-react';
import { AVATAR_CHARACTERS, AVATAR_PALETTES, parseAvatar, randomAvatar } from '../../shared/avatars.ts';
import { characterUrl } from '../../shared/characters.ts';
import { useSession } from '../lib/session.ts';
import { errorText } from '../lib/api.ts';
import { reconnectSocket } from '../lib/socket.ts';
import { PAGES } from '../lib/mode.ts';
import { Avatar, Button, cx, Spinner } from './ui.tsx';

export function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [c, p] = value.split('-').map(Number);
  // a short row first so the form below stays on screen; the rest opens with "المزيد"
  const [more, setMore] = useState(false);
  const SHORT = 8;
  const shown = more ? AVATAR_CHARACTERS : AVATAR_CHARACTERS.slice(0, SHORT);
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Avatar avatar={value} size={56} />
        <p className="min-w-0 flex-1 truncate font-bold" data-testid="avatar-name">
          {parseAvatar(value).name}
        </p>
        <Button type="button" variant="secondary" size="sm" icon={<Shuffle className="size-4" />} onClick={() => onChange(randomAvatar())}>
          عشوائي
        </Button>
      </div>
      <div className={cx('grid gap-1.5 sm:grid-cols-8', more ? 'grid-cols-6' : 'grid-cols-8')} role="radiogroup" aria-label="الشخصية">
        {shown.map((ch, i) => (
          <button
            key={ch}
            type="button"
            role="radio"
            aria-checked={i === c}
            aria-label={ch}
            title={ch}
            onClick={() => onChange(`${i}-${p}`)}
            className={cx('aspect-square overflow-hidden rounded-xl transition', i === c ? 'bg-brand-500/40 ring-2 ring-brand-400' : 'bg-white/5 hover:bg-white/10')}
          >
            <img src={characterUrl(i)} alt="" className="size-full" loading="lazy" draggable={false} />
          </button>
        ))}
      </div>
      {AVATAR_CHARACTERS.length > SHORT && (
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 text-sm font-semibold text-ink-200 hover:bg-white/10" data-testid="avatar-more">
          {more ? 'أقل' : 'المزيد'}
          <ChevronDown className={cx('size-4 transition', more && 'rotate-180')} />
        </button>
      )}
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
  const nameRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim().length < 2) {
          setErr('اكتب اسمك (حرفين على الأقل)');
          nameRef.current?.focus();
          return;
        }
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
        <input id="nick" ref={nameRef} className="field text-lg" value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} aria-invalid={err != null && name.trim().length < 2} placeholder="مثلاً: أبو سند" maxLength={24} required minLength={2} autoComplete="nickname" />
      </div>
      <div>
        <span className="label">اختار شكلك</span>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </div>
      {err && <p className="rounded-xl bg-zing-500/15 px-3 py-2 text-sm text-zing-400" role="alert">{err}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {cta}
      </Button>
      <p className={cx('text-center text-xs text-ink-400', PAGES && 'hidden')}>
        بتلعب كضيف بدون تسجيل. عندك حساب؟{' '}
        <Link to="/login" className="inline-flex min-h-10 items-center px-1 text-volt-300 underline">
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
