/**
 * تحدي السرعة — simultaneous multiple-choice quiz. Timing and scoring are
 * computed on the server; the correct option is never sent before reveal.
 * Flow: countdown → (question → reveal) × N
 */
import { AppError } from '../../shared/errors.ts';
import { addScore, asObject, baseState, baseView, finish, rankingFromScores, requirePhase, requirePlayer, setPhase, shuffle } from './common.ts';
import type { BaseState, EngineCtx, GameEngine } from './types.ts';

export interface TriviaData {
  question: string;
  options: string[];
  answer: number;
}

interface Question {
  question: string;
  options: string[];
  correct: number;
  category: string;
}

export interface SpeedQuizState extends BaseState {
  settings: { questionSeconds: number };
  questions: Question[];
  startedAt: number;
  answers: Record<string, { choice: number; ms: number }>;
  firstCorrect: string | null;
  streaks: Record<string, number>;
  bestStreak: Record<string, number>;
  correctCount: Record<string, number>;
  roundPoints: Record<string, number>;
}

const COUNTDOWN_SECONDS = 4;
const REVEAL_SECONDS = 5;

export function scoreAnswer(ms: number, totalMs: number, first: boolean, streak: number): number {
  const remaining = Math.max(0, Math.min(1, 1 - ms / totalMs));
  return 100 + Math.round(50 * remaining) + (first ? 25 : 0) + Math.min(50, 10 * Math.max(0, streak - 1));
}

export function createSpeedQuizEngine(): GameEngine<SpeedQuizState> {
  function ask(s: SpeedQuizState, ctx: EngineCtx) {
    s.round += 1;
    s.answers = {};
    s.firstCorrect = null;
    s.roundPoints = {};
    s.startedAt = ctx.now;
    setPhase(s, 'question', ctx, s.settings.questionSeconds);
  }
  function reveal(s: SpeedQuizState, ctx: EngineCtx) {
    const q = s.questions[s.round - 1];
    const totalMs = s.settings.questionSeconds * 1000;
    // order by answer time so "first correct" is deterministic
    const ordered = Object.entries(s.answers).sort((a, b) => a[1].ms - b[1].ms);
    for (const p of s.players) if (!s.answers[p]) s.streaks[p] = 0;
    for (const [pid, a] of ordered) {
      if (a.choice === q.correct) {
        const first = !s.firstCorrect;
        if (first) s.firstCorrect = pid;
        s.streaks[pid] = (s.streaks[pid] ?? 0) + 1;
        s.bestStreak[pid] = Math.max(s.bestStreak[pid] ?? 0, s.streaks[pid]);
        s.correctCount[pid] = (s.correctCount[pid] ?? 0) + 1;
        const pts = scoreAnswer(a.ms, totalMs, first, s.streaks[pid]);
        addScore(s, pid, pts);
        s.roundPoints[pid] = pts;
      } else {
        s.streaks[pid] = 0;
        s.roundPoints[pid] = 0;
      }
    }
    setPhase(s, 'reveal', ctx, REVEAL_SECONDS);
  }
  function advance(s: SpeedQuizState, ctx: EngineCtx) {
    if (s.round >= s.totalRounds) {
      const res = rankingFromScores(s);
      const streakKing = Object.entries(s.bestStreak).sort((a, b) => b[1] - a[1])[0];
      res.awards = streakKing && streakKing[1] >= 3 ? [{ playerId: streakKing[0], title: `أطول سلسلة: ${streakKing[1]}`, emoji: '🔥' }] : [];
      finish(s, ctx, res);
    } else ask(s, ctx);
  }

  const engine: GameEngine<SpeedQuizState> = {
    id: 'speed-quiz',
    minPlayers: 1,
    maxPlayers: 12,
    content(settings) {
      return { kind: 'trivia', count: Number(settings.rounds) };
    },
    init(input, ctx) {
      if (!input.content.length) throw new AppError('NOT_FOUND', 'ما في أسئلة كافية.');
      const questions = input.content.map((c) => {
        const d = c.data as unknown as TriviaData;
        const idx = shuffle(d.options.map((_, i) => i), ctx.rng);
        return { question: d.question, options: idx.map((i) => d.options[i]), correct: idx.indexOf(d.answer), category: input.categoryNames[c.category] ?? c.category };
      });
      const s: SpeedQuizState = {
        ...baseState('speed-quiz', input, questions.length),
        settings: { questionSeconds: Number(input.settings.questionSeconds) },
        questions,
        startedAt: 0,
        answers: {},
        firstCorrect: null,
        streaks: {},
        bestStreak: {},
        correctCount: {},
        roundPoints: {},
      };
      setPhase(s, 'countdown', ctx, COUNTDOWN_SECONDS);
      return s;
    },
    act(s, pid, type, payload, ctx) {
      if (type === 'host:skip') return engine.tick(s, ctx);
      requirePlayer(s, pid);
      if (type !== 'answer') throw new AppError('INVALID_ACTION');
      requirePhase(s, 'question');
      if (s.answers[pid]) throw new AppError('INVALID_ACTION', 'جاوبت قبل.');
      const choice = asObject(payload).choice;
      const q = s.questions[s.round - 1];
      if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new AppError('VALIDATION');
      s.answers[pid] = { choice, ms: Math.max(0, ctx.now - s.startedAt) };
      if (s.players.every((p) => s.answers[p])) reveal(s, ctx);
    },
    tick(s, ctx) {
      if (s.phase === 'countdown') ask(s, ctx);
      else if (s.phase === 'question') reveal(s, ctx);
      else if (s.phase === 'reveal') advance(s, ctx);
    },
    playerLeft(s, pid, ctx) {
      s.players = s.players.filter((p) => p !== pid);
      if (!s.players.length) return finish(s, ctx);
      if (s.phase === 'question' && s.players.every((p) => s.answers[p])) reveal(s, ctx);
    },
    view(s, viewer, now) {
      const q = s.round > 0 ? s.questions[s.round - 1] : null;
      const revealed = s.phase === 'reveal' || s.phase === 'finished';
      return {
        ...baseView(s, now),
        question: q && s.phase !== 'countdown' ? { text: q.question, options: q.options, category: q.category } : null,
        correct: revealed && q ? q.correct : null,
        answeredCount: Object.keys(s.answers).length,
        answeredBy: Object.keys(s.answers),
        me: { isPlayer: s.players.includes(viewer), answer: s.answers[viewer]?.choice ?? null, streak: s.streaks[viewer] ?? 0 },
        reveal: revealed
          ? { answers: Object.fromEntries(Object.entries(s.answers).map(([p, a]) => [p, a.choice])), roundPoints: s.roundPoints, firstCorrect: s.firstCorrect, streaks: s.streaks }
          : null,
      };
    },
  };
  return engine;
}
