/**
 * Shared engine for the two "outsider" social deduction games:
 *  - مين برا السالفة؟ (secret word)
 *  - مين برا الصورة؟ (secret picture)
 *
 * Flow per round:
 *   reveal → turns → discuss → vote → verdict → guess → roundEnd
 */
import { AppError } from '../../shared/errors.ts';
import type { GameId } from '../../shared/games.ts';
import {
  accused,
  addScore,
  baseState,
  baseView,
  castVote,
  finish,
  pickN,
  requirePhase,
  requirePlayer,
  setPhase,
  shuffle,
  str,
  tally,
} from './common.ts';
import type { BaseState, ContentItem, EngineCtx, GameEngine, ImageAccess, InitInput } from './types.ts';

export interface WordData {
  word: string;
  /** optional picture shown with the word (image id; only to players who know the word) */
  image?: string;
  /** admin-approved TMDB poster (preferred over `image`) */
  poster?: { tmdbId: number; type: 'movie' | 'tv'; path: string; title?: string };
}
export interface PicturePairData {
  a: string; // image id (majority)
  b: string; // image id (outsider, normal/hard)
  labelA: string;
  labelB: string;
  mode: 'normal' | 'hard';
  /** attribution for real photos */
  credits?: { a: PhotoCredit; b: PhotoCredit };
}
export interface PhotoCredit {
  author: string;
  license: string;
  licenseUrl?: string;
  page: string;
}

interface RoundSecret {
  itemId: string;
  category: string;
  categoryName: string;
  /** word game */
  word?: string;
  wordImage?: string;
  /** picture game */
  imageA?: string;
  imageB?: string;
  labelA?: string;
  labelB?: string;
  credits?: { a: PhotoCredit; b: PhotoCredit };
  guessOptions: string[];
  answer: string;
}

interface RoundHistory {
  round: number;
  outsiders: string[];
  caught: string[];
  answer: string;
  guesses: Record<string, string>;
}

export interface OutsiderState extends BaseState {
  variant: 'word' | 'picture';
  mode: 'easy' | 'normal' | 'hard';
  settings: { outsiders: number; categoryHint: boolean; turnSeconds: number; discussSeconds: number; voteSeconds: number };
  pool: ContentItem[];
  decoyLabels: Record<string, string[]>;
  secret: RoundSecret | null;
  outsiders: string[];
  order: string[];
  turnIndex: number;
  seen: string[];
  readyToVote: string[];
  votes: Record<string, string>;
  caught: string[];
  guesses: Record<string, string>;
  roundPoints: Record<string, number>;
  history: RoundHistory[];
}

const REVEAL_SECONDS = 12;
const VERDICT_SECONDS = 7;
const GUESS_SECONDS = 25;
const ROUND_END_SECONDS = 12;

export function outsiderCountFor(requested: number, players: number): number {
  return Math.max(1, Math.min(requested, Math.floor((players - 1) / 2)));
}

