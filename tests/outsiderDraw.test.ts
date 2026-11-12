import { describe, expect, it } from 'vitest';
import { Harness } from './helpers/engine.ts';
import { MAX_DRAW_POINTS, parseDrawing, type OutsiderDrawState } from '../src/server/games/outsiderDraw.ts';
import { GAMES, GAME_IDS, sanitizeSettings } from '../src/shared/games.ts';
import type { DrawSegment } from '../src/shared/protocol.ts';

const json = (v: unknown) => JSON.stringify(v);
const line = (s: number, x: number): DrawSegment => ({ s, c: 2, w: 1, p: [x, 100, x + 50, 200, x + 100, 150] });

function toGallery(h: Harness<OutsiderDrawState>) {
  for (const p of h.players) h.act(p, 'seen');
  expect(h.state.phase).toBe('draw');
  h.players.forEach((p, i) => h.act(p, 'drawing', { segments: [line(1, i * 100)], done: true }));
  expect(h.state.phase).toBe('gallery');
}

describe('مين برا الرسمة؟ (outsider-draw) / مين برا الصورة؟ rename', () => {
  it('is registered as a new game and the picture game is renamed', () => {
    expect(GAME_IDS).toContain('outsider-draw');
    expect(GAMES['outsider-draw'].name).toBe('مين برا الرسمة؟');
    expect(GAMES['outsider-picture'].name).toBe('مين برا الصورة؟');
    expect(sanitizeSettings('outsider-draw', {}).drawSeconds).toBe(50);
  });

  it('everyone but the outsider gets the same word; the outsider only gets the category hint', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 4);
    const out = h.state.outsiders[0];
    const word = h.state.secret!.word;
    expect(h.state.outsiders).toHaveLength(1);
    for (const p of h.players) {
      const v = h.view(p);
      if (p === out) {
        expect(v.me.role).toBe('outsider');
        expect(v.me.word).toBeUndefined();
        expect(v.me.category).toBe('أكل');
        expect(json(v)).not.toContain(word);
      } else {
        expect(v.me.role).toBe('insider');
        expect(v.me.word).toBe(word);
      }
    }
    // no category hint when switched off
    const h2 = new Harness<OutsiderDrawState>('outsider-draw', 4, { categoryHint: false });
    expect(h2.view(h2.state.outsiders[0]).me.category).toBeNull();
  });

  it('drawings stay private while drawing: you only get your own, then everyone sees all of them', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 3);
    for (const p of h.players) h.act(p, 'seen');
    const [a, b, c] = h.players;
    h.act(a, 'drawing', { segments: [line(1, 111)] }); // autosave, not handed in
    h.act(b, 'drawing', { segments: [line(1, 222)], done: true });
    expect(h.state.phase).toBe('draw');
    expect(h.view(a).me.drawing).toEqual([line(1, 111)]);
    expect(json(h.view(a))).not.toContain('222');
    expect(json(h.view(c))).not.toContain('111');
    expect(json(h.view(c))).not.toContain('222');
    expect(h.view(c).gallery).toBeNull();
    expect(h.view(a).done).toEqual([b]);
    // a handed-in drawing can't be changed
    expect(() => h.act(b, 'drawing', { segments: [] })).toThrow();
    // time is up: unfinished drawings are shown as they are
    h.expire();
    expect(h.state.phase).toBe('gallery');
    const g = h.view(c).gallery as { pid: string; segments: DrawSegment[] }[];
    expect(g.map((x) => x.pid).sort()).toEqual([...h.players].sort());
    expect(g.find((x) => x.pid === a)!.segments).toEqual([line(1, 111)]);
    expect(g.find((x) => x.pid === c)!.segments).toEqual([]);
  });

  it('rejects malformed or oversized drawings', () => {
    expect(() => parseDrawing('x')).toThrow();
    expect(() => parseDrawing([{ s: 1, c: 99, w: 1, p: [1, 2] }])).toThrow();
    expect(() => parseDrawing([{ s: 1, c: 1, w: 1, p: [1, 2, 3] }])).toThrow();
    expect(() => parseDrawing([{ s: 1, c: 1, w: 1, p: [1, 2000] }])).toThrow();
    expect(() => parseDrawing([{ s: 1, c: 1, w: 1, e: 2, p: [1, 2] }])).toThrow();
    const full = Array.from({ length: Math.ceil(MAX_DRAW_POINTS / 200) + 1 }, (_, i) => ({ s: i, c: 0, w: 0, p: Array.from({ length: 400 }, (_, j) => j % 1000) }));
    expect(() => parseDrawing(full)).toThrow(/الحبر/);
    // unknown fields are dropped
    expect(parseDrawing([{ s: 1, c: 1, w: 1, p: [5, 5], evil: '<script>' } as unknown as DrawSegment])).toEqual([{ s: 1, c: 1, w: 1, p: [5, 5] }]);
    // and the biggest allowed drawing fits comfortably in one socket message
    const max = Array.from({ length: MAX_DRAW_POINTS / 200 }, (_, i) => ({ s: i, c: 11, w: 4, e: 1 as const, p: Array.from({ length: 400 }, () => 1000) }));
    expect(parseDrawing(max)).toHaveLength(max.length);
    expect(json({ segments: max }).length).toBeLessThan(40 * 1024);
  });

  it('votes, verdict, outsider guess and scoring', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 4, { rounds: 1 });
    const out = h.state.outsiders[0];
    const insiders = h.players.filter((p) => p !== out);
    toGallery(h);
    expect(h.view(out).reveal).toBeNull();
    for (const p of h.players) h.act(p, 'ready-vote');
    expect(h.state.phase).toBe('vote');
    for (const p of insiders) h.act(p, 'vote', { target: out });
    h.act(out, 'vote', { target: insiders[0] });
    expect(h.state.phase).toBe('verdict');
    const v = h.view(insiders[0]);
    expect(v.reveal.caught).toEqual([out]);
    expect(v.reveal.answer).toBeNull(); // still hidden from the outsider
    h.expire();
    expect(h.state.phase).toBe('guess');
    expect(h.view(insiders[0]).me.guessOptions).toBeUndefined();
    const opts = h.view(out).me.guessOptions as string[];
    expect(opts).toHaveLength(6);
    expect(opts).toContain(h.state.secret!.word);
    expect(() => h.act(insiders[0], 'guess', { choice: opts[0] })).toThrow();
    h.act(out, 'guess', { choice: h.state.secret!.word });
    expect(h.state.phase).toBe('roundEnd');
    for (const p of insiders) expect(h.state.scores[p]).toBe(1);
    expect(h.state.scores[out]).toBe(2); // caught, but guessed the word
    expect(h.view(out).reveal.answer).toBe(h.state.secret!.word);
    h.act(h.players[0], 'host:next');
    expect(h.state.finished).toBe(true);
  });

  it('the word is masked in chat until the round ends; host skip always moves forward', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 3, { rounds: 1 });
    expect(h.engine.chatSecrets!(h.state)).toContain(h.state.secret!.word);
    let guard = 0;
    while (!h.state.finished && guard++ < 20) {
      if (h.state.phase === 'roundEnd') expect(h.engine.chatSecrets!(h.state)).toEqual([]);
      h.act(h.players[0], 'host:skip');
    }
    expect(h.state.finished).toBe(true);
  });

  it('if the outsider leaves mid-round the round is skipped; others leaving does not block', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 4, { rounds: 2 });
    const out = h.state.outsiders[0];
    for (const p of h.players) h.act(p, 'seen');
    const stay = h.players.filter((p) => p !== out);
    h.engine.playerLeft!(h.state, stay[0], { now: h.now, rng: () => 0.5 });
    for (const p of h.state.players) h.act(p, 'drawing', { segments: [], done: true });
    expect(h.state.phase).toBe('gallery');
    h.engine.playerLeft!(h.state, out, { now: h.now, rng: () => 0.5 });
    expect(h.state.round).toBe(2);
    expect(h.state.phase).toBe('reveal');
  });
});
