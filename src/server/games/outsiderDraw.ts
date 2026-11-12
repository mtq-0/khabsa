/**
 * مين برا الرسمة؟ — everyone except one outsider gets the same secret word. All players
 * share ONE canvas: in a random order, each player adds a single line (one stroke, in
 * their own colour) per turn, for a few laps. The outsider has to add lines without
 * knowing the word. Then vote for the outsider; the outsider gets a last chance to
 * guess the word from the drawing.
 *
 * Flow per round:
 *   reveal → turn × (players × laps) → discuss → vote → verdict → guess → roundEnd
 */
import { AppError } from '../../shared/errors.ts';
import type { DrawSegment } from '../../shared/protocol.ts';
import { accused, addScore, asObject, baseState, baseView, castVote, finish, pickN, requirePhase, requirePlayer, setPhase, shuffle, str, tally } from './common.ts';
import type { BaseState, ContentItem, EngineCtx, GameEngine, InitInput } from './types.ts';

interface DrawWordData {
  word: string;
  alternatives?: string[];
}

interface Secret {
  itemId: string;
  category: string;
  categoryName: string;
  word: string;
  alternatives: string[];
  guessOptions: string[];
}

export interface Stroke {
  pid: string;
  segs: DrawSegment[];
}

export interface OutsiderDrawState extends BaseState {
  settings: { categoryHint: boolean; laps: number; turnSeconds: number; discussSeconds: number; voteSeconds: number };
  pool: ContentItem[];
  decoyLabels: Record<string, string[]>;
  secret: Secret | null;
  outsiders: string[];
  seen: string[];
  /** random drawing order for this round */
  order: string[];
  /** index into the whole sequence of turns (order repeated `laps` times) */
  turnIndex: number;
  /** palette index per player, so everybody can tell whose line is whose */
  colors: Record<string, number>;
  strokes: Stroke[];
  readyToVote: string[];
  votes: Record<string, string>;
  caught: string[];
  guesses: Record<string, string>;
  roundPoints: Record<string, number>;
  history: { round: number; outsiders: string[]; caught: string[]; answer: string }[];
}

const REVEAL_SECONDS = 12;
const VERDICT_SECONDS = 7;
const GUESS_SECONDS = 25;
const ROUND_END_SECONDS = 15;

/** one line = one stroke of at most this many points (keeps the shared drawing small) */
export const MAX_STROKE_POINTS = 250;
/** player colours: distinct palette entries, white excluded */
export const PLAYER_COLORS = [2, 7, 5, 9, 3, 8, 6, 0, 4, 10, 11];
const SIZE_COUNT = 5;

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Validates one line: segments of a single stroke, in the player's colour, within the ink limit. */
export function parseStroke(raw: unknown, color: number): DrawSegment[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4) throw new AppError('VALIDATION', 'خط واحد بس!');
  let points = 0;
  const out: DrawSegment[] = [];
  for (const r of raw) {
    const s = r as Partial<DrawSegment>;
    if (!s || typeof s !== 'object' || !isInt(s.w, 0, SIZE_COUNT - 1) || s.e !== undefined) throw new AppError('VALIDATION', 'خط غير صالح');
    const p = s.p;
    if (!Array.isArray(p) || p.length < 2 || p.length > 400 || p.length % 2 || !p.every((v) => isInt(v, 0, 1000))) throw new AppError('VALIDATION', 'خط غير صالح');
    points += p.length / 2;
    if (points > MAX_STROKE_POINTS + 4) throw new AppError('VALIDATION', 'الخط طويل كثير!');
    // the server decides stroke id and colour: one line, your colour
    out.push({ s: 1, c: color, w: s.w, p: [...p] });
  }
  return out;
}

