/** Writes every built-in content item (kind, category, difficulty, data, key) to a JSON file, for content-revisions.ts. */
import { writeFileSync } from 'node:fs';
import { builtinContent } from '../src/server/db/seed/seed.ts';
import { photoPairs } from '../src/server/db/seed/photoSeed.ts';
import { dedupeKey } from '../src/server/content/content.ts';
const out = process.argv[2] ?? 'content-snapshot.json';
const items = builtinContent().map((i) => ({ ...i, key: dedupeKey(i.kind, i.data) }));
// photo pairs: only their labels are text; the pair id (photo files) is the key
for (const p of photoPairs())
  items.push({ kind: 'picture-pair', category: p.category, difficulty: p.mode === 'hard' ? 'hard' : 'medium', data: { labelA: p.labelA, labelB: p.labelB }, key: `${p.keyA}|${p.keyB}` });
writeFileSync(out, JSON.stringify(items));
console.log(`${items.length} items -> ${out}`);
