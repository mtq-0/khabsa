/**
 * The "who was outside?" reveal: a spotlight jumps between every player, quickly at first,
 * then slower and slower, and finally stops on the one who was outside — with a tick for every
 * jump and a sting when it lands. Used by مين برا السالفة / الصورة / الرسمة.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomView } from '../../shared/protocol.ts';
import { Avatar, cx } from '../components/ui.tsx';
import { sfx } from '../fx/sound.ts';
import { vfx } from '../fx/visual.tsx';
import { useMembers } from '../room/common.tsx';

/** Delays (ms) between jumps: fast at the start, slowing down (ease-in cubic). */
export function spinSchedule(playerCount: number, targetIndex: number): { steps: number; delays: number[] } {
  const n = Math.max(1, playerCount);
  // at least ~26 jumps, and the last jump must land on the target index
  let steps = 26;
  while (steps % n !== targetIndex % n) steps++;
  const delays = Array.from({ length: steps }, (_, i) => Math.round(45 + 360 * Math.pow(steps === 1 ? 1 : i / (steps - 1), 3)));
  return { steps, delays };
}

const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function OutsiderRoulette({
  view,
  players,
  outsiders,
  caught,
  label,
  seed,
}: {
  view: RoomView;
  players: string[];
  outsiders: string[];
  caught: string[];
  /** e.g. "برا السالفة" */
  label: string;
  /** changes every round so the animation restarts */
  seed: string;
}) {
  const { byId } = useMembers(view);
  const order = useMemo(() => [...new Set([...players, ...outsiders])], [players, outsiders]);
  const targetIndex = Math.max(0, order.indexOf(outsiders[0]));
  const [active, setActive] = useState<number | null>(null);
  const [landed, setLanded] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    clear();
    setLanded(false);
    setActive(null);
    const iAmOutsider = outsiders.includes(view.you);
    const good = iAmOutsider ? caught.length === 0 : caught.length > 0;
    const land = () => {
      setLanded(true);
      sfx.spinLand();
      timers.current.push(
        setTimeout(() => {
          if (good) {
            vfx.confetti(0.7);
            vfx.flash('good');
          } else {
            sfx.sneaky();
            vfx.shake();
            vfx.flash('bad');
          }
          navigator.vibrate?.(good ? 60 : [50, 40, 50]);
        }, 380),
      );
    };
    if (prefersReducedMotion() || order.length < 2) {
      setActive(targetIndex);
      land();
      return clear;
    }
    const { steps, delays } = spinSchedule(order.length, targetIndex);
    let i = 0;
    const next = () => {
      setActive(i % order.length);
      sfx.spinTick(i / (steps - 1));
      if (i === steps - 1) {
        timers.current.push(setTimeout(land, 450));
        return;
      }
      timers.current.push(setTimeout(next, delays[i]));
      i++;
    };
    timers.current.push(setTimeout(next, 350));
    return clear;
    // restart only for a new reveal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const cols = order.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className="card mb-5 p-5 text-center" data-testid="roulette" data-state={landed ? 'landed' : 'spinning'}>
      <p className="text-sm text-ink-300">{landed ? (outsiders.length > 1 ? `اللي كانوا ${label}` : `اللي كان ${label}`) : `مين ${label}؟... 🥁`}</p>
      <div className={cx('mt-3 grid gap-2.5', cols)}>
        {order.map((id, i) => {
          const m = byId.get(id);
          const isOut = outsiders.includes(id);
          const isActive = active === i && !landed;
          const winner = landed && isOut;
          return (
            <div
              key={id}
              data-testid={`roulette-${id}`}
              data-active={isActive ? '1' : undefined}
              data-winner={winner ? '1' : undefined}
              className={cx(
                'relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all duration-100',
                winner && 'z-10 scale-110 animate-pop border-zing-400 bg-zing-500/25 shadow-glow',
                isActive && 'scale-105 border-volt-400 bg-volt-400/20 shadow-glow-volt',
                !winner && !isActive && 'border-white/10 bg-white/5',
                landed && !isOut && 'opacity-35',
              )}
            >
              {m ? <Avatar avatar={m.avatar} url={m.avatarUrl} size={landed && isOut ? 64 : 48} /> : <span className="size-12 rounded-full bg-white/10" />}
              <span className="max-w-full truncate text-sm font-semibold">{m?.name ?? 'لاعب'}</span>
              {winner && (
                <>
                  <span className="text-2xl leading-none" aria-hidden>
                    {label.includes('الصورة') ? '🙈' : label.includes('الرسمة') ? '🖍' : '🕵'}
                  </span>
                  <span className={cx('chip', caught.includes(id) ? 'text-zing-400' : 'text-lime-400')}>{caught.includes(id) ? 'انكشف!' : 'ما انكشف!'}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
