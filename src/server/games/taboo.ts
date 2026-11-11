/**
 * ممنوع تحكي! — team taboo.
 * Flow per turn: ready → turn → turnEnd
 */
import { AppError } from '../../shared/errors.ts';
import { matchGuess } from '../../shared/arabic.ts';
import { cleanText } from '../security/text.ts';
import { addScore, asObject, baseState, baseView, finish, rankingFromScores, requirePhase, requirePlayer, setPhase, shuffle, str } from './common.ts';
import { assignTeams, teamResults } from './teams.ts';
import type { BaseState, ContentItem, EngineCtx, GameEngine } from './types.ts';

export interface TabooCard {
  word: string;
  forbidden: string[];
  alternatives?: string[];
}

interface PlayedCard {
  word: string;
  forbidden: string[];
  result: 'correct' | 'skip' | 'buzz';
  by?: string;
}

export interface TabooState extends BaseState {
  settings: { turnSeconds: number; maxSkips: number };
  teams: Record<string, number>;
  teamScores: number[];
  deck: TabooCard[];
  deckIndex: number;
  /** explainer rotation per team */
  rotation: string[][];
  rotationIndex: number[];
  turnNumber: number;
  totalTurns: number;
  explainer: string | null;
  turnTeam: number;
  card: TabooCard | null;
  cardIndex: number;
  skipsLeft: number;
  played: PlayedCard[];
  feed: { id: number; pid: string; text: string; correct: boolean }[];
  feedSeq: number;
  buzzedCard: number;
}

const READY_SECONDS = 15;
const TURN_END_SECONDS = 8;

