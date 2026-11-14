# نسخة GitHub Pages (بدون سيرفر)

**الرابط:** https://mtq-0.github.io/khabsa/

## كيف بتلعبوا
1. واحد منكم يفتح الرابط ويكبس **اعمل غرفة**. هاد بيصير **المضيف**.
2. المضيف بيكبس **شارك** أو **اعزم** وبيبعت الرابط لأصحابه.
3. أصحابه بيفتحوا الرابط من أي موبايل أو كمبيوتر، ومن أي بلد، وبيكتبوا أسماءهم وبيدخلوا.

## كيف بتشتغل
- ما في سيرفر. **متصفح المضيف هو السيرفر**: بيشغّل نفس محرّكات الألعاب ونفس مدير الغرف اللي بنسخة السيرفر.
- الباقي بيتصلوا فيه مباشرة عبر **WebRTC**، والاتصال مشفّر.
- خادم الربط العام تبع PeerJS بيعرّف المتصفحات على بعض بس، وما بيمر من خلاله أي إشي من اللعب.
- كل لاعب بيوصله بس اللي مسموح يشوفه: الكلمة السرية، صورته هو، دوره. اللاعبين ما بيشوفوا أسرار بعض.

## مهم تعرفه
- **المضيف لازم يخلّي الصفحة مفتوحة** طول اللعب. الأفضل يكون من كمبيوتر، لأنه الموبايل بيوقف الصفحة لما تطلع منها.
- **إذا المضيف حدّث الصفحة**، الغرفة واللعبة بيرجعوا والباقي بيرجعوا يتصلوا لحالهم. **إذا سكّرها**، الغرفة بتسكر.
- **المضيف تقنياً بيقدر يشوف الأسرار** من أدوات المطوّر بالمتصفح، لأنه هو السيرفر. للعب بين أصحاب هاد مقبول. إذا بدكم حماية كاملة ضد الغش، استخدموا نسخة السيرفر (Render).
- **بعض شبكات الموبايل** بتمنع الاتصال المباشر. إذا صاحبك ما قدر يدخل، خليه يجرب على واي فاي، أو العبوا على نسخة Render.
- **مش موجود بهالنسخة:** الحسابات، الأصحاب، المتصدرين، الإنجازات، لوحة الإدارة، والصوت. احكوا على مكالمة واتساب.

## للمطوّرين
| الأمر | شو بيعمل |
|---|---|
| `npm run build:pages` | ببني الموقع الثابت بمجلد `dist-pages/` |
| `npm run preview:pages` | بشغّله على `http://localhost:4173/khabsa/` |
| `npm run test:pages` | اختبارات بعدة متصفحات (بدها إنترنت لخادم الربط) |
| `PAGES_URL=https://mtq-0.github.io/khabsa/ npm run test:pages` | نفس الاختبارات على الموقع المنشور |

**النشر:** محتوى `dist-pages/` بيترفع على فرع `gh-pages`.

## Voice chat on the GitHub Pages edition

Voice works peer to peer (WebRTC mesh, `src/client/voice/voiceP2p.ts`), and needs no server:
- Offers, answers and ICE candidates travel over the room link. The hosting browser relays them, together with who is in voice.
- If two browsers cannot connect directly (strict mobile networks), their audio goes through the host's link instead (`voice:audio`, compressed, only while talking). Everybody who can play can also hear everybody.
- Good for rooms of up to about 8 people in voice.
- Optional TURN relay for better quality on strict networks: put the ICE servers next to the site as `turn.json` (a JSON array such as `[{"urls":"turn:…","username":"…","credential":"…"}]`, for example from a free metered.ca account). The file is loaded when somebody joins voice. Keep it out of the repo and add it to the `gh-pages` branch only, because its contents are public to everyone who opens the site.
