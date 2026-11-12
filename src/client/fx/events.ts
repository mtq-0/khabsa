/**
 * Decides which sound / visual effects to play by comparing two consecutive
 * room states. Pure function (no DOM) so it can be unit-tested.
 */
import type { RoomView } from '../../shared/protocol.ts';

export type FxEvent =
  | { type: 'join' }
  | { type: 'leave' }
  | { type: 'chat' }
  | { type: 'phase' }
  | { type: 'start' }
  | { type: 'yourTurn' }
  | { type: 'vote' }
  | { type: 'tick'; seconds: number }
  | { type: 'points'; amount: number }
  | { type: 'correct' }
  | { type: 'wrong' }
  | { type: 'reveal'; good: boolean }
  | { type: 'win' }
  | { type: 'gameOver' };

type G = Record<string, any>;
const game = (v: RoomView | null): G | null => (v?.game ? (v.game as unknown as G) : null);

/** Phases where the last seconds of the timer tick. */
const TICK_PHASES = new Set(['vote', 'answer', 'question', 'draw', 'turn', 'turns', 'guess', 'choose']);

/** Is it this player's moment to act (asker, explainer, drawer...)? */
function isMyTurn(g: G | null, me: string): boolean {
  if (!g) return false;
  switch (g.gameId) {
    case 'outsider-word':
    case 'outsider-picture':
      return g.phase === 'turns' && g.asker === me;
    case 'taboo':
      return g.phase === 'ready' && g.explainer === me;
    case 'draw-guess':
      return g.phase === 'choose' && g.drawer === me;
    case 'outsider-draw':
      return g.phase === 'turn' && g.drawer === me;
    default:
      return false;
  }
}

export function deriveFx(prev: RoomView | null, next: RoomView, chatCountPrev: number, chatCountNext: number, lastChatFromOther: boolean): FxEvent[] {
  const out: FxEvent[] = [];
  const me = next.you;
  if (!prev || prev.id !== next.id) return out; // first view of a room: stay quiet

  // people
  if (next.members.length > prev.members.length) out.push({ type: 'join' });
  else if (next.members.length < prev.members.length) out.push({ type: 'leave' });
  if (chatCountNext > chatCountPrev && lastChatFromOther) out.push({ type: 'chat' });

  const a = game(prev);
  const b = game(next);

  // game started / finished
  if (b && prev.status !== 'playing' && next.status === 'playing') out.push({ type: 'start' });
  if (prev.status === 'playing' && next.status === 'results' && b?.results) {
    out.push((b.results.winners as string[]).includes(me) ? { type: 'win' } : { type: 'gameOver' });
    return out;
  }
  if (!b) return out;

  const phaseChanged = !a || a.phaseKey !== b.phaseKey;
  if (phaseChanged && a && next.status === 'playing') {
    if (b.phase === 'vote') out.push({ type: 'vote' });
    else out.push({ type: 'phase' });
    if (isMyTurn(b, me) && !isMyTurn(a, me)) out.push({ type: 'yourTurn' });
  }

  // my points went up
  const before = (a?.scores?.[me] as number | undefined) ?? 0;
  const after = (b.scores?.[me] as number | undefined) ?? 0;
  if (a && a.gameId === b.gameId && after > before) out.push({ type: 'points', amount: after - before });

  // game-specific moments (only when the phase just changed into them)
  if (phaseChanged && a) {
    switch (b.gameId) {
      case 'speed-quiz':
        if (b.phase === 'reveal' && b.me?.answer != null) out.push(b.me.answer === b.correct ? { type: 'correct' } : { type: 'wrong' });
        break;
      case 'outsider-word':
      case 'outsider-picture':
      case 'outsider-draw':
        if (b.phase === 'verdict' && b.reveal) {
          const outsiders = b.reveal.outsiders as string[];
          const caught = b.reveal.caught as string[];
          const iAmOutsider = outsiders.includes(me);
          // good for me = I escaped as outsider, or the group caught them
          const good = iAmOutsider ? !caught.includes(me) : caught.length > 0;
          out.push({ type: 'reveal', good });
        }
        break;
      case 'odd-question':
        if (b.phase === 'verdict' && b.reveal) out.push({ type: 'reveal', good: b.reveal.outsider === me ? !b.reveal.caught : b.reveal.caught });
        break;
      case 'most-likely':
        if (b.phase === 'results' && b.result) out.push({ type: 'reveal', good: (b.result.winners as string[]).includes(b.me?.voted) });
        break;
    }
  }

  // draw & guess: a correct guess (the last guesser's correct guess also ends the turn,
  // so this must not depend on the phase staying the same)
  if (a && b.gameId === 'draw-guess' && a.gameId === 'draw-guess' && a.turnNumber === b.turnNumber && (b.guessed?.length ?? 0) > (a.guessed?.length ?? 0)) {
    out.push((b.guessed as string[]).includes(me) && !(a.guessed as string[]).includes(me) ? { type: 'correct' } : { type: 'join' });
  }
  // taboo: points during the same turn
  if (a && !phaseChanged) {
    if (b.gameId === 'taboo' && Array.isArray(b.teamScores) && Array.isArray(a.teamScores)) {
      const team = b.turnTeam as number;
      if (b.teamScores[team] > a.teamScores[team]) out.push({ type: 'correct' });
      else if (b.teamScores[team] < a.teamScores[team]) out.push({ type: 'wrong' });
    }
  }
  return out;
}

/** Seconds left to tick for (5..1), or null when no tick is due. */
export function tickSecond(g: G | null, nowServer: number): number | null {
  if (!g || g.deadline == null || !TICK_PHASES.has(g.phase)) return null;
  const s = Math.ceil((g.deadline - nowServer) / 1000);
  return s >= 1 && s <= 5 ? s : null;
}
