/**
 * مين الأطرش بالزفة؟ — everyone answers a private question; one player got a
 * different (related) question and does not know it.
 * Flow per round: answer → discuss → vote → verdict → roundEnd
 */
import { AppError } from '../../shared/errors.ts';
import { cleanText, maskProfanity } from '../security/text.ts';
import { accused, addScore, baseState, baseView, castVote, finish, pickN, requirePhase, requirePlayer, setPhase, str, tally } from './common.ts';
import type { BaseState, ContentItem, EngineCtx, GameEngine } from './types.ts';

export interface QuestionPairData {
  majority: string;
  outsider: string;
}

export interface OddQuestionState extends BaseState {
  settings: { answerSeconds: number; discussSeconds: number; voteSeconds: number };
  pool: ContentItem[];
  pair: QuestionPairData | null;
  categoryName: string;
  outsider: string | null;
  answers: Record<string, string>;
  readyToVote: string[];
  votes: Record<string, string>;
  caught: boolean;
  roundPoints: Record<string, number>;
  history: { round: number; outsider: string; caught: boolean; majority: string; outsiderQuestion: string }[];
}

const VERDICT_SECONDS = 10;
const ROUND_END_SECONDS = 10;

export function createOddQuestionEngine(): GameEngine<OddQuestionState> {
  function startRound(s: OddQuestionState, ctx: EngineCtx) {
    s.round += 1;
    const item = s.pool[s.round - 1];
    s.pair = item.data as unknown as QuestionPairData;
    s.categoryName = (item.data as { categoryName?: string }).categoryName ?? item.category;
    s.outsider = pickN(s.players, 1, ctx.rng)[0];
    s.answers = {};
    s.readyToVote = [];
    s.votes = {};
    s.caught = false;
    s.roundPoints = {};
    setPhase(s, 'answer', ctx, s.settings.answerSeconds);
  }
  function award(s: OddQuestionState, pid: string, pts: number) {
    addScore(s, pid, pts);
    s.roundPoints[pid] = (s.roundPoints[pid] ?? 0) + pts;
  }
  function toDiscuss(s: OddQuestionState, ctx: EngineCtx) {
    setPhase(s, 'discuss', ctx, s.settings.discussSeconds);
  }
  function closeVoting(s: OddQuestionState, ctx: EngineCtx) {
    const counts = tally(s.votes, s.players);
    s.caught = !!s.outsider && accused(counts, 1).includes(s.outsider);
    for (const [voter, target] of Object.entries(s.votes)) if (voter !== s.outsider && target === s.outsider) award(s, voter, 1);
    if (s.outsider && !s.caught) award(s, s.outsider, 2);
    s.history.push({ round: s.round, outsider: s.outsider!, caught: s.caught, majority: s.pair!.majority, outsiderQuestion: s.pair!.outsider });
    setPhase(s, 'verdict', ctx, VERDICT_SECONDS);
  }
  function advance(s: OddQuestionState, ctx: EngineCtx) {
    if (s.round >= s.totalRounds) finish(s, ctx);
    else startRound(s, ctx);
  }

  const engine: GameEngine<OddQuestionState> = {
    id: 'odd-question',
    minPlayers: 3,
    maxPlayers: 12,
    content(settings) {
      return { kind: 'question-pair', count: Number(settings.rounds) };
    },
    init(input, ctx) {
      if (!input.content.length) throw new AppError('NOT_FOUND', 'ما في أسئلة كافية لهالإعدادات.');
      const st = input.settings;
      const s: OddQuestionState = {
        ...baseState('odd-question', input, Math.min(Number(st.rounds), input.content.length)),
        settings: { answerSeconds: Number(st.answerSeconds), discussSeconds: Number(st.discussSeconds), voteSeconds: Number(st.voteSeconds) },
        pool: input.content.map((c) => ({ ...c, data: { ...c.data, categoryName: input.categoryNames[c.category] ?? c.category } })),
        pair: null,
        categoryName: '',
        outsider: null,
        answers: {},
        readyToVote: [],
        votes: {},
        caught: false,
        roundPoints: {},
        history: [],
      };
      startRound(s, ctx);
      return s;
    },
    act(s, pid, type, payload, ctx) {
      if (type === 'host:skip') return engine.tick(s, ctx);
      if (type === 'host:next') {
        requirePhase(s, 'roundEnd');
        return advance(s, ctx);
      }
      requirePlayer(s, pid);
      switch (type) {
        case 'answer': {
          requirePhase(s, 'answer');
          const text = maskProfanity(cleanText(str(payload, 'text', 200), 80));
          if (!text) throw new AppError('VALIDATION', 'اكتب جواب.');
          s.answers[pid] = text;
          if (s.players.every((p) => s.answers[p])) toDiscuss(s, ctx);
          return;
        }
        case 'ready-vote': {
          requirePhase(s, 'discuss');
          if (!s.readyToVote.includes(pid)) s.readyToVote.push(pid);
          if (s.players.every((p) => s.readyToVote.includes(p))) setPhase(s, 'vote', ctx, s.settings.voteSeconds);
          return;
        }
        case 'vote': {
          requirePhase(s, 'vote');
          castVote(s.votes, s.players, pid, payload);
          if (s.players.every((p) => s.votes[p])) closeVoting(s, ctx);
          return;
        }
        default:
          throw new AppError('INVALID_ACTION');
      }
    },
    tick(s, ctx) {
      switch (s.phase) {
        case 'answer':
          return toDiscuss(s, ctx);
        case 'discuss':
          return setPhase(s, 'vote', ctx, s.settings.voteSeconds);
        case 'vote':
          return closeVoting(s, ctx);
        case 'verdict':
          return setPhase(s, 'roundEnd', ctx, ROUND_END_SECONDS);
        case 'roundEnd':
          return advance(s, ctx);
      }
    },
    playerLeft(s, pid, ctx) {
      s.players = s.players.filter((p) => p !== pid);
      delete s.votes[pid];
      if (s.players.length < 2) return finish(s, ctx);
      if (pid === s.outsider && ['answer', 'discuss', 'vote'].includes(s.phase)) return advance(s, ctx);
      if (s.phase === 'answer' && s.players.every((p) => s.answers[p])) toDiscuss(s, ctx);
      else if (s.phase === 'discuss' && s.players.every((p) => s.readyToVote.includes(p))) setPhase(s, 'vote', ctx, s.settings.voteSeconds);
      else if (s.phase === 'vote' && s.players.every((p) => s.votes[p])) closeVoting(s, ctx);
    },
    view(s, viewer, now) {
      const isPlayer = s.players.includes(viewer);
      const answersPublic = s.phase !== 'answer';
      const revealed = ['verdict', 'roundEnd', 'finished'].includes(s.phase);
      return {
        ...baseView(s, now),
        category: s.categoryName,
        me: {
          isPlayer,
          // the outsider receives their different question and is never told
          question: isPlayer && s.pair ? (viewer === s.outsider ? s.pair.outsider : s.pair.majority) : null,
          answer: s.answers[viewer] ?? null,
          voted: s.votes[viewer] ?? null,
        },
        answeredCount: Object.keys(s.answers).length,
        answeredBy: Object.keys(s.answers),
        majorityQuestion: answersPublic && s.pair ? s.pair.majority : null,
        answers: answersPublic ? s.answers : null,
        readyToVote: s.readyToVote,
        votedCount: Object.keys(s.votes).length,
        reveal: revealed && s.pair
          ? { outsider: s.outsider, outsiderQuestion: s.pair.outsider, caught: s.caught, votes: s.votes, counts: tally(s.votes, s.players), roundPoints: s.roundPoints }
          : null,
        history: s.history,
      };
    },
  };
  return engine;
}
