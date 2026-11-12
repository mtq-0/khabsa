/**
 * Avatar system: an original cartoon character (Arab / Jordanian, drawn in
 * src/shared/characters.ts — names here, same order) on a branded gradient. Encoded as
 * "<characterIndex>-<paletteIndex>" so it is tiny on the wire and easy to validate.
 * Registered users may also upload a profile picture (avatarUrl).
 */
export const AVATAR_CHARACTERS = [
  'أبو العبد',
  'أم العبد',
  'الحجّي أبو صالح',
  'أبو شنب سوّاق التكسي',
  'بيّاع الفلافل',
  'القهوجي',
  'الشب الكول',
  'البنت المهضومة',
  'الولد الشقي',
  'تيتا',
  'البدوي',
  'طالب التوجيهي',
  'الأستاذ',
  'لاعب النشامى',
  'الشيف أبو المناسف',
  'اليوتيوبر',
  'أم العروس',
  'العريس',
  'أبو نومة',
  'أبو زعل',
  'المبرمج',
  'الدكتورة',
  'الحكم',
  'خالتو الحشرية',
  'المهندس',
  'الدبّيك',
  'سيدو',
  'أبو الشاورما',
  'الفنّانة',
  'الكابتن الطيّار',
  'الجمل أبو سنام',
  'بسبس قطّة الحارة',
] as const;

export const AVATAR_PALETTES = [
  ['#7c3aed', '#22d3ee'],
  ['#a21caf', '#f472b6'],
  ['#4f46e5', '#38bdf8'],
  ['#9333ea', '#facc15'],
  ['#0ea5e9', '#22c55e'],
  ['#e11d48', '#fb923c'],
  ['#6d28d9', '#14b8a6'],
  ['#be185d', '#8b5cf6'],
  ['#0f766e', '#a3e635'],
  ['#1d4ed8', '#c084fc'],
] as const;

export type AvatarCode = `${number}-${number}`;

export function isValidAvatar(code: unknown): code is AvatarCode {
  if (typeof code !== 'string') return false;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(code);
  if (!m) return false;
  return Number(m[1]) < AVATAR_CHARACTERS.length && Number(m[2]) < AVATAR_PALETTES.length;
}

export function parseAvatar(code: string | null | undefined): { index: number; name: string; from: string; to: string } {
  const safe = code && isValidAvatar(code) ? code : '0-0';
  const [c, p] = safe.split('-').map(Number);
  const pal = AVATAR_PALETTES[p];
  return { index: c, name: AVATAR_CHARACTERS[c], from: pal[0], to: pal[1] };
}

export function randomAvatar(rand: () => number = Math.random): AvatarCode {
  const c = Math.floor(rand() * AVATAR_CHARACTERS.length);
  const p = Math.floor(rand() * AVATAR_PALETTES.length);
  return `${c}-${p}`;
}
