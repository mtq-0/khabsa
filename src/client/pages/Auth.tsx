import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { SessionUser } from '../../shared/protocol.ts';
import { api, errorText } from '../lib/api.ts';
import { useSession } from '../lib/session.ts';
import { closeSocket, getSocket } from '../lib/socket.ts';
import { AvatarPicker } from '../components/GuestGate.tsx';
import { Button, Logo } from '../components/ui.tsx';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  // only allow same-site relative paths (no open redirect)
  const rawNext = params.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const { user, set } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? '0-0');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upgrading = mode === 'register' && user?.isGuest;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ user: SessionUser }>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        body: mode === 'login' ? { email, password } : { email, password, username, displayName, avatar },
      });
      set(r.user);
      // the session cookie changed: reconnect realtime with the new identity
      closeSocket();
      getSocket();
      nav(next, { replace: true });
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-4">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <form className="card space-y-4 p-6" onSubmit={submit}>
        <h1 className="font-display text-3xl">{mode === 'login' ? 'أهلين من جديد 👋' : upgrading ? 'احفظ حسابك' : 'حساب جديد'}</h1>
        {upgrading && <p className="text-sm text-ink-300">نقاطك وتاريخك كضيف رح يضلّوا معك.</p>}
        <div>
          <label className="label" htmlFor="email">
            الإيميل
          </label>
          <input id="email" className="field" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="pw">
            كلمة السر
          </label>
          <input id="pw" className="field" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>
        {mode === 'register' && (
          <>
            <div>
              <label className="label" htmlFor="un">
                اسم المستخدم (إنجليزي)
              </label>
              <input id="un" className="field" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} required pattern="[A-Za-z0-9_]{3,24}" title="3-24 حرف إنجليزي أو رقم أو _" autoComplete="username" />
            </div>
            <div>
              <label className="label" htmlFor="dn">
                الاسم الظاهر
              </label>
              <input id="dn" className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={24} />
            </div>
            {!upgrading && <AvatarPicker value={avatar} onChange={setAvatar} />}
          </>
        )}
        {err && <p className="rounded-xl bg-zing-500/15 px-3 py-2 text-sm text-zing-400" role="alert">{err}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {mode === 'login' ? 'دخول' : 'سجّل'}
        </Button>
        <p className="text-center text-sm text-ink-400">
          {mode === 'login' ? (
            <>
              ما عندك حساب؟ <Link to="/register" className="text-volt-300">سجّل</Link> · أو <Link to="/" className="text-volt-300">العب كضيف</Link>
            </>
          ) : (
            <>
              عندك حساب؟ <Link to="/login" className="text-volt-300">ادخل</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
