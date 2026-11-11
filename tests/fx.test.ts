import { describe, expect, it } from 'vitest';
import { deriveFx, tickSecond } from '../src/client/fx/events.ts';
import type { RoomView } from '../src/shared/protocol.ts';

const member = (id: string) => ({ id, name: id, avatar: '0-0', avatarUrl: null, isGuest: true, level: 1, ready: false, connected: true, isHost: id === 'me', team: null, inGame: true, joinedAt: 0 });

function view(over: Omit<Partial<RoomView>, 'game'> & { game?: Record<string, unknown> | null } = {}): RoomView {
  return {
    id: 'room1',
    code: 'ABCDEF',
    version: 1,
    hostId: 'me',
    visibility: 'private',
    capacity: 8,
    name: 'r',
    selectedGame: 'outsider-word',
    settings: {},
    status: 'playing',
    members: ['me', 'a', 'b'].map(member),
    you: 'me',
    matchNumber: 1,
    createdAt: 0,
    awards: null,
    voiceAvailable: false,
    packId: null,
    ...over,
    game: (over.game === undefined ? null : over.game) as RoomView['game'],
  };
}
const types = (e: { type: string }[]) => e.map((x) => x.type);

describe('effects decisions', () => {
  it('stays quiet on the first view and on unchanged state', () => {
    const v = view();
    expect(deriveFx(null, v, 0, 0, false)).toEqual([]);
    expect(deriveFx(v, v, 0, 0, false)).toEqual([]);
  });

  it('people joining/leaving and chat from others', () => {
    const a = view({ status: 'lobby' });
    const b = view({ status: 'lobby', members: [...a.members, member('c')] });
    expect(types(deriveFx(a, b, 0, 0, false))).toEqual(['join']);
    expect(types(deriveFx(b, a, 0, 0, false))).toEqual(['leave']);
    expect(types(deriveFx(a, a, 1, 2, true))).toEqual(['chat']);
    expect(types(deriveFx(a, a, 1, 2, false))).toEqual([]); // my own message
  });

  it('game start, win and game over', () => {
    const lobby = view({ status: 'lobby' });
    const g = { gameId: 'most-likely', phase: 'vote', phaseKey: '1:vote:1', scores: { me: 0 } };
    expect(types(deriveFx(lobby, view({ game: g }), 0, 0, false))).toContain('start');
    const playing = view({ game: g });
    const won = view({ status: 'results', game: { ...g, phase: 'finished', phaseKey: 'f', results: { ranking: [], winners: ['me'] } } });
    const lost = view({ status: 'results', game: { ...g, phase: 'finished', phaseKey: 'f', results: { ranking: [], winners: ['a'] } } });
    expect(types(deriveFx(playing, won, 0, 0, false))).toEqual(['win']);
    expect(types(deriveFx(playing, lost, 0, 0, false))).toEqual(['gameOver']);
  });

  it('points, phase changes and your turn', () => {
    const a = view({ game: { gameId: 'outsider-word', phase: 'reveal', phaseKey: '1:reveal:1', scores: { me: 0 } } });
    const b = view({ game: { gameId: 'outsider-word', phase: 'turns', phaseKey: '1:turns:2', asker: 'me', scores: { me: 2 } } });
    const ev = deriveFx(a, b, 0, 0, false);
    expect(types(ev)).toEqual(['phase', 'yourTurn', 'points']);
    expect(ev.find((e) => e.type === 'points')).toEqual({ type: 'points', amount: 2 });
    const vote = view({ game: { gameId: 'outsider-word', phase: 'vote', phaseKey: '1:vote:3', scores: { me: 2 } } });
    expect(types(deriveFx(b, vote, 0, 0, false))).toEqual(['vote']);
  });

  it('speed quiz right and wrong answers', () => {
    const q = view({ game: { gameId: 'speed-quiz', phase: 'question', phaseKey: '1:question:1', scores: { me: 0 }, me: { answer: 2 } } });
    const right = view({ game: { gameId: 'speed-quiz', phase: 'reveal', phaseKey: '1:reveal:2', scores: { me: 150 }, me: { answer: 2 }, correct: 2 } });
    const wrong = view({ game: { gameId: 'speed-quiz', phase: 'reveal', phaseKey: '1:reveal:2', scores: { me: 0 }, me: { answer: 1 }, correct: 2 } });
    expect(types(deriveFx(q, right, 0, 0, false))).toEqual(['phase', 'points', 'correct']);
    expect(types(deriveFx(q, wrong, 0, 0, false))).toEqual(['phase', 'wrong']);
  });

  it('outsider reveal is good for the group when caught and for the outsider when they escape', () => {
    const vote = view({ game: { gameId: 'outsider-word', phase: 'vote', phaseKey: 'v', scores: {} } });
    const verdict = (outsiders: string[], caught: string[]) => view({ game: { gameId: 'outsider-word', phase: 'verdict', phaseKey: 'x', scores: {}, reveal: { outsiders, caught } } });
    expect(deriveFx(vote, verdict(['a'], ['a']), 0, 0, false)).toContainEqual({ type: 'reveal', good: true });
    expect(deriveFx(vote, verdict(['a'], []), 0, 0, false)).toContainEqual({ type: 'reveal', good: false });
    expect(deriveFx(vote, verdict(['me'], []), 0, 0, false)).toContainEqual({ type: 'reveal', good: true });
  });

  it('draw & guess and taboo live moments', () => {
    const d1 = view({ game: { gameId: 'draw-guess', phase: 'draw', phaseKey: 'd', scores: { me: 0 }, guessed: [] } });
    const d2 = view({ game: { gameId: 'draw-guess', phase: 'draw', phaseKey: 'd', scores: { me: 120 }, guessed: ['me'] } });
    expect(types(deriveFx(d1, d2, 0, 0, false))).toEqual(['points', 'correct']);
    const t1 = view({ game: { gameId: 'taboo', phase: 'turn', phaseKey: 't', scores: {}, turnTeam: 0, teamScores: [2, 0] } });
    const up = view({ game: { gameId: 'taboo', phase: 'turn', phaseKey: 't', scores: {}, turnTeam: 0, teamScores: [3, 0] } });
    const down = view({ game: { gameId: 'taboo', phase: 'turn', phaseKey: 't', scores: {}, turnTeam: 0, teamScores: [1, 0] } });
    expect(types(deriveFx(t1, up, 0, 0, false))).toEqual(['correct']);
    expect(types(deriveFx(t1, down, 0, 0, false))).toEqual(['wrong']);
  });

  it('ticks only in the last 5 seconds of timed phases', () => {
    const g = { phase: 'vote', deadline: 10_000 };
    expect(tickSecond(g, 4_000)).toBeNull();
    expect(tickSecond(g, 5_000)).toBe(5);
    expect(tickSecond(g, 9_500)).toBe(1);
    expect(tickSecond(g, 10_000)).toBeNull();
    expect(tickSecond({ phase: 'roundEnd', deadline: 10_000 }, 9_000)).toBeNull();
  });
});
