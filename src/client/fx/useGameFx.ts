import { useEffect, useRef } from 'react';
import type { RoomApi } from '../lib/room.ts';
import { deriveFx, tickSecond, type FxEvent } from './events.ts';
import { sfx } from './sound.ts';
import { vfx } from './visual.tsx';

function run(e: FxEvent) {
  switch (e.type) {
    case 'join':
      return sfx.join();
    case 'leave':
      return sfx.leave();
    case 'chat':
      return sfx.chat();
    case 'phase':
      return sfx.phase();
    case 'start':
      sfx.start();
      return vfx.flash('good');
    case 'yourTurn':
      sfx.yourTurn();
      vfx.float('دورك! 🎯');
      navigator.vibrate?.(60);
      return;
    case 'vote':
      return sfx.vote();
    case 'tick':
      return sfx.tick(e.seconds);
    case 'points':
      sfx.points();
      return vfx.float(`+${e.amount}`);
    case 'correct':
      sfx.correct();
      vfx.flash('good');
      return vfx.confetti(0.5);
    case 'wrong':
      sfx.wrong();
      vfx.flash('bad');
      vfx.shake();
      navigator.vibrate?.([40, 40, 40]);
      return;
    case 'reveal':
      if (e.roulette) return; // OutsiderRoulette plays its own ticks, hit and confetti
      sfx.drumroll();
      setTimeout(() => {
        if (e.good) {
          vfx.confetti(0.6);
          vfx.flash('good');
        } else {
          sfx.sneaky();
          vfx.shake();
        }
      }, 650);
      return;
    case 'win':
      sfx.win();
      vfx.confetti(1.6);
      setTimeout(() => vfx.confetti(1), 700);
      return;
    case 'gameOver':
      return sfx.gameOver();
  }
}

/** Plays sound and visual effects for changes in the room state. */
export function useGameFx(room: RoomApi) {
  const prev = useRef(room.view);
  const chatCount = useRef(room.chat.length);
  const lastTick = useRef<string | null>(null);

  useEffect(() => {
    const next = room.view;
    if (!next) return;
    const last = room.chat[room.chat.length - 1];
    const events = deriveFx(prev.current, next, chatCount.current, room.chat.length, !!last && last.kind === 'user' && last.userId !== next.you);
    prev.current = next;
    chatCount.current = room.chat.length;
    for (const e of events) run(e);
  }, [room.view, room.chat]);

  // countdown ticks for the last 5 seconds of timed phases
  useEffect(() => {
    const t = setInterval(() => {
      const g = room.view?.game as unknown as Record<string, unknown> | null;
      if (!g || room.view?.status !== 'playing') return;
      const s = tickSecond(g, Date.now() + room.clockOffset);
      if (s == null) return;
      const key = `${g.phaseKey}:${s}`;
      if (lastTick.current === key) return;
      lastTick.current = key;
      run({ type: 'tick', seconds: s });
    }, 200);
    return () => clearInterval(t);
  }, [room.view, room.clockOffset]);
}
