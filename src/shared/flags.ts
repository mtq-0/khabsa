/**
 * Flags for the country words (مين برا السالفة؟ → دول): Arabic name → ISO 3166-1 alpha-2 code.
 * The flags are drawn as images (public/flags/<code>.svg, Twemoji, CC-BY 4.0) and not as emoji,
 * because Windows does not draw flag emoji (it shows two letters instead).
 */
export const COUNTRY_FLAGS: Record<string, string> = {
  'الأردن': 'jo', 'مصر': 'eg', 'السعودية': 'sa', 'فلسطين': 'ps', 'لبنان': 'lb', 'سوريا': 'sy', 'العراق': 'iq', 'تركيا': 'tr',
  'اليابان': 'jp', 'البرازيل': 'br', 'إيطاليا': 'it', 'فرنسا': 'fr', 'ألمانيا': 'de', 'المغرب': 'ma', 'تونس': 'tn', 'الجزائر': 'dz',
  'الإمارات': 'ae', 'قطر': 'qa', 'الكويت': 'kw', 'عُمان': 'om', 'اليمن': 'ye', 'السودان': 'sd', 'الهند': 'in', 'الصين': 'cn',
  'أمريكا': 'us', 'كندا': 'ca', 'أستراليا': 'au', 'المكسيك': 'mx', 'الأرجنتين': 'ar', 'إسبانيا': 'es', 'كوريا الجنوبية': 'kr',
  'إندونيسيا': 'id', 'ماليزيا': 'my', 'باكستان': 'pk', 'إيران': 'ir', 'أفغانستان': 'af', 'بنغلاديش': 'bd', 'تايلاند': 'th',
  'الفلبين': 'ph', 'فيتنام': 'vn', 'نيجيريا': 'ng', 'جنوب أفريقيا': 'za', 'كينيا': 'ke', 'إثيوبيا': 'et', 'ليبيا': 'ly',
  'موريتانيا': 'mr', 'الصومال': 'so', 'جيبوتي': 'dj', 'البحرين': 'bh', 'اليونان': 'gr', 'هولندا': 'nl', 'بلجيكا': 'be',
  'سويسرا': 'ch', 'السويد': 'se', 'النرويج': 'no', 'الدنمارك': 'dk', 'فنلندا': 'fi', 'بولندا': 'pl', 'أوكرانيا': 'ua',
  'البرتغال': 'pt', 'أيرلندا': 'ie', 'بريطانيا': 'gb', 'النمسا': 'at', 'كرواتيا': 'hr', 'البوسنة': 'ba', 'قبرص': 'cy',
  'نيوزيلندا': 'nz', 'تشيلي': 'cl', 'كولومبيا': 'co', 'بيرو': 'pe', 'فنزويلا': 've', 'كوبا': 'cu', 'جامايكا': 'jm',
  'السنغال': 'sn', 'الكاميرون': 'cm', 'غانا': 'gh', 'أوزبكستان': 'uz', 'كازاخستان': 'kz', 'جزر المالديف': 'mv', 'سنغافورة': 'sg',
  'روسيا': 'ru',
};

/** the flag code for a country word, or null */
export function flagOf(word: string | null | undefined): string | null {
  if (!word) return null;
  return COUNTRY_FLAGS[word.trim()] ?? null;
}

/** the flag as emoji (for share texts / places that cannot show images) */
export function flagEmoji(code: string): string {
  return [...code.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}