export function createOutsiderDrawEngine(): GameEngine<OutsiderDrawState> {
  const totalTurns = (s: OutsiderDrawState) => s.order.length * s.settings.laps;
  const drawerOf = (s: OutsiderDrawState) => (s.phase === 'turn' && s.order.length ? s.order[s.turnIndex % s.order.length] : null);

  function startRound(s: OutsiderDrawState, ctx: EngineCtx) {
    s.round += 1;
    const item = s.pool[(s.round - 1) % s.pool.length];
    const d = item.data as unknown as DrawWordData & { categoryName?: string };
    const word = d.word;
    const same = Array.from(new Set((s.decoyLabels[item.category] ?? []).filter((w) => w !== word)));
    const decoys = pickN(same, 5, ctx.rng);
    if (decoys.length < 5) {
      const others = Array.from(new Set(Object.values(s.decoyLabels).flat().filter((w) => w !== word && !same.includes(w))));
      decoys.push(...pickN(others, 5 - decoys.length, ctx.rng));
    }
    s.secret = { itemId: item.id, category: item.category, categoryName: d.categoryName ?? item.category, word, alternatives: d.alternatives ?? [], guessOptions: shuffle([word, ...decoys], ctx.rng) };
    s.outsiders = pickN(s.players, 1, ctx.rng);
    s.order = shuffle(s.players, ctx.rng);
    s.colors = Object.fromEntries(s.order.map((p, i) => [p, PLAYER_COLORS[i % PLAYER_COLORS.length]]));
    s.turnIndex = 0;
    s.strokes = [];
    s.seen = [];
    s.readyToVote = [];
    s.votes = {};
    s.caught = [];
    s.guesses = {};
    s.roundPoints = {};
    setPhase(s, 'reveal', ctx, REVEAL_SECONDS);
  }

  const startTurns = (s: OutsiderDrawState, ctx: EngineCtx) => {
    s.turnIndex = 0;
    setPhase(s, 'turn', ctx, s.settings.turnSeconds);
  };
  function nextTurn(s: OutsiderDrawState, ctx: EngineCtx) {
    s.turnIndex += 1;
    if (s.turnIndex >= totalTurns(s)) setPhase(s, 'discuss', ctx, s.settings.discussSeconds);
    else setPhase(s, 'turn', ctx, s.settings.turnSeconds);
  }
  const startVote = (s: OutsiderDrawState, ctx: EngineCtx) => setPhase(s, 'vote', ctx, s.settings.voteSeconds);

  function award(s: OutsiderDrawState, pid: string, pts: number) {
    addScore(s, pid, pts);
    s.roundPoints[pid] = (s.roundPoints[pid] ?? 0) + pts;
  }

  function closeVoting(s: OutsiderDrawState, ctx: EngineCtx) {
    const counts = tally(s.votes, s.players);
    s.caught = accused(counts, s.outsiders.length).filter((p) => s.outsiders.includes(p));
    for (const [voter, target] of Object.entries(s.votes)) if (!s.outsiders.includes(voter) && s.outsiders.includes(target)) award(s, voter, 1);
    for (const o of s.outsiders) if (!s.caught.includes(o)) award(s, o, 2);
    setPhase(s, 'verdict', ctx, VERDICT_SECONDS);
  }

  function closeGuess(s: OutsiderDrawState, ctx: EngineCtx) {
    for (const o of s.outsiders) if (s.guesses[o] === s.secret!.word) award(s, o, 2);
    s.history.push({ round: s.round, outsiders: s.outsiders, caught: s.caught, answer: s.secret!.word });
    setPhase(s, 'roundEnd', ctx, ROUND_END_SECONDS);
  }

  function advanceRound(s: OutsiderDrawState, ctx: EngineCtx) {
    if (s.round >= s.totalRounds) finish(s, ctx);
    else startRound(s, ctx);
  }

  const engine: GameEngine<OutsiderDrawState> = {
    id: 'outsider-draw',
    minPlayers: 3,
    maxPlayers: 11, // one colour each
    content(settings) {
      return { kind: 'draw-word', count: Number(settings.rounds), decoys: 40 };
    },
    init(input: InitInput, ctx) {
      if (!input.content.length) throw new AppError('NOT_FOUND', 'ما في محتوى كافي لهالإعدادات.');
      const st = input.settings;
      const decoyLabels: Record<string, string[]> = {};
      for (const d of [...input.content, ...input.decoys]) (decoyLabels[d.category] ??= []).push((d.data as unknown as DrawWordData).word);
      const s: OutsiderDrawState = {
        ...baseState('outsider-draw', input, Math.min(Number(st.rounds), input.content.length)),
        settings: {
          categoryHint: st.categoryHint !== false,
          laps: Number(st.laps),
          turnSeconds: Number(st.turnSeconds),
          discussSeconds: Number(st.discussSeconds),
          voteSeconds: Number(st.voteSeconds),
        },
        pool: input.content.map((c) => ({ ...c, data: { ...c.data, categoryName: input.categoryNames[c.category] ?? c.category } })),
        decoyLabels,
        secret: null,
        outsiders: [],
        seen: [],
        order: [],
        turnIndex: 0,
        colors: {},
        strokes: [],
        readyToVote: [],
        votes: {},
        caught: [],
        guesses: {},
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
        return advanceRound(s, ctx);
      }
      requirePlayer(s, pid);
      switch (type) {
        case 'seen': {
          requirePhase(s, 'reveal');
          if (!s.seen.includes(pid)) s.seen.push(pid);
          if (s.players.every((p) => s.seen.includes(p))) startTurns(s, ctx);
          return;
        }
        case 'stroke': {
          // your one line for this turn
          requirePhase(s, 'turn');
          if (drawerOf(s) !== pid) throw new AppError('INVALID_ACTION', 'مش دورك.');
          s.strokes.push({ pid, segs: parseStroke(asObject(payload).segments, s.colors[pid] ?? 0) });
          return nextTurn(s, ctx);
        }
        case 'ready-vote': {
          requirePhase(s, 'discuss');
          if (!s.readyToVote.includes(pid)) s.readyToVote.push(pid);
          if (s.players.every((p) => s.readyToVote.includes(p))) startVote(s, ctx);
          return;
        }
        case 'vote': {
          requirePhase(s, 'vote');
          castVote(s.votes, s.players, pid, payload);
          if (s.players.every((p) => s.votes[p])) closeVoting(s, ctx);
          return;
        }
        case 'guess': {
          requirePhase(s, 'guess');
          if (!s.outsiders.includes(pid)) throw new AppError('FORBIDDEN', 'التخمين للبرّا بس.');
          if (s.guesses[pid]) throw new AppError('INVALID_ACTION', 'خمّنت قبل.');
          const choice = str(payload, 'choice', 80);
          if (!s.secret!.guessOptions.includes(choice)) throw new AppError('VALIDATION');
          s.guesses[pid] = choice;
          if (s.outsiders.every((o) => s.guesses[o])) closeGuess(s, ctx);
          return;
        }
        default:
          throw new AppError('INVALID_ACTION');
      }
    },
    tick(s, ctx) {
      switch (s.phase) {
        case 'reveal':
          return startTurns(s, ctx);
        case 'turn':
          return nextTurn(s, ctx); // time's up: no line this turn
        case 'discuss':
          return startVote(s, ctx);
        case 'vote':
          return closeVoting(s, ctx);
        case 'verdict':
          return setPhase(s, 'guess', ctx, GUESS_SECONDS);
        case 'guess':
          return closeGuess(s, ctx);
        case 'roundEnd':
          return advanceRound(s, ctx);
      }
    },
    playerLeft(s, pid, ctx) {
      const wasDrawer = drawerOf(s) === pid;
      // keep the turn sequence consistent: count this player's turns that already passed
      const n = s.order.length;
      const idx = s.order.indexOf(pid);
      if (idx >= 0 && n) {
        const before = Math.floor(s.turnIndex / n) + (idx < s.turnIndex % n ? 1 : 0);
        s.turnIndex -= before;
      }
      s.players = s.players.filter((p) => p !== pid);
      s.order = s.order.filter((p) => p !== pid);
      delete s.votes[pid];
      for (const [v, t] of Object.entries(s.votes)) if (t === pid && !s.outsiders.includes(pid)) delete s.votes[v];
      if (s.players.length < 2) return finish(s, ctx);
      if (s.outsiders.includes(pid) && ['reveal', 'turn', 'discuss', 'vote'].includes(s.phase)) {
        s.outsiders = [];
        return advanceRound(s, ctx); // the round makes no sense without its outsider
      }
      if (s.phase === 'turn') {
        if (s.turnIndex >= totalTurns(s)) setPhase(s, 'discuss', ctx, s.settings.discussSeconds);
        else if (wasDrawer) setPhase(s, 'turn', ctx, s.settings.turnSeconds);
      } else if (s.phase === 'reveal' && s.players.every((p) => s.seen.includes(p))) startTurns(s, ctx);
      else if (s.phase === 'discuss' && s.players.every((p) => s.readyToVote.includes(p))) startVote(s, ctx);
      else if (s.phase === 'vote' && s.players.every((p) => s.votes[p])) closeVoting(s, ctx);
      else if (s.phase === 'guess' && s.outsiders.every((o) => s.guesses[o] || !s.players.includes(o))) closeGuess(s, ctx);
    },
    /** live preview: the current drawer's line streams to everyone while it is being drawn */
    canvas(s) {
      const d = drawerOf(s);
      return d ? { drawer: d, turnKey: s.phaseKey } : null;
    },
    chatSecrets(s) {
      if (!s.secret || s.phase === 'roundEnd' || s.phase === 'finished') return [];
      return [s.secret.word, ...s.secret.alternatives];
    },
    view(s, viewer, now) {
      const sec = s.secret;
      const isPlayer = s.players.includes(viewer);
      const isOutsider = s.outsiders.includes(viewer);
      const revealed = ['verdict', 'guess', 'roundEnd', 'finished'].includes(s.phase);
      const hide = s.phase === 'verdict' || s.phase === 'guess'; // the word stays secret until the outsider guessed
      const me: Record<string, unknown> = { isPlayer, color: s.colors[viewer] ?? null };
      if (isPlayer && sec) {
        me.role = isOutsider ? 'outsider' : 'insider';
        if (!isOutsider) me.word = sec.word;
        me.category = !isOutsider || s.settings.categoryHint ? sec.categoryName : null;
        if (s.phase === 'guess' && isOutsider) me.guessOptions = sec.guessOptions;
        me.voted = s.votes[viewer] ?? null;
        me.guess = s.guesses[viewer] ?? null;
      }
      return {
        ...baseView(s, now),
        seenCount: s.seen.length,
        order: s.order,
        colors: s.colors,
        drawer: drawerOf(s),
        turnNumber: Math.min(s.turnIndex + 1, totalTurns(s)),
        totalTurns: totalTurns(s),
        lap: Math.min(s.settings.laps, Math.floor(s.turnIndex / Math.max(1, s.order.length)) + 1),
        laps: s.settings.laps,
        turnSeconds: s.settings.turnSeconds,
        maxStrokePoints: MAX_STROKE_POINTS,
        strokes: s.phase === 'reveal' ? [] : s.strokes,
        readyToVote: s.readyToVote,
        votedCount: Object.keys(s.votes).length,
        me,
        reveal: revealed
          ? {
              outsiders: s.outsiders,
              caught: s.caught,
              votes: s.votes,
              counts: tally(s.votes, s.players),
              answer: hide ? null : (sec?.word ?? null),
              guesses: hide ? {} : s.guesses,
              roundPoints: s.roundPoints,
            }
          : null,
        history: s.history,
      };
    },
  };
  return engine;
}
