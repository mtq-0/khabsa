/**
 * Builds the real-photo set for مين برا الرسمة from Wikimedia Commons.
 *
 *   node scripts/fetch-photos.ts candidates   → .tools/photo-candidates/ (contact sheets for review)
 *   node scripts/fetch-photos.ts finalize     → src/server/db/seed/photos/*.webp + credits.json
 *
 * Only free licenses are accepted (CC0, public domain, CC BY, CC BY-SA).
 * Choices (which candidate to use per subject) live in photo-choices.json;
 * a missing entry means "candidate 0".
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { PHOTO_PAIRS } from '../src/server/db/seed/photoPairs.ts';

const UA = 'KhabsaPartyGame/1.0 (https://github.com/mtq-0/khabsa; non-commercial party game)';
const API = 'https://commons.wikimedia.org/w/api.php';
const CAND_DIR = '.tools/photo-candidates';
const OUT_DIR = 'src/server/db/seed/photos';
const CHOICES = 'src/server/db/seed/photo-choices.json';
const PER_SUBJECT = 4;

export interface Candidate {
  title: string;
  page: string;
  thumb: string;
  author: string;
  license: string;
  licenseUrl: string;
}

const OK_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? \d(\.\d)?|CC BY(-SA)?)/i;
const BAD_TITLE = /(map|diagram|logo|icon|drawing|illustration|painting|cartoon|svg|chart|coat of arms|flag|sign|poster|stamp|coin|label)/i;

const strip = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function search(query: string, width: number): Promise<Candidate[]> {
  const url = new URL(API);
  const params: Record<string, string> = {
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: '30',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: String(width),
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`commons ${res.status}`);
  const d = (await res.json()) as { query?: { pages: Record<string, { title: string; index: number; imageinfo?: { width: number; height: number; mime: string; thumburl: string; descriptionurl: string; extmetadata: Record<string, { value: string }> }[] }> } };
  const pages = Object.values(d.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  const out: Candidate[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const m = ii.extmetadata;
    const license = strip(m.LicenseShortName?.value ?? '');
    const ratio = ii.width / ii.height;
    if (!/^image\/(jpeg|png)$/.test(ii.mime) || ii.width < 900 || ii.height < 600 || ratio < 1.05 || ratio > 2.1) continue;
    if (!OK_LICENSE.test(license) || /NC|ND|fair use/i.test(license)) continue;
    if (BAD_TITLE.test(p.title)) continue;
    out.push({
      title: p.title.replace(/^File:/, ''),
      page: ii.descriptionurl,
      thumb: ii.thumburl,
      author: strip(m.Artist?.value ?? 'Unknown').slice(0, 120) || 'Unknown',
      license,
      licenseUrl: strip(m.LicenseUrl?.value ?? ''),
    });
  }
  return out;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
async function download(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(350); // be gentle with Wikimedia's servers
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r) continue;
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    await sleep(3000 * (attempt + 1));
  }
  throw new Error('download failed ' + url);
}

function subjects() {
  const list: { key: string; label: string; query: string; category: string }[] = [];
  for (const [category, la, qa, lb, qb] of PHOTO_PAIRS) {
    list.push({ key: slug(qa), label: la, query: qa, category });
    list.push({ key: slug(qb), label: lb, query: qb, category });
  }
  return list;
}

async function candidates(sheetsOnly = false, fromSheet = 0) {
  mkdirSync(CAND_DIR, { recursive: true });
  const subs = subjects();
  let all: Record<string, Candidate[]> = {};
  if (sheetsOnly) all = JSON.parse(readFileSync(join(CAND_DIR, 'candidates.json'), 'utf8'));
  else {
    for (const [i, s] of subs.entries()) {
      const c = (await search(s.query, 480)).slice(0, PER_SUBJECT);
      all[s.key] = c;
      process.stdout.write(`${i + 1}/${subs.length} ${s.key}: ${c.length}\n`);
    }
    writeFileSync(join(CAND_DIR, 'candidates.json'), JSON.stringify(all, null, 1));
  }
  // contact sheets: 8 subjects per sheet, one row each
  const W = 240;
  const H = 160;
  for (let sheet = fromSheet; sheet * 8 < subs.length; sheet++) {
    const rows = subs.slice(sheet * 8, sheet * 8 + 8);
    const tiles: OverlayOptions[] = [];
    for (const [r, s] of rows.entries()) {
      const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="${H}"><rect width="200" height="${H}" fill="#111"/><text x="8" y="40" font-size="20" fill="#fff" font-family="sans-serif">${s.key.slice(0, 18)}</text></svg>`);
      tiles.push({ input: await sharp(label).png().toBuffer(), left: 0, top: r * H });
      for (const [c, cand] of (all[s.key] ?? []).entries()) {
        const raw = await download(cand.thumb).catch(() => null);
        if (!raw) continue; // leave the slot empty; that candidate can't be chosen
        const img = await sharp(raw).resize(W, H, { fit: 'cover' }).png().toBuffer();
        const num = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"><rect width="34" height="34" rx="6" fill="#000"/><text x="10" y="25" font-size="22" fill="#ff0" font-family="sans-serif">${c}</text></svg>`);
        tiles.push({ input: img, left: 200 + c * W, top: r * H }, { input: await sharp(num).png().toBuffer(), left: 200 + c * W + 4, top: r * H + 4 });
      }
    }
    await sharp({ create: { width: 200 + PER_SUBJECT * W, height: rows.length * H, channels: 3, background: '#222' } }).composite(tiles).png().toFile(join(CAND_DIR, `sheet-${sheet}.png`));
    process.stdout.write(`sheet ${sheet} written\n`);
  }
}

async function finalize() {
  const all = JSON.parse(readFileSync(join(CAND_DIR, 'candidates.json'), 'utf8')) as Record<string, Candidate[]>;
  const choices = existsSync(CHOICES) ? (JSON.parse(readFileSync(CHOICES, 'utf8')) as Record<string, number | null>) : {};
  mkdirSync(OUT_DIR, { recursive: true });
  const credits: Record<string, Omit<Candidate, 'thumb'>> = {};
  for (const s of subjects()) {
    const pick = choices[s.key] === undefined ? 0 : choices[s.key];
    if (pick === null) continue; // rejected: no good photo
    const cand = all[s.key]?.[pick];
    if (!cand) continue;
    const { thumb: _t, ...credit } = cand;
    const file = join(OUT_DIR, `${s.key}.webp`);
    if (existsSync(file)) { credits[s.key] = credit; continue; } // resumable
    // 960px is one of Wikimedia's standard (pre-rendered) thumbnail widths.
    const big = cand.thumb.replace(/\/\d+px-/, '/960px-');
    const buf = await download(big).catch(() => download(cand.thumb));
    const webp = await sharp(buf).rotate().resize(800, 600, { fit: 'cover', position: 'attention' }).webp({ quality: 72 }).toBuffer();
    writeFileSync(file, webp);
    credits[s.key] = credit;
    writeFileSync(join(OUT_DIR, 'credits.json'), JSON.stringify(credits, null, 1));
    process.stdout.write(`${s.key} ${(webp.length / 1024).toFixed(0)}KB\n`);
  }
  writeFileSync(join(OUT_DIR, 'credits.json'), JSON.stringify(credits, null, 1));
  writeCreditsMd();
}

/** Human-readable attribution list (licence, author, source, changes) for every shipped photo. */
function writeCreditsMd() {
  const credits = JSON.parse(readFileSync(join(OUT_DIR, 'credits.json'), 'utf8')) as Record<string, Omit<Candidate, 'thumb'>>;
  const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
  const rows = Object.entries(credits)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, c]) => `| \`${k}.webp\` | [${esc(c.title.replace(/^File:/, ''))}](${c.page.replace(/^http:/, 'https:')}) | ${esc(c.author)} | ${c.licenseUrl ? `[${c.license}](${c.licenseUrl.replace(/^http:/, 'https:')})` : c.license} |`);
  writeFileSync(
    join(OUT_DIR, 'CREDITS.md'),
    [
      '# Photo credits — مين برا الرسمة؟',
      '',
      'Real photos from [Wikimedia Commons](https://commons.wikimedia.org/), used under the free licence shown for each file',
      '(CC0, public domain, CC BY or CC BY-SA). **Changes:** every photo was resized and cropped to 800×600 and converted to WebP;',
      'the CC BY-SA files in this folder are those adapted versions and remain under the same CC BY-SA licence.',
      'Authors do not endorse this project. Credits are also shown in the game when a round\'s pictures are revealed.',
      '',
      '| File | Source | Author | Licence |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'),
  );
  console.log(`CREDITS.md: ${rows.length} photos`);
}

const cmd = process.argv[2];
if (cmd === 'candidates') await candidates();
else if (cmd === 'sheets') await candidates(true, Number(process.argv[3] ?? 0));
else if (cmd === 'finalize') await finalize();
else if (cmd === 'credits') writeCreditsMd();
else console.log('usage: node scripts/fetch-photos.ts candidates|sheets N|finalize|credits');
