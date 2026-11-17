import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawEvent, DrawSegment, RoomView } from '../../shared/protocol.ts';
import { getSocket, request } from '../lib/socket.ts';
import { useRoomContext } from '../lib/room.ts';
import { Button, Countdown, cx } from '../components/ui.tsx';
import { BoardPainter, PALETTE, SIZES, SIZE_ORDER, isShape, joinLine, mergeable, paint } from './drawPaint.ts';
import { DrawToolbar, strokeFields, useCustomColor, useDrawStyle, type DrawStyle } from './DrawTools.tsx';
import { BigToggle, BoardFrame, useBigBoard, useLandscape } from './BigBoard.tsx';
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
  feed: {
    id: number;
    pid: string;
    kind: 'guess' | 'correct' | 'close' | 'system';
    text: string;
  }[];
  teams: Record<string, number> | null;
  turnPoints: Record<string, number> | null;
  lastWord: string | null;
  players: string[];
  scores: Record<string, number>;
  me: { isPlayer: boolean; isDrawer: boolean; guessed: boolean };
}

export { PALETTE, SIZES, paint };

const noop = () => {};

/**
 * The drawing of the current turn. It lives above the canvas, so the canvas can move between the
 * normal page and the big board without losing anything.
 */
interface Board {
  turnKey: string;
  segs: DrawSegment[];
  /** undone strokes (drawer), newest last */
  redo: DrawSegment[][];
  redraw: () => void;
  paintSeg: (s: DrawSegment) => void;
}

function useBoard(code: string, turnKey: string): Board {
  const ref = useRef<Board>({
    turnKey: '',
    segs: [],
    redo: [],
    redraw: noop,
    paintSeg: noop,
  });
  const b = ref.current;
  if (b.turnKey !== turnKey) {
    b.turnKey = turnKey;
    b.segs = [];
    b.redo = [];
  }
  useEffect(() => {
    b.redraw();
    const s = getSocket();
    const onEvent = (e: DrawEvent) => {
      if (e.turnKey !== turnKey) return;
      if (e.op === 'clear') b.segs = [];
      else if (e.op === 'undo') {
        const last = b.segs.at(-1)?.s;
        b.segs = b.segs.filter((x) => x.s !== last);
      } else if (e.seg) {
        b.segs.push(e.seg);
        b.paintSeg(e.seg);
        return;
      }
      b.redraw();
    };
    s.on('draw:event', onEvent);
    void request<{ turnKey: string; segments: DrawSegment[] }>('draw:sync', {
      code,
    }).then((r) => {
      if (r.ok && r.data.turnKey === turnKey && r.data.segments.length) {
        b.segs = [...r.data.segments, ...b.segs.filter((x) => !r.data.segments.includes(x))];
        b.redraw();
      }
    });
    const onReconnect = () => {
      void request<{ turnKey: string; segments: DrawSegment[] }>('draw:sync', {
        code,
      }).then((r) => {
        if (r.ok && r.data.turnKey === turnKey) {
          b.segs = r.data.segments;
          b.redraw();
        }
      });
    };
    s.on('connect', onReconnect);
    return () => {
      s.off('draw:event', onEvent);
      s.off('connect', onReconnect);
    };
  }, [code, turnKey, b]);
  return b;
}

