/**
 * Generates the game content for the GitHub Pages (browser-hosted) edition.
 * Output: <outDir>/content/{content.json, pictures.json, word-images.json, photos/*.webp}
 * The pictures file is only downloaded by the hosting browser when a
 * picture game starts; other players only ever receive their own picture.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES } from '../src/server/db/seed/categories.ts';
import { DRAW_WORDS, OUTSIDER_WORDS, parseWord } from '../src/server/db/seed/words.ts';
import { QUESTION_PAIRS } from '../src/server/db/seed/questionPairs.ts';
import { MORE_QUESTION_PAIRS } from '../src/server/db/seed/more/questions.ts';
import { MORE_MOST_LIKELY } from '../src/server/db/seed/more/party.ts';
import { MORE_TRIVIA } from '../src/server/db/seed/more/trivia.ts';
import { MOST_LIKELY, TABOO_ALL } from '../src/server/db/seed/party.ts';
import { TRIVIA } from '../src/server/db/seed/trivia.ts';
import { renderWordPicture } from '../src/server/db/seed/wordPictures.ts';
import { PHOTOS_DIR, itemCredit, photoPairs } from '../src/server/db/seed/photoSeed.ts';
import { POSTER_CATEGORIES, loadPosters } from '../src/server/db/seed/posters.ts';
import type { ContentItem } from '../src/server/games/types.ts';

const outDir = process.argv[2] ?? 'dist-pages';
const DIFF = { e: 'easy', m: 'medium', h: 'hard' } as const;
const items: ContentItem[] = [];
let n = 0;
const add = (kind: ContentItem['kind'], category: string, difficulty: ContentItem['difficulty'], data: Record<string, unknown>) =>
  items.push({ id: `${kind}-${++n}`, kind, category, difficulty, data });

const wordImages: Record<string, string> = {};
const posters = loadPosters();
let withPoster = 0;
for (const [cat, words] of Object.entries(OUTSIDER_WORDS))
  for (const w of words) {
    const p = parseWord(w);
    const svg = renderWordPicture(p.word);
    const image = svg ? `wimg-${n + 1}` : undefined;
    if (svg && image) wordImages[image] = svg;
    // TMDB poster (loaded straight from TMDB's CDN by the players who know the word)
    const poster = POSTER_CATEGORIES.includes(cat) ? posters.get(p.word) : undefined;
    if (poster) withPoster++;
    add('word', cat, p.difficulty, { word: p.word, ...(p.alternatives.length ? { alternatives: p.alternatives } : {}), ...(image ? { image } : {}), ...(poster ? { poster } : {}) });
  }
for (const [cat, words] of Object.entries(DRAW_WORDS))
  for (const w of words) {
    const p = parseWord(w);
    add('draw-word', cat, p.difficulty, { word: p.word, ...(p.alternatives.length ? { alternatives: p.alternatives } : {}) });
  }
for (const [cat, d, majority, outsider] of [...QUESTION_PAIRS, ...MORE_QUESTION_PAIRS]) add('question-pair', cat, DIFF[d], { majority, outsider });
for (const [cat, text] of [...MOST_LIKELY, ...MORE_MOST_LIKELY]) add('most-likely', cat, 'medium', { text });
for (const [cat, d, word, forbidden] of TABOO_ALL) add('taboo-card', cat, DIFF[d], { word, forbidden });
for (const [cat, d, question, ...opts] of [...TRIVIA, ...MORE_TRIVIA]) add('trivia', cat, DIFF[d], { question, options: opts, answer: 0 });

const pictures: ContentItem[] = [];
const images: Record<string, string> = {};
// real photos (static files under content/photos/, fetched by the host only when picked)
const photos = photoPairs();
const photoKeys = new Set<string>();
photos.forEach((p, i) => {
  photoKeys.add(p.keyA).add(p.keyB);
  pictures.push({
    id: `photo-pair-${i + 1}`,
    kind: 'picture-pair',
    category: p.category,
    difficulty: p.mode === 'hard' ? 'hard' : 'medium',
    data: { a: `photo-${p.keyA}`, b: `photo-${p.keyB}`, labelA: p.labelA, labelB: p.labelB, mode: p.mode, credits: { a: itemCredit(p.creditA), b: itemCredit(p.creditB) } },
  });
});

const dir = join(outDir, 'content');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'content.json'), JSON.stringify({ categories: CATEGORIES, items }));
writeFileSync(join(dir, 'pictures.json'), JSON.stringify({ items: pictures, images }));
writeFileSync(join(dir, 'word-images.json'), JSON.stringify({ images: wordImages }));
mkdirSync(join(dir, 'photos'), { recursive: true });
for (const k of photoKeys) copyFileSync(join(PHOTOS_DIR, `${k}.webp`), join(dir, 'photos', `${k}.webp`));
console.log(`pages content: ${items.length} items, ${pictures.length} picture pairs (${photos.length} real photos), ${Object.keys(wordImages).length} word pictures, ${withPoster} TMDB posters -> ${dir}`);
