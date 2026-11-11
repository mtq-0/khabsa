/**
 * Text sanitation for user-provided strings. React escapes on render, so this
 * focuses on stripping control/bidi-override characters (used for spoofing)
 * and enforcing length limits.
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B\uFEFF]/g;

export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  return input.replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanMultiline(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  return input.replace(CONTROL, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

const BANNED = ['كس', 'شرموط', 'عرص', 'منيك', 'fuck', 'shit', 'bitch'];

/** Basic profanity mask for chat and nicknames. */
export function maskProfanity(text: string): string {
  let out = text;
  for (const w of BANNED) {
    const re = new RegExp(`(^|\\s)${w}\\S*`, 'giu');
    out = out.replace(re, (m, pre: string) => pre + '*'.repeat(Math.max(3, m.length - pre.length)));
  }
  return out;
}

export function containsProfanity(text: string): boolean {
  return maskProfanity(text) !== text;
}
