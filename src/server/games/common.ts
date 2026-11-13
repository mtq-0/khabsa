import { AppError } from '../../shared/errors.ts';
import type { FinalResults } from '../../shared/protocol.ts';
import type { BaseState, EngineCtx, InitInput } from './types.ts';
import type { GameId } from '../../shared/games.ts';

export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickN<T>(arr: readonly T[], n: number, rng: () => number): T[] {
  return shuffle(arr, rng).slice(0, n);
}

export function baseState(gameId: GameId, input: InitInput, totalRounds: number): BaseState {
  const players = input.players.map((p) => p.id);
  return {
    gameId,
    phase: 'init',
    phaseKey: 'init',
    seq: 0,
    deadline: null,
    round: 0,
    totalRounds,
    players,
    names: Object.fromEntries(input.players.map((p) => [p.id, p.name])),
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    finished: false,
    results: null,
  };
}

export function setPhase(s: BaseState, phase: string, ctx: EngineCtx, seconds: number | null) {
  s.seq += 1;
  s.phase = phase;
  s.phaseKey = `${s.round}:${phase}:${s.seq}`;
  s.deadline = seconds == null ? null : ctx.now + seconds * 1000;
}

export function requirePhase(s: BaseState, ...phases: string[]) {
  if (!phases.includes(s.phase)) throw new AppError('INVALID_ACTION', 'هالحركة مش بوقتها.');
}

export function requirePlayer(s: BaseState, playerId: string) {
  if (!s.players.includes(playerId)) throw new AppError('FORBIDDEN', 'إنت متفرج بهالجولة.');
}

export function addScore(s: BaseState, playerId: string, pts: number) {
  if (!s.players.includes(playerId)) return;
  s.scores[playerId] = (s.scores[playerId] ?? 0) + pts;
}

export function rankingFromScores(s: BaseState): FinalResults {
  const sorted = s.players.map((p) => ({ playerId: p, score: s.scores[p] ?? 0 })).sort((a, b) => b.score - a.score);
  let place = 0;
  let last = Number.NaN;
  const ranking = sorted.map((r, i) => {
    if (r.score !== last) {
      place = i + 1;
      last = r.score;
    }
    return { ...r, place };
  });
  const top = ranking[0]?.score ?? 0;
  return { ranking, winners: top > 0 ? ranking.filter((r) => r.score === top).map((r) => r.playerId) : [] };
}

export function finish(s: BaseState, ctx: EngineCtx, results?: FinalResults) {
  s.results = results ?? rankingFromScores(s);
  s.finished = true;
  setPhase(s, 'finished', ctx, null);
}

export function baseView(s: BaseState, now: number) {
  return {
    gameId: s.gameId,
    phase: s.phase,
    phaseKey: s.phaseKey,
    deadline: s.deadline,
    serverNow: now,
    round: s.round,
    totalRounds: s.totalRounds,
    players: s.players,
    scores: s.scores,
    finished: s.finished,
    results: s.results,
  };
}

export function asObject(p: unknown): Record<string, unknown> {
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}

export function str(p: unknown, key: string, max = 200): string {
  const v = asObject(p)[key];
  if (typeof v !== 'string') throw new AppError('VALIDATION');
  return v.slice(0, max);
}

// ---------------------------------------------------------------------------
// Voting helpers for the social deduction games
// ---------------------------------------------------------------------------

export function tally(votes: Record<string, string>, candidates: string[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(candidates.map((c) => [c, 0]));
  for (const target of Object.values(votes)) if (target in counts) counts[target] += 1;
  return counts;
}

/**
 * Accused players = the top `slots` vote-getters with at least one vote.
 * When a tie straddles the cut-off, all tied players are left out
 * ("ties favour the outsider").
 */
export function accused(counts: Record<string, number>, slots: number): string[] {
  const entries = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return [];
  const out: string[] = [];
  let i = 0;
  while (i < entries.length && out.length < slots) {
    const n = entries[i][1];
    const group = entries.filter(([, c]) => c === n).map(([p]) => p);
    if (out.length + group.length > slots) break;
    out.push(...group);
    i += group.length;
  }
  return out;
}

export function castVote(votes: Record<string, string>, players: string[], voter: string, payload: unknown, allowSelf = false) {
  const target = str(payload, 'target', 64);
  if (!players.includes(target)) throw new AppError('VALIDATION', 'اختيار غير صالح.');
  if (!allowSelf && target === voter) throw new AppError('INVALID_ACTION', 'ما بتقدر تصوّت لحالك.');
  votes[voter] = target;
}

/**
 * Next player to take a turn: random, but fair — only among the players who have had the
 * fewest turns so far, and never the same player twice in a row (when there is a choice).
 */
export function pickTurnPlayer(players: readonly string[], counts: Readonly<Record<string, number>>, last: string | null, rng: () => number): string {
  const min = Math.min(...players.map((p) => counts[p] ?? 0));
  let pool = players.filter((p) => (counts[p] ?? 0) === min);
  if (pool.length > 1 && last) pool = pool.filter((p) => p !== last);
  if (pool.length === 0) pool = players.filter((p) => p !== last);
  if (pool.length === 0) pool = [...players];
  return pool[Math.floor(rng() * pool.length)];
}

/** Random player other than `not` (prefers someone other than `avoid`, e.g. the previous target). */
export function pickOther(players: readonly string[], not: string, avoid: string | null, rng: () => number): string {
  let pool = players.filter((p) => p !== not);
  const fresh = pool.filter((p) => p !== avoid);
  if (fresh.length) pool = fresh;
  return pool.length ? pool[Math.floor(rng() * pool.length)] : not;
}
