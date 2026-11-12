/**
 * Private sketchpad (strokes stay in this browser until saved through a game action)
 * and a read-only view that replays a drawing. Same segment format and palette as
 * ارسم وخمّن (coordinates 0..1000, 4:3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Trash2, Undo2 } from 'lucide-react';
import type { DrawSegment } from '../../shared/protocol.ts';
import { Button, cx } from '../components/ui.tsx';
import { PALETTE, SIZES, paint } from './DrawGuessGame.tsx';

const inkOf = (segs: DrawSegment[]) => segs.reduce((n, s) => n + s.p.length / 2, 0);

/** Keeps a canvas sized to its container (4:3, crisp on high-DPI) and repaints on resize. */
function useFittedCanvas(redraw: (c: HTMLCanvasElement) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = canvasRef.current!;
    const wrap = wrapRef.current!;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(w * 0.75 * dpr));
      c.style.height = `${w * 0.75}px`;
      redraw(c);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    return () => ro.disconnect();
  }, [redraw]);
  return { canvasRef, wrapRef };
}

/** Read-only drawing. */
export function SketchView({ segments, className, label, testId }: { segments: DrawSegment[]; className?: string; label?: string; testId?: string }) {
  const redraw = useCallback(
    (c: HTMLCanvasElement) => {
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      for (const s of segments) paint(ctx, s, c.width, c.height);
    },
    [segments],
  );
  const { canvasRef, wrapRef } = useFittedCanvas(redraw);
  return (
    <div ref={wrapRef} className={cx('relative w-full overflow-hidden rounded-xl bg-white', className)} data-testid={testId}>
      <canvas ref={canvasRef} className="block w-full" role="img" aria-label={label ?? 'رسمة'} data-strokes={segments.length} />
      {!segments.length && <p className="absolute inset-0 grid place-items-center text-sm text-ink-500">ما رسم إشي 🤷</p>}
    </div>
  );
}

/**
 * Private drawing pad. Calls onChange(segments) after every stroke / undo / clear;
 * the parent decides when to send it. `maxInk` caps the total number of points.
 */
export function Sketchpad({ initial, disabled, maxInk, onChange }: { initial: DrawSegment[]; disabled?: boolean; maxInk: number; onChange: (segs: DrawSegment[]) => void }) {
  const segments = useRef<DrawSegment[]>(initial);
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(1);
  const [eraser, setEraser] = useState(false);
  const [ink, setInk] = useState(() => inkOf(initial));
  const stroke = useRef<{ id: number; pts: number[]; last: [number, number] } | null>(null);
  const strokeSeq = useRef(Math.max(0, ...initial.map((s) => s.s)) + 1);

  const redraw = useCallback((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of segments.current) paint(ctx, s, c.width, c.height);
  }, []);
  const { canvasRef, wrapRef } = useFittedCanvas(redraw);
  const repaint = () => canvasRef.current && redraw(canvasRef.current);
  const changed = () => {
    setInk(inkOf(segments.current));
    onChange(segments.current.slice());
  };

  const left = maxInk - ink - (stroke.current ? stroke.current.pts.length / 2 : 0);
  const toPoint = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.max(0, Math.min(1000, Math.round(((e.clientX - r.left) / r.width) * 1000))), Math.max(0, Math.min(1000, Math.round(((e.clientY - r.top) / r.height) * 1000)))];
  };
  const seg = (p: number[]): DrawSegment => ({ s: stroke.current?.id ?? 0, c: color, w: size, p, ...(eraser ? { e: 1 as const } : {}) });

  const onDown = (e: React.PointerEvent) => {
    if (disabled || inkOf(segments.current) >= maxInk) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = toPoint(e);
    stroke.current = { id: strokeSeq.current++, pts: [pt[0], pt[1]], last: pt };
    const c = canvasRef.current!;
    paint(c.getContext('2d')!, seg(pt), c.width, c.height);
  };
  const onMove = (e: React.PointerEvent) => {
    const st = stroke.current;
    if (disabled || !st) return;
    const pt = toPoint(e);
    if (Math.abs(pt[0] - st.last[0]) + Math.abs(pt[1] - st.last[1]) < 6) return; // saves ink
    if (inkOf(segments.current) + st.pts.length / 2 + 1 > maxInk) return onUp(); // out of ink
    const c = canvasRef.current!;
    paint(c.getContext('2d')!, seg([st.last[0], st.last[1], pt[0], pt[1]]), c.width, c.height);
    st.pts.push(pt[0], pt[1]);
    st.last = pt;
  };
  const onUp = () => {
    const st = stroke.current;
    if (!st) return;
    // split long strokes into segments of at most 200 points (continuous: each starts at the last point)
    for (let i = 0; i < st.pts.length; i += 398) {
      const start = i === 0 ? 0 : i - 2;
      segments.current.push(seg(st.pts.slice(start, i + 398)));
      if (i + 398 >= st.pts.length) break;
    }
    stroke.current = null;
    changed();
  };

  const pct = Math.max(0, Math.min(100, (left / maxInk) * 100));
  return (
    <div>
      <div ref={wrapRef} className="relative w-full overflow-hidden rounded-2xl bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          className={cx('block w-full touch-none', disabled ? 'cursor-default' : 'cursor-crosshair')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          aria-label="لوحة الرسم"
          data-testid="draw-canvas"
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-400" title="الحبر">
        <span>🖍 الحبر</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className={cx('h-full rounded-full transition-all', pct < 15 ? 'bg-zing-500' : 'bg-volt-400')} style={{ width: `${pct}%` }} data-testid="ink-left" data-ink={Math.round(pct)} />
        </div>
        {pct <= 0 && <span className="text-zing-400">خلص الحبر!</span>}
      </div>
      {!disabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(i);
                  setEraser(false);
                }}
                aria-label={`لون ${i + 1}`}
                className={cx('size-8 rounded-full border border-white/20', color === i && !eraser && 'ring-2 ring-volt-400 ring-offset-2 ring-offset-ink-900')}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
            {SIZES.map((s, i) => (
              <button key={s} type="button" onClick={() => setSize(i)} aria-label={`حجم ${i + 1}`} className={cx('grid size-9 place-items-center rounded-lg', size === i && 'bg-white/15')}>
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
              repaint();
              changed();
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
              repaint();
              changed();
            }}
          >
            امسح
          </Button>
        </div>
      )}
    </div>
  );
}
