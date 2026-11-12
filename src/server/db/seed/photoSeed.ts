/**
 * Real-photo pairs for مين برا الصورة؟ built from PHOTO_PAIRS + ./photos/credits.json.
 * A pair is only used when BOTH photos exist (subjects rejected during review have none).
 * Shared by the server seed and the GitHub Pages content build.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHOTO_PAIRS } from './photoPairs.ts';

export const PHOTOS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'photos');

export interface PhotoCredit {
  /** short file title on Wikimedia Commons */
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** Commons file page (attribution link) */
  page: string;
}

export interface PhotoPair {
  category: string;
  labelA: string;
  labelB: string;
  /** subject keys = file names in PHOTOS_DIR without .webp */
  keyA: string;
  keyB: string;
  creditA: PhotoCredit;
  creditB: PhotoCredit;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function photoPairs(): PhotoPair[] {
  const file = join(PHOTOS_DIR, 'credits.json');
  if (!existsSync(file)) return [];
  const credits = JSON.parse(readFileSync(file, 'utf8')) as Record<string, PhotoCredit>;
  const out: PhotoPair[] = [];
  for (const [category, labelA, qa, labelB, qb] of PHOTO_PAIRS) {
    const keyA = slug(qa);
    const keyB = slug(qb);
    const creditA = credits[keyA];
    const creditB = credits[keyB];
    if (!creditA || !creditB) continue;
    if (!existsSync(join(PHOTOS_DIR, `${keyA}.webp`)) || !existsSync(join(PHOTOS_DIR, `${keyB}.webp`))) continue;
    out.push({ category, labelA, labelB, keyA, keyB, creditA, creditB });
  }
  return out;
}

export function readPhoto(key: string): Buffer {
  return readFileSync(join(PHOTOS_DIR, `${key}.webp`));
}

/** the credit as stored on a content item (no internal file title needed) */
const https = (u: string) => u.replace(/^http:\/\//, 'https://');
export const itemCredit = (c: PhotoCredit) => ({ author: c.author, license: c.license, ...(c.licenseUrl ? { licenseUrl: https(c.licenseUrl) } : {}), page: https(c.page) });
