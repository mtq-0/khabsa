import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Gamepad2, Home, Trophy, Users, Settings, Shield, LogIn, WifiOff, RefreshCw } from 'lucide-react';
import { GAMES } from '../../shared/games.ts';
import type { InviteView } from '../../shared/protocol.ts';
import { useSession } from '../lib/session.ts';
import { api } from '../lib/api.ts';
import { PAGES } from '../lib/mode.ts';
import { getSocket, reconnectSocket, useConnection } from '../lib/socket.ts';
import { Avatar, Button, cx, Logo, toast, Toaster } from './ui.tsx';
import { TmdbNotice } from './TmdbNotice.tsx';
import { FxLayer, setReducedMotion } from '../fx/visual.tsx';
import { AudioToggles, ThemeToggle, useAudioRuntime } from '../fx/audioUi.tsx';

const NAV = PAGES
  ? [
      { to: '/', label: 'الرئيسية', icon: Home, end: true },
      { to: '/games', label: 'الألعاب', icon: Gamepad2 },
      { to: '/create', label: 'غرفة جديدة', icon: Users },
      { to: '/join', label: 'ادخل غرفة', icon: Trophy },
    ]
  : [
      { to: '/', label: 'الرئيسية', icon: Home, end: true },
      { to: '/games', label: 'الألعاب', icon: Gamepad2 },
      { to: '/friends', label: 'الأصحاب', icon: Users },
      { to: '/leaderboard', label: 'المتصدرين', icon: Trophy },
    ];

