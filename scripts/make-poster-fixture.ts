/** Regenerates e2e/fixtures/posters.json: every movie word gets one real poster (Titanic), for the browser test. */
import { writeFileSync } from 'node:fs';
import { OUTSIDER_WORDS, parseWord } from '../src/server/db/seed/words.ts';
const o: Record<string, unknown> = {};
for (const w of OUTSIDER_WORDS.movies) o[parseWord(w).word] = { tmdbId: 597, type: 'movie', path: '/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg', title: 'Titanic' };
writeFileSync('e2e/fixtures/posters.json', JSON.stringify(o));
console.log(`${Object.keys(o).length} movie words`);
