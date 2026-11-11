/**
 * ارسم وخمّن — one player draws, everyone else guesses.
 * Flow per turn: choose → draw → turnEnd. Each round every player draws once.
 * Canvas segments travel on a separate lightweight channel (see rooms/drawing.ts);
 * this engine only decides who may draw and scores guesses.
 */
import { AppError } from '../../shared/errors.ts';
import { matchGuess } from '../../shared/arabic.ts';
import { cleanText, maskProfanity } from '../security/text.ts';
import { addScore, asObject, baseState, baseView, finish, pickN, rankingFromScores, requirePhase, requirePlayer, setPhase, shuffle, str } from './common.ts';
import { assignTeams, teamResults } from './teams.ts';
import type { BaseState, EngineCtx, GameEngine } from './types.ts';

export interface DrawWordData {
  word: string;
  alternatives?: string[];
}

interface FeedEntry {
  id: number;
  pid: string;
  kind: 'guess' | 'correct' | 'close' | 'system';
  text: string;
  /** when set, only this player (and nobody else) sees the entry */
  only?: string;
}

export interface DrawGuessState extends BaseState {
  settings: { drawSeconds: number; scoring: 'individual' | 'teams' };
  words: DrawWordData[];
  wordIndex: number;
  order: string[];
  turnIndex: number;
  turnNumber: number;
  totalTurns: number;
  drawer: string | null;
  choices: DrawWordData[];
  word: DrawWordData | null;
  drawStartedAt: number;
  guessed: string[];
  hintPositions: number[];
  hintTimes: number[];
  feed: FeedEntry[];
  feedSeq: number;
  teams: Record<string, number> | null;
  turnPoints: Record<string, number>;
}

const CHOOSE_SECONDS = 15;
const TURN_END_SECONDS = 7;

export function guessPoints(elapsedMs: number, totalMs: number, order: number): number {
  const remaining = Math.max(0, 1 - elapsedMs / totalMs);
  return 50 + Math.round(100 * remaining) + (order === 0 ? 20 : 0);
}

function letterIndices(word: string): number[] {
  return [...word].map((ch, i) => (ch.trim() ? i : -1)).filter((i) => i >= 0);
}

export function hintMask(word: string, revealed: number[]): string {
  return [...word].map((ch, i) => (!ch.trim() ? ' ' : revealed.includes(i) ? ch : '_')).join('');
}

