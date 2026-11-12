/**
 * مين برا الرسمة؟ — everyone except one outsider gets the same secret word; each player
 * draws it on their own private canvas, then all the drawings are revealed together.
 * Find the outsider by their drawing; the outsider then tries to guess the word.
 *
 * Flow per round:
 *   reveal → draw → gallery (discussion) → vote → verdict → guess → roundEnd
 *
 * Privacy: during "draw" a player only ever receives their own drawing; nobody sees
 * anyone else's until the gallery. The outsider never receives the word.
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

export interface OutsiderDrawState extends BaseState {
  settings: { categoryHint: boolean; drawSeconds: number; discussSeconds: number; voteSeconds: number };
  pool: ContentItem[];
  decoyLabels: Record<string, string[]>;
  secret: Secret | null;
  outsiders: string[];
  seen: string[];
  drawings: Record<string, DrawSegment[]>;
  done: string[];
  /** gallery order (shuffled so position gives nothing away) */
  order: string[];
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

/** "ink": total points per drawing; keeps every message small (well under the 64 KB socket limit) */
export const MAX_DRAW_POINTS = 1500;
export const MAX_DRAW_SEGMENTS = 300;
const PALETTE_SIZE = 12;
const SIZE_COUNT = 5;

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Validates and copies a drawing (only known fields survive). */
export function parseDrawing(raw: unknown): DrawSegment[] {
  if (!Array.isArray(raw) || raw.length > MAX_DRAW_SEGMENTS) throw new AppError('VALIDATION', 'الرسمة كبرت كثير!');
  let points = 0;
  const out: DrawSegment[] = [];
  for (const r of raw) {
    const s = r as Partial<DrawSegment>;
    if (!s || typeof s !== 'object' || !isInt(s.s, 0, 1e6) || !isInt(s.c, 0, PALETTE_SIZE - 1) || !isInt(s.w, 0, SIZE_COUNT - 1)) throw new AppError('VALIDATION', 'رسمة غير صالحة');
    if (s.e !== undefined && s.e !== 1) throw new AppError('VALIDATION', 'رسمة غير صالحة');
    const p = s.p;
    if (!Array.isArray(p) || p.length < 2 || p.length > 400 || p.length % 2 || !p.every((v) => isInt(v, 0, 1000))) throw new AppError('VALIDATION', 'رسمة غير صالحة');
    points += p.length / 2;
    if (points > MAX_DRAW_POINTS) throw new AppError('VALIDATION', 'خلص الحبر! 🖍');
    out.push({ s: s.s, c: s.c, w: s.w, p: [...p], ...(s.e ? { e: 1 as const } : {}) });
  }
  return out;
}

