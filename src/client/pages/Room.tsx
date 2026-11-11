import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Copy, LogOut, MessageCircle, Share2, SkipForward, Square, UserPlus, Users, Gamepad2 } from 'lucide-react';
import { GAMES } from '../../shared/games.ts';
import { normalizeRoomCode, type PublicUser, type RoomView } from '../../shared/protocol.ts';
import { api, errorText } from '../lib/api.ts';
import { RoomContext, useRoom } from '../lib/room.ts';
import { useConnection } from '../lib/socket.ts';
import { useSession } from '../lib/session.ts';
import { PAGES, isHostTab, roomLink } from '../lib/mode.ts';

import { loadHostBadge } from '../lib/pagesExtras.ts';

// Pages edition only (pulls in the in-browser game server)
const HostBadge = loadHostBadge ? lazy(loadHostBadge) : null;
import { RequireSession } from '../components/GuestGate.tsx';
import { Avatar, Button, Modal, Spinner, Tabs, copyText, cx, toast } from '../components/ui.tsx';
import { Lobby } from '../room/Lobby.tsx';
import { ChatPanel, PlayersPanel } from '../room/Panels.tsx';
import { Results } from '../room/Results.tsx';
import { VoicePanel } from '../voice/VoicePanel.tsx';
import { OutsiderGame } from '../games/OutsiderGame.tsx';
import { OddQuestionGame } from '../games/OddQuestionGame.tsx';
import { MostLikelyGame } from '../games/MostLikelyGame.tsx';
import { TabooGame } from '../games/TabooGame.tsx';
import { SpeedQuizGame } from '../games/SpeedQuizGame.tsx';
import { DrawGuessGame } from '../games/DrawGuessGame.tsx';

export default function RoomPage() {
  const { code: raw = '' } = useParams();
  return (
    <RequireSession title="ادخل الغرفة">
      <RoomInner code={normalizeRoomCode(raw)} />
    </RequireSession>
  );
}

