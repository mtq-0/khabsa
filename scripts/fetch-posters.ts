/**
 * Finds TMDB posters for the cartoon / movie / TV words of مين برا السالفة؟ and saves the
 * poster *metadata* (TMDB id, type, poster path, title) to src/server/db/seed/posters.json.
 * No images are stored: both editions show them from TMDB's image CDN.
 *
 *   TMDB_TOKEN=... node scripts/fetch-posters.ts          (normally run by .github/workflows/posters.yml)
 *   node scripts/fetch-posters.ts sheet                    (contact sheet of the current matches, no token needed)
 *
 * Words whose search gives the wrong work go in NO_POSTER or TMDB_QUERIES (wordPictures.ts).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { TmdbService } from '../src/server/content/tmdb.ts';
import { OUTSIDER_WORDS, parseWord } from '../src/server/db/seed/words.ts';
import { tmdbQueryFor } from '../src/server/db/seed/wordPictures.ts';
import { POSTER_CATEGORIES, POSTERS_FILE, type PosterEntry } from '../src/server/db/seed/posters.ts';

const words = POSTER_CATEGORIES.flatMap((c) => (OUTSIDER_WORDS[c] ?? []).map((w) => ({ category: c, word: parseWord(w).word })));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAll() {
  const token = process.env.TMDB_TOKEN?.trim();
  if (!token) {
    console.error('TMDB_TOKEN is not set (add it as a GitHub Actions secret).');
    process.exit(2);
  }
  const tmdb = new TmdbService({ token, apiBase: 'https://api.themoviedb.org/3', imageBase: 'https://image.tmdb.org/t/p' });
  // keep what is already there (reviewed); only words with no entry yet are searched
  const out: Record<string, PosterEntry | null> = existsSync(POSTERS_FILE) ? (JSON.parse(readFileSync(POSTERS_FILE, 'utf8')) as Record<string, PosterEntry | null>) : {};
  const keep = new Set(Object.entries(out).filter(([, v]) => v).map(([k]) => k));
  let found = 0;
  for (const { word } of words) {
    if (keep.has(word) || (word in out && !tmdbQueryFor(word))) continue; // already done / nothing to look for
    const q = tmdbQueryFor(word);
    if (!q) {
      out[word] = null;
      continue;
    }
    let m = null;
    for (let attempt = 0; attempt < 3 && !m; attempt++) {
      m = await tmdb.search(q).catch(async (e) => {
        if (String(e?.message).includes('نستنى')) await sleep(3000);
        else if (attempt === 2) console.error(`  ${word}: ${e?.message}`);
        return null;
      });
    }
    out[word] = m ? { tmdbId: m.tmdbId, type: m.type, path: m.posterPath, title: m.title } : null;
    if (m) found++;
    console.log(`${m ? '✓' : '·'} ${word}${m ? ` → ${m.title} (${m.type} ${m.tmdbId})` : ''}`);
    await sleep(120);
  }
  writeFileSync(POSTERS_FILE, JSON.stringify(out, null, 1) + '\n');
  console.log(`\n${found}/${Object.keys(out).length} words have a poster → ${POSTERS_FILE}`);
}

/** A labelled grid of the current posters, to review the matches by eye. */
async function sheet() {
  const sharp = (await import('sharp')).default;
  if (!existsSync(POSTERS_FILE)) throw new Error('no posters.json yet');
  const map = JSON.parse(readFileSync(POSTERS_FILE, 'utf8')) as Record<string, PosterEntry | null>;
  const list = Object.entries(map).filter((e): e is [string, PosterEntry] => !!e[1]);
  const W = 154, H = 260, C = 10;
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const tiles = [];
  for (const [i, [word, p]] of list.entries()) {
    const res = await fetch(`https://image.tmdb.org/t/p/w154${p.path}`).catch(() => null);
    const img = res?.ok ? await sharp(Buffer.from(await res.arrayBuffer())).resize(W, 220, { fit: 'cover' }).png().toBuffer() : null;
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="40"><rect width="${W}" height="40" fill="#111"/><text x="${W / 2}" y="16" font-size="13" fill="#fff" text-anchor="middle" font-family="sans-serif">${i} ${esc(word)}</text><text x="${W / 2}" y="33" font-size="10" fill="#aaa" text-anchor="middle" font-family="sans-serif">${esc((p.title ?? '').slice(0, 26))}</text></svg>`);
    if (img) tiles.push({ input: img, left: (i % C) * W, top: Math.floor(i / C) * H });
    tiles.push({ input: await sharp(label).png().toBuffer(), left: (i % C) * W, top: Math.floor(i / C) * H + 220 });
  }
  const file = process.argv[3] ?? '.tools/posters-sheet.png';
  await sharp({ create: { width: W * C, height: H * Math.ceil(list.length / C), channels: 3, background: '#000' } }).composite(tiles).png().toFile(file);
  console.log(`${list.length} posters → ${file}`);
}

if (process.argv[2] === 'sheet') await sheet();
else await fetchAll();
