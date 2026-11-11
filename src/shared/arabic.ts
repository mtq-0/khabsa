/**
 * Arabic text normalization used for comparing guesses (draw & guess, taboo).
 * Removes diacritics and tatweel, unifies alef/ya/ta-marbuta forms,
 * collapses whitespace and strips a leading definite article from each word.
 */
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

export function normalizeArabic(input: string): string {
  let s = input.normalize('NFKC').toLowerCase();
  s = s.replace(DIACRITICS, '').replace(TATWEEL, '');
  s = s.replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
    .join(' ');
  return s.trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export type GuessMatch = 'exact' | 'close' | 'miss';

/** Compare a guess against the answer and accepted alternatives. */
export function matchGuess(guess: string, answers: string[]): GuessMatch {
  const g = normalizeArabic(guess);
  if (!g) return 'miss';
  let close = false;
  for (const a of answers) {
    const n = normalizeArabic(a);
    if (!n) continue;
    if (n === g || n.replace(/\s/g, '') === g.replace(/\s/g, '')) return 'exact';
    const d = levenshtein(n, g);
    if (n.length >= 4 && d === 1) close = true;
    if (n.length >= 7 && d === 2) close = true;
  }
  return close ? 'close' : 'miss';
}

/** Whether the text contains any of the given words (used for taboo checks). */
export function containsWord(text: string, word: string): boolean {
  const t = ` ${normalizeArabic(text)} `;
  const w = normalizeArabic(word);
  return !!w && t.includes(` ${w} `);
}
