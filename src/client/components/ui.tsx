import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { create } from 'zustand';
import { Loader2, X } from 'lucide-react';
import { parseAvatar } from '../../shared/avatars.ts';
import { characterUrl } from '../../shared/characters.ts';
import { GAMES, type GameId } from '../../shared/games.ts';
import { asset } from '../lib/mode.ts';
import { SPEAK_MIN, useVoice } from '../voice/voiceStore.ts';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// --------------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'volt';
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-gradient-to-l from-brand-500 to-brand-700 text-[#fff] shadow-glow hover:brightness-110',
    volt: 'theme-dark bg-gradient-to-l from-volt-400 to-brand-500 text-[#07050f] shadow-glow-volt hover:brightness-110',
    secondary: 'bg-white/8 text-ink-100 border border-white/12 hover:bg-white/12',
    ghost: 'text-ink-200 hover:bg-white/8',
    danger: 'bg-zing-500/90 text-[#fff] hover:bg-zing-500',
  };
  const sizes = { sm: 'h-9 px-3 text-sm rounded-lg gap-1.5', md: 'h-11 px-5 rounded-xl gap-2', lg: 'h-14 px-7 text-lg rounded-2xl gap-2.5' };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

// ----------------------------------------------------------------------- Logo
export function LogoMark({ className = 'size-10' }: { className?: string }) {
  return <img src={asset('icon.svg')} alt="" aria-hidden className={cx(className, 'drop-shadow-[0_6px_20px_rgb(139_77_255/0.55)]')} width={40} height={40} />;
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" aria-label="خبصة KHABSA">
      <LogoMark className={compact ? 'size-8' : 'size-10'} />
      <span className="flex flex-col leading-none">
        <span className={cx('font-display text-gradient', compact ? 'text-2xl' : 'text-3xl')}>خَبْصَة</span>
        {!compact && <span className="mt-0.5 text-[10px] font-semibold tracking-[0.35em] text-ink-300">KHABSA</span>}
      </span>
    </span>
  );
}

// --------------------------------------------------------------------- Avatar
/**
 * Player picture. Give it `voiceId` (the player's id) and a GREEN ring appears around it while that
 * player is talking in voice chat; the ring and its glow grow and shrink with their volume.
 */
