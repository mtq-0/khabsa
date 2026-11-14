/**
 * Static game catalogue shared by client and server. This holds presentation
 * metadata and the settings schema only; no game content (words, questions,
 * pictures) lives here. Content is stored in the database.
 */
export const GAME_IDS = [
  'outsider-word',
  'odd-question',
  'outsider-picture',
  'most-likely',
  'taboo',
  'speed-quiz',
  'draw-guess',
  'outsider-draw',
] as const;
export type GameId = (typeof GAME_IDS)[number];

export function isGameId(v: unknown): v is GameId {
  return typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);
}

export type SettingField =
  | { key: string; label: string; type: 'number'; min: number; max: number; step?: number; default: number; unit?: string }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: 'boolean'; default: boolean }
  | { key: string; label: string; type: 'category'; default: string };

export const DIFFICULTY_OPTIONS = [
  { value: 'mixed', label: 'مخلوط' },
  { value: 'easy', label: 'سهل' },
  { value: 'medium', label: 'متوسط' },
  { value: 'hard', label: 'صعب' },
];

export interface GameMeta {
  id: GameId;
  emoji: string;
  name: string;
  nameEn: string;
  tagline: string;
  description: string;
  rules: string[];
  minPlayers: number;
  maxPlayers: number;
  durationMin: number;
  tags: string[];
  gradient: [string, string];
  settings: SettingField[];
}

const roundsField = (def: number, max = 10): SettingField => ({ key: 'rounds', label: 'عدد الجولات', type: 'number', min: 1, max, default: def });

