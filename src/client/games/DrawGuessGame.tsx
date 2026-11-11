import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Trash2, Undo2 } from 'lucide-react';
import type { DrawEvent, DrawSegment, RoomView } from '../../shared/protocol.ts';
import { getSocket, request } from '../lib/socket.ts';
import { useRoomContext } from '../lib/room.ts';
import { Button, cx } from '../components/ui.tsx';
import { PhaseHeader, PlayerTag, Scoreboard, useGameAction, useMembers } from '../room/common.tsx';

interface DrawView {
  phase: string;
  drawer: string | null;
  turnKey: string;
  turnNumber: number;
  totalTurns: number;
  choices: string[] | null;
  word: string | null;
  hint: string | null;
  guessed: string[];
  feed: { id: number; pid: string; kind: 'guess' | 'correct' | 'close' | 'system'; text: string }[];
  teams: Record<string, number> | null;
  turnPoints: Record<string, number> | null;
  lastWord: string | null;
  players: string[];
  scores: Record<string, number>;
  me: { isPlayer: boolean; isDrawer: boolean; guessed: boolean };
}

export const PALETTE = ['#111827', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#94a3b8'];
export const SIZES = [3, 6, 11, 18, 30];

/** Draws one segment; coordinates are quantized to 0..1000 on both axes. */
function paint(ctx: CanvasRenderingContext2D, seg: DrawSegment, w: number, h: number) {
  const p = seg.p;
  ctx.save();
  ctx.globalCompositeOperation = seg.e ? 'destination-out' : 'source-over';
  ctx.strokeStyle = PALETTE[seg.c] ?? '#fff';
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = (SIZES[seg.w] ?? 6) * (w / 800);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const X = (v: number) => (v / 1000) * w;
  const Y = (v: number) => (v / 1000) * h;
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(X(p[0]), Y(p[1]), ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(X(p[0]), Y(p[1]));
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
    ctx.stroke();
  }
  ctx.restore();
}

function Canvas({ code, turnKey, canDraw }: { code: string; turnKey: string; canDraw: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const segments = useRef<DrawSegment[]>([]);
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(1);
  const [eraser, setEraser] = useState(false);
  const stroke = useRef<{ id: number; pending: number[]; last: [number, number] | null } | null>(null);
  const strokeSeq = useRef(1);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of segments.current) paint(ctx, s, c.width, c.height);
  }, []);

  // size canvas to its container with device pixel ratio for crisp lines
  useEffect(() => {
    const c = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      c.width = Math.round(w * dpr);
      c.height = Math.round(w * 0.75 * dpr);
      c.style.height = `${w * 0.75}px`;
      redraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  // remote events + initial sync for this turn
  useEffect(() => {
    segments.current = [];
    redraw();
    const s = getSocket();
    const onEvent = (e: DrawEvent) => {
      if (e.turnKey !== turnKey) return;
      if (e.op === 'clear') segments.current = [];
      else if (e.op === 'undo') {
        const last = segments.current.at(-1)?.s;
        segments.current = segments.current.filter((x) => x.s !== last);
      } else if (e.seg) {
        segments.current.push(e.seg);
        const c = canvasRef.current;
        if (c) paint(c.getContext('2d')!, e.seg, c.width, c.height);
        return;
      }
      redraw();
    };
    s.on('draw:event', onEvent);
    void request<{ turnKey: string; segments: DrawSegment[] }>('draw:sync', { code }).then((r) => {
      if (r.ok && r.data.turnKey === turnKey && r.data.segments.length) {
        segments.current = [...r.data.segments, ...segments.current.filter((x) => !r.data.segments.includes(x))];
        redraw();
      }
    });
    const onReconnect = () => {
      void request<{ turnKey: string; segments: DrawSegment[] }>('draw:sync', { code }).then((r) => {
        if (r.ok && r.data.turnKey === turnKey) {
          segments.current = r.data.segments;
          redraw();
        }
      });
    };
    s.on('connect', onReconnect);
    return () => {
      s.off('draw:event', onEvent);
      s.off('connect', onReconnect);
    };
  }, [code, turnKey, redraw]);

  const send = useCallback(
    (ev: Omit<DrawEvent, 'turnKey'>) => {
      getSocket().emit('draw:event', { code, turnKey, ...ev } as never);
    },
    [code, turnKey],
  );

  const flush = useCallback(() => {
    const st = stroke.current;
    if (!st || st.pending.length < 2) return;
    const seg: DrawSegment = { s: st.id, c: color, w: size, p: st.pending, ...(eraser ? { e: 1 as const } : {}) };
    segments.current.push(seg);
    send({ op: 'seg', seg });
    // keep continuity: next segment starts at the last point
    st.pending = st.last ? [st.last[0], st.last[1]] : [];
  }, [color, size, eraser, send]);

  useEffect(
    () => () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
    },
    [],
  );

  const toPoint = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, Math.round(((e.clientX - r.left) / r.width) * 1000))), Math.max(0, Math.min(1000, Math.round(((e.clientY - r.top) / r.height) * 1000)))];
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toPoint(e);
    stroke.current = { id: strokeSeq.current++, pending: [pt[0], pt[1]], last: pt };
    const c = canvasRef.current!;
    paint(c.getContext('2d')!, { s: 0, c: color, w: size, p: pt, ...(eraser ? { e: 1 as const } : {}) }, c.width, c.height);
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = setInterval(flush, 50);
  };
  const onMove = (e: React.PointerEvent) => {
    const st = stroke.current;
    if (!canDraw || !st) return;
    const pt = toPoint(e);
    if (st.last && Math.abs(pt[0] - st.last[0]) + Math.abs(pt[1] - st.last[1]) < 3) return;
    const c = canvasRef.current!;
    if (st.last) paint(c.getContext('2d')!, { s: 0, c: color, w: size, p: [st.last[0], st.last[1], pt[0], pt[1]], ...(eraser ? { e: 1 as const } : {}) }, c.width, c.height);
    st.pending.push(pt[0], pt[1]);
    st.last = pt;
    if (st.pending.length >= 380) flush();
  };
  const onUp = () => {
    if (!stroke.current) return;
    flush();
    stroke.current = null;
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = null;
  };

  return (
    <div>
      <div ref={wrapRef} className="relative w-full overflow-hidden rounded-2xl bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          className={cx('block w-full touch-none', canDraw ? 'cursor-crosshair' : 'cursor-default')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          aria-label="لوحة الرسم"
          data-testid="draw-canvas"
        />
      </div>
      {canDraw && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((c, i) => (
              <button key={c} onClick={() => { setColor(i); setEraser(false); }} aria-label={`لون ${i + 1}`} className={cx('size-8 rounded-full border border-white/20', color === i && !eraser && 'ring-2 ring-volt-400 ring-offset-2 ring-offset-ink-900')} style={{ background: c }} />
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
            {SIZES.map((s, i) => (
              <button key={s} onClick={() => setSize(i)} aria-label={`حجم ${i + 1}`} className={cx('grid size-9 place-items-center rounded-lg', size === i && 'bg-white/15')}>
                <span className="rounded-full bg-white" style={{ width: Math.min(22, s), height: Math.min(22, s) }} />
              </button>
            ))}
          </div>
          <Button size="sm" variant={eraser ? 'volt' : 'secondary'} icon={<Eraser className="size-4" />} onClick={() => setEraser((x) => !x)}>
            ممحاة
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Undo2 className="size-4" />}
            onClick={() => {
              const last = segments.current.at(-1)?.s;
              segments.current = segments.current.filter((x) => x.s !== last);
              redraw();
              send({ op: 'undo' });
            }}
          >
            تراجع
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 className="size-4" />}
            onClick={() => {
              segments.current = [];
              redraw();
              send({ op: 'clear' });
            }}
          >
            امسح
          </Button>
        </div>
      )}
    </div>
  );
}