export function Avatar({ avatar, url, size = 40, name, ring, voiceId, offline, className }: { avatar: string; url?: string | null; size?: number; name?: string; ring?: boolean; voiceId?: string; offline?: boolean; className?: string }) {
  const a = parseAvatar(avatar);
  const level = useVoice((s) => (voiceId ? (s.levels[voiceId] ?? 0) : 0));
  const talking = level >= SPEAK_MIN;
  const boxShadow = talking ? `0 0 0 ${2 + level * 4}px rgb(34 197 94), 0 0 ${6 + level * 20}px ${level * 8}px rgb(34 197 94 / ${0.35 + level * 0.45})` : undefined;
  return (
    <span
      className={cx('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full transition-shadow duration-100', ring && !talking && 'ring-2 ring-volt-400 ring-offset-2 ring-offset-ink-900', offline && 'opacity-45 grayscale', className)}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${a.from}, ${a.to})`, boxShadow }}
      data-speaking={talking ? '1' : undefined}
      data-voice-level={talking ? level.toFixed(1) : undefined}
      title={name ?? a.name}
      role="img"
      aria-label={name ?? 'avatar'}
    >
      <img src={url || characterUrl(a.index)} alt="" className="size-full object-cover" loading="lazy" draggable={false} />
    </span>
  );
}

// ------------------------------------------------------------------- Spinner
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-ink-300" role="status">
      <div className="relative size-14">
        <LogoMark className="size-14 animate-[float_1.6s_ease-in-out_infinite]" />
      </div>
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

// ---------------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,button,select,textarea')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" className={cx('card max-h-[92dvh] w-full animate-rise overflow-y-auto rounded-b-none p-5 sm:rounded-b-[var(--radius-card)]', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/10" aria-label="إغلاق">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- Toasts
interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}
export const useToasts = create<{ toasts: Toast[]; push(kind: Toast['kind'], text: string): void; dismiss(id: number): void }>((set, get) => ({
  toasts: [],
  push(kind, text) {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 3500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
export const toast = {
  info: (t: string) => useToasts.getState().push('info', t),
  success: (t: string) => useToasts.getState().push('success', t),
  warning: (t: string) => useToasts.getState().push('warning', t),
  error: (t: string) => useToasts.getState().push('error', t),
};
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const colors = { info: 'border-volt-400/40', success: 'border-lime-400/50', warning: 'border-sun-400/50', error: 'border-zing-500/60' };
  const icons = { info: '💬', success: '🎉', warning: '⚠️', error: '😬' };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} onClick={() => dismiss(t.id)} className={cx('glass pointer-events-auto flex max-w-md animate-rise items-center gap-3 rounded-2xl border px-4 py-3 text-start text-sm shadow-xl', colors[t.kind])}>
          <span className="text-lg">{icons[t.kind]}</span>
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Countdown
export function useNow(intervalMs = 250, enabled = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, enabled]);
  return now;
}

export function Countdown({ deadline, offset, total, size = 'md' }: { deadline: number | null; offset: number; total?: number; size?: 'sm' | 'md' }) {
  const now = useNow(200, deadline != null);
  if (deadline == null) return null;
  const ms = Math.max(0, deadline - (now + offset));
  const s = Math.ceil(ms / 1000);
  const pct = total ? Math.max(0, Math.min(1, ms / (total * 1000))) : null;
  const urgent = s <= 5;
  return (
    <div className={cx('flex items-center gap-2 font-bold tabular-nums', urgent ? 'text-zing-400' : 'text-volt-300')} aria-label={`باقي ${s} ثانية`}>
      <span className={cx('grid place-items-center rounded-full border-2', urgent ? 'border-zing-400 animate-wiggle' : 'border-volt-400', size === 'sm' ? 'size-8 text-sm' : 'size-11 text-lg')}>{s}</span>
      {pct != null && (
        <span className="hidden h-2 w-24 overflow-hidden rounded-full bg-white/10 sm:block">
          <span className={cx('block h-full rounded-full transition-[width] duration-200', urgent ? 'bg-zing-400' : 'bg-volt-400')} style={{ width: `${pct * 100}%` }} />
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Game art
export function GameArt({ gameId, className, big }: { gameId: GameId; className?: string; big?: boolean }) {
  const g = GAMES[gameId];
  return (
    <div className={cx('theme-dark relative overflow-hidden', className)} style={{ background: `linear-gradient(135deg, ${g.gradient[0]}, ${g.gradient[1]})` }} aria-hidden>
      <div className="absolute -start-6 -top-6 size-24 rounded-full bg-white/15 blur-xl" />
      <div className="absolute -bottom-8 -end-4 size-32 rounded-full bg-black/20 blur-2xl" />
      <svg className="absolute inset-0 size-full opacity-25" viewBox="0 0 100 60" preserveAspectRatio="none">
        <path d="M0 45 Q25 30 50 42 T100 38 V60 H0Z" fill="#fff" />
        <circle cx="82" cy="14" r="5" fill="#fff" />
        <circle cx="12" cy="18" r="2" fill="#fff" />
        <circle cx="64" cy="8" r="1.5" fill="#fff" />
      </svg>
      <span className={cx('absolute inset-0 grid place-items-center drop-shadow-[0_8px_16px_rgb(0_0_0/0.35)]', big ? 'text-8xl' : 'text-6xl')}>{g.emoji}</span>
    </div>
  );
}

// ------------------------------------------------------------------ Misc
export function EmptyState({ emoji, title, text, action }: { emoji: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="text-5xl">{emoji}</span>
      <h3 className="mt-2 text-lg font-bold">{title}</h3>
      {text && <p className="max-w-sm text-sm text-ink-300">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2" htmlFor={id}>
      <span className="text-sm text-ink-200">{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-brand-500' : 'bg-white/15')}
      >
        <span className={cx('absolute top-1 size-5 rounded-full bg-[#fff] shadow transition-all', checked ? 'start-6' : 'start-1')} />
      </button>
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto rounded-2xl bg-white/5 p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx('shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition', value === t.value ? 'bg-brand-500 text-[#fff] shadow-glow' : 'text-ink-300 hover:text-ink-100')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PageTitle({ title, subtitle, emoji, action }: { title: string; subtitle?: string; emoji?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-3 font-display text-4xl leading-tight sm:text-5xl">
          {emoji && <span className="text-3xl sm:text-4xl">{emoji}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-ink-300">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('انسخ ✔');
  } catch {
    toast.warning('ما قدرنا ننسخ تلقائياً، انسخه يدوياً.');
  }
}
