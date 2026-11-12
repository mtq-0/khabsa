import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Circle, Ellipsis, Eraser, Heart, Highlighter, Minus, PaintBucket, Pencil, Square, SprayCan, Star, Trash2, Triangle, Undo2 } from 'lucide-react';
import type { DrawEvent, DrawSegment, RoomView } from '../../shared/protocol.ts';
import { getSocket, request } from '../lib/socket.ts';
import { useRoomContext } from '../lib/room.ts';
import { Button, cx } from '../components/ui.tsx';
import { PALETTE, SIZES, isShape, paint } from './drawPaint.ts';
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

export { PALETTE, SIZES, paint };

type ToolId = 'pen' | 'eraser' | NonNullable<DrawSegment['t']>;
const TOOL_LIST: { id: ToolId; label: string; icon: ReactNode }[] = [
  { id: 'pen', label: 'قلم', icon: <Pencil className="size-4" /> },
  { id: 'hl', label: 'تظليل', icon: <Highlighter className="size-4" /> },
  { id: 'dash', label: 'خط متقطع', icon: <Ellipsis className="size-4" /> },
  { id: 'spray', label: 'بخّاخ', icon: <SprayCan className="size-4" /> },
  { id: 'line', label: 'خط مستقيم', icon: <Minus className="size-4" /> },
  { id: 'rect', label: 'مستطيل', icon: <Square className="size-4" /> },
  { id: 'ellipse', label: 'دائرة', icon: <Circle className="size-4" /> },
  { id: 'tri', label: 'مثلث', icon: <Triangle className="size-4" /> },
  { id: 'star', label: 'نجمة', icon: <Star className="size-4" /> },
  { id: 'heart', label: 'قلب', icon: <Heart className="size-4" /> },
  { id: 'fill', label: 'تعبئة لون', icon: <PaintBucket className="size-4" /> },
  { id: 'eraser', label: 'ممحاة', icon: <Eraser className="size-4" /> },
];

