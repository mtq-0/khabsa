import type { GameId, GameSettings } from '../../shared/games.ts';
import type { FinalResults } from '../../shared/protocol.ts';

export type ContentKind = 'word' | 'question-pair' | 'picture-pair' | 'most-likely' | 'taboo-card' | 'trivia' | 'draw-word';

export interface ContentItem<D = Record<string, unknown>> {
  id: string;
  kind: ContentKind;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  data: D;
}

export interface ContentRequest {
  kind: ContentKind;
  count: number;
  /** extra items from the same categories, used e.g. as guess decoys */
  decoys?: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  team?: number | null;
}

export interface EngineCtx {
  now: number;
  rng: () => number;
}

export interface InitInput {
  players: PlayerInfo[];
  settings: GameSettings;
  content: ContentItem[];
  decoys: ContentItem[];
  categoryNames: Record<string, string>;
}

/** Fields every engine state carries. Engine states must be JSON-serializable. */
export interface BaseState {
  gameId: GameId;
  phase: string;
  /** unique per phase instance; clients echo it to reject stale actions */
  phaseKey: string;
  seq: number;
  deadline: number | null;
  round: number;
  totalRounds: number;
  players: string[];
  names: Record<string, string>;
  scores: Record<string, number>;
  finished: boolean;
  results: FinalResults | null;
}

export interface GameEngine<S extends BaseState = BaseState> {
  id: GameId;
  minPlayers: number;
  maxPlayers: number;
  content(settings: GameSettings, playerCount: number): ContentRequest;
  init(input: InitInput, ctx: EngineCtx): S;
  /** Mutates the (already cloned) draft state. Throws AppError on invalid input. */
  act(state: S, playerId: string, type: string, payload: unknown, ctx: EngineCtx): void;
  /** Called when ctx.now >= state.deadline. Mutates draft. */
  tick(state: S, ctx: EngineCtx): void;
  /** Personalized projection: must never include another player's secrets. */
  view(state: S, viewerId: string, now: number): Record<string, unknown>;
  /** Player left the room mid-game. Mutates draft. */
  playerLeft?(state: S, playerId: string, ctx: EngineCtx): void;
  /** Earliest time tick() must run; defaults to state.deadline. */
  nextWake?(state: S, now: number): number | null;
  /** Secret words that must be masked in room chat while they are hidden. */
  chatSecrets?(state: S): string[];
  /** Who may currently draw on the shared canvas (draw & guess only). */
  canvas?(state: S): { drawer: string; turnKey: string } | null;
}

export interface ImageAccess {
  /** returns a short-lived URL that only `viewerId` may load */
  sign(imageId: string, viewerId: string): string;
}
