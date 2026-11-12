/**
 * The shared canvas of مين برا الرسمة؟: replays every player's lines (each in their own
 * colour) and, on your turn, lets you add exactly ONE line (pen down → pen up), which is
 * handed to `onStroke`. Same segment format and palette as ارسم وخمّن (0..1000, 4:3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawSegment } from '../../shared/protocol.ts';
import { cx } from '../components/ui.tsx';
import { PALETTE, paint } from './DrawGuessGame.tsx';

export interface StrokeView {
  pid: string;
  segs: DrawSegment[];
}

export const LINE_SIZE = 2;
export const colorOf = (i: number | null | undefined) => PALETTE[i ?? 0] ?? '#111827';

export function SharedCanvas({
  strokes,
  canDraw,
  color,
  maxPoints,
  onStroke,
  dimExcept,
}: {
  strokes: StrokeView[];
  canDraw: boolean;
  color: number;
  maxPoints: number;
  onStroke?: (segs: DrawSegment[]) => Promise<boolean>;
  /** fade every line except these players' (e.g. show the outsider's lines) */
  dimExcept?: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const live = useRef<{ pts: number[]; last: [number, number] } | null>(null);
  // the line you just drew stays on screen until the server's copy arrives
  const [pending, setPending] = useState<DrawSegment[] | null>(null);
  useEffect(() => setPending(null), [strokes.length, canDraw]);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const st of strokes) {
      ctx.globalAlpha = dimExcept && !dimExcept.includes(st.pid) ? 0.18 : 1;
      for (const s of st.segs) paint(ctx, s, c.width, c.height);
    }
    ctx.globalAlpha = 1;
    for (const s of pending ?? []) paint(ctx, s, c.width, c.height);
  }, [strokes, dimExcept, pending]);

  useEffect(() => {
    const c = canvasRef.current!;
    const wrap = wrapRef.current!;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(w * 0.75 * dpr));
      c.style.height = `${w * 0.75}px`;
      redraw();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    return () => ro.disconnect();
  }, [redraw]);

  const toPoint = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, Math.round(((e.clientX - r.left) / r.width) * 1000))), Math.max(0, Math.min(1000, Math.round(((e.clientY - r.top) / r.height) * 1000)))];
  };
  const seg = (p: number[]): DrawSegment => ({ s: 1, c: color, w: LINE_SIZE, p });
  const active = canDraw && !pending;

  const onDown = (e: React.PointerEvent) => {
    if (!active || live.current) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toPoint(e);
    live.current = { pts: [pt[0], pt[1]], last: pt };
    const c = canvasRef.current!;
    paint(c.getContext('2d')!, seg(pt), c.width, c.height);
  };
  const onMove = (e: React.PointerEvent) => {
    const st = live.current;
    if (!st) return;
    const pt = toPoint(e);
    if (Math.abs(pt[0] - st.last[0]) + Math.abs(pt[1] - st.last[1]) < 6) return;
    if (st.pts.length / 2 >= maxPoints) return onUp(); // the line can't get any longer
    const c = canvasRef.current!;
    paint(c.getContext('2d')!, seg([st.last[0], st.last[1], pt[0], pt[1]]), c.width, c.height);
    st.pts.push(pt[0], pt[1]);
    st.last = pt;
  };
  const onUp = () => {
    const st = live.current;
    if (!st) return;
    live.current = null;
    // at most 200 points per segment; each continues from the previous one's last point
    const segs: DrawSegment[] = [];
    for (let i = 0; i < st.pts.length; i += 398) {
      segs.push(seg(st.pts.slice(i === 0 ? 0 : i - 2, i + 398)));
      if (i + 398 >= st.pts.length) break;
    }
    setPending(segs);
    void onStroke?.(segs).then((ok) => !ok && setPending(null));
  };

  return (
    <div ref={wrapRef} className={cx('relative w-full overflow-hidden rounded-2xl bg-white shadow-inner', active && 'ring-4 ring-volt-400')}>
      <canvas
        ref={canvasRef}
        className={cx('block w-full touch-none', active ? 'cursor-crosshair' : 'cursor-default')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
        aria-label="لوحة الرسم المشتركة"
        data-testid="draw-canvas"
        data-strokes={strokes.length}
      />
      {!strokes.length && !pending && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-ink-400">اللوحة فاضية... أول خط عليك 😉</p>}
    </div>
  );
}
