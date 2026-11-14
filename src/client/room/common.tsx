import type { ReactNode } from 'react';
import { Crown } from 'lucide-react';
import type { GameViewBase, MemberView, RoomView } from '../../shared/protocol.ts';
import { Avatar, Countdown, cx } from '../components/ui.tsx';
import { useRoomContext } from '../lib/room.ts';
import { toast } from '../components/ui.tsx';

export function useMembers(view: RoomView) {
  const byId = new Map(view.members.map((m) => [m.id, m]));
  const name = (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? (view.game as { names?: Record<string, string> })?.names?.[id] ?? 'لاعب') : '');
  return { byId, name };
}

export function PlayerTag({ m, size = 28, sub, highlight }: { m: MemberView | undefined; size?: number; sub?: ReactNode; highlight?: boolean }) {
  if (!m) return <span className="text-ink-400">لاعب طلع</span>;
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-2', highlight && 'font-bold text-volt-300')}>
      <Avatar avatar={m.avatar} url={m.avatarUrl} size={size} offline={!m.connected} voiceId={m.id} />
      <span className="min-w-0">
        <span className="flex items-center gap-1 truncate">
          {m.name}
          {m.isHost && <Crown className="size-3.5 shrink-0 text-sun-400" aria-label="المضيف" />}
        </span>
        {sub && <span className="block text-xs font-normal text-ink-400">{sub}</span>}
      </span>
    </span>
  );
}

/** Title row for a game phase with the shared server-synced countdown. */
export function PhaseHeader({ game, title, subtitle, total }: { game: GameViewBase; title: ReactNode; subtitle?: ReactNode; total?: number }) {
  const { clockOffset } = useRoomContext();
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-400">
          الجولة {Math.max(1, game.round)} من {game.totalRounds}
        </p>
        <h2 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-300">{subtitle}</p>}
      </div>
      <Countdown deadline={game.deadline} offset={clockOffset} total={total} />
    </div>
  );
}

/** Wraps room actions with consistent error toasts and the current phase key. */
export function useGameAction() {
  const room = useRoomContext();
  return async (type: string, payload?: unknown) => {
    const r = await room.act(`game:${type}`, payload, { phaseKey: room.view?.game?.phaseKey });
    if (!r.ok && r.code !== 'STALE_ACTION') toast.error(r.message);
    return r;
  };
}

export function VoteGrid({ candidates, view, voted, onVote, disabledIds = [], counts, highlight }: { candidates: string[]; view: RoomView; voted: string | null; onVote?: (id: string) => void; disabledIds?: string[]; counts?: Record<string, number>; highlight?: string[] }) {
  const { byId, name } = useMembers(view);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {candidates.map((id) => {
        const m = byId.get(id);
        const disabled = !onVote || disabledIds.includes(id);
        return (
          <button
            key={id}
            disabled={disabled}
            onClick={() => onVote?.(id)}
            data-testid={`vote-${id}`}
            className={cx(
              'relative flex items-center gap-2 rounded-2xl border p-3 text-start transition',
              voted === id ? 'border-volt-400 bg-volt-400/15 shadow-glow-volt' : 'border-white/10 bg-white/5',
              !disabled && 'hover:border-brand-400 active:scale-[0.98]',
              highlight?.includes(id) && 'border-zing-400 bg-zing-500/15',
              disabled && voted !== id && 'opacity-60',
            )}
          >
            {m ? <Avatar avatar={m.avatar} url={m.avatarUrl} size={36} voiceId={m.id} /> : <span className="size-9 rounded-full bg-white/10" />}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name(id)}</span>
            {counts && <span className="rounded-lg bg-white/10 px-2 py-0.5 text-sm font-bold tabular-nums">{counts[id] ?? 0}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Scoreboard({ view, scores, teams }: { view: RoomView; scores: Record<string, number>; teams?: Record<string, number> | null }) {
  const { byId } = useMembers(view);
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return (
    <ol className="space-y-1.5">
      {rows.map(([id, s], i) => (
        <li key={id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
          <span className="w-5 text-center text-sm font-bold text-ink-400">{i + 1}</span>
          <PlayerTag m={byId.get(id)} size={26} />
          {teams && <span className={cx('size-2.5 rounded-full', teams[id] === 0 ? 'bg-brand-400' : 'bg-volt-400')} />}
          <span className="ms-auto font-bold tabular-nums text-volt-300">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function SecretCard({ children, tone = 'brand', testId }: { children: ReactNode; tone?: 'brand' | 'zing' | 'volt'; testId?: string }) {
  const tones = { brand: 'from-brand-600 to-brand-700 border-brand-400/40', zing: 'from-zing-500 to-brand-700 border-zing-400/40', volt: 'from-volt-500/80 to-brand-600 border-volt-400/40' };
  return (
    <div data-testid={testId} className={cx('theme-dark relative mx-auto max-w-md animate-flip overflow-hidden rounded-3xl border bg-gradient-to-br p-6 text-center text-[#fff] shadow-glow', tones[tone])}>
      <div className="absolute -end-8 -top-8 size-28 rounded-full bg-white/15 blur-xl" />
      <div className="relative">{children}</div>
    </div>
  );
}
