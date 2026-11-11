import { useEffect, useRef, useState } from 'react';
import { Crown, Flag, MoreVertical, Send, Smile, UserMinus, Wifi, WifiOff } from 'lucide-react';
import type { ChatMessage, RoomView } from '../../shared/protocol.ts';
import { api, errorText } from '../lib/api.ts';
import { useRoomContext } from '../lib/room.ts';
import { useVoice } from '../voice/voiceStore.ts';
import { PAGES } from '../lib/mode.ts';
import { Avatar, Button, Modal, cx, toast } from '../components/ui.tsx';

const EMOJIS = ['😂', '🤣', '😅', '😎', '🤔', '🙄', '😱', '🔥', '👏', '❤️', '😭', '🕵️', '👀', '🤐', '💀', '🎉'];

export function PlayersPanel({ view }: { view: RoomView }) {
  const room = useRoomContext();
  const voice = useVoice();
  const isHost = view.hostId === view.you;
  const [menu, setMenu] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const teamGame = view.selectedGame === 'taboo' || (view.selectedGame === 'draw-guess' && view.settings.scoring === 'teams');
  return (
    <div>
      <p className="mb-2 flex items-center justify-between text-sm font-bold">
        اللاعبين
        <span className="text-xs font-normal text-ink-400">
          {view.members.length}/{view.capacity}
        </span>
      </p>
      <ul className="space-y-1.5" data-testid="players-list">
        {view.members.map((m) => (
          <li key={m.id} className="relative flex items-center gap-2 rounded-xl bg-white/5 p-2">
            <Avatar avatar={m.avatar} url={m.avatarUrl} size={34} offline={!m.connected} speaking={!!voice.speaking[m.id]} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-sm font-semibold">
                {m.name}
                {m.id === view.you && <span className="text-xs text-ink-400">(إنت)</span>}
                {m.isHost && <Crown className="size-3.5 shrink-0 text-sun-400" aria-label="المضيف" />}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
                {m.connected ? <Wifi className="size-3 text-lime-400" /> : <WifiOff className="size-3 text-zing-400" />}
                {m.connected ? 'متصل' : 'منقطع'}
                {voice.inVoice[m.id] && <span>🎙️</span>}
                {view.status !== 'playing' && !m.isHost && <span className={m.ready ? 'text-lime-400' : ''}>{m.ready ? '· جاهز' : '· مش جاهز'}</span>}
                {m.inGame && <span>· بيلعب</span>}
                <span>· م{m.level}</span>
              </p>
            </div>
            {teamGame && view.status !== 'playing' && (isHost || m.id === view.you) && (
              <select
                className="rounded-lg bg-ink-900 px-1 py-1 text-xs"
                value={m.team ?? ''}
                onChange={(e) => void room.act('team', { userId: m.id, team: e.target.value === '' ? null : Number(e.target.value) })}
                aria-label="الفريق"
              >
                <option value="">تلقائي</option>
                <option value="0">بنفسجي</option>
                <option value="1">كهربائي</option>
              </select>
            )}
            {m.id !== view.you && (isHost || !PAGES) && (
              <button className="rounded-lg p-1 text-ink-400 hover:bg-white/10" onClick={() => setMenu(menu === m.id ? null : m.id)} aria-label="خيارات اللاعب">
                <MoreVertical className="size-4" />
              </button>
            )}
            {menu === m.id && (
              <div className="glass absolute end-2 top-12 z-20 w-44 rounded-xl p-1 shadow-xl">
                {isHost && (
                  <>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"
                      onClick={async () => {
                        setMenu(null);
                        const r = await room.act('transfer-host', { userId: m.id });
                        if (!r.ok) toast.error(r.message);
                      }}
                    >
                      <Crown className="size-4" /> خلّيه المضيف
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zing-400 hover:bg-white/10"
                      onClick={async () => {
                        setMenu(null);
                        if (!confirm(`متأكد بدك تطلّع ${m.name}؟`)) return;
                        const r = await room.act('kick', { userId: m.id });
                        if (!r.ok) toast.error(r.message);
                      }}
                      data-testid={`kick-${m.id}`}
                    >
                      <UserMinus className="size-4" /> طلّعه
                    </button>
                  </>
                )}
                {!PAGES && (
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"
                    onClick={() => {
                      setMenu(null);
                      setReport(m.id);
                    }}
                  >
                    <Flag className="size-4" /> بلّغ عنه
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <ReportModal userId={report} code={view.code} onClose={() => setReport(null)} name={view.members.find((m) => m.id === report)?.name ?? ''} />
    </div>
  );
}

function ReportModal({ userId, code, onClose, name }: { userId: string | null; code: string; onClose: () => void; name: string }) {
  const [reason, setReason] = useState('abuse');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={!!userId} onClose={onClose} title={`بلاغ عن ${name}`}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api('/api/reports', { body: { targetUserId: userId, roomCode: code, reason, details } });
            toast.success('وصلنا البلاغ، شكراً إلك.');
            onClose();
          } catch (e2) {
            toast.error(errorText(e2));
          } finally {
            setBusy(false);
          }
        }}
      >
        <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="abuse">إساءة أو كلام بذيء</option>
          <option value="cheating">غش</option>
          <option value="spam">سبام</option>
          <option value="other">إشي ثاني</option>
        </select>
        <textarea className="field min-h-24" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="تفاصيل (اختياري)" />
        <Button type="submit" className="w-full" loading={busy}>
          إرسال البلاغ
        </Button>
      </form>
    </Modal>
  );
}

export function ChatPanel({ view, compact }: { view: RoomView; compact?: boolean }) {
  const room = useRoomContext();
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const byId = new Map(view.members.map((m) => [m.id, m]));
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room.chat.length]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    const r = await room.sendChat(t);
    if (!r.ok) {
      toast.error(r.message);
      setText(t);
    }
  };

  return (
    <div className={cx('flex flex-col', compact ? 'h-[60dvh]' : 'h-full min-h-80')}>
      <div ref={listRef} className="scrollbar-thin flex-1 space-y-2 overflow-y-auto pe-1" aria-live="polite" data-testid="chat-list">
        {room.chat.map((m: ChatMessage) =>
          m.kind === 'system' ? (
            <p key={m.id} className="text-center text-xs text-ink-400">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={cx('flex items-start gap-2', m.userId === view.you && 'flex-row-reverse')}>
              <Avatar avatar={byId.get(m.userId ?? '')?.avatar ?? m.avatar} url={byId.get(m.userId ?? '')?.avatarUrl} size={28} />
              <div className={cx('max-w-[78%] rounded-2xl px-3 py-2', m.userId === view.you ? 'rounded-se-sm bg-brand-600/70' : 'rounded-ss-sm bg-white/8')}>
                <p className="text-[11px] font-semibold text-ink-300">
                  {m.name} · <time dateTime={new Date(m.at).toISOString()}>{new Date(m.at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</time>
                </p>
                <p className="break-words text-sm">{m.text}</p>
              </div>
            </div>
          ),
        )}
        {!room.chat.length && <p className="py-6 text-center text-sm text-ink-400">قول مرحبا للشلة 👋</p>}
      </div>
      {emoji && (
        <div className="mt-2 grid grid-cols-8 gap-1 rounded-xl bg-white/5 p-2">
          {EMOJIS.map((e) => (
            <button key={e} className="rounded-lg p-1 text-xl hover:bg-white/10" onClick={() => setText((t) => t + e)}>
              {e}
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <button type="button" className="rounded-xl bg-white/5 px-3 text-ink-300 hover:bg-white/10" onClick={() => setEmoji((x) => !x)} aria-label="إيموجي">
          <Smile className="size-5" />
        </button>
        <input className="field py-2.5" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="اكتب رسالة..." data-testid="chat-input" aria-label="رسالة" />
        <Button type="submit" size="md" className="px-3" aria-label="إرسال" disabled={!text.trim()}>
          <Send className="size-4 -scale-x-100" />
        </Button>
      </form>
    </div>
  );
}