function RoomInner({ code }: { code: string }) {
  const room = useRoom(code);
  const nav = useNavigate();
  const conn = useConnection((s) => s.status);
  const [tab, setTab] = useState<'game' | 'chat' | 'players'>('game');
  const [unread, setUnread] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (tab !== 'chat') setUnread((u) => u + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.chat.length]);
  useEffect(() => {
    if (tab === 'chat') setUnread(0);
  }, [tab]);
  useEffect(() => {
    if (room.view) document.title = `${room.view.name} · خبصة`;
    return () => {
      document.title = 'خبصة | KHABSA';
    };
  }, [room.view?.name]);

  // -------------------------------------------------------- recovery screens
  if (room.status === 'error' || room.status === 'kicked' || room.status === 'closed') {
    const e = room.error;
    const emoji = room.status === 'kicked' ? '🥾' : room.status === 'closed' ? '🚪' : e?.code === 'ROOM_FULL' ? '🈵' : e?.code === 'ROOM_NOT_FOUND' || e?.code === 'INVALID_CODE' ? '🔍' : '😬';
    const title = room.status === 'closed' ? 'الغرفة انسكرت' : (e?.message ?? 'صار خطأ');
    return (
      <div className="mx-auto max-w-md py-16 text-center" data-testid="room-error">
        <p className="text-6xl">{emoji}</p>
        <h1 className="mt-4 font-display text-3xl">{title}</h1>
        <p className="mt-2 font-mono text-ink-400" dir="ltr">
          {code}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {room.status === 'error' && e?.code !== 'ROOM_NOT_FOUND' && e?.code !== 'INVALID_CODE' && <Button onClick={room.rejoin}>حاول مرة ثانية</Button>}
          <Button variant="secondary" onClick={() => nav('/join')}>
            ادخل غرفة ثانية
          </Button>
          <Button variant="ghost" onClick={() => nav('/create')}>
            اعمل غرفة جديدة
          </Button>
        </div>
      </div>
    );
  }
  if (!room.view) {
    const networkProblem = room.error && (room.error.code === 'NETWORK' || room.error.code === 'TIMEOUT');
    return (
      <div className="py-16 text-center">
        <Spinner label={conn === 'connected' ? 'عم ندخل الغرفة...' : 'عم نتصل بالخادم...'} />
        {(networkProblem || conn === 'offline' || conn === 'reconnecting') && (
          <div className="mt-2">
            <p className="text-sm text-sun-400">{room.error?.message ?? 'الاتصال بطيء أو مقطوع. الغرفة ممكن تكون موجودة.'}</p>
            <Button className="mt-3" variant="secondary" onClick={room.rejoin}>
              حاول مرة ثانية
            </Button>
          </div>
        )}
      </div>
    );
  }

  const view = room.view;
  const isHost = view.hostId === view.you;
  const link = roomLink(view.code);
  const hostTab = isHostTab(view.code);

  const share = async () => {
    const text = `تعال العب معنا ${GAMES[view.selectedGame].name} على خبصة! 🎮 رمز الغرفة: ${view.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'خبصة', text, url: link });
        return;
      } catch {
        /* cancelled */
      }
    }
    void copyText(`${text}\n${link}`);
  };

  const stage =
    view.status === 'results' ? (
      <Results view={view} />
    ) : view.status === 'playing' && view.game ? (
      <GameStage view={view} />
    ) : (
      <Lobby view={view} />
    );

  return (
    <RoomContext.Provider value={room}>
      <div className="flex min-w-0 flex-col gap-3">
        {/* header */}
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <p className="truncate font-bold">{view.name}</p>
            <p className="truncate text-xs text-ink-400">
              {GAMES[view.selectedGame].emoji} {GAMES[view.selectedGame].name} · {view.visibility === 'public' ? 'عامة' : 'خاصة'}
            </p>
          </div>
          <button onClick={() => void copyText(view.code)} className="flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 font-mono text-lg font-bold tracking-[0.25em] hover:bg-white/12" dir="ltr" aria-label="انسخ رمز الغرفة" data-testid="room-code">
            {view.code} <Copy className="size-4 text-ink-400" />
          </button>
          <div className="ms-auto flex gap-1">
            <Button size="sm" variant="secondary" icon={<Share2 className="size-4" />} onClick={() => void share()}>
              <span className="hidden sm:inline">شارك</span>
            </Button>
            <Button size="sm" variant="secondary" icon={<UserPlus className="size-4" />} onClick={() => setInviteOpen(true)} data-testid="invite-btn">
              <span className="hidden sm:inline">اعزم</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<LogOut className="size-4" />}
              onClick={async () => {
                if (hostTab && !confirm('إنت المضيف: إذا طلعت الغرفة رح تسكر للكل. متأكد؟')) return;
                if (!hostTab && view.status === 'playing' && !confirm('اللعبة شغالة. متأكد بدك تطلع؟')) return;
                await room.leave();
                nav('/');
              }}
              aria-label="اطلع من الغرفة"
              data-testid="leave-room"
            />
          </div>
        </div>

        {HostBadge && (
          <Suspense fallback={null}>
            <HostBadge code={view.code} />
          </Suspense>
        )}

        {/* mobile tabs */}
        <div className="lg:hidden">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'game', label: <span className="flex items-center gap-1.5"><Gamepad2 className="size-4" /> اللعبة</span> },
              { value: 'chat', label: <span className="flex items-center gap-1.5"><MessageCircle className="size-4" /> الشات {unread > 0 && tab !== 'chat' && <span className="rounded-full bg-zing-500 px-1.5 text-[10px]">{unread > 9 ? '9+' : unread}</span>}</span> },
              { value: 'players', label: <span className="flex items-center gap-1.5"><Users className="size-4" /> اللاعبين ({view.members.length})</span> },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className={cx('min-w-0 space-y-3', tab === 'players' ? 'block' : 'hidden lg:block')}>
            <div className="card p-3">
              <VoicePanel view={view} />
            </div>
            <div className="card p-3">
              <PlayersPanel view={view} />
            </div>
          </aside>
          <section className={cx('min-w-0', tab === 'game' ? 'block' : 'hidden lg:block')}>
            <div className="lg:hidden mb-3">
              <VoicePanel view={view} />
            </div>
            {stage}
            {isHost && view.status === 'playing' && <HostControls />}
          </section>
          <aside className={cx('card min-w-0 p-3 lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]', tab === 'chat' ? 'block' : 'hidden lg:block')}>
            <ChatPanel view={view} compact={tab === 'chat'} />
          </aside>
        </div>
      </div>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} view={view} link={link} />
    </RoomContext.Provider>
  );
}

function GameStage({ view }: { view: RoomView }) {
  switch (view.game!.gameId) {
    case 'outsider-word':
    case 'outsider-picture':
      return <OutsiderGame view={view} />;
    case 'odd-question':
      return <OddQuestionGame view={view} />;
    case 'most-likely':
      return <MostLikelyGame view={view} />;
    case 'taboo':
      return <TabooGame view={view} />;
    case 'speed-quiz':
      return <SpeedQuizGame view={view} />;
    case 'draw-guess':
      return <DrawGuessGame view={view} />;
  }
}

function HostControls() {
  return (
    <RoomContext.Consumer>
      {(room) => (
        <div className="mt-6 flex flex-wrap justify-center gap-2 border-t border-white/5 pt-4">
          <span className="w-full text-center text-xs text-ink-500">أدوات المضيف</span>
          <Button size="sm" variant="ghost" icon={<SkipForward className="size-4" />} onClick={() => void room!.act('game:host:skip', undefined, { phaseKey: room!.view?.game?.phaseKey })} data-testid="host-skip">
            تخطى المرحلة
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Square className="size-4" />}
            onClick={async () => {
              if (!confirm('توقف اللعبة؟ ما رح تنحسب النقاط.')) return;
              const r = await room!.act('end-game');
              if (!r.ok) toast.error(r.message);
            }}
          >
            وقّف اللعبة
          </Button>
        </div>
      )}
    </RoomContext.Consumer>
  );
}

function InviteModal({ open, onClose, view, link }: { open: boolean; onClose: () => void; view: RoomView; link: string }) {
  const user = useSession((s) => s.user);
  const [friends, setFriends] = useState<(PublicUser & { online: boolean })[] | null>(null);
  const [recent, setRecent] = useState<(PublicUser & { online: boolean })[]>([]);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!open || !user || PAGES) return;
    api<{ friends: (PublicUser & { online: boolean })[]; recent: (PublicUser & { online: boolean })[] }>('/api/friends')
      .then((r) => {
        setFriends(r.friends);
        setRecent(r.recent.filter((x) => !r.friends.some((f) => f.id === x.id)));
      })
      .catch(() => setFriends([]));
  }, [open, user]);
  const inRoom = new Set(view.members.map((m) => m.id));
  const invite = async (id: string) => {
    try {
      await api('/api/invites', { body: { code: view.code, userId: id } });
      setSent((s) => ({ ...s, [id]: true }));
      toast.success('انبعتت الدعوة');
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const list = [...(friends ?? []), ...recent].filter((f) => !inRoom.has(f.id));
  return (
    <Modal open={open} onClose={onClose} title="اعزم الشلة">
      <div className="space-y-4">
        <div className="flex gap-2">
          <input className="field font-mono text-sm" readOnly value={link} dir="ltr" onFocus={(e) => e.target.select()} aria-label="رابط الغرفة" />
          <Button variant="secondary" onClick={() => void copyText(link)} icon={<Copy className="size-4" />}>
            انسخ
          </Button>
        </div>
        <a className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 font-bold text-ink-950" href={`https://wa.me/?text=${encodeURIComponent(`تعال العب معنا على خبصة 🎮 ${link}`)}`} target="_blank" rel="noopener noreferrer">
          ابعت على واتساب
        </a>
        {PAGES ? (
          <p className="text-center text-sm text-ink-400">انسخ الرابط أو ابعته على واتساب. أصحابك بيفتحوه وبيدخلوا مباشرة.</p>
        ) : user?.isGuest ? (
          <p className="text-center text-sm text-ink-400">
            <Link to="/register" className="text-volt-300 underline">سجّل حساب</Link> لتضيف أصحاب وتعزمهم مباشرة.
          </p>
        ) : friends == null ? (
          <Spinner />
        ) : list.length === 0 ? (
          <p className="text-center text-sm text-ink-400">ما في أصحاب تعزمهم. ضيف أصحاب من صفحة الأصحاب.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-2">
                <Avatar avatar={f.avatar} url={f.avatarUrl} size={36} offline={!f.online} />
                <span className="flex-1 truncate text-sm font-semibold">{f.displayName}</span>
                <span className={cx('text-xs', f.online ? 'text-lime-400' : 'text-ink-500')}>{f.online ? 'أونلاين' : 'أوفلاين'}</span>
                <Button size="sm" disabled={sent[f.id]} onClick={() => void invite(f.id)}>
                  {sent[f.id] ? 'انبعتت' : 'اعزم'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
