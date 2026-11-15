/**
 * Compares two content snapshots (scripts/content-snapshot.ts) and writes the built-in content revisions that
 * existing databases need: items that were removed or reworded (switched off) and items whose category,
 * difficulty or data changed (updated). New items need nothing: the seed inserts them.
 *
 *   node scripts/content-snapshot.ts before.json   # on the old version
 *   node scripts/content-snapshot.ts after.json    # on the new version
 *   node scripts/content-revisions.ts before.json after.json
 *
 * The result is appended to src/server/db/seed/contentRevisions.json (earlier revisions are kept, so a database
 * that skipped versions still gets every step). The seed only touches built-in rows that still have the old data,
 * so changes an admin made to a built-in item are kept.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

type Item = { kind: string; category: string; difficulty: string; data: Record<string, unknown>; key: string };
export type Revision =
  | { op: 'remove'; kind: string; key: string; old: Record<string, unknown> }
  | { op: 'update'; kind: string; key: string; old: Record<string, unknown>; category: string; difficulty: string; data: Record<string, unknown> };

const [beforeFile, afterFile] = process.argv.slice(2);
if (!beforeFile || !afterFile) throw new Error('usage: content-revisions.ts before.json after.json');
const before: Item[] = JSON.parse(readFileSync(beforeFile, 'utf8'));
const after: Item[] = JSON.parse(readFileSync(afterFile, 'utf8'));
const id = (i: Item) => `${i.kind}\u0000${i.key}`;
const now = new Map(after.map((i) => [id(i), i]));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const out: Revision[] = [];
for (const o of before) {
  const n = now.get(id(o));
  if (!n) out.push({ op: 'remove', kind: o.kind, key: o.key, old: o.data });
  else if (o.category !== n.category || o.difficulty !== n.difficulty || !same(o.data, n.data))
    out.push({ op: 'update', kind: o.kind, key: o.key, old: o.data, category: n.category, difficulty: n.difficulty, data: n.data });
}
const file = 'src/server/db/seed/contentRevisions.json';
const prev: Revision[][] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
prev.push(out);
writeFileSync(file, JSON.stringify(prev) + '\n');
const count = (op: string, kind?: string) => out.filter((r) => r.op === op && (!kind || r.kind === kind)).length;
for (const kind of [...new Set(out.map((r) => r.kind))]) console.log(`${kind}: ${count('remove', kind)} removed, ${count('update', kind)} updated`);
console.log(`${out.length} revisions -> ${file} (step ${prev.length})`);
