/**
 * Visual effects layer: confetti bursts, screen shake and floating "+N".
 * One fixed overlay per page; effects are triggered through `vfx`.
 * Nothing runs when reduced motion is on.
 */
import { useEffect, useRef } from 'react';
import { create } from 'zustand';

interface Floater {
  id: number;
  text: string;
  tone: 'good' | 'bad';
}

const useFx = create<{ bursts: { id: number; power: number }[]; floaters: Floater[]; shake: number; flash: 'good' | 'bad' | null }>(() => ({
  bursts: [],
  floaters: [],
  shake: 0,
  flash: null,
}));

let reduced = false;
export function setReducedMotion(on: boolean) {
  reduced = on || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

let seq = 0;
export const vfx = {
  confetti(power = 1) {
    if (reduced) return;
    const id = ++seq;
    useFx.setState((s) => ({ bursts: [...s.bursts, { id, power }] }));
  },
  float(text: string, tone: 'good' | 'bad' = 'good') {
    const id = ++seq;
    useFx.setState((s) => ({ floaters: [...s.floaters.slice(-3), { id, text, tone }] }));
    setTimeout(() => useFx.setState((s) => ({ floaters: s.floaters.filter((f) => f.id !== id) })), 1400);
  },
  shake() {
    if (reduced) return;
    useFx.setState({ shake: Date.now() });
  },
  flash(tone: 'good' | 'bad') {
    if (reduced) return;
    useFx.setState({ flash: tone });
    setTimeout(() => useFx.setState({ flash: null }), 450);
  },
};

const COLORS = ['#8b4dff', '#3ce7ff', '#ff3d9a', '#ffd84d', '#a6ff4d', '#ffffff'];

/** Canvas confetti: a few hundred particles, cleans itself up. */
function Confetti({ power, onDone }: { power: number; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const n = Math.round(120 * power);
    const parts = Array.from({ length: n }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.3,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const frame = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - elapsed / 2600);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < 2600) raf = requestAnimationFrame(frame);
      else onDone();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [power, onDone]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[70] size-full" data-testid="confetti" aria-hidden />;
}

export function FxLayer() {
  const { bursts, floaters, flash } = useFx();
  return (
    <>
      {bursts.map((b) => (
        <Confetti key={b.id} power={b.power} onDone={() => useFx.setState((s) => ({ bursts: s.bursts.filter((x) => x.id !== b.id) }))} />
      ))}
      <div className="pointer-events-none fixed inset-x-0 top-1/3 z-[71] flex flex-col items-center gap-2" aria-live="polite">
        {floaters.map((f) => (
          <span key={f.id} className={`fx-float font-display text-5xl drop-shadow-[0_4px_20px_rgb(0_0_0/0.6)] ${f.tone === 'good' ? 'text-lime-400' : 'text-zing-400'}`} data-testid="fx-float" dir="ltr">
            {f.text}
          </span>
        ))}
      </div>
      {flash && <div className={`pointer-events-none fixed inset-0 z-[69] fx-flash ${flash === 'good' ? 'bg-lime-400/15' : 'bg-zing-500/20'}`} aria-hidden />}
    </>
  );
}

/**
 * Wrap content that should shake on mistakes. Uses the Web Animations API on
 * the same element, so children (canvas, inputs) are never re-mounted.
 */
export function ShakeArea({ children }: { children: React.ReactNode }) {
  const shake = useFx((s) => s.shake);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shake || !ref.current?.animate) return;
    ref.current.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(9px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
      { duration: 420, easing: 'ease-out' },
    );
  }, [shake]);
  return <div ref={ref}>{children}</div>;
}
