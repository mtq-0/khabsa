/**
 * Original illustrated cards for the cartoon / movie / TV words of
 * مين برا السالفة؟. Each card hints at the title with emoji artwork
 * (Twemoji, CC-BY 4.0); no posters, logos or screenshots are used.
 * Only players who know the word see the picture; the outsider does not.
 * [main, small decoration]
 */
import { renderScene } from './pictures.ts';

export const WORD_PICTURES: Record<string, [string, string]> = {
  // cartoons
  'توم وجيري': ['🐱', '🐭'],
  'سبونج بوب': ['🧽', '🍍'],
  'المحقق كونان': ['🔍', '🕵️'],
  'كابتن ماجد': ['⚽', '🥅'],
  'غرندايزر': ['🤖', '🚀'],
  'السنافر': ['🍄', '💙'],
  'بوكيمون': ['⚡', '🐹'],
  'ميكي ماوس': ['🐭', '🎩'],
  'عدنان ولينا': ['🏝️', '⛵'],
  'سالي': ['👧', '🏫'],
  'ريمي': ['🎻', '🐕'],
  'هايدي': ['🏔️', '🐐'],
  'ماوكلي': ['🐺', '🌴'],
  'بابار': ['🐘', '👑'],
  'سيمبا': ['🦁', '👑'],
  'نيلز': ['🦆', '🌍'],
  'ون بيس': ['👒', '🏴‍☠️'],
  'ناروتو': ['🍥', '🦊'],
  'دراغون بول': ['🐉', '🟠'],
  'بن تن': ['⌚', '👽'],
  'بات مان': ['🦇', '🏙️'],
  'سكوبي دو': ['🐕', '👻'],
  'بيبي شارك': ['🦈', '🎶'],
  'الكابتن رابح': ['⚽', '🏆'],
  'ماشا والدب': ['👧', '🐻'],
  'باو باترول': ['🐶', '🚒'],
  'الدبدوب ويني': ['🧸', '🍯'],
  'فلة': ['🎀', '👗'],
  'جزيرة الكنز': ['🏝️', '💰'],
  'بسيط': ['😊', '🎈'],
  // movies
  'تايتانيك': ['🚢', '🧊'],
  'الأسد الملك': ['🦁', '🌅'],
  'هاري بوتر': ['🧙', '⚡'],
  'سبايدر مان': ['🕷️', '🕸️'],
  'باتمان': ['🦇', '🌙'],
  'أفاتار': ['🌳', '💙'],
  'جوكر': ['🃏', '😂'],
  'ذيب': ['🐺', '🌄'],
  'الرسالة': ['📜', '🕌'],
  'عمر المختار': ['🐎', '🏜️'],
  'إنسبشن': ['🌀', '🏙️'],
  'فروزن': ['❄️', '👸'],
  'توي ستوري': ['🤠', '🚀'],
  'شريك': ['🧅', '🏰'],
  'علاء الدين': ['🧞', '🪔'],
  'هالك': ['💪', '💚'],
  'ماتريكس': ['💊', '🕶️'],
  'جوراسيك بارك': ['🦖', '🌴'],
  'الأب الروحي': ['🌹', '🎩'],
  'كابتن أمريكا': ['🛡️', '⭐'],
  'أفنجرز': ['🦸', '⚡'],
  'المهمة المستحيلة': ['🕶️', '⏱️'],
  'فاست آند فيوريس': ['🏎️', '💨'],
  'الكيف': ['☕', '🎭'],
  'الإرهاب والكباب': ['🍢', '🏢'],
  'بارلبي': ['💖', '👗'],
  'كونغ فو باندا': ['🐼', '🥋'],
  'مدغشقر': ['🦓', '🏝️'],
  'نيمو': ['🐠', '🌊'],
  'العالم السفلي': ['🧛', '🌙'],
  // TV
  'باب الحارة': ['🚪', '🏘️'],
  'طاش ما طاش': ['😂', '📺'],
  'شارع شيكاغو': ['🎷', '🌃'],
  'الهيبة': ['🏡', '🕶️'],
  'جن': ['👻', '🏫'],
  'نجوم الأردن': ['🌟', '🎤'],
  'أبو عواد': ['👴', '☕'],
  'وطن ع وتر': ['🎻', '😂'],
  'ذا فويس': ['🎤', '🪑'],
  'من سيربح المليون': ['💰', '❓'],
  'الكبير أوي': ['🤠', '🌾'],
  'صراع العروش': ['👑', '🐉'],
  'بريكنغ باد': ['🧪', '🚐'],
  'فريندز': ['☕', '🛋️'],
  'مستر بين': ['🧸', '🚗'],
  'الخربة': ['🏚️', '👴'],
  'ضيعة ضايعة': ['🏘️', '🐑'],
  'الزير سالم': ['🐎', '🗡️'],
  'التغريبة الفلسطينية': ['🫒', '🗝️'],
  'نشرة الأخبار': ['📰', '📺'],
  'برنامج طبخ': ['🧑‍🍳', '🍲'],
  'كورة ليلة الجمعة': ['⚽', '📺'],
  'عرب آيدول': ['🎤', '⭐'],
  'مسلسل تركي': ['💔', '📺'],
  'كوميدي ستاند أب': ['🎤', '😂'],
  'برامج مسابقات': ['🏆', '❓'],
  'دراما رمضان': ['🌙', '📺'],
  'قصص الأنبياء': ['📖', '✨'],
  'المتحري كونان': ['🔍', '👓'],
};

