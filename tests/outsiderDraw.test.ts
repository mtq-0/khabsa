import { describe, expect, it } from 'vitest';
import { Harness } from './helpers/engine.ts';
import { MAX_STROKE_POINTS, PLAYER_COLORS, parseStroke, type OutsiderDrawState } from '../src/server/games/outsiderDraw.ts';
import { GAMES, GAME_IDS, sanitizeSettings } from '../src/shared/games.ts';
import type { DrawSegment } from '../src/shared/protocol.ts';

const json = (v: unknown) => JSON.stringify(v);
const line = (x: number, c = 0): DrawSegment => ({ s: 99, c, w: 2, p: [x, 100, x + 50, 200, x + 100, 150] });
const drawer = (h: Harness<OutsiderDrawState>) => h.view(h.players[0]).drawer as string;

/** everyone draws the minimum number of lines (the "ready to vote" button opens after that) */
function drawAll(h: Harness<OutsiderDrawState>) {
  for (const p of h.players) h.act(p, 'seen');
  let k = 0;
  while (h.state.phase === 'turn' && !h.view(h.players[0]).canVote) h.act(drawer(h), 'stroke', { segments: [line(k++ * 10)] });
}

describe('مين برا الرسمة؟ (outsider-draw, one shared canvas, one line per turn)', () => {
  it('is registered; the picture game is called مين برا الصورة؟', () => {
    expect(GAME_IDS).toContain('outsider-draw');
    expect(GAMES['outsider-draw'].name).toBe('مين برا الرسمة؟');
    expect(GAMES['outsider-picture'].name).toBe('مين برا الصورة؟');
    const st = sanitizeSettings('outsider-draw', {});
    expect(st.laps).toBe(2);
    expect(st.turnSeconds).toBe(20);
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
      } else expect(v.me.word).toBe(word);
    }
    const h2 = new Harness<OutsiderDrawState>('outsider-draw', 4, { categoryHint: false });
    expect(h2.view(h2.state.outsiders[0]).me.category).toBeNull();
  });

  it('random fair order, each player has their own colour, endless until everybody is ready to vote', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 4, { laps: 2 });
    for (const p of h.players) h.act(p, 'seen');
    expect(h.state.phase).toBe('turn');
    const v = h.view(h.players[1]);
    expect([...v.order].sort()).toEqual([...h.players].sort());
    expect(new Set(Object.values(v.colors)).size).toBe(4);
    for (const c of Object.values(v.colors)) expect(PLAYER_COLORS).toContain(c);
    expect(v.minTurns).toBe(8);
    expect(v.canVote).toBe(false);
    expect(() => h.act(h.players[0], 'ready-vote')).toThrow(/بدري/);
    const seq: string[] = [];
    for (let t = 0; t < 8; t++) {
      const d = drawer(h);
      seq.push(d);
      // only the drawer may draw
      const other = h.players.find((p) => p !== d)!;
      expect(() => h.act(other, 'stroke', { segments: [line(1)] })).toThrow(/مش دورك/);
      h.act(d, 'stroke', { segments: [line(t * 10, 11)] });
    }
    // fair and random: every lap is a permutation of the players, never the same drawer twice in a row
    expect([...seq.slice(0, 4)].sort()).toEqual([...h.players].sort());
    expect([...seq.slice(4)].sort()).toEqual([...h.players].sort());
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    // the minimum is drawn but the canvas goes on until everybody presses ready
    expect(h.state.phase).toBe('turn');
    expect(h.view(h.players[0]).canVote).toBe(true);
    for (const p of h.players.slice(0, 3)) h.act(p, 'ready-vote');
    expect(h.state.phase).toBe('turn');
    h.act(drawer(h), 'stroke', { segments: [line(77)] }); // one more line while somebody is not ready
    expect(h.state.phase).toBe('turn');
    h.act(h.players[3], 'ready-vote');
    expect(h.state.phase).toBe('vote');
    // everyone sees the whole shared canvas, each line in its owner's colour (not the one sent)
    const strokes = h.view(h.players[0]).strokes as { pid: string; segs: DrawSegment[] }[];
    expect(strokes).toHaveLength(9);
    for (const st of strokes) expect(st.segs.every((s) => s.c === v.colors[st.pid] && s.s === 1)).toBe(true);
  });

  it('hard stop: after enough lines the canvas goes to the discussion even if nobody is ready', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 3, { laps: 1 });
    for (const p of h.players) h.act(p, 'seen');
    let n = 0;
    while (h.state.phase === 'turn' && n++ < 100) h.act(drawer(h), 'stroke', { segments: [line(n)] });
    expect(h.state.phase).toBe('discuss');
    expect(n).toBe(3 * 8);
  });

  it('opens the live draw channel only to the current drawer, for the current turn', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 3, { laps: 1 });
    expect(h.engine.canvas!(h.state)).toBeNull(); // reveal
    for (const p of h.players) h.act(p, 'seen');
    const c1 = h.engine.canvas!(h.state)!;
    expect(c1.drawer).toBe(drawer(h));
    h.act(c1.drawer, 'stroke', { segments: [line(1)] });
    const c2 = h.engine.canvas!(h.state)!;
    expect(c2.drawer).not.toBe(c1.drawer);
    expect(c2.turnKey).not.toBe(c1.turnKey); // old live lines can't leak into the next turn
    while (h.state.phase === 'turn') h.act(drawer(h), 'stroke', { segments: [line(2)] });
    expect(h.engine.canvas!(h.state)).toBeNull(); // discuss
  });

  it('a turn that runs out of time passes without a line', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 3, { laps: 1 });
    for (const p of h.players) h.act(p, 'seen');
    const first = drawer(h);
    h.expire();
    expect(drawer(h)).not.toBe(first);
    expect(h.state.strokes).toHaveLength(0);
  });

  it('rejects anything but a single valid line', () => {
    expect(() => parseStroke('x', 0)).toThrow();
    expect(() => parseStroke([], 0)).toThrow();
    expect(() => parseStroke([{ s: 1, c: 0, w: 9, p: [1, 2] }], 0)).toThrow();
    expect(() => parseStroke([{ s: 1, c: 0, w: 1, p: [1, 2, 3] }], 0)).toThrow();
    expect(() => parseStroke([{ s: 1, c: 0, w: 1, p: [1, 2000] }], 0)).toThrow();
    expect(() => parseStroke([{ s: 1, c: 0, w: 1, e: 1, p: [1, 2] }], 0)).toThrow(); // no eraser
    const long = [0, 1].map(() => ({ s: 1, c: 0, w: 1, p: Array.from({ length: 400 }, (_, j) => j % 1000) }));
    expect(() => parseStroke(long, 0)).toThrow(/طويل/);
    expect(parseStroke([{ s: 7, c: 9, w: 1, p: [5, 5], evil: '<script>' } as unknown as DrawSegment], 3)).toEqual([{ s: 1, c: 3, w: 1, p: [5, 5] }]);
    // the whole canvas stays small: 11 players × 3 laps of maximal lines
    const max = { pid: 'x'.repeat(36), segs: parseStroke([{ s: 1, c: 0, w: 4, p: Array.from({ length: MAX_STROKE_POINTS * 2 }, () => 1000) }].flatMap((s) => [{ ...s, p: s.p.slice(0, 400) }, { ...s, p: s.p.slice(398) }]), 0) };
    expect(json(Array.from({ length: 33 }, () => max)).length).toBeLessThan(200 * 1024);
  });

  it('votes, verdict, outsider guess and scoring', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 4, { rounds: 1, laps: 1 });
    const out = h.state.outsiders[0];
    const insiders = h.players.filter((p) => p !== out);
    drawAll(h);
    expect(h.state.phase).toBe('turn');
    expect(h.view(out).reveal).toBeNull();
    for (const p of h.players) h.act(p, 'ready-vote');
    expect(h.state.phase).toBe('vote');
    for (const p of insiders) h.act(p, 'vote', { target: out });
    h.act(out, 'vote', { target: insiders[0] });
    expect(h.state.phase).toBe('verdict');
    expect(h.view(insiders[0]).reveal.caught).toEqual([out]);
    expect(h.view(insiders[0]).reveal.answer).toBeNull();
    h.expire();
    expect(h.state.phase).toBe('guess');
    const opts = h.view(out).me.guessOptions as string[];
    expect(opts).toHaveLength(6);
    expect(opts).toContain(h.state.secret!.word);
    expect(h.view(insiders[0]).me.guessOptions).toBeUndefined();
    expect(() => h.act(insiders[0], 'guess', { choice: opts[0] })).toThrow();
    h.act(out, 'guess', { choice: h.state.secret!.word });
    expect(h.state.phase).toBe('roundEnd');
    for (const p of insiders) expect(h.state.scores[p]).toBe(1);
    expect(h.state.scores[out]).toBe(2);
    expect(h.view(out).reveal.answer).toBe(h.state.secret!.word);
    h.act(h.players[0], 'host:next');
    expect(h.state.finished).toBe(true);
  });

  it('the word is masked in chat until the round ends; host skip always moves forward', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 3, { rounds: 1 });
    expect(h.engine.chatSecrets!(h.state)).toContain(h.state.secret!.word);
    let guard = 0;
    while (!h.state.finished && guard++ < 30) {
      if (h.state.phase === 'roundEnd') expect(h.engine.chatSecrets!(h.state)).toEqual([]);
      h.act(h.players[0], 'host:skip');
    }
    expect(h.state.finished).toBe(true);
  });

  it('players leaving mid-draw: a new drawer is picked; the outsider leaving skips the round', () => {
    const h = new Harness<OutsiderDrawState>('outsider-draw', 4, { rounds: 2, laps: 2 });
    const out = h.state.outsiders[0];
    for (const p of h.players) h.act(p, 'seen');
    const ctx = { now: h.now, rng: () => 0.5 };
    h.act(drawer(h), 'stroke', { segments: [line(1)] });
    h.act(drawer(h), 'stroke', { segments: [line(2)] });
    let leaver = drawer(h);
    if (leaver === out) {
      h.act(leaver, 'stroke', { segments: [line(3)] });
      leaver = drawer(h);
    }
    h.engine.playerLeft!(h.state, leaver, ctx);
    expect(h.state.players).not.toContain(leaver);
    expect(drawer(h)).not.toBe(leaver);
    expect(h.state.players).toContain(drawer(h));
    expect(h.view(h.players[0]).minTurns).toBe(6); // 3 players left × 2 lines
    // the rest of the canvas can be finished (hard stop)
    while (h.state.phase === 'turn') h.act(drawer(h), 'stroke', { segments: [line(4)] });
    expect(h.state.phase).toBe('discuss');
    h.engine.playerLeft!(h.state, out, ctx);
    expect(h.state.round).toBe(2);
    expect(h.state.phase).toBe('reveal');
  });
});
