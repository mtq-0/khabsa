/**
 * "Big board" mode for the drawing games: the canvas fills the screen (phone or laptop) and keeps
 * its 4:3 shape; the tools (or the guess box) sit next to it in landscape and under it in portrait.
 * The choice is remembered, so the next turn opens big again.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cx } from '../components/ui.tsx';

/**
 * The big board preference, per role: `draw` (your turn to draw, on by default: the board stays in
 * view while you pick tools) and `watch` (guessing / watching, off by default so the chat stays visible).
 */
export function useBigBoard(role: 'draw' | 'watch'): [boolean, (v: boolean) => void] {
  const key = `khabsa:draw:big:${role}`;
  const read = () => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? role === 'draw' : v === '1';
    } catch {
      return role === 'draw';
    }
  };
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const big = prefs[key] ?? read();
  const setBig = (v: boolean) => {
    setPrefs((p) => ({ ...p, [key]: v }));
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      /* private mode */
    }
    // real full screen where the browser allows it (Android, laptops); iPhones keep the overlay only
    try {
      if (v && !document.fullscreenElement && document.fullscreenEnabled) void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      /* not supported */
    }
  };
  return [big, setBig];
}

const isLandscape = () => window.innerWidth > window.innerHeight && window.innerWidth >= 560;

/** true when the screen is wider than tall (laptop, phone held sideways) */
export function useLandscape() {
  const [land, setLand] = useState(isLandscape);
  useEffect(() => {
    const on = () => setLand(isLandscape());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return land;
}

export function BigToggle({ big, onToggle, className }: { big: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={big}
      aria-label={big ? 'صغّر اللوحة' : 'كبّر اللوحة'}
      title={big ? 'صغّر اللوحة' : 'كبّر اللوحة (ملء الشاشة)'}
      data-testid={big ? 'big-board-close' : 'big-board-open'}
      className={cx('inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold', big ? 'bg-white/10 hover:bg-white/20' : 'bg-volt-400 text-[#07050f] hover:brightness-110', className)}
    >
      {big ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      {big ? 'صغّر' : 'كبّر اللوحة'}
    </button>
  );
}

/**
 * Renders the board inline, or (big) as a full-screen layer. `side` is shown next to / under the
 * board only in big mode (inline, the caller lays it out itself).
 */
export function BoardFrame({ big, onClose, header, side, children }: { big: boolean; onClose: () => void; header?: ReactNode; side?: ReactNode; children: ReactNode }) {
  if (!big) return <>{children}</>;
  return createPortal(
    <BigLayout onClose={onClose} header={header} side={side}>
      {children}
    </BigLayout>,
    document.body,
  );
}

function BigLayout({ onClose, header, side, children }: { onClose: () => void; header?: ReactNode; side?: ReactNode; children: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ w: 0, land: false });
  useLayoutEffect(() => {
    const el = bodyRef.current!;
    const measure = () => {
      // inner size (without the frame's padding)
      const r = { width: el.clientWidth - 16, height: el.clientHeight - 16 };
      const land = isLandscape();
      const sideW = side ? Math.min(330, Math.round(window.innerWidth * 0.4)) : 0;
      // landscape: the side panel takes a column; portrait: keep at least ~150 px under the board for it
      const availW = land ? r.width - sideW - 8 : r.width;
      const availH = land ? r.height : r.height - (side ? 150 : 0);
      setFit({
        w: Math.max(160, Math.floor(Math.min(availW, availH / 0.75))),
        land,
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [side]);
  // no page scrolling behind the board; Esc closes it
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      try {
        if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      } catch {
        /* not supported */
      }
    };
  }, [onClose]);

  return (
    <div className="theme-dark fixed inset-0 z-[90] flex flex-col bg-[#07050f] text-white" style={{ height: '100dvh' }} data-testid="big-board" dir="rtl">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1">
        <div className="min-w-0 flex-1">{header}</div>
        <BigToggle big onToggle={onClose} />
      </div>
      <div ref={bodyRef} className={cx('flex min-h-0 flex-1 gap-2 p-2', fit.land ? 'flex-row items-center' : 'flex-col')}>
        <div className="mx-auto shrink-0" style={{ width: fit.w || undefined }}>
          {children}
        </div>
        {!fit.land && window.innerWidth < 560 && (
          <p className="shrink-0 text-center text-[11px] text-ink-400" data-testid="rotate-tip">
            📱↔️ لف التلفون بالعرض عشان تصير اللوحة أكبر
          </p>
        )}
        {side && (
          <div
            className={cx('scrollbar-thin min-h-0 overflow-y-auto', fit.land ? 'h-full shrink-0' : 'flex-1')}
            style={fit.land ? { width: Math.min(330, Math.round(window.innerWidth * 0.4)) } : undefined}
          >
            {side}
          </div>
        )}
      </div>
    </div>
  );
}