export const GAMES: Record<GameId, GameMeta> = {
  'outsider-word': {
    id: 'outsider-word',
    emoji: '🕵️',
    name: 'مين برا السالفة؟',
    nameEn: 'Who is outside the topic?',
    tagline: 'كلكم بتعرفوا الكلمة... إلا واحد!',
    description: 'الكل بياخد نفس الكلمة السرية إلا اللي برا السالفة. اسألوا بعض، شكّوا، صوّتوا... وإذا انكشف، عنده فرصة أخيرة يخمّن الكلمة.',
    rules: [
      'كل لاعب بيشوف بطاقته لحاله: إما الكلمة السرية، أو إنه برا السالفة.',
      'الأسئلة عشوائية: كل مرة بيطلع لاعب بيسأل لاعب ثاني سؤال عن الكلمة بدون ما يفضحها.',
      'الأسئلة بتضل شغالة لحد ما الكل يكبس "جاهز للتصويت" (بعد ما كل واحد يسأل مرة على الأقل).',
      'بعدها الكل بيصوّت سراً على اللي شاكّين فيه.',
      'اللي برا السالفة بيحاول يخمّن الكلمة من بين 12 خيار، كلهم من نفس الفئة.',
      'التصويت الصح +1، البرّا اللي ما انكشف +2، وتخمين الكلمة صح +1 بونص.',
      'إذا تعادلت الأصوات على المركز الأخير، التعادل لصالح البرّا.',
    ],
    minPlayers: 3,
    maxPlayers: 12,
    durationMin: 10,
    tags: ['خداع', 'نقاش', 'كلمات'],
    gradient: ['#7c3aed', '#22d3ee'],
    settings: [
      roundsField(3),
      { key: 'category', label: 'التصنيف', type: 'category', default: 'any' },
      { key: 'difficulty', label: 'الصعوبة', type: 'select', options: DIFFICULTY_OPTIONS, default: 'mixed' },
      { key: 'outsiders', label: 'عدد اللي برا السالفة', type: 'number', min: 1, max: 3, default: 1 },
      { key: 'categoryHint', label: 'اعرض التصنيف للبرّا', type: 'boolean', default: true },
      { key: 'turnSeconds', label: 'وقت كل سؤال', type: 'number', min: 10, max: 120, step: 5, default: 30, unit: 'ثانية' },
      { key: 'discussSeconds', label: 'وقت النقاش', type: 'number', min: 15, max: 300, step: 15, default: 60, unit: 'ثانية' },
      { key: 'voteSeconds', label: 'وقت التصويت', type: 'number', min: 10, max: 120, step: 5, default: 30, unit: 'ثانية' },
    ],
  },
  'odd-question': {
    id: 'odd-question',
    emoji: '🎭',
    name: 'مين الأطرش بالزفة؟',
    nameEn: 'The impostor question',
    tagline: 'سؤال واحد للكل... وسؤال ثاني لواحد مش داري',
    description: 'كل اللاعبين بياخدوا نفس السؤال، إلا واحد بياخد سؤال قريب بس مختلف. جاوبوا، اكشفوا الأجوبة، ودوّروا على الجواب اللي "مش راكب".',
    rules: [
      'كل لاعب بيشوف سؤاله لحاله وبيكتب جواب قصير.',
      'الأطرش ما بيعرف إنه سؤاله مختلف!',
      'بعد ما الكل يجاوب، بينكشف سؤال الأغلبية مع كل الأجوبة.',
      'ناقشوا وصوّتوا سراً على اللي جوابه غريب.',
      'التصويت الصح +1، والأطرش اللي ما انكشف +2.',
    ],
    minPlayers: 3,
    maxPlayers: 12,
    durationMin: 8,
    tags: ['أسئلة', 'خداع', 'ضحك'],
    gradient: ['#a21caf', '#f472b6'],
    settings: [
      roundsField(4),
      { key: 'category', label: 'التصنيف', type: 'category', default: 'any' },
      { key: 'difficulty', label: 'الصعوبة', type: 'select', options: DIFFICULTY_OPTIONS, default: 'mixed' },
      { key: 'answerSeconds', label: 'وقت الإجابة', type: 'number', min: 15, max: 120, step: 5, default: 45, unit: 'ثانية' },
      { key: 'discussSeconds', label: 'وقت النقاش', type: 'number', min: 15, max: 300, step: 15, default: 60, unit: 'ثانية' },
      { key: 'voteSeconds', label: 'وقت التصويت', type: 'number', min: 10, max: 120, step: 5, default: 30, unit: 'ثانية' },
    ],
  },
  'outsider-picture': {
    id: 'outsider-picture',
    emoji: '🖼',
    name: 'مين برا الصورة؟',
    nameEn: 'Who is outside the photo?',
    tagline: 'كلكم شايفين نفس الصورة... متأكدين؟',
    description: 'الأغلبية بتشوف نفس الصورة السرية، وواحد بيشوف صورة شبهها بس مختلفة وما حدا بيقلّه. اوصفوا، شكّوا، وصوّتوا.',
    rules: [
      'كل لاعب بيشوف صورته لحاله، وما حدا بيشوف صورة غيره.',
      'سهل: البرّا ما بياخد صورة وبيعرف إنه برّا. عادي: صورة قريبة. صعب: صورة شبه متطابقة.',
      'الدور عشوائي: كل مرة واحد بيوصف صورته بكلمة أو جملة بدون ما يفضحها.',
      'الوصف بيضل شغال لحد ما الكل يكبس "جاهز للتصويت" (بعد ما كل واحد يوصف مرة على الأقل).',
      'صوّتوا سراً، وبعدها البرّا عنده فرصة يخمّن صورة الأغلبية.',
      'التصويت الصح +1، البرّا اللي ما انكشف +2، والتخمين الصح +1 بونص.',
    ],
    minPlayers: 3,
    maxPlayers: 12,
    durationMin: 10,
    tags: ['صور', 'خداع', 'وصف'],
    gradient: ['#4f46e5', '#38bdf8'],
    settings: [
      roundsField(3),
      { key: 'category', label: 'التصنيف', type: 'category', default: 'any' },
      {
        key: 'mode',
        label: 'الصعوبة',
        type: 'select',
        options: [
          { value: 'easy', label: 'سهل (بدون صورة)' },
          { value: 'normal', label: 'عادي (صورة قريبة)' },
          { value: 'hard', label: 'صعب (فرق بسيط)' },
        ],
        default: 'normal',
      },
      { key: 'turnSeconds', label: 'وقت كل وصف', type: 'number', min: 10, max: 120, step: 5, default: 25, unit: 'ثانية' },
      { key: 'discussSeconds', label: 'وقت النقاش', type: 'number', min: 15, max: 300, step: 15, default: 60, unit: 'ثانية' },
      { key: 'voteSeconds', label: 'وقت التصويت', type: 'number', min: 10, max: 120, step: 5, default: 30, unit: 'ثانية' },
    ],
  },
  'most-likely': {
    id: 'most-likely',
    emoji: '😂',
    name: 'مين غالباً؟',
    nameEn: 'Most likely to',
    tagline: 'مين فينا غالباً... بتعرفوا الجواب 😏',
    description: 'سؤال مضحك عن الشلة، والكل بيصوّت على مين أكثر واحد بينطبق عليه. اللي بيصوّت مع الأغلبية بياخد نقطة، واللي بياخد أكثر أصوات بياخد اللقب.',
    rules: [
      'بيظهر سؤال مثل "مين غالباً ينام بنص الطلعة؟".',
      'كل لاعب بيصوّت على لاعب (مسموح تصوّت لحالك إذا صادق!).',
      'بالتصويت المخفي ما بيبين مين صوّت لمين، بالمكشوف بيبين.',
      'اللي صوّت مع الأغلبية +1، وصاحب أكثر أصوات بياخد اللقب.',
    ],
    minPlayers: 3,
    maxPlayers: 12,
    durationMin: 6,
    tags: ['ضحك', 'تصويت', 'شلة'],
    gradient: ['#9333ea', '#facc15'],
    settings: [
      roundsField(8, 20),
      { key: 'category', label: 'التصنيف', type: 'category', default: 'any' },
      { key: 'anonymous', label: 'تصويت مخفي', type: 'boolean', default: true },
      { key: 'voteSeconds', label: 'وقت التصويت', type: 'number', min: 10, max: 60, step: 5, default: 20, unit: 'ثانية' },
    ],
  },
  taboo: {
    id: 'taboo',
    emoji: '🚫',
    name: 'ممنوع تحكي!',
    nameEn: 'Taboo',
    tagline: 'اشرح الكلمة... بس إياك تقول الممنوع',
    description: 'لعبة فرق: واحد بيشرح كلمة سرية لفريقه بدون ما يستخدم الكلمات الممنوعة، والفريق الثاني بيراقب وبيكبس "ممنوع!" إذا غلط.',
    rules: [
      'اللاعبين بيتقسموا لفريقين.',
      'الشارح بيشوف الكلمة والكلمات الممنوعة، وفريقه بيخمّن بالصوت أو بالكتابة.',
      'كل كلمة صح +1 للفريق، والتخطي ما إله نقاط.',
      'الفريق الثاني بيشوف البطاقة، وإذا الشارح قال كلمة ممنوعة بيكبسوا "ممنوع!" و -1.',
      'الأدوار بتلف على كل الفريقين والشارحين.',
    ],
    minPlayers: 4,
    maxPlayers: 12,
    durationMin: 12,
    tags: ['فرق', 'كلمات', 'سرعة'],
    gradient: ['#e11d48', '#fb923c'],
    settings: [
      { key: 'turnsPerPlayer', label: 'دورات لكل لاعب', type: 'number', min: 1, max: 4, default: 1 },
      { key: 'category', label: 'التصنيف', type: 'category', default: 'any' },
      { key: 'difficulty', label: 'الصعوبة', type: 'select', options: DIFFICULTY_OPTIONS, default: 'mixed' },
      { key: 'turnSeconds', label: 'وقت الدور', type: 'number', min: 30, max: 180, step: 10, default: 60, unit: 'ثانية' },
      { key: 'maxSkips', label: 'عدد التخطيات', type: 'number', min: 0, max: 10, default: 3 },
    ],
  },
  'speed-quiz': {
    id: 'speed-quiz',
    emoji: '⚡',
    name: 'تحدي السرعة',
    nameEn: 'Speed challenge',
    tagline: 'مين أسرع مخ بالشلة؟',
    description: 'أسئلة معلومات عامة للكل بنفس اللحظة. الجواب الصح بيعطيك نقاط، والأسرع بياخد بونص، والسلسلة بتكبّر نقاطك.',
    rules: [
      'كل سؤال إله 4 خيارات ووقت محدد.',
      'الجواب الصح = 100 نقطة + بونص سرعة لحد 50.',
      'أول جواب صح بياخد +25 إضافية.',
      'كل جواب صح ورا بعض بيزيد بونص السلسلة.',
      'الخادم هو اللي بيحسب الوقت والنقاط، ما في غش!',
    ],
    minPlayers: 1,
    maxPlayers: 12,
    durationMin: 5,
    tags: ['معلومات', 'سرعة', 'منافسة'],
    gradient: ['#0ea5e9', '#22c55e'],
    settings: [
      { key: 'rounds', label: 'عدد الأسئلة', type: 'number', min: 5, max: 30, default: 10 },
      { key: 'category', label: 'التصنيف', type: 'category', default: 'any' },
      { key: 'difficulty', label: 'الصعوبة', type: 'select', options: DIFFICULTY_OPTIONS, default: 'mixed' },
      { key: 'questionSeconds', label: 'وقت السؤال', type: 'number', min: 5, max: 30, default: 15, unit: 'ثانية' },
    ],
  },
  'draw-guess': {
    id: 'draw-guess',
    emoji: '✏️',
    name: 'ارسم وخمّن',
    nameEn: 'Draw & guess',
    tagline: 'ارسمها... حتى لو بتطلع خبصة!',
    description: 'واحد بيرسم كلمة سرية والباقي بيخمّنوا بالشات. كل ما خمّنت أسرع، أخذت نقاط أكثر، والرسام بياخد نقاط على كل واحد خمّن.',
    rules: [
      'الرسام بيختار كلمة من 3 خيارات.',
      'الباقي بيكتبوا تخمينهم، والتخمين الصح بينخفى عن الباقي.',
      'نقاط التخمين بتقل مع الوقت، وأول واحد بياخد بونص.',
      'الرسام بياخد 25 نقطة على كل لاعب خمّن صح.',
      'مع الوقت بتنكشف حروف من الكلمة كتلميح.',
    ],
    minPlayers: 2,
    maxPlayers: 12,
    durationMin: 12,
    tags: ['رسم', 'تخمين', 'إبداع'],
    gradient: ['#0f766e', '#a3e635'],
    settings: [
      roundsField(2, 5),
      { key: 'category', label: 'التصنيف', type: 'category', default: 'any' },
      { key: 'difficulty', label: 'الصعوبة', type: 'select', options: DIFFICULTY_OPTIONS, default: 'mixed' },
      { key: 'drawSeconds', label: 'وقت الرسم', type: 'number', min: 30, max: 180, step: 10, default: 80, unit: 'ثانية' },
      {
        key: 'scoring',
        label: 'نظام النقاط',
        type: 'select',
        options: [
          { value: 'individual', label: 'فردي' },
          { value: 'teams', label: 'فرق' },
        ],
        default: 'individual',
      },
    ],
  },
  'outsider-draw': {
    id: 'outsider-draw',
    emoji: '🎨',
    name: 'مين برا الرسمة؟',
    nameEn: 'Who is outside the drawing?',
    tagline: 'لوحة وحدة، كل واحد خط... وواحد بيخبّص!',
    description: 'الكل بياخد نفس الكلمة إلا واحد. كلكم بترسموا على نفس اللوحة: كل واحد خط واحد بدوره وبترتيب عشوائي لحد ما الكل يكبس جاهز للتصويت، وكل لاعب إله لون. مين خطّه مش راكب؟ صوّتوا، واللي برا بيحاول يخمّن شو كانت الرسمة.',
    rules: [
      'كل لاعب بيشوف بطاقته لحاله: الكلمة السرية، أو إنه برا الرسمة (مع التصنيف كتلميح إذا مفعّل).',
      'الدور عشوائي: كل واحد بيرسم خط واحد بس (بدون ما يشيل إيده) على نفس اللوحة، وبلونه.',
      'بتضل الرسمة بتكبر لحد ما الكل يكبس "جاهز للتصويت" (بعد ما كل واحد يرسم الحد الأدنى من الخطوط).',
      'ارسم خط بيبيّن إنك بتعرف الكلمة، بس مش واضح كثير عشان البرّا ما يعرفها!',
      'بعد الرسم ناقشوا وصوّتوا سراً، وبعدها البرّا بيخمّن الكلمة من بين خيارات.',
      'التصويت الصح +1، البرّا اللي ما انكشف +2، وتخمين الكلمة صح +1 بونص.',
    ],
    minPlayers: 3,
    maxPlayers: 11,
    durationMin: 10,
    tags: ['رسم', 'خداع', 'ضحك'],
    gradient: ['#ea580c', '#facc15'],
    settings: [
      roundsField(3, 8),
      { key: 'category', label: 'التصنيف', type: 'category', default: 'any' },
      { key: 'difficulty', label: 'الصعوبة', type: 'select', options: DIFFICULTY_OPTIONS, default: 'mixed' },
      { key: 'categoryHint', label: 'اعرض التصنيف للبرّا', type: 'boolean', default: true },
      { key: 'laps', label: 'أقل عدد خطوط لكل لاعب', type: 'number', min: 1, max: 3, default: 2 },
      { key: 'turnSeconds', label: 'وقت كل خط', type: 'number', min: 10, max: 60, step: 5, default: 20, unit: 'ثانية' },
      { key: 'discussSeconds', label: 'وقت النقاش', type: 'number', min: 15, max: 300, step: 15, default: 60, unit: 'ثانية' },
      { key: 'voteSeconds', label: 'وقت التصويت', type: 'number', min: 10, max: 120, step: 5, default: 30, unit: 'ثانية' },
    ],
  },
};