const BACKGROUNDS: [string, string][] = [
  ['#312e81', '#7c3aed'],
  ['#0e7490', '#22d3ee'],
  ['#831843', '#f472b6'],
  ['#14532d', '#4ade80'],
  ['#7c2d12', '#fb923c'],
  ['#1e3a8a', '#60a5fa'],
];

/** Renders the illustrated card for a word, or null if the word has none. */
export function renderWordPicture(word: string): string | null {
  const art = WORD_PICTURES[word];
  if (!art) return null;
  let h = 0;
  for (const ch of word) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return renderScene(art[0], art[1], BACKGROUNDS[h % BACKGROUNDS.length], h % 97);
}

/**
 * Better TMDB search terms for some titles (the Arabic name alone often
 * matches a different work). Admins can still type their own search.
 */
export const TMDB_QUERIES: Record<string, string> = {
  'غرندايزر': 'Grendizer',
  // pinned after reviewing the poster sheet (the plain search picked the wrong work)
  'بات مان': 'tv:Batman: The Animated Series',
  'باتمان': 'movie:Batman Begins',
  'بن تن': 'tv:Ben 10',
  'توي ستوري': 'movie:Toy Story',
  'الكابتن رابح': 'Ganbare Kickers',
  'بسيط': '',
  'تايتانيك': 'Titanic',
  'سبايدر مان': 'movie:Spider-Man',
  'أفاتار': 'Avatar',
  'الرسالة': 'The Message',
  'إنسبشن': 'Inception',
  'ماتريكس': 'The Matrix',
  'جوراسيك بارك': 'Jurassic Park',
  'الأب الروحي': 'The Godfather',
  'أفنجرز': 'movie:The Avengers',
  'فاست آند فيوريس': 'The Fast and the Furious',
  'بارلبي': 'Barbie',
  'مدغشقر': 'Madagascar',
  'نجوم الأردن': '',
  'ذا فويس': 'The Voice Ahla Sawt',
  'فريندز': 'Friends',
  'مستر بين': 'Mr. Bean',
  'المتحري كونان': 'tv:المحقق كونان',
  'ميكي ماوس': 'Mickey Mouse',
  'الدبدوب ويني': 'movie:The Many Adventures of Winnie the Pooh',
  'سيمبا': 'tv:سيمبا',
  'هاري بوتر': "Harry Potter and the Philosopher's Stone",
  'هالك': 'movie:The Incredible Hulk',
  'جن': 'tv:جن',
  'كابتن أمريكا': 'Captain America: The First Avenger',
};

/** Generic words that are not a specific title: no poster search. */
export const NO_POSTER = new Set(['نشرة الأخبار', 'برنامج طبخ', 'كورة ليلة الجمعة', 'مسلسل تركي', 'كوميدي ستاند أب', 'برامج مسابقات', 'دراما رمضان', 'بسيط', 'نجوم الأردن', 'قصص الأنبياء']);

export function tmdbQueryFor(word: string): string | null {
  if (NO_POSTER.has(word)) return null;
  return TMDB_QUERIES[word] || word;
}
