/**
 * Generates the game content for the GitHub Pages (browser-hosted) edition.
 * Output: <outDir>/content/content.json and <outDir>/content/pictures.json
 * The pictures file is only downloaded by the hosting browser when a
 * picture game starts; other players only ever receive their own picture.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES } from '../src/server/db/seed/categories.ts';
import { DRAW_WORDS, OUTSIDER_WORDS, parseWord } from '../src/server/db/seed/words.ts';
import { QUESTION_PAIRS } from '../src/server/db/seed/questionPairs.ts';
import { MOST_LIKELY, TABOO_CARDS } from '../src/server/db/seed/party.ts';
import { TRIVIA } from '../src/server/db/seed/trivia.ts';
import { generatePicturePairs } from '../src/server/db/seed/pictures.ts';
import type { ContentItem } from '../src/server/games/types.ts';

const outDir = process.argv[2] ?? 'dist-pages';
const DIFF = { e: 'easy', m: 'medium', h: 'hard' } as const;
const items: ContentItem[] = [];
let n = 0;
const add = (kind: ContentItem['kind'], category: string, difficulty: ContentItem['difficulty'], data: Record<string, unknown>) =>
  items.push({ id: `${kind}-${++n}`, kind, category, difficulty, data });

for (const [cat, words] of Object.entries(OUTSIDER_WORDS))
  for (const w of words) {
    const p = parseWord(w);
    add('word', cat, p.difficulty, { word: p.word, ...(p.alternatives.length ? { alternatives: p.alternatives } : {}) });
  }
for (const [cat, words] of Object.entries(DRAW_WORDS))
  for (const w of words) {
    const p = parseWord(w);
    add('draw-word', cat, p.difficulty, { word: p.word, ...(p.alternatives.length ? { alternatives: p.alternatives } : {}) });
  }
for (const [cat, d, majority, outsider] of QUESTION_PAIRS) add('question-pair', cat, DIFF[d], { majority, outsider });
for (const [cat, text] of MOST_LIKELY) add('most-likely', cat, 'medium', { text });
for (const [cat, d, word, forbidden] of TABOO_CARDS) add('taboo-card', cat, DIFF[d], { word, forbidden });
for (const [cat, d, question, ...opts] of TRIVIA) add('trivia', cat, DIFF[d], { question, options: opts, answer: 0 });

const pictures: ContentItem[] = [];
const images: Record<string, string> = {};
generatePicturePairs().forEach((p, i) => {
  const a = `img-${i}-a`;
  const b = `img-${i}-b`;
  images[a] = p.svgA;
  images[b] = p.svgB;
  pictures.push({ id: `picture-pair-${i + 1}`, kind: 'picture-pair', category: p.category, difficulty: p.mode === 'hard' ? 'hard' : 'medium', data: { a, b, labelA: p.labelA, labelB: p.labelB, mode: p.mode } });
});

const dir = join(outDir, 'content');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'content.json'), JSON.stringify({ categories: CATEGORIES, items }));
writeFileSync(join(dir, 'pictures.json'), JSON.stringify({ items: pictures, images }));
console.log(`pages content: ${items.length} items, ${pictures.length} picture pairs -> ${dir}`);