export function createDrawGuessEngine(): GameEngine<DrawGuessState> {
  function takeWords(s: DrawGuessState, n: number): DrawWordData[] {
    const out: DrawWordData[] = [];
    for (let i = 0; i < n; i++) {
      if (s.wordIndex >= s.words.length) s.wordIndex = 0;
      out.push(s.words[s.wordIndex++]);
    }
    return out;
  }
  function push(s: DrawGuessState, e: Omit<FeedEntry, 'id'>) {
    s.feed.push({ id: ++s.feedSeq, ...e });
    if (s.feed.length > 60) s.feed.shift();
  }
  function startTurn(s: DrawGuessState, ctx: EngineCtx) {
    s.turnNumber += 1;
    s.round = Math.ceil(s.turnNumber / Math.max(1, s.order.length));
    s.drawer = s.order[s.turnIndex % s.order.length];
    s.turnIndex += 1;
    s.choices = takeWords(s, 3);
    s.word = null;
    s.guessed = [];
    s.feed = [];
    s.turnPoints = {};
    setPhase(s, 'choose', ctx, CHOOSE_SECONDS);
  }
  function beginDrawing(s: DrawGuessState, choice: number, ctx: EngineCtx) {
    s.word = s.choices[choice] ?? s.choices[0];
    s.drawStartedAt = ctx.now;
    const letters = letterIndices(s.word.word);
    const hintCount = letters.length >= 4 ? 2 : letters.length >= 3 ? 1 : 0;
    s.hintPositions = pickN(letters, hintCount, ctx.rng);
    const total = s.settings.drawSeconds * 1000;
    s.hintTimes = hintCount === 2 ? [ctx.now + total * 0.5, ctx.now + total * 0.75] : hintCount === 1 ? [ctx.now + total * 0.6] : [];
    push(s, { pid: s.drawer!, kind: 'system', text: 'بلّش الرسم!' });
    setPhase(s, 'draw', ctx, s.settings.drawSeconds);
  }
  function endTurn(s: DrawGuessState, ctx: EngineCtx) {
    setPhase(s, 'turnEnd', ctx, TURN_END_SECONDS);
  }
  function advance(s: DrawGuessState, ctx: EngineCtx) {
    if (s.turnNumber >= s.totalTurns || s.players.length < 2) {
      const res = rankingFromScores(s);
      if (s.teams) {
        const ts = [0, 1].map((t) => s.players.filter((p) => s.teams![p] === t).reduce((a, p) => a + (s.scores[p] ?? 0), 0));
        const tr = teamResults(Object.fromEntries(s.players.map((p) => [p, s.teams![p]])), ts);
        res.teamScores = tr.teamScores;
        res.winningTeam = tr.winningTeam;
        res.winners = tr.winningTeam == null ? [] : tr.teamScores[tr.winningTeam].members;
      }
      finish(s, ctx, res);
    } else startTurn(s, ctx);
  }
  function advancePhase(s: DrawGuessState, ctx: EngineCtx) {
    if (s.phase === 'choose') beginDrawing(s, 0, ctx);
    else if (s.phase === 'draw') endTurn(s, ctx);
    else if (s.phase === 'turnEnd') advance(s, ctx);
  }
  function revealedHints(s: DrawGuessState, now: number) {
    return s.hintPositions.filter((_, i) => s.hintTimes[i] <= now);
  }

  const engine: GameEngine<DrawGuessState> = {
    id: 'draw-guess',
    minPlayers: 2,
    maxPlayers: 12,
    content(settings, playerCount) {
      return { kind: 'draw-word', count: Math.min(300, Number(settings.rounds) * playerCount * 3 + 6) };
    },
    init(input, ctx) {
      if (input.content.length < 3) throw new AppError('NOT_FOUND', 'ما في كلمات كافية.');
      const order = shuffle(input.players.map((p) => p.id), ctx.rng);
      const scoring = input.settings.scoring === 'teams' && input.players.length >= 4 ? 'teams' : 'individual';
      const totalTurns = order.length * Number(input.settings.rounds);
      const s: DrawGuessState = {
        ...baseState('draw-guess', input, Number(input.settings.rounds)),
        settings: { drawSeconds: Number(input.settings.drawSeconds), scoring },
        words: shuffle(input.content.map((c) => c.data as unknown as DrawWordData), ctx.rng),
        wordIndex: 0,
        order,
        turnIndex: 0,
        turnNumber: 0,
        totalTurns,
        drawer: null,
        choices: [],
        word: null,
        drawStartedAt: 0,
        guessed: [],
        hintPositions: [],
        hintTimes: [],
        feed: [],
        feedSeq: 0,
        teams: scoring === 'teams' ? assignTeams(input.players, ctx.rng) : null,
        turnPoints: {},
      };
      startTurn(s, ctx);
      return s;
    },
    act(s, pid, type, payload, ctx) {
      if (type === 'host:skip') return advancePhase(s, ctx);
      requirePlayer(s, pid);
      switch (type) {
        case 'choose': {
          requirePhase(s, 'choose');
          if (pid !== s.drawer) throw new AppError('FORBIDDEN', 'الرسام بس بيختار.');
          const choice = asObject(payload).choice;
          if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= s.choices.length) throw new AppError('VALIDATION');
          return beginDrawing(s, choice, ctx);
        }
        case 'guess': {
          requirePhase(s, 'draw');
          if (pid === s.drawer) throw new AppError('FORBIDDEN', 'الرسام ما بيخمّن 😄');
          if (s.guessed.includes(pid)) throw new AppError('INVALID_ACTION', 'خمّنتها خلص!');
          const text = maskProfanity(cleanText(str(payload, 'text', 120), 50));
          if (!text) throw new AppError('VALIDATION');
          const m = matchGuess(text, [s.word!.word, ...(s.word!.alternatives ?? [])]);
          if (m === 'exact') {
            const pts = guessPoints(ctx.now - s.drawStartedAt, s.settings.drawSeconds * 1000, s.guessed.length);
            s.guessed.push(pid);
            addScore(s, pid, pts);
            addScore(s, s.drawer!, 25);
            s.turnPoints[pid] = pts;
            s.turnPoints[s.drawer!] = (s.turnPoints[s.drawer!] ?? 0) + 25;
            push(s, { pid, kind: 'correct', text: 'خمّن الكلمة! 🎉' });
            const guessers = s.players.filter((p) => p !== s.drawer);
            if (guessers.every((p) => s.guessed.includes(p))) endTurn(s, ctx);
          } else if (m === 'close') {
            push(s, { pid, kind: 'close', text: `${text} — قريب كثير!`, only: pid });
          } else {
            push(s, { pid, kind: 'guess', text });
          }
          return;
        }
        default:
          throw new AppError('INVALID_ACTION');
      }
    },
    tick(s, ctx) {
      if (s.deadline != null && ctx.now < s.deadline) return; // hint wake-up only; views read hints by time
      advancePhase(s, ctx);
    },
    nextWake(s, now) {
      if (s.phase === 'draw') {
        const nextHint = s.hintTimes.find((t) => t > now);
        if (nextHint && s.deadline && nextHint < s.deadline) return nextHint;
      }
      return s.deadline;
    },
    playerLeft(s, pid, ctx) {
      s.players = s.players.filter((p) => p !== pid);
      s.order = s.order.filter((p) => p !== pid);
      s.totalTurns = Math.max(s.turnNumber, s.order.length * s.totalRounds);
      if (s.players.length < 2) return advance(s, ctx);
      if (pid === s.drawer && (s.phase === 'choose' || s.phase === 'draw')) return endTurn(s, ctx);
      const guessers = s.players.filter((p) => p !== s.drawer);
      if (s.phase === 'draw' && guessers.every((p) => s.guessed.includes(p))) endTurn(s, ctx);
    },
    chatSecrets(s) {
      return s.phase === 'draw' && s.word ? [s.word.word, ...(s.word.alternatives ?? [])] : [];
    },
    canvas(s) {
      return s.phase === 'draw' && s.drawer ? { drawer: s.drawer, turnKey: `t${s.turnNumber}` } : null;
    },
    view(s, viewer, now) {
      const isDrawer = viewer === s.drawer;
      const knows = isDrawer || s.guessed.includes(viewer) || s.phase === 'turnEnd' || s.phase === 'finished';
      return {
        ...baseView(s, now),
        drawer: s.drawer,
        turnNumber: s.turnNumber,
        totalTurns: s.totalTurns,
        turnKey: `t${s.turnNumber}`,
        choices: isDrawer && s.phase === 'choose' ? s.choices.map((c) => c.word) : null,
        word: knows && s.word ? s.word.word : null,
        hint: s.word && s.phase === 'draw' ? hintMask(s.word.word, revealedHints(s, now)) : null,
        guessed: s.guessed,
        feed: s.feed.filter((f) => !f.only || f.only === viewer).map(({ only: _o, ...f }) => f),
        teams: s.teams,
        turnPoints: s.phase === 'turnEnd' ? s.turnPoints : null,
        lastWord: s.phase === 'turnEnd' && s.word ? s.word.word : null,
        me: { isPlayer: s.players.includes(viewer), isDrawer, guessed: s.guessed.includes(viewer) },
      };
    },
  };
  return engine;
}
