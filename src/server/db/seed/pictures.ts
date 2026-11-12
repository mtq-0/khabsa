/**
 * Procedurally generated picture pairs for مين برا الصورة؟.
 * Each relation yields:
 *   - "normal" pairs: a related but different main subject (🍎 vs 🍐)
 *   - "hard" pairs: the same subject with one subtle detail changed
 * Images are rendered to SVG and written to PRIVATE storage; browsers only
 * receive short-lived signed URLs for their own assigned picture.
 * Admins can add real photo pairs through the dashboard.
 * Emoji artwork: Twemoji by Twitter/X and contributors, CC-BY 4.0.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
export const PICTURE_RELATIONS: [string, string, string, string, string][] = [
  ['food', 'تفاحة', '🍎', 'إجاصة', '🍐'],
  ['food', 'بطيخة', '🍉', 'شمامة', '🍈'],
  ['food', 'برغر', '🍔', 'سندويشة', '🥪'],
  ['food', 'بيتزا', '🍕', 'فطيرة', '🥧'],
  ['food', 'بوظة', '🍦', 'كيكة', '🍰'],
  ['food', 'ليمونة', '🍋', 'برتقالة', '🍊'],
  ['food', 'عنب', '🍇', 'كرز', '🍒'],
  ['food', 'فراولة', '🍓', 'توت', '🫐'],
  ['food', 'قهوة', '☕', 'شاي', '🍵'],
  ['food', 'دونات', '🍩', 'كوكيز', '🍪'],
  ['food', 'جزرة', '🥕', 'ذرة', '🌽'],
  ['food', 'فلفل حار', '🌶️', 'فليفلة', '🫑'],
  ['food', 'بيضة مقلية', '🍳', 'فطاير', '🥞'],
  ['food', 'خبز', '🍞', 'كرواسون', '🥐'],
  ['animals', 'قطة', '🐱', 'نمر', '🐯'],
  ['animals', 'كلب', '🐶', 'ذيب', '🐺'],
  ['animals', 'أسد', '🦁', 'نمر', '🐅'],
  ['animals', 'جمل', '🐫', 'لاما', '🦙'],
  ['animals', 'حصان', '🐴', 'حمار وحشي', '🦓'],
  ['animals', 'بقرة', '🐮', 'خنزير بري', '🐗'],
  ['animals', 'فار', '🐭', 'أرنب', '🐰'],
  ['animals', 'دب', '🐻', 'باندا', '🐼'],
  ['animals', 'ضفدع', '🐸', 'سلحفاة', '🐢'],
  ['animals', 'دلفين', '🐬', 'حوت', '🐳'],
  ['animals', 'بطريق', '🐧', 'بومة', '🦉'],
  ['animals', 'نحلة', '🐝', 'دعسوقة', '🐞'],
  ['animals', 'فراشة', '🦋', 'يعسوب', '🪰'],
  ['animals', 'ديك', '🐓', 'بطة', '🦆'],
  ['animals', 'أفعى', '🐍', 'تمساح', '🐊'],
  ['animals', 'أخطبوط', '🐙', 'حبار', '🦑'],
  ['animals', 'قرد', '🐵', 'غوريلا', '🦍'],
  ['animals', 'فيل', '🐘', 'وحيد القرن', '🦏'],
  ['sports', 'كورة قدم', '⚽', 'كورة سلة', '🏀'],
  ['sports', 'تنس', '🎾', 'بيسبول', '⚾'],
  ['sports', 'كورة طائرة', '🏐', 'رجبي', '🏉'],
  ['sports', 'ميدالية ذهبية', '🥇', 'كأس', '🏆'],
  ['sports', 'تزلج', '⛷️', 'تزحلق على الجليد', '⛸️'],
  ['sports', 'دراجة', '🚴', 'سباحة', '🏊'],
  ['sports', 'ملاكمة', '🥊', 'كاراتيه', '🥋'],
  ['cars', 'سيارة', '🚗', 'تكسي', '🚕'],
  ['cars', 'باص', '🚌', 'ترام', '🚎'],
  ['cars', 'سيارة إسعاف', '🚑', 'سيارة إطفاء', '🚒'],
  ['cars', 'سيارة شرطة', '🚓', 'سيارة سباق', '🏎️'],
  ['cars', 'موتور', '🏍️', 'سكوتر', '🛵'],
  ['cars', 'تراكتور', '🚜', 'شاحنة', '🚚'],
  ['cars', 'طيارة', '✈️', 'هليكوبتر', '🚁'],
  ['cars', 'سفينة', '🚢', 'قارب', '⛵'],
  ['cars', 'قطار', '🚆', 'مترو', '🚇'],
  ['cars', 'صاروخ', '🚀', 'صحن طائر', '🛸'],
  ['objects', 'ساعة يد', '⌚', 'ساعة منبه', '⏰'],
  ['objects', 'موبايل', '📱', 'تلفون أرضي', '☎️'],
  ['objects', 'لابتوب', '💻', 'كمبيوتر مكتبي', '🖥️'],
  ['objects', 'كاميرا', '📷', 'كاميرا فيديو', '📹'],
  ['objects', 'مظلة', '☂️', 'شمسية بحر', '⛱️'],
  ['objects', 'مفتاح', '🔑', 'قفل', '🔒'],
  ['objects', 'شمعة', '🕯️', 'لمبة', '💡'],
  ['objects', 'كتاب', '📕', 'دفتر', '📒'],
  ['objects', 'قلم رصاص', '✏️', 'قلم حبر', '🖊️'],
  ['objects', 'هدية', '🎁', 'بالون', '🎈'],
  ['objects', 'غيتار', '🎸', 'كمان', '🎻'],
  ['objects', 'طبل', '🥁', 'ساكسفون', '🎷'],
  ['objects', 'نظارة', '👓', 'نظارة شمسية', '🕶️'],
  ['objects', 'كندرة رياضة', '👟', 'كعب عالي', '👠'],
  ['objects', 'قبعة', '🎩', 'طاقية', '🧢'],
  ['objects', 'تاج', '👑', 'خاتم', '💍'],
  ['nature', 'شمس', '☀️', 'قمر', '🌙'],
  ['nature', 'غيمة', '☁️', 'مطر', '🌧️'],
  ['nature', 'ثلج', '❄️', 'رجل ثلج', '⛄'],
  ['nature', 'وردة', '🌹', 'زهرة عباد الشمس', '🌻'],
  ['nature', 'شجرة', '🌳', 'نخلة', '🌴'],
  ['nature', 'صبار', '🌵', 'نبتة', '🪴'],
  ['nature', 'جبل', '⛰️', 'بركان', '🌋'],
  ['nature', 'موجة', '🌊', 'إعصار', '🌪️'],
  ['nature', 'نار', '🔥', 'برق', '⚡'],
  ['nature', 'قوس قزح', '🌈', 'نجمة', '⭐'],
  ['landmarks', 'برج إيفل', '🗼', 'برج عالي', '🏙️'],
  ['landmarks', 'تمثال الحرية', '🗽', 'تمثال', '🗿'],
  ['landmarks', 'مسجد', '🕌', 'قلعة', '🏰'],
  ['landmarks', 'خيمة', '⛺', 'بيت', '🏠'],
  ['landmarks', 'جسر', '🌉', 'نافورة', '⛲'],
  ['landmarks', 'معبد قديم', '🏛️', 'ستاد', '🏟️'],
  ['funny', 'وجه ضاحك', '😂', 'وجه باكي', '😭'],
  ['funny', 'شبح', '👻', 'كائن فضائي', '👽'],
  ['funny', 'روبوت', '🤖', 'مهرج', '🤡'],
  ['funny', 'زومبي', '🧟', 'مصاص دماء', '🧛'],
  ['funny', 'نينجا', '🥷', 'ساحر', '🧙'],
  ['funny', 'ديناصور', '🦖', 'تنين', '🐉'],
  ['professions', 'دكتور', '🧑‍⚕️', 'طباخ', '🧑‍🍳'],
  ['professions', 'شرطي', '👮', 'إطفائي', '🧑‍🚒'],
  ['professions', 'رائد فضاء', '🧑‍🚀', 'طيار', '🧑‍✈️'],
  ['professions', 'مزارع', '🧑‍🌾', 'عامل بناء', '👷'],
  ['professions', 'رسام', '🧑‍🎨', 'مبرمج', '🧑‍💻'],
];

const DECOR: [string, string][] = [
  ['نجمة', '⭐'],
  ['قمر', '🌙'],
  ['قلب', '❤️'],
  ['غيمة', '☁️'],
  ['بالون', '🎈'],
  ['زهرة', '🌸'],
  ['شمس', '☀️'],
  ['ورقة شجر', '🍃'],
];

const BACKGROUNDS: [string, string][] = [
  ['#312e81', '#7c3aed'],
  ['#0e7490', '#22d3ee'],
  ['#831843', '#f472b6'],
  ['#14532d', '#4ade80'],
  ['#7c2d12', '#fb923c'],
  ['#1e3a8a', '#60a5fa'],
];

const require = createRequire(import.meta.url);
let twemojiDir: string | null = null;
function twemojiPath(): string {
  twemojiDir ??= dirname(require.resolve('@twemoji/svg/package.json'));
  return twemojiDir;
}

/**
 * Inline vector artwork for an emoji (Twemoji, CC-BY 4.0) so the picture
 * renders identically on every device instead of depending on system fonts.
 */
