import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ContentItem } from '../src/server/games/types.ts';

// The Pages edition's content picker, with its static JSON and the host's localStorage stubbed
const items: ContentItem[] = Array.from({ length: 30 }, (_, i) => ({
  id: `trivia-${i.toString(16).padStart(12, '0')}`,
  kind: 'trivia',
  category: i < 20 ? 'football' : 'food',
  difficulty: 'medium',
  data: { question: `سؤال ${i}`, options: ['أ', 'ب'], answer: 0 },
}));
const store = new Map<string, string>();
let BrowserContent: typeof import('../src/client/p2p/content.ts').BrowserContent;

beforeAll(async () => {
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          categories: [
            { slug: 'football', name: 'كرة', emoji: '⚽' },
            { slug: 'food', name: 'أكل', emoji: '🍔' },
          ],
          items,
        }),
      ),
  );
  ({ BrowserContent } = await import('../src/client/p2p/content.ts'));
});

describe('Pages edition: content does not repeat for the same players', () => {
  it('picks what the players have not seen, then the least recently seen; the history survives a reload', async () => {
    const repo = new BrowserContent();
    const football = items.filter((i) => i.category === 'football').map((i) => i.id);
    const first = (await repo.pick({ kind: 'trivia', count: 8, category: 'football', players: ['a', 'b'] })).map((i) => i.id);
    expect(new Set(first).size).toBe(8);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    await repo.markSeen(['a', 'b'], first);
    expect(JSON.parse(store.get('khabsa:seen:v1')!).a[first[0]]).toBeGreaterThan(0);
    // a new game (any room, a fresh BrowserContent like after a reload): other questions, for any of those players
    const second = (await new BrowserContent().pick({ kind: 'trivia', count: 8, category: 'football', players: ['b', 'c'] })).map((i) => i.id);
    for (const id of second) expect(first).not.toContain(id);
    now.mockReturnValue(1_800_000_600_000);
    await repo.markSeen(['b', 'c'], second);
    now.mockRestore();
    // only 4 unseen left: those 4 come first, then the oldest seen (the first game's)
    const third = (await repo.pick({ kind: 'trivia', count: 8, category: 'football', players: ['a', 'b'] })).map((i) => i.id);
    const unseen = football.filter((id) => !first.includes(id) && !second.includes(id));
    expect(third.slice(0, 4).sort()).toEqual(unseen.sort());
    for (const id of third.slice(4)) expect(first).toContain(id);
    // the room's recent content still goes last
    const ex = (await repo.pick({ kind: 'trivia', count: 4, category: 'football', players: ['a', 'b'], exclude: unseen })).map((i) => i.id);
    for (const id of ex) expect(unseen).not.toContain(id);
    // without players it is just random
    expect(await repo.pick({ kind: 'trivia', count: 30 })).toHaveLength(30);
  });
});