function Canvas({ code, turnKey, canDraw }: { code: string; turnKey: string; canDraw: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const segments = useRef<DrawSegment[]>([]);
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(1);
  const [tool, setTool] = useState<ToolId>('pen');
  const [filled, setFilled] = useState(false);
  const stroke = useRef<{ id: number; pending: number[]; last: [number, number] | null; sent: boolean } | null>(null);
  const shape = useRef<{ id: number; start: [number, number]; cur: [number, number] } | null>(null);
  const strokeSeq = useRef(1);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const eraser = tool === 'eraser';
  const freehandTool = tool === 'hl' || tool === 'dash' || tool === 'spray' ? tool : undefined;
  const isShapeTool = isShape(tool === 'pen' || tool === 'eraser' ? undefined : tool);

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
    const pv = previewRef.current!;
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      c.width = pv.width = Math.round(w * dpr);
      c.height = pv.height = Math.round(w * 0.75 * dpr);
      c.style.height = pv.style.height = `${w * 0.75}px`;
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

  /** the style fields every segment of the current tool carries */
  const style = useCallback(
    () => ({ c: color, w: size, ...(eraser ? { e: 1 as const } : {}), ...(freehandTool ? { t: freehandTool } : {}) }),
    [color, size, eraser, freehandTool],
  );

  const flush = useCallback(() => {
    const st = stroke.current;
    // after the first piece, only send when the pen actually moved (a lone carried-over point would be a stray dot)
    if (!st || st.pending.length < (st.sent ? 4 : 2)) return;
    st.sent = true;
    const seg: DrawSegment = { s: st.id, p: st.pending, ...style() };
    segments.current.push(seg);
    send({ op: 'seg', seg });
    // keep continuity: next segment starts at the last point
    st.pending = st.last ? [st.last[0], st.last[1]] : [];
  }, [style, send]);

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

  const shapeSeg = (sh: { id: number; start: [number, number]; cur: [number, number] }): DrawSegment => ({
    s: sh.id,
    c: color,
    w: size,
    t: tool as NonNullable<DrawSegment['t']>,
    p: [sh.start[0], sh.start[1], sh.cur[0], sh.cur[1]],
    ...(filled && tool !== 'line' ? { f: 1 as const } : {}),
  });
  const clearPreview = () => {
    const pv = previewRef.current;
    pv?.getContext('2d')?.clearRect(0, 0, pv.width, pv.height);
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toPoint(e);
    const c = canvasRef.current!;
    if (tool === 'fill') {
      const seg: DrawSegment = { s: strokeSeq.current++, c: color, w: size, t: 'fill', p: [pt[0], pt[1]] };
      segments.current.push(seg);
      paint(c.getContext('2d')!, seg, c.width, c.height);
      send({ op: 'seg', seg });
      return;
    }
    if (isShapeTool) {
      shape.current = { id: strokeSeq.current++, start: pt, cur: pt };
      return;
    }
    stroke.current = { id: strokeSeq.current++, pending: [pt[0], pt[1]], last: pt, sent: false };
    paint(c.getContext('2d')!, { s: 0, p: pt, ...style() }, c.width, c.height);
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = setInterval(flush, 50);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!canDraw) return;
    const sh = shape.current;
    if (sh) {
      sh.cur = toPoint(e);
      const pv = previewRef.current!;
      const ctx = pv.getContext('2d')!;
      ctx.clearRect(0, 0, pv.width, pv.height);
      paint(ctx, shapeSeg(sh), pv.width, pv.height);
      return;
    }
    const st = stroke.current;
    if (!st) return;
    const pt = toPoint(e);
    if (st.last && Math.abs(pt[0] - st.last[0]) + Math.abs(pt[1] - st.last[1]) < 3) return;
    const c = canvasRef.current!;
    if (st.last) paint(c.getContext('2d')!, { s: 0, p: [st.last[0], st.last[1], pt[0], pt[1]], ...style() }, c.width, c.height);
    st.pending.push(pt[0], pt[1]);
    st.last = pt;
    if (st.pending.length >= 380) flush();
  };
  const onUp = () => {
    const sh = shape.current;
    if (sh) {
      shape.current = null;
      clearPreview();
      // a tiny drag is a mis-click, not a shape
      if (Math.abs(sh.cur[0] - sh.start[0]) + Math.abs(sh.cur[1] - sh.start[1]) < 12) return;
      const seg = shapeSeg(sh);
      segments.current.push(seg);
      const c = canvasRef.current!;
      paint(c.getContext('2d')!, seg, c.width, c.height);
      send({ op: 'seg', seg });
      return;
    }
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
          className={cx('block w-full touch-none', canDraw ? (tool === 'fill' ? 'cursor-cell' : 'cursor-crosshair') : 'cursor-default')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          aria-label="لوحة الرسم"
          data-testid="draw-canvas"
        />
        <canvas ref={previewRef} className="pointer-events-none absolute inset-0 block w-full" aria-hidden />
      </div>
      {canDraw && (
        <div className="mt-3 space-y-2" data-testid="draw-toolbar">
          <div className="flex flex-wrap gap-1 rounded-xl bg-white/5 p-1" role="toolbar" aria-label="أدوات الرسم">
            {TOOL_LIST.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                title={t.label}
                aria-label={t.label}
                aria-pressed={tool === t.id}
                data-testid={`tool-${t.id}`}
                className={cx('flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold', tool === t.id ? 'bg-volt-400 text-ink-950' : 'bg-white/5 text-ink-100 hover:bg-white/10')}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
          {isShapeTool && tool !== 'line' && (
            <div className="flex gap-1 text-xs" role="group" aria-label="نوع الشكل">
              <button type="button" onClick={() => setFilled(false)} aria-pressed={!filled} data-testid="shape-outline" className={cx('rounded-lg px-3 py-1.5 font-semibold', !filled ? 'bg-white/20' : 'bg-white/5')}>
                ⬜ فاضي
              </button>
              <button type="button" onClick={() => setFilled(true)} aria-pressed={filled} data-testid="shape-filled" className={cx('rounded-lg px-3 py-1.5 font-semibold', filled ? 'bg-white/20' : 'bg-white/5')}>
                ⬛ ممتلئ
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex max-w-full flex-wrap gap-1.5" data-testid="palette">
              {PALETTE.map((c, i) => (
                <button
                  key={c}
                  onClick={() => {
                    setColor(i);
                    if (eraser) setTool('pen');
                  }}
                  aria-label={`لون ${i + 1}`}
                  className={cx('size-7 rounded-full border border-white/20', color === i && !eraser && 'ring-2 ring-volt-400 ring-offset-2 ring-offset-ink-900')}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
              {SIZES.map((s, i) => (
                <button key={s} onClick={() => setSize(i)} aria-label={`حجم ${i + 1}`} className={cx('grid size-9 place-items-center rounded-lg', size === i && 'bg-white/15')}>
                  <span className="rounded-full bg-white" style={{ width: Math.min(22, s), height: Math.min(22, s) }} />
                </button>
              ))}
            </div>
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