export function emojiSvg(emoji: string, x: number, y: number, size: number): string {
  const cps = [...emoji].map((c) => c.codePointAt(0)!.toString(16));
  const candidates = [cps.join('-'), cps.filter((c) => c !== 'fe0f').join('-')];
  for (const name of candidates) {
    const file = join(twemojiPath(), `${name}.svg`);
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, 'utf8');
    const inner = raw.slice(raw.indexOf('>') + 1, raw.lastIndexOf('</svg>'));
    return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 36 36">${inner}</svg>`;
  }
  throw new Error(`missing artwork for ${emoji} (${cps.join('-')})`);
}

export function renderScene(main: string, decor: string, bg: [string, string], seed: number): string {
  const sparkles = [0, 1, 2, 3, 4, 5].map((i) => {
    const x = 30 + ((seed * 37 + i * 71) % 340);
    const y = 25 + ((seed * 53 + i * 29) % 110);
    const r = 1.5 + ((seed + i) % 3);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.5"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="800" height="600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>
<radialGradient id="l" cx="0.5" cy="0.55" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="400" height="300" rx="24" fill="url(#g)"/>
${sparkles.join('')}
<ellipse cx="200" cy="255" rx="150" ry="22" fill="#000" opacity="0.18"/>
<circle cx="200" cy="160" r="120" fill="url(#l)"/>
${emojiSvg(main, 125, 70, 150)}
${emojiSvg(decor, 305, 40, 56)}
</svg>`;
}

export interface GeneratedPair {
  category: string;
  mode: 'normal' | 'hard';
  labelA: string;
  labelB: string;
  svgA: string;
  svgB: string;
  key: string;
}

export function generatePicturePairs(): GeneratedPair[] {
  const out: GeneratedPair[] = [];
  PICTURE_RELATIONS.forEach(([category, la, ea, lb, eb], i) => {
    for (let v = 0; v < 2; v++) {
      const bg = BACKGROUNDS[(i + v * 3) % BACKGROUNDS.length];
      const decor = DECOR[(i + v) % DECOR.length][1];
      out.push({ category, mode: 'normal', labelA: la, labelB: lb, svgA: renderScene(ea, decor, bg, i * 2 + v), svgB: renderScene(eb, decor, bg, i * 2 + v), key: `n:${i}:${v}` });
    }
    const bg = BACKGROUNDS[(i + 1) % BACKGROUNDS.length];
    const d1 = DECOR[i % DECOR.length];
    const d2 = DECOR[(i + 3) % DECOR.length];
    out.push({
      category,
      mode: 'hard',
      labelA: `${la} وجنبها ${d1[0]}`,
      labelB: `${la} وجنبها ${d2[0]}`,
      svgA: renderScene(ea, d1[1], bg, i * 7),
      svgB: renderScene(ea, d2[1], bg, i * 7),
      key: `h:${i}`,
    });
  });
  return out;
}
