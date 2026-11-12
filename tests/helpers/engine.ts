import { sanitizeSettings, type GameId } from '../../src/shared/games.ts';
import type { BaseState, ContentItem, ContentKind, EngineCtx, GameEngine, ImageAccess } from '../../src/server/games/types.ts';
import { createEngines } from '../../src/server/games/registry.ts';

export function seededRng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const fakeImages: ImageAccess = { sign: (id, viewer) => `/img/${id}?for=${viewer}` };

export function item(kind: ContentKind, i: number, data: Record<string, unknown>, category = 'food'): ContentItem {
  return { id: `${kind}-${i}`, kind, category, difficulty: 'medium', data };
}

export function contentFor(gameId: GameId, n = 40): ContentItem[] {
  const out: ContentItem[] = [];
  for (let i = 0; i < n; i++) {
    switch (gameId) {
      case 'outsider-word':
        out.push(item('word', i, { word: `كلمة${i}` }));
        break;
      case 'odd-question':
        out.push(item('question-pair', i, { majority: `سؤال أغلبية ${i}`, outsider: `سؤال مختلف ${i}` }));
        break;
      case 'outsider-picture':
        out.push(item('picture-pair', i, { a: `imgA${i}`, b: `imgB${i}`, labelA: `صورة أ${i}`, labelB: `صورة ب${i}`, mode: 'normal' }));
        break;
      case 'most-likely':
        out.push(item('most-likely', i, { text: `مين غالباً ${i}؟` }));
        break;
      case 'taboo':
        out.push(item('taboo-card', i, { word: `منسف${i}`, forbidden: ['لبن', 'رز', 'لحمة'] }));
        break;
      case 'speed-quiz':
        out.push(item('trivia', i, { question: `سؤال ${i}`, options: ['أ', 'ب', 'ج', 'د'], answer: i % 4 }));
        break;
      case 'draw-guess':
      case 'outsider-draw':
        out.push(item('draw-word', i, { word: `بطيخة${i}` }));
        break;
    }
  }
  return out;
}

/** Drives an engine with a controllable clock, cloning state like the room manager does. */
export class Harness<S extends BaseState = BaseState> {
  engine: GameEngine<S>;
  state: S;
  now = 1_000_000;
  rng = seededRng(7);
  constructor(gameId: GameId, playerCount: number, settings: Record<string, unknown> = {}, content?: ContentItem[]) {
    this.engine = createEngines(fakeImages)[gameId] as GameEngine<S>;
    const players = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `لاعب ${i}` }));
    this.state = this.engine.init(
      { players, settings: sanitizeSettings(gameId, settings), content: content ?? contentFor(gameId), decoys: contentFor(gameId, 20), categoryNames: { food: 'أكل' } },
      this.ctx(),
    );
  }
  ctx(): EngineCtx {
    return { now: this.now, rng: this.rng };
  }
  act(pid: string, type: string, payload?: unknown) {
    const draft = structuredClone(this.state);
    this.engine.act(draft, pid, type, payload, this.ctx());
    this.state = draft;
  }
  /** jump to the current deadline and tick */
  expire() {
    const wake = this.engine.nextWake?.(this.state, this.now) ?? this.state.deadline;
    if (wake == null) throw new Error('no deadline in phase ' + this.state.phase);
    this.now = Math.max(this.now, this.state.deadline ?? wake);
    const draft = structuredClone(this.state);
    this.engine.tick(draft, this.ctx());
    this.state = draft;
  }
  view(pid: string) {
    return this.engine.view(this.state, pid, this.now) as Record<string, any>;
  }
  get players() {
    return this.state.players;
  }
}
