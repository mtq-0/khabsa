# Content formats

All content lives in `content_items` (`kind`, `category`, `difficulty` easy|medium|hard, `status` active|pending|disabled, `data` jsonb). Duplicates (same kind + pack + normalised key) are skipped on import.

| kind | game | `data` |
|---|---|---|
| `word` | مين برا السالفة | `{"word":"منسف","alternatives":["المنسف"]}` |
| `question-pair` | الأطرش بالزفة | `{"majority":"شو أكثر فاكهة بتحبها؟","outsider":"شو أكثر فاكهة بتكرهها؟"}` |
| `picture-pair` | مين برا الصورة | `{"a":"<image uuid>","b":"<image uuid>","labelA":"تفاحة","labelB":"إجاصة","mode":"normal"}` (difficulty `hard` = subtle difference) |
| `most-likely` | مين غالباً | `{"text":"مين غالباً ينام بنص الطلعة؟"}` |
| `taboo-card` | ممنوع تحكي | `{"word":"منسف","forbidden":["جميد","رز","لحمة"]}` (3–6 forbidden) |
| `trivia` | تحدي السرعة | `{"question":"…","options":["أ","ب","ج","د"],"answer":0}` (4 distinct options) |
| `draw-word` | ارسم وخمّن، مين برا الرسمة | `{"word":"موبايل","alternatives":["تلفون"]}` |

## Bulk import (admin → المحتوى → استيراد)

- **CSV** with a header row. List fields use `|`.
  - question pairs: `category,difficulty,majority,outsider`
  - taboo: `category,difficulty,word,forbidden`
  - trivia: `category,difficulty,question,options,answer`
  - words: `category,difficulty,word,alternatives`
  - most-likely: `category,text`
- **JSON**: array of `{category, difficulty, data}`.
- **Lines**: one item per line, fields separated by `|`.

Up to 5,000 rows per request; invalid rows are reported with their index and skipped. Choose "pending" to import for review, then activate from the list. Export is available as CSV/JSON.

Categories must exist first (admin → التصنيفات). Picture pairs are created by uploading two images in admin → الصور.