export function Layout() {
  const user = useSession((s) => s.user);
  const loc = useLocation();
  const inRoom = loc.pathname.startsWith('/r/');
  const settings = user?.settings;

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', !!settings?.reducedMotion);
    setReducedMotion(!!settings?.reducedMotion);
  }, [settings?.reducedMotion]);

  // sound effects for every press, background music, and their settings
  useAudioRuntime();

  // connect realtime once a session exists
  useEffect(() => {
    if (user) getSocket();
  }, [user]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Toaster />
      <FxLayer />
      <InviteListener />
      <header className={cx('sticky top-0 z-40 border-b border-white/5 bg-ink-950/75 backdrop-blur-xl', inRoom && 'hidden md:block')}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4">
          <Link to="/" className="shrink-0">
            <Logo compact />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="التنقل الرئيسي">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('rounded-xl px-3 py-2 text-sm font-semibold transition', isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:text-white')}>
                {n.label}
              </NavLink>
            ))}
            {!PAGES && <NavLink to="/achievements" className={({ isActive }) => cx('rounded-xl px-3 py-2 text-sm font-semibold transition', isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:text-white')}>
              الإنجازات
            </NavLink>}
          </nav>
          <div className="ms-auto flex items-center gap-1 sm:gap-2">
            {!inRoom && <AudioToggles />}
            {!inRoom && <ThemeToggle />}
            {!PAGES && <OnlineBadge />}
            {user?.role === 'admin' && (
              <Link to="/admin" className="rounded-xl p-2 text-ink-300 hover:bg-white/10" aria-label="لوحة الإدارة">
                <Shield className="size-5" />
              </Link>
            )}
            {user ? (
              <>
                <Link to="/settings" className="hidden rounded-xl p-2 text-ink-300 hover:bg-white/10 sm:block" aria-label="الإعدادات">
                  <Settings className="size-5" />
                </Link>
                <Link to={user.isGuest ? '/settings' : `/u/${user.username}`} className="flex items-center gap-2 rounded-full bg-white/5 py-1 ps-1 hover:bg-white/10 pe-1 min-[400px]:pe-3">
                  <Avatar avatar={user.avatar} url={user.avatarUrl} size={32} />
                  <span className="hidden max-w-24 truncate text-sm font-semibold min-[400px]:inline">{user.displayName}</span>
                </Link>
              </>
            ) : PAGES ? null : (
              <Link to="/login">
                <Button size="sm" variant="secondary" icon={<LogIn className="size-4" />}>
                  دخول
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>
      <ConnectionBanner />
      <main className={cx('mx-auto w-full max-w-7xl flex-1 px-4', inRoom ? 'py-2 md:py-4' : 'py-6 pb-28 md:pb-10')}>
        <Outlet />
      </main>
      {!inRoom && (
        <nav className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-x-0 border-b-0 md:hidden" aria-label="التنقل السفلي">
          {[...NAV, { to: '/settings', label: 'حسابي', icon: Settings }].map((n) => (
            <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false} className={({ isActive }) => cx('flex flex-col items-center gap-1 py-2 text-[11px] font-semibold', isActive ? 'text-volt-300' : 'text-ink-400')}>
              <n.icon className="size-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
      {!inRoom && (
        <footer className="hidden border-t border-white/5 py-8 text-center text-sm text-ink-400 md:block">
          <p className="font-display text-xl text-ink-200">اللعب بلّش... والخبصة علينا!</p>
          <p className="mt-1">© {new Date().getFullYear()} خبصة KHABSA{PAGES && ' · نسخة GitHub (بدون سيرفر)'}</p>
          <TmdbCredit />
          <p className="mt-1 text-xs text-ink-500" dir="ltr">
            Picture artwork: <a className="underline" href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener noreferrer">Twemoji</a> by Twitter/X and contributors, CC-BY 4.0
          </p>
        </footer>
      )}
    </div>
  );
}

function OnlineBadge() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ online?: { online: number } }>('/api/platform')
        .then((d) => alive && setN(d.online?.online ?? 0))
        .catch(() => {});
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (n == null) return null;
  return (
    <span className="chip hidden sm:inline-flex" title="لاعبين متصلين الآن">
      <span className="size-2 rounded-full bg-lime-400 shadow-[0_0_8px] shadow-lime-400" />
      {n} أونلاين
    </span>
  );
}

/** Shows realtime connection problems without blaming the room. */
function ConnectionBanner() {
  const { status, attempts } = useConnection();
  const user = useSession((s) => s.user);
  const load = useSession((s) => s.load);
  if (!user || status === 'connected' || status === 'idle' || status === 'connecting') return null;
  // Pages edition: link problems are shown inside the room, there is no global server
  if (PAGES && status !== 'offline') return null;
  if (status === 'auth-failed')
    return (
      <div className="flex items-center justify-center gap-3 bg-sun-400/15 px-4 py-2 text-sm text-sun-400" role="alert">
        جلستك انتهت أو ما قدرنا نتحقق منها.
        <Button size="sm" variant="secondary" onClick={() => void load().then(() => reconnectSocket())}>
          حاول مرة ثانية
        </Button>
      </div>
    );
  return (
    <div className={cx('flex items-center justify-center gap-3 px-4 py-2 text-sm', status === 'offline' ? 'bg-zing-500/15 text-zing-400' : 'bg-sun-400/10 text-sun-400')} role="alert">
      <WifiOff className="size-4" />
      {status === 'offline' ? 'انقطع الاتصال بالخادم. تأكد من الإنترنت.' : `انقطع الاتصال، عم نحاول نرجع... (${attempts})`}
      <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={reconnectSocket}>
        إعادة الاتصال
      </Button>
    </div>
  );
}

function InviteListener() {
  const user = useSession((s) => s.user);
  const nav = useNavigate();
  const [invite, setInvite] = useState<InviteView | null>(null);
  useEffect(() => {
    if (!user) return;
    const s = getSocket();
    const onInvite = (i: InviteView) => {
      setInvite(i);
      toast.info(`${i.from.displayName} عزمك على ${GAMES[i.gameId].name}`);
    };
    s.on('invite:new', onInvite);
    return () => {
      s.off('invite:new', onInvite);
    };
  }, [user]);
  if (!invite) return null;
  return (
    <div className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-sm animate-rise md:bottom-6">
      <div className="card flex items-center gap-3 p-4">
        <Avatar avatar={invite.from.avatar} url={invite.from.avatarUrl} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <b>{invite.from.displayName}</b> عزمك على {GAMES[invite.gameId].emoji}
          </p>
          <p className="truncate text-xs text-ink-300">{invite.roomName}</p>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            await api(`/api/invites/${invite.id}/respond`, { body: { accept: true } }).catch(() => {});
            setInvite(null);
            nav(`/r/${invite.roomCode}`);
          }}
        >
          ادخل
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setInvite(null)}>
          لاحقاً
        </Button>
      </div>
    </div>
  );
}

/** Shown when the server has TMDB posters enabled (attribution required by TMDB). */
export function TmdbCredit() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    api<{ tmdb?: boolean }>('/api/platform')
      .then((d) => setOn(!!d.tmdb))
      .catch(() => {});
  }, []);
  return on ? (
    <div className="mt-2">
      <TmdbNotice />
    </div>
  ) : null;
}