export type GameSettings = Record<string, number | string | boolean>;

/**
 * The category setting holds 'any' (everything) or one or more category slugs joined by commas
 * ("food,animals"). One slug is just the old single-category value, so saved rooms keep working.
 */
export function categoryList(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  const out: string[] = [];
  for (const part of v.split(',')) {
    const slug = part.trim();
    if (slug !== 'any' && /^[a-z0-9-]{1,40}$/.test(slug) && !out.includes(slug)) out.push(slug);
  }
  return out.slice(0, 40);
}

/** Fill defaults and clamp values to the schema; unknown keys are dropped. */
export function sanitizeSettings(gameId: GameId, raw: unknown): GameSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: GameSettings = {};
  for (const f of GAMES[gameId].settings) {
    const v = src[f.key];
    switch (f.type) {
      case 'number': {
        const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : f.default;
        out[f.key] = Math.min(f.max, Math.max(f.min, n));
        break;
      }
      case 'select':
        out[f.key] = typeof v === 'string' && f.options.some((o) => o.value === v) ? v : f.default;
        break;
      case 'boolean':
        out[f.key] = typeof v === 'boolean' ? v : f.default;
        break;
      case 'category': {
        const list = categoryList(v);
        out[f.key] = list.length ? list.join(',') : f.default;
        break;
      }
    }
  }
  return out;
}