export function createOutsiderDrawEngine(): GameEngine<OutsiderDrawState> {
  function startRound(s: OutsiderDrawState, ctx: EngineCtx) {
    s.round += 1;
    const item = s.pool[(s.round - 1) % s.pool.length];
    const d = item.data as unknown as DrawWordData & { categoryName?: string };
    const word = d.word;
    const same = (s.decoyLabels[item.category] ?? []).filter((w) => w !== word);
    const others = Object.values(s.decoyLabels).flat().filter((w) => w !== word && !same.includes(w));
    const decoys = [...pickN(Array.from(new Set(same)), 5, ctx.rng)];
    if (decoys.length < 5) decoys.push(...pickN(Array.from(new Set(others)), 5 - decoys.length, ctx.rng));
    s.secret = { itemId: item.id, category: item.category, categoryName: d.categoryName ?? item.category, word, alternatives: d.alternatives ?? [], guessOptions: shuffle([word, ...decoys], ctx.rng) };
    s.outsiders = pickN(s.players, 1, ctx.rng);
    s.order = shuffle(s.players, ctx.rng);
    s.seen = [];
    s.drawings = {};
    s.done = [];
    s.readyToVote = [];
    s.votes = {};
    s.caught = [];
    s.guesses = {};
    s.roundPoints = {};
    setPhase(s, 'reveal', ctx, REVEAL_SECONDS);
  }

  const startDraw = (s: OutsiderDrawState, ctx: EngineCtx) => setPhase(s, 'draw', ctx, s.settings.drawSeconds);
  const startGallery = (s: OutsiderDrawState, ctx: EngineCtx) => setPhase(s, 'gallery', ctx, s.settings.discussSeconds);
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
    maxPlayers: 12,
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
          drawSeconds: Number(st.drawSeconds),
          discussSeconds: Number(st.discussSeconds),
          voteSeconds: Number(st.voteSeconds),
        },
        pool: input.content.map((c) => ({ ...c, data: { ...c.data, categoryName: input.categoryNames[c.category] ?? c.category } })),
        decoyLabels,
        secret: null,
        outsiders: [],
        seen: [],
        drawings: {},
        done: [],
        order: [],
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
          if (s.players.every((p) => s.seen.includes(p))) startDraw(s, ctx);
          return;
        }
        case 'drawing': {
          // saves the whole drawing (autosave while drawing); done=true hands it in
          requirePhase(s, 'draw');
          if (s.done.includes(pid)) throw new AppError('INVALID_ACTION', 'سلّمت رسمتك.');
          const p = asObject(payload);
          s.drawings[pid] = parseDrawing(p.segments);
          if (p.done === true) {
            s.done.push(pid);
            if (s.players.every((x) => s.done.includes(x))) startGallery(s, ctx);
          }
          return;
        }
        case 'ready-vote': {
          requirePhase(s, 'gallery');
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
          return startDraw(s, ctx);
        case 'draw':
          return startGallery(s, ctx); // unfinished drawings are shown as they are
        case 'gallery':
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
      s.players = s.players.filter((p) => p !== pid);
      s.order = s.order.filter((p) => p !== pid);
      delete s.votes[pid];
      for (const [v, t] of Object.entries(s.votes)) if (t === pid && !s.outsiders.includes(pid)) delete s.votes[v];
      if (s.players.length < 2) return finish(s, ctx);
      if (s.outsiders.includes(pid) && ['reveal', 'draw', 'gallery', 'vote'].includes(s.phase)) {
        // the round makes no sense without its outsider
        s.outsiders = [];
        return advanceRound(s, ctx);
      }
      if (s.phase === 'reveal' && s.players.every((p) => s.seen.includes(p))) startDraw(s, ctx);
      else if (s.phase === 'draw' && s.players.every((p) => s.done.includes(p))) startGallery(s, ctx);
      else if (s.phase === 'gallery' && s.players.every((p) => s.readyToVote.includes(p))) startVote(s, ctx);
      else if (s.phase === 'vote' && s.players.every((p) => s.votes[p])) closeVoting(s, ctx);
      else if (s.phase === 'guess' && s.outsiders.every((o) => s.guesses[o] || !s.players.includes(o))) closeGuess(s, ctx);
    },
    chatSecrets(s) {
      if (!s.secret || s.phase === 'roundEnd' || s.phase === 'finished') return [];
      return [s.secret.word, ...s.secret.alternatives];
    },
    view(s, viewer, now) {
      const sec = s.secret;
      const isPlayer = s.players.includes(viewer);
      const isOutsider = s.outsiders.includes(viewer);
      const galleryOpen = ['gallery', 'vote', 'verdict', 'guess', 'roundEnd', 'finished'].includes(s.phase);
      const revealed = ['verdict', 'guess', 'roundEnd', 'finished'].includes(s.phase);
      const hide = s.phase === 'verdict' || s.phase === 'guess'; // the word stays secret until the outsider guessed
      const me: Record<string, unknown> = { isPlayer };
      if (isPlayer && sec) {
        me.role = isOutsider ? 'outsider' : 'insider';
        if (!isOutsider) me.word = sec.word;
        me.category = !isOutsider || s.settings.categoryHint ? sec.categoryName : null;
        if (s.phase === 'draw') {
          me.drawing = s.drawings[viewer] ?? []; // only your own, e.g. after a reload
          me.done = s.done.includes(viewer);
        }
        if (s.phase === 'guess' && isOutsider) me.guessOptions = sec.guessOptions;
        me.voted = s.votes[viewer] ?? null;
        me.guess = s.guesses[viewer] ?? null;
      }
      return {
        ...baseView(s, now),
        seenCount: s.seen.length,
        done: s.done,
        readyToVote: s.readyToVote,
        votedCount: Object.keys(s.votes).length,
        maxPoints: MAX_DRAW_POINTS,
        me,
        gallery: galleryOpen ? s.order.map((pid) => ({ pid, segments: s.drawings[pid] ?? [] })) : null,
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
