/**
 * More real-photo pairs for مين برا الصورة؟ — [category, labelA, searchA, labelB, searchB, 'hard'?].
 * - normal pairs: two related but clearly different things
 * - 'hard' pairs: two look-alikes (lime/lemon, wolf/husky...) for the hard mode
 * Every subject here is new (never used in photoPairs.ts), so photos don't repeat across pairs.
 * No identifiable people: objects, animals, food, places and landmarks only.
 */
import type { PhotoPairDef } from './photoPairs.ts';

export const MORE_PHOTO_PAIRS: PhotoPairDef[] = [
  // food
  ['food', 'موزة', 'banana fruit', 'أناناس', 'pineapple fruit'],
  ['food', 'خيارة', 'cucumber', 'باذنجان', 'eggplant'],
  ['food', 'بندورة', 'tomato', 'بطاطا', 'potatoes'],
  ['food', 'عسل', 'honey jar', 'مربى', 'strawberry jam jar'],
  ['food', 'حمص', 'hummus', 'فلافل', 'falafel'],
  ['food', 'شاورما', 'shawarma', 'كباب', 'kebab skewers'],
  ['food', 'سوشي', 'sushi', 'معكرونة', 'spaghetti pasta'],
  ['food', 'رمان', 'pomegranate', 'تين', 'figs fruit'],
  ['food', 'مانجا', 'mango fruit', 'أفوكادو', 'avocado'],
  ['food', 'سمك مشوي', 'grilled fish', 'دجاج مشوي', 'roast chicken'],
  // animals
  ['animals', 'زرافة', 'giraffe', 'نعامة', 'ostrich'],
  ['animals', 'نسر', 'eagle', 'حمامة', 'pigeon bird'],
  ['animals', 'حرباية', 'chameleon', 'سحلية', 'lizard'],
  ['animals', 'أخطبوط', 'octopus', 'قنديل بحر', 'jellyfish'],
  ['animals', 'سنجاب', 'squirrel', 'قنفذ', 'hedgehog'],
  ['animals', 'طاووس', 'peacock', 'فلامنغو', 'flamingo'],
  ['animals', 'عنكبوت', 'spider', 'عقرب', 'scorpion'],
  ['animals', 'كنغر', 'kangaroo', 'كوالا', 'koala'],
  ['animals', 'ببغاء', 'parrot', 'هدهد', 'hoopoe'],
  ['animals', 'فقمة', 'seal animal', 'سلطعون', 'crab'],
  // sports
  ['sports', 'مضرب تنس', 'tennis racket', 'مضرب بينغ بونغ', 'table tennis paddle'],
  ['sports', 'دراجة هوائية', 'bicycle', 'لوح تزلج', 'skateboard'],
  ['sports', 'حذاء كرة قدم', 'football boots', 'قفازات حارس', 'goalkeeper gloves'],
  ['sports', 'طاولة بلياردو', 'billiard table', 'لوح شطرنج', 'chess board'],
  ['sports', 'أثقال', 'dumbbells', 'حبل نط', 'jump rope'],
  ['sports', 'مسبح', 'swimming pool', 'ملعب تنس', 'tennis court'],
  // vehicles
  ['cars', 'باص مدرسة', 'school bus', 'باص سياحي', 'tour bus'],
  ['cars', 'منطاد', 'hot air balloon', 'طيارة بمروحة', 'propeller airplane'],
  ['cars', 'غواصة', 'submarine', 'سفينة حربية', 'warship'],
  ['cars', 'قارب صيد', 'fishing boat', 'يخت', 'yacht'],
  ['cars', 'رافعة', 'construction crane', 'حفارة', 'excavator'],
  ['cars', 'كرفان', 'campervan', 'جيب صحراء', 'off-road jeep desert'],
  // objects
  ['objects', 'مسطرة', 'ruler', 'مقص', 'scissors'],
  ['objects', 'سماعات', 'headphones', 'ميكروفون', 'microphone'],
  ['objects', 'حقيبة ظهر', 'backpack', 'حقيبة سفر', 'suitcase'],
  ['objects', 'إبريق شاي', 'teapot', 'دلة قهوة', 'arabic coffee pot'],
  ['objects', 'مخدة', 'pillow', 'بطانية', 'folded blanket'],
  ['objects', 'ساعة رملية', 'hourglass', 'بوصلة', 'compass'],
  ['objects', 'مجهر', 'microscope', 'تلسكوب', 'telescope'],
  ['objects', 'كيبورد', 'computer keyboard', 'ماوس', 'computer mouse'],
  ['objects', 'محفظة', 'wallet', 'حزام', 'leather belt'],
  ['objects', 'كرة أرضية', 'globe', 'خريطة', 'paper map'],
  // nature
  ['nature', 'شلال', 'waterfall', 'نهر', 'river'],
  ['nature', 'كثبان رملية', 'sand dunes', 'واحة', 'desert oasis'],
  ['nature', 'غابة', 'forest trees', 'حقل قمح', 'wheat field'],
  ['nature', 'بحيرة جبلية', 'mountain lake', 'أمواج', 'sea waves'],
  ['nature', 'كهف', 'cave', 'وادي صخري', 'canyon'],
  ['nature', 'توليب', 'tulip flowers', 'لافندر', 'lavender field'],
  ['nature', 'سماء نجوم', 'starry night sky', 'مجرة', 'milky way'],
  ['nature', 'قوس قزح', 'rainbow', 'ضباب', 'fog landscape'],
  ['nature', 'شاطئ استوائي', 'tropical beach', 'جبل جليد', 'iceberg'],
  // landmarks
  ['landmarks', 'الأهرامات', 'pyramids of giza', 'تاج محل', 'taj mahal'],
  ['landmarks', 'برج بيزا', 'leaning tower of pisa', 'الكولوسيوم', 'colosseum'],
  ['landmarks', 'بيغ بن', 'big ben', 'جسر البرج', 'tower bridge'],
  ['landmarks', 'دار أوبرا سيدني', 'sydney opera house', 'جسر البوابة الذهبية', 'golden gate bridge'],
  ['landmarks', 'ماتشو بيتشو', 'machu picchu', 'تمثال المسيح', 'christ the redeemer'],
  ['landmarks', 'قبة الصخرة', 'dome of the rock', 'آيا صوفيا', 'hagia sophia'],
  // jordan
  ['jordan', 'جبل نيبو', 'mount nebo', 'المغطس', 'bethany beyond the jordan'],
  ['jordan', 'قلعة الشوبك', 'Shobak Castle', 'أم قيس', 'Umm Qais'],
  ['jordan', 'محمية ضانا', 'Dana Biosphere Reserve', 'وادي الموجب', 'Wadi Mujib'],
  ['jordan', 'قصر عمرة', 'Qusayr Amra', 'قصر الحرانة', 'Qasr Kharana'],
  ['jordan', 'فسيفساء مادبا', 'Madaba mosaic map', 'جبل القلعة بعمّان', 'Amman Citadel'],
  ['jordan', 'جمل بوادي رم', 'camel Wadi Rum', 'بيت شعر بدوي', 'bedouin tent Jordan'],
  ['jordan', 'منسف', 'mansaf', 'كنافة نابلسية', 'knafeh'],
  ['jordan', 'السيق بالبترا', 'Petra Siq', 'البترا ليلاً', 'Petra by night'],
  // household
  ['household', 'ثلاجة', 'refrigerator', 'فرن', 'oven kitchen'],
  ['household', 'سرير', 'bed bedroom', 'كنباية', 'sofa'],
  ['household', 'مروحة', 'electric fan', 'مكيف', 'air conditioner'],
  ['household', 'مصباح طاولة', 'table lamp', 'ثريا', 'chandelier'],
  // hard: look-alikes
  ['animals', 'ذئب', 'wolf in snow', 'كلب هاسكي', 'husky dog', 'hard'],
  ['animals', 'تمساح أمريكي', 'alligator', 'تمساح النيل', 'nile crocodile', 'hard'],
  ['animals', 'أرنب بري', 'european hare', 'أرنب منزلي', 'domestic rabbit', 'hard'],
  ['animals', 'ضفدع الطين', 'toad', 'ضفدع الشجر', 'green tree frog', 'hard'],
  ['animals', 'عثة', 'moth insect', 'فراشة نهارية', 'butterfly on flower', 'hard'],
  ['animals', 'صقر', 'falcon', 'نسر ذهبي', 'golden eagle', 'hard'],
  ['animals', 'جاموس', 'water buffalo', 'بقرة سوداء', 'black cow', 'hard'],
  ['animals', 'نمر مرقط', 'leopard', 'فهد صياد', 'cheetah running', 'hard'],
  ['animals', 'دب غريزلي', 'grizzly bear', 'دب أسود', 'american black bear', 'hard'],
  ['food', 'ليمون أخضر', 'lime fruit', 'ليمون أصفر', 'lemon fruit', 'hard'],
  ['food', 'خوخ', 'peach', 'مشمش', 'apricot', 'hard'],
  ['food', 'برتقال', 'orange fruit whole', 'يوسفي', 'mandarin fruit', 'hard'],
  ['food', 'تفاح أخضر', 'green apple', 'تفاح أحمر', 'red apple on tree', 'hard'],
  ['food', 'ثوم', 'garlic', 'بصل', 'onion', 'hard'],
  ['landmarks', 'مسجد', 'mosque minaret', 'كنيسة', 'church building', 'hard'],
  ['cars', 'طيارة ركاب', 'airliner landing', 'طيارة شحن', 'cargo aircraft', 'hard'],
];
