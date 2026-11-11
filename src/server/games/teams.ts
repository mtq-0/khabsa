import type { PlayerInfo } from './types.ts';
import { shuffle } from './common.ts';

/**
 * Two teams (0 and 1). Respects lobby team choices when they are valid and
 * reasonably balanced, otherwise balances randomly.
 */
export function assignTeams(players: PlayerInfo[], rng: () => number): Record<string, number> {
  const chosen = players.filter((p) => p.team === 0 || p.team === 1);
  const counts = [0, 1].map((t) => chosen.filter((p) => p.team === t).length);
  const out: Record<string, number> = {};
  if (chosen.length === players.length && Math.abs(counts[0] - counts[1]) <= 1 && counts[0] > 0 && counts[1] > 0) {
    for (const p of players) out[p.id] = p.team as number;
    return out;
  }
  shuffle(players, rng).forEach((p, i) => (out[p.id] = i % 2));
  return out;
}

export function teamResults(teams: Record<string, number>, teamScores: number[]) {
  const list = [0, 1].map((t) => ({ team: t, score: teamScores[t] ?? 0, members: Object.keys(teams).filter((p) => teams[p] === t) }));
  const winningTeam = list[0].score === list[1].score ? null : list[0].score > list[1].score ? 0 : 1;
  return { teamScores: list, winningTeam };
}

export const TEAM_NAMES = ['الفريق البنفسجي', 'الفريق الكهربائي'];
