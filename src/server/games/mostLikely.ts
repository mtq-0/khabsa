/**
 * مين غالباً؟ — vote for the friend who best fits the prompt.
 * Voting with the majority earns +1; the top vote-getter takes the title.
 * Flow per round: vote → results
 */
import { AppError } from '../../shared/errors.ts';
import { addScore, baseState, baseView, castVote, finish, rankingFromScores, requirePhase, requirePlayer, setPhase, tally } from './common.ts';
import type { BaseState, ContentItem, EngineCtx, GameEngine } from './types.ts';

export interface MostLikelyState extends BaseState {
  settings: { anonymous: boolean; voteSeconds: number };
  pool: ContentItem[];
  prompt: string;
  votes: Record<string, string>;
  winners: string[];
  titles: Record<string, string[]>;
  roundPoints: Record<string, number>;
  history: { round: number; prompt: string; winners: string[]; counts: Record<string, number> }[];
}

const RESULTS_SECONDS = 9;

export function createMostLikelyEngine(): GameEngine<MostLikelyState> {
  function startRound(s: MostLikelyState, ctx: EngineCtx) {
    s.round += 1;
    s.prompt = String((s.pool[s.round - 1].data as { text: string }).text);
    s.votes = {};
    s.winners = [];
    s.roundPoints = {};
    setPhase(s, 'vote', ctx, s.settings.voteSeconds);
  }
  function close(s: MostLikelyState, ctx: EngineCtx) {
    const counts = tally(s.votes, s.players);
    const max = Math.max(0, ...Object.values(counts));
    s.winners = max > 0 ? Object.keys(counts).filter((p) => counts[p] === max) : [];
    for (const w of s.winners) (s.titles[w] ??= []).push(s.prompt);
    for (const [voter, target] of Object.entries(s.votes)) {
      if (s.winners.includes(target)) {
        addScore(s, voter, 1);
        s.roundPoints[voter] = (s.roundPoints[voter] ?? 0) + 1;
      }
    }
    s.history.push({ round: s.round, prompt: s.prompt, winners: s.winners, counts });
    setPhase(s, 'results', ctx, RESULTS_SECONDS);
  }
  function advance(s: MostLikelyState, ctx: EngineCtx) {
    if (s.round >= s.totalRounds) {
      const res = rankingFromScores(s);
      const byTitles = Object.entries(s.titles).sort((a, b) => b[1].length - a[1].length);
      res.awards = byTitles.slice(0, 3).map(([pid, t]) => ({ playerId: pid, title: `${t.length} ألقاب — آخرها: ${t[t.length - 1]}`, emoji: '🏅' }));
      finish(s, ctx, res);
    } else startRound(s, ctx);
  }
  const engine: GameEngine<MostLikelyState> = {
    id: 'most-likely',
    minPlayers: 3,
    maxPlayers: 12,
    content(settings) {
      return { kind: 'most-likely', count: Number(settings.rounds) };
    },
    init(input, ctx) {
      if (!input.content.length) throw new AppError('NOT_FOUND', 'ما في أسئلة كافية.');
      const s: MostLikelyState = {
        ...baseState('most-likely', input, Math.min(Number(input.settings.rounds), input.content.length)),
        settings: { anonymous: input.settings.anonymous !== false, voteSeconds: Number(input.settings.voteSeconds) },
        pool: input.content,
        prompt: '',
        votes: {},
        winners: [],
        titles: {},
        roundPoints: {},
        history: [],
      };
      startRound(s, ctx);
      return s;
    },
    act(s, pid, type, payload, ctx) {
      if (type === 'host:skip' || type === 'host:next') return engine.tick(s, ctx);
      requirePlayer(s, pid);
      if (type !== 'vote') throw new AppError('INVALID_ACTION');
      requirePhase(s, 'vote');
      castVote(s.votes, s.players, pid, payload, true);
      if (s.players.every((p) => s.votes[p])) close(s, ctx);
    },
    tick(s, ctx) {
      if (s.phase === 'vote') close(s, ctx);
      else if (s.phase === 'results') advance(s, ctx);
    },
    playerLeft(s, pid, ctx) {
      s.players = s.players.filter((p) => p !== pid);
      delete s.votes[pid];
      if (s.players.length < 2) return finish(s, ctx);
      if (s.phase === 'vote' && s.players.every((p) => s.votes[p])) close(s, ctx);
    },
    view(s, viewer, now) {
      const showResults = s.phase !== 'vote';
      return {
        ...baseView(s, now),
        prompt: s.prompt,
        anonymous: s.settings.anonymous,
        me: { isPlayer: s.players.includes(viewer), voted: s.votes[viewer] ?? null },
        votedCount: Object.keys(s.votes).length,
        votedBy: Object.keys(s.votes),
        result: showResults
          ? { counts: tally(s.votes, s.players), winners: s.winners, votes: s.settings.anonymous ? null : s.votes, roundPoints: s.roundPoints }
          : null,
        titles: Object.fromEntries(Object.entries(s.titles).map(([k, v]) => [k, v.length])),
        history: s.history,
      };
    },
  };
  return engine;
}