function Canvas({ board, canDraw, style, send, onPick }: { board: Board; canDraw: boolean; style: DrawStyle; send: (ev: Omit<DrawEvent, 'turnKey'>) => void; onPick: (rgb: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef(style);
  styleRef.current = style;
  const stroke = useRef<{
    id: number;
    pending: number[];
    last: [number, number] | null;
    sent: boolean;
    /** the pieces of this line already sent */
    parts: DrawSegment[];
    /** see-through line: shown whole on the preview layer, put on the board when finished */
    merge: boolean;
  } | null>(null);
  const painter = useRef(new BoardPainter()).current;
  const shape = useRef<{
    id: number;
    start: [number, number];
    cur: [number, number];
  } | null>(null);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tool = style.tool;

  const ctx = () => canvasRef.current!.getContext('2d', { willReadFrequently: true })!;
  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    painter.repaint(c.getContext('2d', { willReadFrequently: true })!, board.segs);
  }, [board, painter]);

  // this canvas paints the board while it is on screen
  useEffect(() => {
    board.redraw = redraw;
    board.paintSeg = (seg) => {
      const c = canvasRef.current;
      if (c) painter.add(c.getContext('2d', { willReadFrequently: true })!, seg);
    };
    redraw();
    return () => {
      board.redraw = noop;
      board.paintSeg = noop;
    };
  }, [board, redraw, painter]);

  // size canvas to its container with device pixel ratio for crisp lines
  useEffect(() => {
    const c = canvasRef.current!;
    const pv = previewRef.current!;
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      c.width = pv.width = Math.max(1, Math.round(w * dpr));
      c.height = pv.height = Math.max(1, Math.round(w * 0.75 * dpr));
      c.style.height = pv.style.height = `${w * 0.75}px`;
      redraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(
    () => () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
    },
    [],
  );

  const nextId = () => board.segs.reduce((m, s) => Math.max(m, s.s), 0) + 1;
  const commit = (seg: DrawSegment) => {
    board.segs.push(seg);
    board.redo = [];
    send({ op: 'seg', seg });
  };

  const previewClear = () => {
    const pv = previewRef.current;
    pv?.getContext('2d')?.clearRect(0, 0, pv.width, pv.height);
  };
  /** the part of the line not sent yet is drawn on the preview layer (brushes look the same as on everyone else's screen) */
  const previewStroke = () => {
    const st = stroke.current;
    const pv = previewRef.current;
    if (!st || !pv) return;
    const g = pv.getContext('2d')!;
    g.clearRect(0, 0, pv.width, pv.height);
    const cur: DrawSegment = { s: st.id, p: st.pending, ...strokeFields(styleRef.current) };
    if (st.merge) {
      const parts = st.pending.length >= 2 ? [...st.parts, cur] : st.parts;
      if (parts.length) paint(g, joinLine(parts), pv.width, pv.height);
    } else if (st.pending.length >= 2) paint(g, cur, pv.width, pv.height);
  };

  const flush = useCallback(() => {
    const st = stroke.current;
    // after the first piece, only send when the pen actually moved (a lone carried-over point would be a stray dot)
    if (!st || st.pending.length < (st.sent ? 4 : 2)) return;
    st.sent = true;
    const seg: DrawSegment = {
      s: st.id,
      p: st.pending,
      ...strokeFields(styleRef.current),
    };
    commit(seg);
    st.parts.push(seg);
    // keep continuity: next segment starts at the last point
    st.pending = st.last ? [st.last[0], st.last[1]] : [];
    if (st.merge) previewStroke();
    else {
      const c = canvasRef.current!;
      if (!seg.e) painter.add(c.getContext('2d', { willReadFrequently: true })!, seg);
      previewClear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, board, painter]);

  const toPoint = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, Math.round(((e.clientX - r.left) / r.width) * 1000))), Math.max(0, Math.min(1000, Math.round(((e.clientY - r.top) / r.height) * 1000)))];
  };

  const shapeSeg = (sh: { id: number; start: [number, number]; cur: [number, number] }): DrawSegment => {
    const st = styleRef.current;
    const f = strokeFields(st);
    return {
      s: sh.id,
      c: f.c,
      w: f.w,
      ...(f.k !== undefined ? { k: f.k } : {}),
      ...(f.o !== undefined ? { o: f.o } : {}),
      ...(f.m ? { m: 1 as const } : {}),
      t: st.tool as NonNullable<DrawSegment['t']>,
      p: [sh.start[0], sh.start[1], sh.cur[0], sh.cur[1]],
      ...(st.filled && st.tool !== 'line' && st.tool !== 'arrow' ? { f: 1 as const } : {}),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toPoint(e);
    const c = canvasRef.current!;
    const st = styleRef.current;
    if (st.tool === 'pick') {
      const x = Math.min(c.width - 1, Math.round((pt[0] / 1000) * c.width));
      const y = Math.min(c.height - 1, Math.round((pt[1] / 1000) * c.height));
      const d = ctx().getImageData(x, y, 1, 1).data;
      // the board is white under the drawing
      const a = d[3] / 255;
      const mix = (v: number) => Math.round(v * a + 255 * (1 - a));
      onPick((mix(d[0]) << 16) | (mix(d[1]) << 8) | mix(d[2]));
      return;
    }
    if (st.tool === 'fill') {
      const f = strokeFields(st);
      const seg: DrawSegment = {
        s: nextId(),
        c: f.c,
        w: f.w,
        t: 'fill',
        p: [pt[0], pt[1]],
        ...(f.k !== undefined ? { k: f.k } : {}),
        ...(f.m ? { m: 1 as const } : {}),
      };
      commit(seg);
      painter.add(ctx(), seg);
      return;
    }
    if (isShape(st.tool === 'pen' || st.tool === 'eraser' ? undefined : st.tool)) {
      shape.current = { id: nextId(), start: pt, cur: pt };
      return;
    }
    stroke.current = {
      id: nextId(),
      pending: [pt[0], pt[1]],
      last: pt,
      sent: false,
      parts: [],
      merge: mergeable({ s: 0, p: pt, ...strokeFields(st) }),
    };
    if (st.tool === 'eraser') paint(ctx(), { s: 0, p: pt, ...strokeFields(st) }, c.width, c.height);
    else previewStroke();
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = setInterval(flush, 50);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!canDraw) return;
    const sh = shape.current;
    if (sh) {
      sh.cur = toPoint(e);
      const pv = previewRef.current!;
      const g = pv.getContext('2d')!;
      g.clearRect(0, 0, pv.width, pv.height);
      paint(g, shapeSeg(sh), pv.width, pv.height);
      return;
    }
    const st = stroke.current;
    if (!st) return;
    const pt = toPoint(e);
    if (st.last && Math.abs(pt[0] - st.last[0]) + Math.abs(pt[1] - st.last[1]) < 3) return;
    const c = canvasRef.current!;
    if (styleRef.current.tool === 'eraser' && st.last)
      paint(
        ctx(),
        {
          s: 0,
          p: [st.last[0], st.last[1], pt[0], pt[1]],
          ...strokeFields(styleRef.current),
        },
        c.width,
        c.height,
      );
    st.pending.push(pt[0], pt[1]);
    st.last = pt;
    if (styleRef.current.tool !== 'eraser') previewStroke();
    if (st.pending.length >= 380) flush();
  };
  const onUp = () => {
    const sh = shape.current;
    if (sh) {
      shape.current = null;
      previewClear();
      // a tiny drag is a mis-click, not a shape
      if (Math.abs(sh.cur[0] - sh.start[0]) + Math.abs(sh.cur[1] - sh.start[1]) < 12) return;
      const seg = shapeSeg(sh);
      commit(seg);
      painter.add(ctx(), seg);
      return;
    }
    const st = stroke.current;
    if (!st) return;
    flush();
    // a see-through line goes onto the board as one line
    if (st.merge && st.parts.length) painter.add(ctx(), ...st.parts);
    stroke.current = null;
    previewClear();
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = null;
  };

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-2xl bg-[#fff] shadow-inner">
      <canvas
        ref={canvasRef}
        className={cx('block w-full touch-none', canDraw ? (tool === 'fill' ? 'cursor-cell' : tool === 'pick' ? 'cursor-copy' : 'cursor-crosshair') : 'cursor-default')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
        aria-label="لوحة الرسم"
        data-testid="draw-canvas"
      />
      <canvas ref={previewRef} className="pointer-events-none absolute inset-0 block w-full" aria-hidden />
      {style.mirror && canDraw && <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l-2 border-dashed border-volt-400/50" aria-hidden />}
    </div>
  );
}

export function DrawGuessGame({ view }: { view: RoomView }) {
  const g = view.game as unknown as DrawView & NonNullable<RoomView['game']>;
  const act = useGameAction();
  const { code, clockOffset } = useRoomContext();
  const { byId, name } = useMembers(view);
  const [guess, setGuess] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);
  const bigFeedRef = useRef<HTMLDivElement>(null);
  const [style, update] = useDrawStyle();
  const pickColor = useCustomColor(style, update);
  const board = useBoard(code, g.turnKey);
  const canDraw = g.me.isDrawer && g.phase === 'draw';
  const [big, setBig] = useBigBoard(canDraw ? 'draw' : 'watch');
  const landscape = useLandscape();
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
    bigFeedRef.current?.scrollTo({ top: bigFeedRef.current.scrollHeight });
  }, [g.feed.length, big]);

  const send = useCallback(
    (ev: Omit<DrawEvent, 'turnKey'>) =>
      getSocket().emit('draw:event', {
        code,
        turnKey: g.turnKey,
        ...ev,
      } as never),
    [code, g.turnKey],
  );
  const undo = useCallback(() => {
    const last = board.segs.at(-1)?.s;
    if (last == null) return;
    board.redo.push(board.segs.filter((x) => x.s === last));
    board.segs = board.segs.filter((x) => x.s !== last);
    board.redraw();
    send({ op: 'undo' });
  }, [board, send]);
  const redo = useCallback(() => {
    const st = board.redo.pop();
    if (!st) return;
    for (const seg of st) {
      board.segs.push(seg);
      send({ op: 'seg', seg });
    }
    board.redraw();
  }, [board, send]);
  const clear = useCallback(() => {
    board.segs = [];
    board.redo = [];
    board.redraw();
    send({ op: 'clear' });
  }, [board, send]);

  // keyboard shortcuts for the drawer (laptops)
  useEffect(() => {
    if (!canDraw) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = SIZE_ORDER.indexOf(style.size);
      if (k === 'b' || k === 'p') update({ tool: 'pen' });
      else if (k === 'e') update({ tool: 'eraser' });
      else if (k === 'f') update({ tool: 'fill' });
      else if (k === 'i') update({ tool: 'pick' });
      else if (k === 'm') update({ mirror: !style.mirror });
      else if (e.key === '[') update({ size: SIZE_ORDER[Math.max(0, i - 1)] });
      else if (e.key === ']') update({ size: SIZE_ORDER[Math.min(SIZE_ORDER.length - 1, i + 1)] });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canDraw, undo, redo, style.size, style.mirror, update]);

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

  const title = g.phase === 'turnEnd' ? `الكلمة: ${g.lastWord}` : g.me.isDrawer ? `ارسم: ${g.word}` : g.word ? `عرفتها: ${g.word} ✅` : 'خمّن الرسمة!';
  const hint =
    g.phase === 'draw' && !g.word ? (
      <span dir="rtl" className="font-mono text-2xl tracking-[0.35em] text-volt-200" data-testid="draw-hint">
        {g.hint}
      </span>
    ) : (
      `الرسام: ${name(g.drawer)}`
    );
  const canGuess = g.phase === 'draw' && !g.me.isDrawer && g.me.isPlayer && !g.me.guessed;
  const feed = (ref: React.RefObject<HTMLDivElement | null>, cls: string) => (
    <div ref={ref} className={cx('card scrollbar-thin space-y-1 overflow-y-auto p-3 text-sm', cls)} aria-live="polite">
      {g.feed.map((f) => (
        <p key={f.id} className={cx(f.kind === 'correct' && 'font-bold text-lime-400', f.kind === 'close' && 'text-sun-400', f.kind === 'system' && 'text-ink-400')}>
          {f.kind !== 'system' && <b>{name(f.pid)}: </b>}
          {f.text}
        </p>
      ))}
    </div>
  );
  const guessForm = canGuess && (
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
  );
  const turnPoints = g.phase === 'turnEnd' && g.turnPoints && (
    <div className="card p-3 text-sm">
      {Object.entries(g.turnPoints).map(([p, pts]) => (
        <p key={p} className="text-lime-400">
          {name(p)} <bdi dir="ltr">+{pts}</bdi>
        </p>
      ))}
      {!Object.keys(g.turnPoints).length && <p className="text-ink-400">ما حدا عرفها 😅</p>}
    </div>
  );
  const toolbar = canDraw && <DrawToolbar style={style} update={update} onUndo={undo} onRedo={redo} onClear={clear} big={big} onBig={() => setBig(!big)} wide={big && landscape} />;
  const canvas = <Canvas board={board} canDraw={canDraw} style={style} send={send} onPick={(rgb) => pickColor(rgb)} />;

  return (
    <div>
      <PhaseHeader game={{ ...g, round: g.turnNumber, totalRounds: g.totalTurns }} title={title} subtitle={hint} total={80} />
      {big && (
        <BoardFrame
          big
          onClose={() => setBig(false)}
          header={
            <div className="flex items-center gap-3">
              <Countdown deadline={g.deadline} offset={clockOffset} total={g.phaseSeconds || 80} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-display text-xl leading-tight">{title}</p>
                <p className="truncate text-xs text-ink-300">{typeof hint === 'string' ? hint : <span className="font-mono tracking-[0.3em] text-volt-200">{g.hint}</span>}</p>
              </div>
            </div>
          }
          side={
            canDraw ? (
              toolbar
            ) : (
              <div className="flex h-full flex-col gap-2">
                {guessForm}
                {turnPoints}
                {feed(bigFeedRef, 'min-h-24 flex-1')}
              </div>
            )
          }
        >
          {canvas}
        </BoardFrame>
      )}
      {!big && (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            {/* as big as the column allows, but never taller than the screen (laptops) */}
            <div className="relative mx-auto" style={{ maxWidth: 'max(320px, calc((100dvh - 360px) * 4 / 3))' }}>
              {canvas}
              {!canDraw && <BigToggle big={false} onToggle={() => setBig(true)} className="absolute bottom-2 left-2 opacity-90" />}
            </div>
            {toolbar && <div className="mx-auto mt-3 max-w-3xl">{toolbar}</div>}
          </div>
          <div className="flex flex-col gap-3">
            {guessForm}
            {feed(feedRef, 'h-40 2xl:h-72')}
            {turnPoints}
            <div className="card p-3">
              <Scoreboard view={view} scores={g.scores} teams={g.teams} />
            </div>
          </div>
        </div>
      )}
      {big && (
        <div className="card p-3">
          <Scoreboard view={view} scores={g.scores} teams={g.teams} />
        </div>
      )}
    </div>
  );
}
