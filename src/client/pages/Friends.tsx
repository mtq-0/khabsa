import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AtSign, Copy, Search, UserPlus } from 'lucide-react';
import { GAMES, isGameId } from '../../shared/games.ts';
import type { InviteView, PublicUser } from '../../shared/protocol.ts';
import { api, errorText } from '../lib/api.ts';
import { getSocket } from '../lib/socket.ts';
import { useSession } from '../lib/session.ts';
import { RequireSession } from '../components/GuestGate.tsx';
import { Avatar, Button, EmptyState, PageTitle, Skeleton, Tabs, copyText, cx, toast } from '../components/ui.tsx';

type U = PublicUser & { online: boolean; lastPlayedAt?: string; gameId?: string };
interface FriendsData {
  friends: U[];
  incoming: U[];
  outgoing: U[];
  recent: U[];
  blocked: PublicUser[];
}

export default function FriendsPage() {
  return (
    <RequireSession title="الأصحاب">
      <Friends />
    </RequireSession>
  );
}

function Row({ u, children }: { u: U | PublicUser; children?: React.ReactNode }) {
  const online = 'online' in u && u.online;
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
      <Avatar avatar={u.avatar} url={u.avatarUrl} size={42} offline={'online' in u && !online} />
      <div className="min-w-0 flex-1">
        {u.isGuest ? <p className="truncate font-semibold">{u.displayName}</p> : <Link to={`/u/${u.username}`} className="block truncate font-semibold hover:underline">{u.displayName}</Link>}
        <p className={cx('text-xs', online ? 'text-lime-400' : 'text-ink-500')}>
          {'online' in u ? (online ? '● أونلاين' : 'أوفلاين') : ''} · م{u.level}
          {'gameId' in u && u.gameId && isGameId(u.gameId) && <span className="text-ink-400"> · لعبتوا {GAMES[u.gameId].name}</span>}
        </p>
      </div>
      {children}
    </li>
  );
}

