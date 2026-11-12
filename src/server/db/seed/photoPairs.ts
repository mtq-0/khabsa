import { MORE_PHOTO_PAIRS } from './photoPairsMore.ts';

/**
 * Real photo pairs for مين برا الصورة؟ — [category, labelA, searchA, labelB, searchB].
 * Photos come from Wikimedia Commons under free licenses (CC0 / public domain /
 * CC BY / CC BY-SA). scripts/fetch-photos.ts finds candidates; the chosen
 * files, resized to 800x600 WebP, live in ./photos with their credits.
 * Subjects avoid identifiable people (personality rights).
 */
/** [category, labelA, searchA, labelB, searchB, 'hard'?] */
export type PhotoPairDef = [string, string, string, string, string, 'hard'?];

export const PHOTO_PAIRS: PhotoPairDef[] = [
  // food
  ['food', 'تفاحة', 'red apple fruit', 'إجاصة', 'pear fruit'],
  ['food', 'بطيخة', 'watermelon slice', 'شمامة', 'cantaloupe melon cut'],
  ['food', 'برغر', 'hamburger', 'سندويشة', 'sandwich bread'],
  ['food', 'بيتزا', 'pizza', 'فطيرة', 'apple pie'],
  ['food', 'بوظة', 'ice cream cone', 'كيكة', 'chocolate cake slice'],
  ['food', 'ليمونة', 'lemons', 'برتقالة', 'oranges fruit'],
  ['food', 'عنب', 'grapes bunch', 'كرز', 'cherries fruit'],
  ['food', 'فراولة', 'strawberries', 'توت', 'blueberries'],
  ['food', 'قهوة', 'cup of coffee', 'شاي', 'cup of tea'],
  ['food', 'دونات', 'doughnuts', 'كوكيز', 'chocolate chip cookies'],
  ['food', 'جزرة', 'carrots vegetable', 'ذرة', 'corn on the cob'],
  ['food', 'فلفل حار', 'red chili peppers', 'فليفلة', 'bell peppers'],
  ['food', 'بيضة مقلية', 'fried egg', 'فطاير', 'pancakes stack'],
  ['food', 'خبز', 'bread loaf', 'كرواسون', 'croissant'],
  // animals
  ['animals', 'قطة', 'domestic cat', 'نمر', 'tiger'],
  ['animals', 'كلب', 'dog portrait', 'ذيب', 'gray wolf'],
  ['animals', 'أسد', 'lion male', 'فهد', 'cheetah'],
  ['animals', 'جمل', 'dromedary camel', 'لاما', 'llama'],
  ['animals', 'حصان', 'horse', 'حمار وحشي', 'zebra'],
  ['animals', 'بقرة', 'cow', 'خروف', 'sheep'],
  ['animals', 'أرنب', 'rabbit', 'فار', 'house mouse'],
  ['animals', 'دب', 'brown bear', 'باندا', 'giant panda'],
  ['animals', 'ضفدع', 'frog', 'سلحفاة', 'tortoise'],
  ['animals', 'دلفين', 'dolphin', 'حوت', 'humpback whale'],
  ['animals', 'بطريق', 'penguin', 'بومة', 'owl'],
  ['animals', 'نحلة', 'honey bee', 'دعسوقة', 'ladybird'],
  ['animals', 'فراشة', 'butterfly', 'يعسوب', 'dragonfly'],
  ['animals', 'ديك', 'rooster', 'بطة', 'mallard duck'],
  ['animals', 'أفعى', 'snake', 'تمساح', 'crocodile'],
  ['animals', 'فيل', 'african elephant', 'وحيد القرن', 'rhinoceros'],
  ['animals', 'قرد', 'monkey', 'غوريلا', 'gorilla'],
  // sports equipment (no people)
  ['sports', 'كورة قدم', 'football soccer ball', 'كورة سلة', 'basketball ball'],
  ['sports', 'طابة تنس', 'tennis ball', 'طابة بيسبول', 'baseball ball'],
  ['sports', 'كورة طائرة', 'volleyball ball', 'كورة رجبي', 'rugby ball'],
  ['sports', 'ميدالية ذهبية', 'gold medal', 'كأس', 'trophy cup'],
  // vehicles
  ['cars', 'سيارة', 'car sedan', 'تكسي', 'taxi cab'],
  ['cars', 'باص', 'city bus', 'ترام', 'tram'],
  ['cars', 'سيارة إسعاف', 'ambulance', 'سيارة إطفاء', 'fire engine'],
  ['cars', 'سيارة شرطة', 'police car', 'سيارة سباق', 'formula one car'],
  ['cars', 'موتور', 'motorcycle', 'سكوتر', 'scooter vespa'],
  ['cars', 'تراكتور', 'tractor', 'شاحنة', 'truck lorry'],
  ['cars', 'طيارة', 'airliner airplane', 'هليكوبتر', 'helicopter'],
  ['cars', 'سفينة', 'cruise ship', 'قارب شراعي', 'sailing boat'],
  ['cars', 'قطار', 'train locomotive', 'مترو', 'metro train underground'],
  // objects
  ['objects', 'ساعة يد', 'wristwatch', 'ساعة منبه', 'alarm clock'],
  ['objects', 'موبايل', 'smartphone', 'تلفون أرضي', 'rotary telephone'],
  ['objects', 'لابتوب', 'laptop computer', 'كمبيوتر مكتبي', 'desktop computer'],
  ['objects', 'كاميرا', 'camera', 'كاميرا فيديو', 'camcorder'],
  ['objects', 'مظلة', 'umbrella', 'شمسية بحر', 'beach umbrella'],
  ['objects', 'مفتاح', 'key', 'قفل', 'padlock'],
  ['objects', 'شمعة', 'candle flame', 'لمبة', 'light bulb'],
  ['objects', 'كتاب', 'book', 'دفتر', 'notebook'],
  ['objects', 'قلم رصاص', 'pencils', 'قلم حبر', 'fountain pen'],
  ['objects', 'هدية', 'gift box', 'بالونات', 'balloons'],
  ['objects', 'غيتار', 'acoustic guitar', 'كمان', 'violin'],
  ['objects', 'طبل', 'drum', 'ساكسفون', 'saxophone'],
  ['objects', 'نظارة', 'eyeglasses', 'نظارة شمسية', 'sunglasses'],
  ['objects', 'كندرة رياضة', 'sneakers', 'كعب عالي', 'high heels shoes'],
  ['objects', 'قبعة', 'top hat', 'طاقية', 'baseball cap'],
  ['objects', 'تاج', 'crown jewels', 'خاتم', 'ring jewellery'],
  // nature
  ['nature', 'شمس', 'sunset', 'قمر', 'full moon'],
  ['nature', 'غيمة', 'cumulus cloud', 'مطر', 'rain drops window'],
  ['nature', 'ثلج', 'snow landscape', 'رجل ثلج', 'snowman'],
  ['nature', 'وردة', 'red rose', 'عباد الشمس', 'sunflower'],
  ['nature', 'شجرة', 'oak tree', 'نخلة', 'date palm'],
  ['nature', 'صبار', 'cactus', 'نبتة', 'potted plant'],
  ['nature', 'جبل', 'mountain peak', 'بركان', 'volcano eruption'],
  ['nature', 'نار', 'campfire', 'برق', 'lightning'],
  // world landmarks
  ['landmarks', 'برج إيفل', 'Eiffel Tower', 'برج خليفة', 'Burj Khalifa'],
  ['landmarks', 'تمثال الحرية', 'Statue of Liberty', 'أبو الهول', 'Great Sphinx of Giza'],
  ['landmarks', 'مسجد', 'mosque', 'قلعة', 'castle'],
  ['landmarks', 'خيمة', 'tent camping', 'كوخ', 'wooden cabin'],
  ['landmarks', 'جسر', 'suspension bridge', 'نافورة', 'fountain'],
  // Jordan
  ['jordan', 'الخزنة بالبترا', 'Petra Treasury Al-Khazneh', 'الدير بالبترا', 'Petra Monastery Ad Deir'],
  ['jordan', 'وادي رم', 'Wadi Rum desert', 'البحر الميت', 'Dead Sea shore'],
  ['jordan', 'المدرج الروماني بعمّان', 'Roman Theatre Amman', 'أعمدة جرش', 'Jerash colonnade'],
  ['jordan', 'قلعة عجلون', 'Ajloun Castle', 'قلعة الكرك', 'Kerak Castle'],
];

PHOTO_PAIRS.push(...MORE_PHOTO_PAIRS);