export function createTabooEngine(): GameEngine<TabooState> {
  function drawCard(s: TabooState) {
    if (s.deckIndex >= s.deck.length) s.deckIndex = 0; // recycle when the deck runs out
    s.card = s.deck[s.deckIndex++];
    s.cardIndex += 1;
  }
  function prepareTurn(s: TabooState, ctx: EngineCtx) {
    s.turnNumber += 1;
    s.round = s.turnNumber;
    s.turnTeam = (s.turnNumber - 1) % 2;
    const rot = s.rotation[s.turnTeam];
    s.explainer = rot.length ? rot[s.rotationIndex[s.turnTeam] % rot.length] : null;
    s.rotationIndex[s.turnTeam] += 1;
    s.card = null;
    s.played = [];
    s.feed = [];
    s.skipsLeft = s.settings.maxSkips;
    setPhase(s, 'ready', ctx, READY_SECONDS);
  }
  function startTurn(s: TabooState, ctx: EngineCtx) {
    drawCard(s);
    setPhase(s, 'turn', ctx, s.settings.turnSeconds);
  }
  function endTurn(s: TabooState, ctx: EngineCtx) {
    s.card = null;
    setPhase(s, 'turnEnd', ctx, TURN_END_SECONDS);
  }
  function advance(s: TabooState, ctx: EngineCtx) {
    if (s.turnNumber >= s.totalTurns) {
      const res = rankingFromScores(s);
      const tr = teamResults(s.teams, s.teamScores);
      res.teamScores = tr.teamScores;
      res.winningTeam = tr.winningTeam;
      res.winners = tr.winningTeam == null ? [] : tr.teamScores[tr.winningTeam].members;
      finish(s, ctx, res);
    } else prepareTurn(s, ctx);
  }
  function correct(s: TabooState, guesser: string | undefined, ctx: EngineCtx) {
    s.teamScores[s.turnTeam] += 1;
    if (s.explainer) addScore(s, s.explainer, 1);
    if (guesser) addScore(s, guesser, 1);
    s.played.push({ word: s.card!.word, forbidden: s.card!.forbidden, result: 'correct', by: guesser });
    drawCard(s);
    void ctx;
  }
  function checkCard(s: TabooState, payload: unknown) {
    const card = asObject(payload).card;
    if (card !== s.cardIndex) throw new AppError('STALE_ACTION', 'البطاقة تغيّرت.');
  }

  const engine: GameEngine<TabooState> = {
    id: 'taboo',
    minPlayers: 4,
    maxPlayers: 12,
    content(settings, playerCount) {
      return { kind: 'taboo-card', count: Math.min(400, Number(settings.turnsPerPlayer) * playerCount * 12) };
    },
    init(input, ctx) {
      if (input.content.length < 5) throw new AppError('NOT_FOUND', 'ما في بطاقات كافية.');
      const teams = assignTeams(input.players, ctx.rng);
      const players = input.players.map((p) => p.id);
      const rotation = [0, 1].map((t) => shuffle(players.filter((p) => teams[p] === t), ctx.rng));
      const st = input.settings;
      const turnsPerPlayer = Number(st.turnsPerPlayer);
      const totalTurns = Math.max(rotation[0].length, rotation[1].length) * 2 * turnsPerPlayer;
      const s: TabooState = {
        ...baseState('taboo', input, totalTurns),
        settings: { turnSeconds: Number(st.turnSeconds), maxSkips: Number(st.maxSkips) },
        teams,
        teamScores: [0, 0],
        deck: shuffle(input.content as unknown as ContentItem<TabooCard>[], ctx.rng).map((c) => c.data),
        deckIndex: 0,
        rotation,
        rotationIndex: [0, 0],
        turnNumber: 0,
        totalTurns,
        explainer: null,
        turnTeam: 0,
        card: null,
        cardIndex: 0,
        skipsLeft: 0,
        played: [],
        feed: [],
        feedSeq: 0,
        buzzedCard: -1,
      };
      prepareTurn(s, ctx);
      return s;
    },
    act(s, pid, type, payload, ctx) {
      if (type === 'host:skip') return engine.tick(s, ctx);
      requirePlayer(s, pid);
      const myTeam = s.teams[pid];
      switch (type) {
        case 'start': {
          requirePhase(s, 'ready');
          if (pid !== s.explainer) throw new AppError('INVALID_ACTION', 'الشارح بس بيبلّش.');
          return startTurn(s, ctx);
        }
        case 'correct': {
          requirePhase(s, 'turn');
          if (pid !== s.explainer) throw new AppError('FORBIDDEN');
          checkCard(s, payload);
          return correct(s, undefined, ctx);
        }
        case 'skip': {
          requirePhase(s, 'turn');
          if (pid !== s.explainer) throw new AppError('FORBIDDEN');
          checkCard(s, payload);
          if (s.skipsLeft <= 0) throw new AppError('INVALID_ACTION', 'خلصت التخطيات.');
          s.skipsLeft -= 1;
          s.played.push({ word: s.card!.word, forbidden: s.card!.forbidden, result: 'skip' });
          return drawCard(s);
        }
        case 'buzz': {
          requirePhase(s, 'turn');
          if (myTeam === s.turnTeam) throw new AppError('FORBIDDEN', 'الكبسة للفريق الثاني.');
          checkCard(s, payload);
          if (s.buzzedCard === s.cardIndex) return;
          s.buzzedCard = s.cardIndex;
          s.teamScores[s.turnTeam] -= 1;
          s.played.push({ word: s.card!.word, forbidden: s.card!.forbidden, result: 'buzz', by: pid });
          return drawCard(s);
        }
        case 'guess': {
          requirePhase(s, 'turn');
          if (myTeam !== s.turnTeam || pid === s.explainer) throw new AppError('FORBIDDEN', 'التخمين لفريق الشارح.');
          const text = cleanText(str(payload, 'text', 120), 60);
          if (!text) throw new AppError('VALIDATION');
          const card = s.card!;
          const ok = matchGuess(text, [card.word, ...(card.alternatives ?? [])]) === 'exact';
          s.feed.push({ id: ++s.feedSeq, pid, text, correct: ok });
          if (s.feed.length > 40) s.feed.shift();
          if (ok) correct(s, pid, ctx);
          return;
        }
        default:
          throw new AppError('INVALID_ACTION');
      }
    },
    tick(s, ctx) {
      if (s.phase === 'ready') startTurn(s, ctx);
      else if (s.phase === 'turn') endTurn(s, ctx);
      else if (s.phase === 'turnEnd') advance(s, ctx);
    },
    playerLeft(s, pid, ctx) {
      s.players = s.players.filter((p) => p !== pid);
      s.rotation = s.rotation.map((r) => r.filter((p) => p !== pid));
      if (s.rotation[0].length === 0 || s.rotation[1].length === 0) return finish(s, ctx, (() => {
        const res = rankingFromScores(s);
        const tr = teamResults(s.teams, s.teamScores);
        return { ...res, ...tr, winners: tr.winningTeam == null ? [] : tr.teamScores[tr.winningTeam].members };
      })());
      if (pid === s.explainer && (s.phase === 'ready' || s.phase === 'turn')) endTurn(s, ctx);
    },
    chatSecrets(s) {
      return s.phase === 'turn' && s.card ? [s.card.word, ...(s.card.alternatives ?? [])] : [];
    },
    view(s, viewer, now) {
      const isPlayer = s.players.includes(viewer);
      const myTeam = isPlayer ? s.teams[viewer] : null;
      const seesCard = s.phase === 'turn' && isPlayer && (viewer === s.explainer || myTeam !== s.turnTeam);
      return {
        ...baseView(s, now),
        teams: s.teams,
        teamScores: s.teamScores,
        turnTeam: s.turnTeam,
        explainer: s.explainer,
        turnNumber: s.turnNumber,
        totalTurns: s.totalTurns,
        skipsLeft: s.skipsLeft,
        cardIndex: s.cardIndex,
        card: seesCard ? s.card : null,
        played: s.phase === 'turn' ? s.played.map((p) => ({ result: p.result, word: myTeam !== s.turnTeam || viewer === s.explainer ? p.word : null })) : s.played,
        feed: s.feed,
        me: { isPlayer, team: myTeam, role: viewer === s.explainer ? 'explainer' : myTeam === s.turnTeam ? 'guesser' : isPlayer ? 'watcher' : 'spectator' },
      };
    },
  };
  return engine;
}
