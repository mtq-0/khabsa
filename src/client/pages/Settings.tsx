import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Camera, LogOut } from 'lucide-react';
import { GAME_IDS, GAMES, type GameId } from '../../shared/games.ts';
import type { SessionUser, UserSettings } from '../../shared/protocol.ts';
import { api, errorText } from '../lib/api.ts';
import { useSession } from '../lib/session.ts';
import { closeSocket } from '../lib/socket.ts';
import { AvatarPicker, RequireSession } from '../components/GuestGate.tsx';
import { Avatar, Button, PageTitle, Toggle, cx, toast } from '../components/ui.tsx';

export default function SettingsPage() {
  return (
    <RequireSession title="حسابي">
      <Settings />
    </RequireSession>
  );
}

function Settings() {
  const { user, set, logout } = useSession();
  const u = user!;
  const nav = useNavigate();
  const [name, setName] = useState(u.displayName);
  const [username, setUsername] = useState(u.username);
  const [avatar, setAvatar] = useState(u.avatar);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pw, setPw] = useState({ current: '', next: '' });

  const patch = async (body: Record<string, unknown>, msg = 'انحفظ ✔') => {
    try {
      const r = await api<{ user: SessionUser }>('/api/me', { method: 'PATCH', body });
      set(r.user);
      toast.success(msg);
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const setSetting = (k: keyof UserSettings, v: unknown) => void patch({ settings: { [k]: v } });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle title="حسابي" emoji="⚙️" />
      {u.isGuest && (
        <div className="card border-volt-400/30 p-5">
          <p className="font-bold">إنت بتلعب كضيف 👤</p>
          <p className="mt-1 text-sm text-ink-300">جلستك محفوظة على هالجهاز. سجّل حساب لتحفظ نقاطك، تضيف أصحاب، وتدخل من أي جهاز.</p>
          <Link to="/register">
            <Button className="mt-3">احفظ حسابي</Button>
          </Link>
        </div>
      )}

      <form
        className="card space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await patch({ displayName: name, avatar, ...(u.isGuest ? {} : { username }) });
          setBusy(false);
        }}
      >
        <h2 className="font-bold">الملف الشخصي</h2>
        {!u.isGuest && (
          <div className="flex items-center gap-4">
            <Avatar avatar={u.avatar} url={u.avatarUrl} size={72} />
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) return toast.error('الصورة أكبر من 5 ميغا.');
                const form = new FormData();
                form.append('file', f);
                try {
                  const r = await api<{ user: SessionUser }>('/api/me/avatar', { form, timeoutMs: 30_000 });
                  set(r.user);
                  toast.success('تغيّرت الصورة');
                } catch (e2) {
                  toast.error(errorText(e2));
                }
                e.target.value = '';
              }}
            />
            <Button type="button" variant="secondary" size="sm" icon={<Camera className="size-4" />} onClick={() => fileRef.current?.click()}>
              صورة شخصية
            </Button>
            {u.avatarUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void patch({ removeAvatarImage: true })}>
                شيل الصورة
              </Button>
            )}
          </div>
        )}
        <div>
          <label className="label" htmlFor="dn">
            الاسم الظاهر
          </label>
          <input id="dn" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} minLength={2} required />
        </div>
        {!u.isGuest && (
          <div>
            <label className="label" htmlFor="un">
              اسم المستخدم
            </label>
            <input id="un" className="field" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} pattern="[A-Za-z0-9_]{3,24}" />
          </div>
        )}
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <Button type="submit" loading={busy}>
          احفظ
        </Button>
      </form>

      <div className="card p-5">
        <h2 className="mb-2 font-bold">التفضيلات</h2>
        <Toggle label="أصوات اللعبة" checked={u.settings.sound} onChange={(v) => setSetting('sound', v)} />
        <Toggle label="تقليل الحركة والأنيميشن" checked={u.settings.reducedMotion} onChange={(v) => setSetting('reducedMotion', v)} />
        <Toggle label="خلّي الأصحاب يشوفوني أونلاين" checked={u.settings.showOnline} onChange={(v) => setSetting('showOnline', v)} />
        <label className="flex items-center justify-between gap-4 py-2">
          <span className="text-sm text-ink-200">مين بيقدر يعزمني على غرف</span>
          <select className="field w-auto py-2" value={u.settings.allowInvites} onChange={(e) => setSetting('allowInvites', e.target.value)}>
            <option value="everyone">أي حدا</option>
            <option value="friends">الأصحاب بس</option>
            <option value="none">ولا حدا</option>
          </select>
        </label>
      </div>

      {!u.isGuest && (
        <div className="card p-5">
          <h2 className="mb-3 font-bold">ألعابي المفضلة</h2>
          <div className="flex flex-wrap gap-2">
            {GAME_IDS.map((id: GameId) => {
              const on = u.favoriteGames.includes(id);
              return (
                <button
                  key={id}
                  className={cx('chip px-3 py-2 text-sm', on && 'border-sun-400 bg-sun-400/15 text-white')}
                  onClick={() => void patch({ favoriteGames: on ? u.favoriteGames.filter((g) => g !== id) : [...u.favoriteGames, id] }, on ? 'انشالت من المفضلة' : 'انضافت للمفضلة ⭐')}
                  aria-pressed={on}
                >
                  {on ? '⭐' : '☆'} {GAMES[id].name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-400">بتظهر على صفحتك الشخصية.</p>
        </div>
      )}

      {!u.isGuest && (
        <form
          className="card space-y-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/api/auth/password', { body: pw });
              setPw({ current: '', next: '' });
              toast.success('تغيّرت كلمة السر');
            } catch (e2) {
              toast.error(errorText(e2));
            }
          }}
        >
          <h2 className="font-bold">كلمة السر</h2>
          <input className="field" type="password" dir="ltr" placeholder="الحالية" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required />
          <input className="field" type="password" dir="ltr" placeholder="الجديدة (8 أحرف على الأقل)" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" required />
          <Button type="submit" variant="secondary">
            غيّر كلمة السر
          </Button>
        </form>
      )}

      <div className="card flex flex-wrap gap-3 p-5">
        {!u.isGuest && (
          <>
            <Link to={`/u/${u.username}`}>
              <Button variant="secondary">صفحتي</Button>
            </Link>
            <Link to="/packs">
              <Button variant="secondary">حزم المحتوى الخاصة فيي</Button>
            </Link>
          </>
        )}
        <Button
          variant="ghost"
          icon={<LogOut className="size-4" />}
          onClick={async () => {
            if (u.isGuest && !confirm('إذا طلعت كضيف رح تخسر هالجلسة ونقاطها. متأكد؟')) return;
            closeSocket();
            await logout();
            nav('/');
          }}
        >
          تسجيل خروج
        </Button>
      </div>
    </div>
  );
}