export function createOutsiderEngine(variant: 'word' | 'picture', images?: ImageAccess): GameEngine<OutsiderState> {
  const id: GameId = variant === 'word' ? 'outsider-word' : 'outsider-picture';

  function startRound(s: OutsiderState, ctx: EngineCtx) {
    s.round += 1;
    const item = s.pool[(s.round - 1) % s.pool.length];
    const categoryName = (item.data as { categoryName?: string }).categoryName ?? item.category;
    let secret: RoundSecret;
    if (s.variant === 'word') {
      const { word, image, poster } = item.data as unknown as WordData;
      const decoys = (s.decoyLabels[item.category] ?? []).filter((w) => w !== word);
      secret = { itemId: item.id, category: item.category, categoryName, word, wordImage: poster?.path ? `tmdb:${poster.path}` : typeof image === 'string' && image ? image : undefined, answer: word, guessOptions: shuffle([word, ...pickN(decoys, 5, ctx.rng)], ctx.rng) };
    } else {
      const d = item.data as unknown as PicturePairData;
      const decoys = Object.values(s.decoyLabels).flat().filter((l) => l !== d.labelA && l !== d.labelB);
      const opts = [d.labelA, ...(s.mode === 'easy' ? [] : [d.labelB]), ...pickN(Array.from(new Set(decoys)), s.mode === 'easy' ? 5 : 4, ctx.rng)];
      secret = { itemId: item.id, category: item.category, categoryName, imageA: d.a, imageB: d.b, labelA: d.labelA, labelB: d.labelB, ...(d.credits ? { credits: d.credits } : {}), answer: d.labelA, guessOptions: shuffle(opts, ctx.rng) };
    }
    s.secret = secret;
    const n = variant === 'word' ? outsiderCountFor(s.settings.outsiders, s.players.length) : 1;
    s.outsiders = pickN(s.players, n, ctx.rng);
    s.order = shuffle(s.players, ctx.rng);
    s.turnIndex = 0;
    s.seen = [];
    s.readyToVote = [];
    s.votes = {};
    s.caught = [];
    s.guesses = {};
    s.roundPoints = {};
    setPhase(s, 'reveal', ctx, REVEAL_SECONDS);
  }

  function startTurns(s: OutsiderState, ctx: EngineCtx) {
    s.turnIndex = 0;
    setPhase(s, 'turns', ctx, s.settings.turnSeconds);
  }

  function nextTurn(s: OutsiderState, ctx: EngineCtx) {
    s.turnIndex += 1;
    if (s.turnIndex >= s.order.length) setPhase(s, 'discuss', ctx, s.settings.discussSeconds);
    else setPhase(s, 'turns', ctx, s.settings.turnSeconds);
  }

  function award(s: OutsiderState, pid: string, pts: number) {
    addScore(s, pid, pts);
    s.roundPoints[pid] = (s.roundPoints[pid] ?? 0) + pts;
  }

  function closeVoting(s: OutsiderState, ctx: EngineCtx) {
    const counts = tally(s.votes, s.players);
    s.caught = accused(counts, s.outsiders.length).filter((p) => s.outsiders.includes(p));
    for (const [voter, target] of Object.entries(s.votes)) {
      if (!s.outsiders.includes(voter) && s.outsiders.includes(target)) award(s, voter, 1);
    }
    for (const o of s.outsiders) if (!s.caught.includes(o)) award(s, o, 2);
    setPhase(s, 'verdict', ctx, VERDICT_SECONDS);
  }

  function closeGuess(s: OutsiderState, ctx: EngineCtx) {
    for (const o of s.outsiders) if (s.guesses[o] === s.secret!.answer) award(s, o, 2);
    s.history.push({ round: s.round, outsiders: s.outsiders, caught: s.caught, answer: s.secret!.answer, guesses: s.guesses });
    setPhase(s, 'roundEnd', ctx, ROUND_END_SECONDS);
  }

  function advanceRound(s: OutsiderState, ctx: EngineCtx) {
    if (s.round >= s.totalRounds) finish(s, ctx);
    else startRound(s, ctx);
  }

  const engine: GameEngine<OutsiderState> = {
    id,
    minPlayers: 3,
    maxPlayers: 12,
    content(settings) {
      return { kind: variant === 'word' ? 'word' : 'picture-pair', count: Number(settings.rounds), decoys: 40 };
    },
    init(input: InitInput, ctx) {
      if (!input.content.length) throw new AppError('NOT_FOUND', 'ما في محتوى كافي لهالإعدادات.');
      const st = input.settings;
      const base = baseState(id, input, Math.min(Number(st.rounds), input.content.length));
      const decoyLabels: Record<string, string[]> = {};
      for (const d of [...input.content, ...input.decoys]) {
        const label = variant === 'word' ? (d.data as unknown as WordData).word : (d.data as unknown as PicturePairData).labelA;
        (decoyLabels[d.category] ??= []).push(label);
        if (variant === 'picture') decoyLabels[d.category].push((d.data as unknown as PicturePairData).labelB);
      }
      const pool = input.content.map((c) => ({ ...c, data: { ...c.data, categoryName: input.categoryNames[c.category] ?? c.category } }));
      const s: OutsiderState = {
        ...base,
        variant,
        mode: variant === 'picture' ? ((st.mode as OutsiderState['mode']) ?? 'normal') : 'normal',
        settings: {
          outsiders: Number(st.outsiders ?? 1),
          categoryHint: st.categoryHint !== false,
          turnSeconds: Number(st.turnSeconds),
          discussSeconds: Number(st.discussSeconds),
          voteSeconds: Number(st.voteSeconds),
        },
        pool,
        decoyLabels,
        secret: null,
        outsiders: [],
        order: [],
        turnIndex: 0,
        seen: [],
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
      if (type === 'host:skip') {
        // host-only check is done by the room manager
        engine.tick(s, ctx);
        return;
      }
      if (type === 'host:next') {
        requirePhase(s, 'roundEnd');
        advanceRound(s, ctx);
        return;
      }
      requirePlayer(s, pid);
      switch (type) {
        case 'seen': {
          requirePhase(s, 'reveal');
          if (!s.seen.includes(pid)) s.seen.push(pid);
          if (s.seen.length >= s.players.length) startTurns(s, ctx);
          return;
        }
        case 'turn:done': {
          requirePhase(s, 'turns');
          if (s.order[s.turnIndex] !== pid) throw new AppError('INVALID_ACTION', 'مش دورك.');
          nextTurn(s, ctx);
          return;
        }
        case 'ready-vote': {
          requirePhase(s, 'discuss');
          if (!s.readyToVote.includes(pid)) s.readyToVote.push(pid);
          if (s.readyToVote.length >= s.players.length) setPhase(s, 'vote', ctx, s.settings.voteSeconds);
          return;
        }
        case 'vote': {
          requirePhase(s, 'vote');
          castVote(s.votes, s.players, pid, payload);
          if (Object.keys(s.votes).length >= s.players.length) closeVoting(s, ctx);
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
        case 'turns':
          return nextTurn(s, ctx);
        case 'discuss':
          return setPhase(s, 'vote', ctx, s.settings.voteSeconds);
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
      // keep their score but stop waiting on them
      s.players = s.players.filter((p) => p !== pid);
      delete s.votes[pid];
      for (const [v, t] of Object.entries(s.votes)) if (t === pid && !s.outsiders.includes(pid)) delete s.votes[v];
      const wasTurn = s.phase === 'turns' && s.order[s.turnIndex] === pid;
      const idx = s.order.indexOf(pid);
      s.order = s.order.filter((p) => p !== pid);
      if (idx >= 0 && idx < s.turnIndex) s.turnIndex -= 1;
      if (s.players.length < 2) return finish(s, ctx);
      if (s.outsiders.includes(pid) && ['reveal', 'turns', 'discuss', 'vote'].includes(s.phase)) {
        // round cannot continue without its outsider: void it and move on
        s.outsiders = s.outsiders.filter((p) => p !== pid);
        if (!s.outsiders.length) return advanceRound(s, ctx);
      }
      if (wasTurn) {
        s.turnIndex -= 1;
        nextTurn(s, ctx);
      } else if (s.phase === 'reveal' && s.players.every((p) => s.seen.includes(p))) startTurns(s, ctx);
      else if (s.phase === 'discuss' && s.players.every((p) => s.readyToVote.includes(p))) setPhase(s, 'vote', ctx, s.settings.voteSeconds);
      else if (s.phase === 'vote' && s.players.every((p) => s.votes[p])) closeVoting(s, ctx);
      else if (s.phase === 'guess' && s.outsiders.every((o) => s.guesses[o] || !s.players.includes(o))) closeGuess(s, ctx);
    },
    chatSecrets(s) {
      if (!s.secret || s.phase === 'roundEnd' || s.phase === 'finished') return [];
      return variant === 'word' ? [s.secret.word!] : [s.secret.labelA!, s.secret.labelB!];
    },
    view(s, viewer, now) {
      const isPlayer = s.players.includes(viewer);
      const isOutsider = s.outsiders.includes(viewer);
      const sec = s.secret!;
      const revealed = ['verdict', 'guess', 'roundEnd', 'finished'].includes(s.phase);
      // the answer stays hidden until the outsider has had their guess
      const hide = s.phase === 'verdict' || s.phase === 'guess';
      const me: Record<string, unknown> = { isPlayer };
      if (isPlayer && sec) {
        if (variant === 'word') {
          me.role = isOutsider ? 'outsider' : 'insider';
          if (!isOutsider) {
            me.word = sec.word;
            // the picture would give the word away, so the outsider never gets it
            if (sec.wordImage && images) me.wordImage = images.sign(sec.wordImage, viewer);
          }
          me.category = !isOutsider || s.settings.categoryHint ? sec.categoryName : null;
        } else {
          if (s.mode === 'easy') {
            me.role = isOutsider ? 'outsider' : 'insider';
            me.image = isOutsider ? null : images!.sign(sec.imageA!, viewer);
          } else {
            // the outsider is NOT told that their picture is different
            me.role = revealed ? (isOutsider ? 'outsider' : 'insider') : 'unknown';
            me.image = images!.sign(isOutsider ? sec.imageB! : sec.imageA!, viewer);
          }
          me.category = sec.categoryName;
        }
        if (s.phase === 'guess' && isOutsider) me.guessOptions = sec.guessOptions;
        me.voted = s.votes[viewer] ?? null;
        me.guess = s.guesses[viewer] ?? null;
      }
      return {
        ...baseView(s, now),
        variant,
        mode: s.mode,
        order: s.order,
        turnIndex: s.turnIndex,
        asker: s.phase === 'turns' ? s.order[s.turnIndex] : null,
        target: s.phase === 'turns' ? s.order[(s.turnIndex + 1) % s.order.length] : null,
        seenCount: s.seen.length,
        readyToVote: s.readyToVote,
        votedCount: Object.keys(s.votes).length,
        outsiderCount: s.outsiders.length,
        me,
        reveal: revealed
          ? {
              outsiders: s.outsiders,
              caught: s.caught,
              votes: s.votes,
              counts: tally(s.votes, s.players),
              answer: hide ? null : sec.answer,
              word: hide ? null : (sec.word ?? null),
              wordImage: !hide && variant === 'word' && sec.wordImage && images ? images.sign(sec.wordImage, viewer) : null,
              imageA: !hide && variant === 'picture' ? images!.sign(sec.imageA!, viewer) : null,
              imageB: !hide && variant === 'picture' && s.mode !== 'easy' ? images!.sign(sec.imageB!, viewer) : null,
              labelB: !hide && variant === 'picture' && s.mode !== 'easy' ? sec.labelB : null,
              // photo attribution (only for pictures that are revealed)
              credits:
                !hide && variant === 'picture' && sec.credits
                  ? { a: sec.credits.a, b: s.mode !== 'easy' ? sec.credits.b : null }
                  : null,
              guesses: hide ? {} : s.guesses,
              roundPoints: s.roundPoints,
            }
          : null,
        history: s.history.map((h) => ({ round: h.round, outsiders: h.outsiders, caught: h.caught, answer: h.answer })),
      };
    },
  };
  return engine;
}