function Friends() {
  const user = useSession((s) => s.user)!;
  const nav = useNavigate();
  const [data, setData] = useState<FriendsData | null>(null);
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [tab, setTab] = useState<'friends' | 'requests' | 'invites' | 'recent' | 'blocked'>('friends');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<U[]>([]);
  const [idText, setIdText] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, i] = await Promise.all([api<FriendsData>('/api/friends'), api<{ invites: InviteView[] }>('/api/invites')]);
      setData(f);
      setInvites(i.invites);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
    const s = getSocket();
    const onUpd = () => void load();
    s.on('friends:update', onUpd);
    s.on('invite:new', onUpd);
    const t = setInterval(load, 30_000);
    return () => {
      s.off('friends:update', onUpd);
      s.off('invite:new', onUpd);
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ users: U[] }>(`/api/users/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => setResults(r.users.filter((x) => x.id !== user.id)))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, user.id]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      void load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  /** add a friend by the other player's ID (their username), e.g. @sara_j */
  const addById = async () => {
    const id = idText.trim().replace(/^@+/, '').trim();
    if (!id) return;
    setAdding(true);
    try {
      const r = await api<{ status: 'friends' | 'outgoing'; user: PublicUser }>('/api/friends/request', { body: { username: id } });
      toast.success(r.status === 'friends' ? `صرتوا أصحاب مع ${r.user.displayName}!` : `انبعت طلب الصداقة لـ ${r.user.displayName}`);
      setIdText('');
      void load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setAdding(false);
    }
  };

  if (user.isGuest)
    return (
      <div className="mx-auto max-w-lg">
        <PageTitle title="الأصحاب" emoji="👯" />
        <div className="card">
          <EmptyState
            emoji="🔐"
            title="الأصحاب للحسابات المسجلة"
            text="سجّل حساب (بتحتفظ بنقاطك كضيف) لتضيف أصحاب، تشوف مين أونلاين، وتستقبل دعوات."
            action={
              <Link to="/register">
                <Button>سجّل حساب</Button>
              </Link>
            }
          />
        </div>
        {invites.length > 0 && <InviteList invites={invites} nav={nav} onRespond={load} />}
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="الأصحاب" emoji="👯" subtitle="ضيف أصحابك، شوف مين أونلاين، واعزمهم على غرفتك" />
      <div className="card mb-5 space-y-4 p-4">
        <div>
          <p className="label">ضيف صديق بالـID تبعه</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void addById();
            }}
          >
            <label className="relative block flex-1">
              <AtSign className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                className="field ps-10"
                dir="ltr"
                placeholder="sara_j"
                value={idText}
                onChange={(e) => setIdText(e.target.value)}
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="ID صديقك"
                data-testid="friend-id-input"
              />
            </label>
            <Button type="submit" icon={<UserPlus className="size-4" />} disabled={adding || idText.trim().replace(/^@+/, '').length < 3} data-testid="friend-id-add">
              أضف
            </Button>
          </form>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-400">
            الـID تبعك:
            <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 font-mono text-ink-100 hover:bg-white/10" dir="ltr" onClick={() => void copyText(user.username)} data-testid="my-id" aria-label="انسخ الـID تبعي">
              @{user.username} <Copy className="size-3.5" />
            </button>
            <span>ابعته لأصحابك عشان يضيفوك. بتقدر تعزم أصحابك بس على الغرف.</span>
          </p>
        </div>
        <label className="relative block">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input className="field ps-10" placeholder="دوّر على لاعب بالاسم أو اسم المستخدم" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {!!results.length && (
          <ul className="mt-3 space-y-2">
            {results.map((u) => (
              <Row key={u.id} u={u}>
                <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => run(() => api('/api/friends/request', { body: { userId: u.id } }), 'انبعت الطلب')}>
                  أضف
                </Button>
              </Row>
            ))}
          </ul>
        )}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'friends', label: `الأصحاب (${data?.friends.length ?? 0})` },
          { value: 'requests', label: `الطلبات (${data?.incoming.length ?? 0})` },
          { value: 'invites', label: `الدعوات (${invites.length})` },
          { value: 'recent', label: 'لعبت معهم' },
          { value: 'blocked', label: 'المحظورين' },
        ]}
      />
      <div className="mt-4">
        {!data ? (
          <Skeleton className="h-40" />
        ) : tab === 'friends' ? (
          data.friends.length ? (
            <ul className="space-y-2">
              {[...data.friends].sort((a, b) => Number(b.online) - Number(a.online)).map((u) => (
                <Row key={u.id} u={u}>
                  <Button size="sm" variant="ghost" onClick={() => confirm(`حذف ${u.displayName}؟`) && run(() => api(`/api/friends/${u.id}`, { method: 'DELETE' }), 'انحذف')}>
                    حذف
                  </Button>
                </Row>
              ))}
            </ul>
          ) : (
            <EmptyState emoji="🫂" title="ما عندك أصحاب لسا" text="دوّر عليهم فوق أو ضيف اللي لعبت معهم." />
          )
        ) : tab === 'requests' ? (
          <div className="space-y-4">
            <ul className="space-y-2">
              {data.incoming.map((u) => (
                <Row key={u.id} u={u}>
                  <Button size="sm" onClick={() => run(() => api('/api/friends/respond', { body: { userId: u.id, accept: true } }), 'صرتوا أصحاب!')}>
                    اقبل
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => run(() => api('/api/friends/respond', { body: { userId: u.id, accept: false } }), 'انرفض')}>
                    ارفض
                  </Button>
                </Row>
              ))}
            </ul>
            {!data.incoming.length && <EmptyState emoji="📭" title="ما في طلبات" />}
            {!!data.outgoing.length && (
              <>
                <p className="text-sm text-ink-400">طلبات بعتتها</p>
                <ul className="space-y-2">
                  {data.outgoing.map((u) => (
                    <Row key={u.id} u={u}>
                      <Button size="sm" variant="ghost" onClick={() => run(() => api(`/api/friends/${u.id}`, { method: 'DELETE' }), 'انلغى الطلب')}>
                        إلغاء
                      </Button>
                    </Row>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : tab === 'invites' ? (
          <InviteList invites={invites} nav={nav} onRespond={load} />
        ) : tab === 'recent' ? (
          data.recent.length ? (
            <ul className="space-y-2">
              {data.recent.map((u) => (
                <Row key={u.id} u={u}>
                  {!u.isGuest && !data.friends.some((f) => f.id === u.id) && (
                    <Button size="sm" variant="secondary" onClick={() => run(() => api('/api/friends/request', { body: { userId: u.id } }), 'انبعت الطلب')}>
                      أضف
                    </Button>
                  )}
                </Row>
              ))}
            </ul>
          ) : (
            <EmptyState emoji="🎲" title="لسا ما لعبت مع حدا" />
          )
        ) : data.blocked.length ? (
          <ul className="space-y-2">
            {data.blocked.map((u) => (
              <Row key={u.id} u={u}>
                <Button size="sm" variant="secondary" onClick={() => run(() => api(`/api/blocks/${u.id}`, { method: 'DELETE' }), 'انفك الحظر')}>
                  فك الحظر
                </Button>
              </Row>
            ))}
          </ul>
        ) : (
          <EmptyState emoji="🕊️" title="ما في حدا محظور" />
        )}
      </div>
    </div>
  );
}

function InviteList({ invites, nav, onRespond }: { invites: InviteView[]; nav: (p: string) => void; onRespond: () => void }) {
  if (!invites.length) return <EmptyState emoji="💌" title="ما في دعوات" text="لما حدا يعزمك على غرفة بتظهر هون." />;
  return (
    <ul className="space-y-2">
      {invites.map((i) => (
        <li key={i.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <Avatar avatar={i.from.avatar} url={i.from.avatarUrl} size={40} />
          <div className="min-w-0 flex-1 text-sm">
            <p>
              <b>{i.from.displayName}</b> عزمك على {GAMES[i.gameId].emoji} {GAMES[i.gameId].name}
            </p>
            <p className="truncate text-xs text-ink-400">{i.roomName}</p>
          </div>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const r = await api<{ code: string }>(`/api/invites/${i.id}/respond`, { body: { accept: true } });
                nav(`/r/${r.code}`);
              } catch (e) {
                toast.error(errorText(e));
                onRespond();
              }
            }}
          >
            ادخل
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await api(`/api/invites/${i.id}/respond`, { body: { accept: false } }).catch(() => {});
              onRespond();
            }}
          >
            لا
          </Button>
        </li>
      ))}
    </ul>
  );
}