export function DrawGuessGame({ view }: { view: RoomView }) {
  const g = view.game as unknown as DrawView & NonNullable<RoomView['game']>;
  const act = useGameAction();
  const { code } = useRoomContext();
  const { byId, name } = useMembers(view);
  const [guess, setGuess] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [g.feed.length]);

  if (g.phase === 'choose')
    return (
      <div>
        <PhaseHeader game={{ ...g, round: g.turnNumber, totalRounds: g.totalTurns }} title="مين بيرسم؟" total={15} />
        <div className="card p-6 text-center">
          <PlayerTag m={byId.get(g.drawer ?? '')} size={56} />
          {g.me.isDrawer && g.choices ? (
            <>
              <p className="my-4">اختار كلمة لترسمها:</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {g.choices.map((c, i) => (
                  <Button key={c} size="lg" variant="secondary" onClick={() => void act('choose', { choice: i })} data-testid="draw-choice">
                    {c}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-4 text-ink-300">{name(g.drawer)} عم يختار كلمة... ✏️</p>
          )}
        </div>
      </div>
    );

  return (
    <div>
      <PhaseHeader
        game={{ ...g, round: g.turnNumber, totalRounds: g.totalTurns }}
        title={g.phase === 'turnEnd' ? `الكلمة: ${g.lastWord}` : g.me.isDrawer ? `ارسم: ${g.word}` : g.word ? `عرفتها: ${g.word} ✅` : 'خمّن الرسمة!'}
        subtitle={g.phase === 'draw' && !g.word ? <span dir="rtl" className="font-mono text-2xl tracking-[0.35em] text-volt-200" data-testid="draw-hint">{g.hint}</span> : `الرسام: ${name(g.drawer)}`}
        total={80}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Canvas code={code} turnKey={g.turnKey} canDraw={g.me.isDrawer && g.phase === 'draw'} />
        <div className="flex flex-col gap-3">
          <div ref={feedRef} className="card scrollbar-thin h-48 space-y-1 overflow-y-auto p-3 text-sm lg:h-72" aria-live="polite">
            {g.feed.map((f) => (
              <p key={f.id} className={cx(f.kind === 'correct' && 'font-bold text-lime-400', f.kind === 'close' && 'text-sun-400', f.kind === 'system' && 'text-ink-400')}>
                {f.kind !== 'system' && <b>{name(f.pid)}: </b>}
                {f.text}
              </p>
            ))}
          </div>
          {g.phase === 'draw' && !g.me.isDrawer && g.me.isPlayer && !g.me.guessed && (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!guess.trim()) return;
                const t = guess;
                setGuess('');
                await act('guess', { text: t });
              }}
            >
              <input className="field" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="شو الرسمة؟" maxLength={50} autoComplete="off" data-testid="draw-guess" />
              <Button type="submit">خمّن</Button>
            </form>
          )}
          {g.phase === 'turnEnd' && g.turnPoints && (
            <div className="card p-3 text-sm">
              {Object.entries(g.turnPoints).map(([p, pts]) => (
                <p key={p} className="text-lime-400">
                  {name(p)} +{pts}
                </p>
              ))}
              {!Object.keys(g.turnPoints).length && <p className="text-ink-400">محدا عرفها 😅</p>}
            </div>
          )}
          <div className="card p-3">
            <Scoreboard view={view} scores={g.scores} teams={g.teams} />
          </div>
        </div>
      </div>
    </div>
  );
}
