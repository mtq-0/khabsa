/**
 * Variety check for the real photos of مين برا الصورة؟:
 *  - the same Commons file must not be used for two subjects
 *  - no two photos may be near-duplicates (perceptual hash)
 *  - the two photos of one pair must not be nearly identical
 * Usage: node scripts/check-photos.ts [--prune]   (--prune also deletes photos no pair uses)
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PHOTOS_DIR, photoPairs, type PhotoCredit } from '../src/server/db/seed/photoSeed.ts';

/** 64-bit difference hash of a photo, as a BigInt. */
export async function dhash(file: string): Promise<bigint> {
  const { data } = await sharp(file).resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
  return h;
}
export const hamming = (a: bigint, b: bigint) => {
  let x = a ^ b, n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
};

export const NEAR_DUPLICATE = 6; // of 64 bits

export async function analyse() {
  const pairs = photoPairs();
  const used = new Set(pairs.flatMap((p) => [p.keyA, p.keyB]));
  const credits = JSON.parse(readFileSync(join(PHOTOS_DIR, 'credits.json'), 'utf8')) as Record<string, PhotoCredit>;
  const keys = [...used].sort();
  const hashes = new Map<string, bigint>();
  for (const k of keys) hashes.set(k, await dhash(join(PHOTOS_DIR, `${k}.webp`)));
  const samePage: string[] = [];
  const byPage = new Map<string, string>();
  for (const k of keys) {
    const page = credits[k].page;
    if (byPage.has(page)) samePage.push(`${byPage.get(page)} = ${k}`);
    else byPage.set(page, k);
  }
  const near: { a: string; b: string; d: number }[] = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const d = hamming(hashes.get(keys[i])!, hashes.get(keys[j])!);
    if (d <= NEAR_DUPLICATE) near.push({ a: keys[i], b: keys[j], d });
  }
  const orphans = readdirSync(PHOTOS_DIR).filter((f) => f.endsWith('.webp') && !used.has(f.slice(0, -5)));
  return { pairs, keys, samePage, near, orphans, credits };
}

if (process.argv[1]?.endsWith('check-photos.ts')) {
  const r = await analyse();
  console.log(`${r.pairs.length} pairs, ${r.keys.length} photos; same-file reuse: ${r.samePage.length}; near-duplicates: ${r.near.length}; unused files: ${r.orphans.length}`);
  for (const s of r.samePage) console.log('  same file:', s);
  for (const n of r.near) console.log(`  near-duplicate (${n.d}/64): ${n.a} ~ ${n.b}`);
  if (process.argv.includes('--prune')) {
    for (const f of r.orphans) rmSync(join(PHOTOS_DIR, f));
    const keep = Object.fromEntries(Object.entries(r.credits).filter(([k]) => r.keys.includes(k)));
    writeFileSync(join(PHOTOS_DIR, 'credits.json'), JSON.stringify(keep, null, 1));
    console.log(`pruned ${r.orphans.length} unused photos`);
  }
}
