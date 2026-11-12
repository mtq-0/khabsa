/**
 * Original cartoon characters (Arab / Jordanian, funny) used as player avatars.
 * Every character is drawn from simple parts (body, headwear, face, extras) as an SVG
 * on a transparent background — the avatar gradient shows behind it.
 * Index order matches AVATAR_CHARACTERS in avatars.ts.
 */

type Skin = 'light' | 'olive' | 'tan' | 'brown';
type Eyes = 'dot' | 'happy' | 'closed' | 'wink' | 'side' | 'big' | 'kohl' | 'tired' | 'lashes';
type Glasses = 'round' | 'thick' | 'sun' | 'pilot' | 'half';
type Brows = 'normal' | 'thick' | 'angry' | 'raised' | 'worried' | 'none';
type Nose = 'small' | 'big' | 'long';
type Mouth = 'grin' | 'laugh' | 'smile' | 'gap' | 'tongue' | 'frown' | 'o' | 'smirk' | 'worried' | 'lipstick' | 'toothless' | 'teeth';
type Mustache = 'big' | 'curled' | 'thin';
type Beard = 'full' | 'goatee' | 'stubble';
type Head =
  | { t: 'shmagh'; kind: 'red' | 'white' | 'black' }
  | { t: 'hijab'; color: string; trim?: string; sparkle?: boolean }
  | { t: 'hair'; style: 'short' | 'gel' | 'messy' | 'curly' | 'long' | 'bald' | 'spiky' | 'bun'; color: string }
  | { t: 'tarboush' }
  | { t: 'taqiyah'; color?: string }
  | { t: 'cap'; color: string; label?: string }
  | { t: 'chef' }
  | { t: 'hardhat' }
  | { t: 'pilot' }
  | { t: 'nightcap'; color: string }
  | { t: 'beret'; color: string };
type Body = 'thobe' | 'shirt' | 'suit' | 'hoodie' | 'jersey' | 'coat' | 'embroidered' | 'vest' | 'apron' | 'tshirt' | 'uniform';
type Extra =
  | 'dallah' | 'finjan' | 'tea' | 'falafel' | 'shawarma' | 'mansaf' | 'misbaha' | 'books' | 'phone' | 'football' | 'whistle'
  | 'stethoscope' | 'chain' | 'rose' | 'brush' | 'ladle' | 'heart' | 'zzz' | 'sweat' | 'steam' | 'notes' | 'bandaid'
  | 'pencil' | 'bowtie' | 'mug' | 'headphones' | 'blush' | 'stars' | 'drool' | 'card' | 'smudge' | 'tie' | 'kanafeh';

export interface CharacterSpec {
  skin: Skin;
  head: Head;
  eyes: Eyes;
  glasses?: Glasses;
  brows?: Brows;
  browColor?: string;
  nose?: Nose;
  mouth: Mouth;
  mustache?: Mustache;
  beard?: Beard;
  facialHair?: string;
  body: Body;
  bodyColor?: string;
  extras?: Extra[];
}

const OUT = '#2b1d16';
const SKIN: Record<Skin, [string, string]> = {
  light: ['#f8d7b9', '#e9b48f'],
  olive: ['#eab78c', '#d2966a'],
  tan: ['#c98b5e', '#ad7148'],
  brown: ['#9a6240', '#7d4c30'],
};

const sw = (w = 1.4) => `stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

// ------------------------------------------------------------------ patterns
const DEFS = `<defs>
<pattern id="shr" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff"/><rect width="2.5" height="2.5" fill="#d32f2f"/><rect x="2.5" y="2.5" width="2.5" height="2.5" fill="#d32f2f"/></pattern>
<pattern id="shb" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff"/><path d="M0 2.5h5M2.5 0v5" stroke="#222" stroke-width="1.3"/></pattern>
<pattern id="emb" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#1f1a1a"/><path d="M1 1l4 4M5 1l-4 4" stroke="#e53935" stroke-width="1.1"/></pattern>
<pattern id="dots" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#fff"/><circle cx="2" cy="2" r=".7" fill="#cfd8dc"/></pattern>
</defs>`;

// --------------------------------------------------------------------- body
function body(s: CharacterSpec): string {
  const c = s.bodyColor;
  const shoulders = (fill: string) => `<path d="M8 101 C10 85 27 78 50 78 C73 78 90 85 92 101 Z" fill="${fill}" ${sw()}/>`;
  switch (s.body) {
    case 'thobe':
      return shoulders(c ?? '#f5f5f0') + `<path d="M50 80 L50 98" ${sw(1.1)}/><path d="M43 79 Q50 86 57 79" fill="none" ${sw(1.1)}/>`;
    case 'shirt':
      return shoulders(c ?? '#4fc3f7') + `<path d="M40 79 L50 90 L60 79 L56 77 L50 84 L44 77 Z" fill="#fff" ${sw(1.1)}/><circle cx="50" cy="94" r="1.1" fill="${OUT}"/>`;
    case 'tshirt':
      return shoulders(c ?? '#ff7043') + `<path d="M42 78 Q50 85 58 78" fill="none" ${sw(1.2)}/>`;
    case 'suit':
      return shoulders(c ?? '#263238') + `<path d="M41 78 L50 96 L59 78 Z" fill="#fff" ${sw(1.1)}/><path d="M41 78 L47 92 L43 94 M59 78 L53 92 L57 94" fill="none" ${sw(1)}/>`;
    case 'hoodie':
      return shoulders(c ?? '#5c6bc0') + `<path d="M34 80 Q50 92 66 80" fill="none" ${sw(1.3)}/><path d="M45 86 L44 96 M55 86 L56 96" ${sw(1.2)}/>`;
    case 'jersey':
      return (
        shoulders(c ?? '#d32f2f') +
        `<path d="M42 78 L50 86 L58 78" fill="none" stroke="#fff" stroke-width="2.4"/><text x="50" y="99" font-size="11" font-family="Arial, sans-serif" font-weight="700" fill="#fff" text-anchor="middle">10</text>`
      );
    case 'coat':
      return shoulders('#fafafa') + `<path d="M43 78 L50 92 L57 78" fill="${c ?? '#90caf9'}" ${sw(1.1)}/><path d="M50 92 L50 101" ${sw(1)}/><rect x="61" y="88" width="9" height="6" rx="1" fill="none" ${sw(1)}/>`;
    case 'embroidered':
      return (
        `<path d="M8 101 C10 85 27 78 50 78 C73 78 90 85 92 101 Z" fill="#1f1a1a" ${sw()}/>` +
        `<path d="M40 79 L50 101 L60 79 Z" fill="url(#emb)" ${sw(1)}/><path d="M14 92 Q50 84 86 92" fill="none" stroke="#e53935" stroke-width="2" stroke-dasharray="2 1.5"/>`
      );
    case 'vest':
      return shoulders('#fafafa') + `<path d="M18 101 C20 88 30 81 42 79 L48 101 Z M82 101 C80 88 70 81 58 79 L52 101 Z" fill="${c ?? '#c62828'}" ${sw(1.1)}/><path d="M24 92 Q32 86 40 90 M76 92 Q68 86 60 90" fill="none" stroke="#ffd54f" stroke-width="1.4"/>`;
    case 'apron':
      return shoulders(c ?? '#8d6e63') + `<path d="M36 101 L38 84 Q50 80 62 84 L64 101 Z" fill="#fff" ${sw(1.1)}/><path d="M38 84 L44 78 M62 84 L56 78" ${sw(1)}/>`;
    case 'uniform':
      return shoulders(c ?? '#1a237e') + `<path d="M42 78 L50 88 L58 78" fill="#fff" ${sw(1)}/><path d="M48 88 L50 98 L52 88 Z" fill="#111"/><rect x="62" y="86" width="10" height="3" fill="#ffca28"/>`;
  }
}

// ----------------------------------------------------------- headwear: back
function headBack(h: Head): string {
  switch (h.t) {
    case 'shmagh': {
      const fill = h.kind === 'red' ? 'url(#shr)' : h.kind === 'black' ? 'url(#shb)' : '#fbfbf7';
      return `<path d="M50 16 C74 16 84 34 82 56 C82 72 88 86 92 101 L66 101 C63 90 61 80 58 72 L42 72 C39 80 37 90 34 101 L8 101 C12 86 18 72 18 56 C16 34 26 16 50 16 Z" fill="${fill}" ${sw()}/>`;
    }
    case 'hijab':
      return `<path d="M50 17 C75 17 85 36 83 58 C82 72 87 86 91 101 L9 101 C13 86 18 72 17 58 C15 36 25 17 50 17 Z" fill="${h.color}" ${sw()}/>`;
    case 'hair':
      if (h.style === 'long') return `<path d="M50 20 C74 20 80 40 78 62 C78 76 82 86 80 96 L20 96 C18 86 22 76 22 62 C20 40 26 20 50 20 Z" fill="${h.color}" ${sw()}/>`;
      if (h.style === 'curly')
        return [ [30, 36], [70, 36], [26, 48], [74, 48], [27, 60], [73, 60] ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${h.color}" ${sw(1.2)}/>`).join('');
      return '';
    default:
      return '';
  }
}

// ---------------------------------------------------------- headwear: front
function headFront(h: Head): string {
  switch (h.t) {
    case 'shmagh': {
      const fill = h.kind === 'red' ? 'url(#shr)' : h.kind === 'black' ? 'url(#shb)' : '#fbfbf7';
      return (
        `<path d="M25 55 C24 30 36 19 50 19 C64 19 76 30 75 55 L71 55 C71 41 62 33 50 33 C38 33 29 41 29 55 Z" fill="${fill}" ${sw()}/>` +
        `<path d="M27.5 36 C35 25.5 65 25.5 72.5 36" fill="none" stroke="#151515" stroke-width="3.4" stroke-linecap="round"/>` +
        `<path d="M29 30.5 C36 20.5 64 20.5 71 30.5" fill="none" stroke="#151515" stroke-width="3.4" stroke-linecap="round"/>`
      );
    }
    case 'hijab':
      return (
        `<path fill-rule="evenodd" d="M50 21.5 C64 21.5 75.5 33 75.5 50 C75.5 67 64 79 50 79 C36 79 24.5 67 24.5 50 C24.5 33 36 21.5 50 21.5 Z M50 32 C39.5 32 31 40.5 31 52 C31 64 39.5 74 50 74 C60.5 74 69 64 69 52 C69 40.5 60.5 32 50 32 Z" fill="${h.color}" ${sw()}/>` +
        (h.trim ? `<path d="M31.5 46 C34 36 42 32.5 50 32.5 C58 32.5 66 36 68.5 46" fill="none" stroke="${h.trim}" stroke-width="2.2" stroke-dasharray="2.2 1.6"/>` : '') +
        (h.sparkle ? [ [33, 28], [64, 26], [72, 40], [28, 42] ].map(([x, y]) => `<path d="M${x} ${y - 2.6}L${x + .8} ${y - .8}L${x + 2.6} ${y}L${x + .8} ${y + .8}L${x} ${y + 2.6}L${x - .8} ${y + .8}L${x - 2.6} ${y}L${x - .8} ${y - .8}Z" fill="#fff59d"/>`).join('') : '')
      );
    case 'hair':
      return hairFront(h.style, h.color);
    case 'tarboush':
      return hairFront('short', '#2b2b2b') + `<path d="M35 34 L38.5 13 L61.5 13 L65 34 Z" fill="#c62828" ${sw()}/><ellipse cx="50" cy="13" rx="11.5" ry="2.4" fill="#b71c1c" ${sw(1.1)}/><path d="M50 12 Q60 14 63 26" fill="none" stroke="#111" stroke-width="1.6"/><circle cx="63.3" cy="27.5" r="2" fill="#111"/>`;
    case 'taqiyah':
      return `<path d="M29 40 C29 21 71 21 71 40 C64 36 36 36 29 40 Z" fill="${h.color ?? 'url(#dots)'}" ${sw()}/>`;
    case 'cap':
      return (
        hairFront('short', '#3e2723') +
        `<path d="M28 41 C27 19 73 19 72 41 Z" fill="${h.color}" ${sw()}/><path d="M50 41 C62 38 76 38 86 43 C80 47 64 47 50 44 Z" fill="${h.color}" ${sw()}/>` +
        (h.label ? `<text x="50" y="35" font-size="7.5" font-family="Arial, sans-serif" font-weight="700" fill="#111" text-anchor="middle">${h.label}</text>` : '')
      );
    case 'chef':
      return `<rect x="31" y="27" width="38" height="9" rx="2" fill="#fff" ${sw()}/>${[ [37, 20], [50, 15], [63, 20] ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#fff" ${sw()}/>`).join('')}<rect x="32" y="22" width="36" height="8" fill="#fff"/>`;
    case 'hardhat':
      return hairFront('short', '#4e342e') + `<path d="M29 38 C29 17 71 17 71 38 Z" fill="#fdd835" ${sw()}/><rect x="24" y="36" width="52" height="5" rx="2.5" fill="#fbc02d" ${sw()}/><path d="M50 18 L50 37" stroke="#f9a825" stroke-width="3"/>`;
    case 'pilot':
      return hairFront('short', '#212121') + `<path d="M27 34 C27 18 73 18 73 34 Z" fill="#1a237e" ${sw()}/><rect x="28" y="32" width="44" height="6" rx="2" fill="#111" ${sw(1)}/><path d="M44 26 L50 23 L56 26 L50 29 Z" fill="#ffca28"/>`;
    case 'nightcap':
      return hairFront('short', '#5d4037') + `<path d="M28 38 C30 16 56 10 82 30 C66 26 60 30 72 38 Z" fill="${h.color}" ${sw()}/><rect x="27" y="35" width="46" height="6" rx="3" fill="#fff" ${sw(1.1)}/><circle cx="82" cy="31" r="4.5" fill="#fff" ${sw(1.1)}/>`;
    case 'beret':
      return hairFront('long-bangs', '#4e342e') + `<ellipse cx="46" cy="27" rx="22" ry="8" transform="rotate(-10 46 27)" fill="${h.color}" ${sw()}/><path d="M48 19 L49 15" ${sw(1.6)}/>`;
  }
}

function hairFront(style: string, color: string): string {
  switch (style) {
    case 'short':
      return `<path d="M29 46 C26 22 74 22 71 46 C68 36 60 32 50 32 C40 32 32 36 29 46 Z" fill="${color}" ${sw()}/>`;
    case 'gel':
      return `<path d="M29 46 C24 24 44 14 62 18 C76 22 76 36 71 46 C68 36 60 31 50 33 C42 31 33 36 29 46 Z" fill="${color}" ${sw()}/><path d="M40 22 Q52 18 64 22 M38 27 Q52 22 68 27" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.3"/>`;
    case 'messy':
      return `<path d="M29 47 L26 34 L32 37 L31 24 L38 31 L41 19 L46 29 L51 17 L55 28 L61 19 L63 30 L70 23 L68 35 L74 34 L71 47 C66 36 58 32 50 32 C42 32 33 36 29 47 Z" fill="${color}" ${sw()}/>`;
    case 'spiky':
      return `<path d="M29 46 L24 30 L33 33 L34 17 L43 28 L50 12 L57 28 L66 17 L67 33 L76 30 L71 46 C66 36 58 32 50 32 C42 32 34 36 29 46 Z" fill="${color}" ${sw()}/>`;
    case 'curly':
      return [ [36, 28], [46, 23], [56, 23], [65, 28], [31, 38], [69, 38], [41, 31], [59, 31] ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${color}" ${sw(1.2)}/>`).join('');
    case 'long':
    case 'long-bangs':
      return `<path d="M28 50 C25 24 75 24 72 50 C70 40 64 34 58 33 C52 38 40 40 30 50 Z" fill="${color}" ${sw()}/>`;
    case 'bun':
      return `<circle cx="50" cy="19" r="8" fill="${color}" ${sw()}/>` + hairFront('short', color);
    case 'bald':
      return `<path d="M29 54 C27 46 29 42 32 40 C32 46 32 50 33 54 Z M71 54 C73 46 71 42 68 40 C68 46 68 50 67 54 Z" fill="${color}" ${sw(1)}/><ellipse cx="42" cy="32" rx="5" ry="2.5" transform="rotate(-20 42 32)" fill="#fff" fill-opacity=".55"/>`;
    default:
      return '';
  }
}

// --------------------------------------------------------------------- face
function face(s: CharacterSpec): string {
  const [skin, shade] = SKIN[s.skin];
  const covered = s.head.t === 'shmagh' || s.head.t === 'hijab';
  const ears = covered ? '' : `<ellipse cx="30" cy="52" rx="3.8" ry="5.8" fill="${skin}" ${sw()}/><ellipse cx="70" cy="52" rx="3.8" ry="5.8" fill="${skin}" ${sw()}/>`;
  return (
    `<rect x="43" y="66" width="14" height="15" fill="${shade}" ${sw(1.2)}/>` +
    ears +
    `<ellipse cx="50" cy="51" rx="20" ry="23" fill="${skin}" ${sw()}/>`
  );
}

function eyes(e: Eyes, skin: string): string {
  const dot = (x: number, dx = 0, r = 4.3, pr = 2.3) => `<ellipse cx="${x}" cy="48" rx="${r}" ry="${r + 0.8}" fill="#fff" ${sw(1.1)}/><circle cx="${x + dx}" cy="48.6" r="${pr}" fill="#1b1b1b"/><circle cx="${x + dx + 0.8}" cy="47.6" r=".8" fill="#fff"/>`;
  const arc = (x: number) => `<path d="M${x - 4} 49.5 Q${x} 44.5 ${x + 4} 49.5" fill="none" ${sw(1.8)}/>`;
  const shut = (x: number) => `<path d="M${x - 4} 48 Q${x} 51.5 ${x + 4} 48" fill="none" ${sw(1.8)}/>`;
  switch (e) {
    case 'dot': return dot(42) + dot(58);
    case 'happy': return arc(42) + arc(58);
    case 'closed': return shut(42) + shut(58);
    case 'wink': return dot(42) + arc(58);
    case 'side': return dot(42, 1.6) + dot(58, 1.6);
    case 'big': return dot(41.5, 0, 5.5, 3) + dot(58.5, 0, 5.5, 3);
    case 'kohl': return `<g stroke-width="2.4">${dot(42)}${dot(58)}</g><path d="M37 46.5 Q42 42.5 47 46.5 M53 46.5 Q58 42.5 63 46.5" fill="none" stroke="#111" stroke-width="1.8"/>`;
    case 'tired':
      return dot(42) + dot(58) + `<path d="M37.5 47.6 Q42 42 46.5 47.6 Z M53.5 47.6 Q58 42 62.5 47.6 Z" fill="${skin}" ${sw(1.1)}/><path d="M38.5 54 Q42 55.5 45.5 54 M54.5 54 Q58 55.5 61.5 54" fill="none" stroke="#8d6e63" stroke-width="1"/>`;
    case 'lashes':
      return dot(42) + dot(58) + `<path d="M37.5 45 L36 43 M39.5 43.6 L38.8 41.6 M60.5 43.6 L61.2 41.6 M62.5 45 L64 43" ${sw(1.1)}/>`;
  }
}

function glasses(g: Glasses): string {
  switch (g) {
    case 'round': return `<circle cx="42" cy="48" r="6.8" fill="#fff" fill-opacity=".15" ${sw(1.6)}/><circle cx="58" cy="48" r="6.8" fill="#fff" fill-opacity=".15" ${sw(1.6)}/><path d="M48.8 48 L51.2 48" ${sw(1.6)}/>`;
    case 'thick': return `<rect x="34" y="42.5" width="14" height="11" rx="3" fill="#bbdefb" fill-opacity=".35" stroke="#111" stroke-width="2.8"/><rect x="52" y="42.5" width="14" height="11" rx="3" fill="#bbdefb" fill-opacity=".35" stroke="#111" stroke-width="2.8"/><path d="M48 47 L52 47" stroke="#111" stroke-width="2.6"/><path d="M36.5 45 L40 44.2 M54.5 45 L58 44.2" stroke="#fff" stroke-width="1.2"/>`;
    case 'sun': return `<path d="M33 44 L48 44 L47 51 Q41 55 35 51 Z M52 44 L67 44 L65 51 Q59 55 53 51 Z" fill="#111" ${sw(1.2)}/><path d="M48 45.5 L52 45.5" ${sw(1.8)}/><path d="M36 46 L40 46" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/>`;
    case 'pilot': return `<path d="M34 44 L48 44 Q48 55 41 54 Q34 53 34 44 Z M52 44 L66 44 Q66 53 59 54 Q52 55 52 44 Z" fill="#263238" fill-opacity=".85" stroke="#b0bec5" stroke-width="1.5"/><path d="M48 44.5 L52 44.5" stroke="#b0bec5" stroke-width="1.5"/>`;
    case 'half': return `<path d="M35 50 L48 50 Q47 56 41.5 56 Q36 56 35 50 Z M52 50 L65 50 Q64 56 58.5 56 Q53 56 52 50 Z" fill="#fff" fill-opacity=".2" ${sw(1.5)}/><path d="M48 51 L52 51" ${sw(1.4)}/>`;
  }
}

function brows(b: Brows, color: string): string {
  const st = `fill="none" stroke="${color}" stroke-linecap="round"`;
  switch (b) {
    case 'normal': return `<path d="M37.5 41 Q42 39 46 41 M54 41 Q58 39 62.5 41" ${st} stroke-width="2"/>`;
    case 'thick': return `<path d="M36 41.5 Q42 37 47.5 40.5 M52.5 40.5 Q58 37 64 41.5" ${st} stroke-width="3.8"/>`;
    case 'angry': return `<path d="M36.5 38.5 L47 43 M63.5 38.5 L53 43" ${st} stroke-width="3.2"/>`;
    case 'raised': return `<path d="M37 38 Q42 34 46.5 37.5 M53.5 37.5 Q58 34 63 38" ${st} stroke-width="2.2"/>`;
    case 'worried': return `<path d="M37 41 L46.5 38 M63 41 L53.5 38" ${st} stroke-width="2.4"/>`;
    case 'none': return '';
  }
}

function nose(n: Nose, shade: string): string {
  switch (n) {
    case 'small': return `<path d="M48.5 55 Q50 57 51.5 55" fill="none" ${sw(1.4)}/>`;
    case 'big': return `<ellipse cx="50" cy="55" rx="5.6" ry="4.6" fill="${shade}" ${sw(1.3)}/><ellipse cx="48.4" cy="53.6" rx="1.4" ry="1" fill="#fff" fill-opacity=".5"/>`;
    case 'long': return `<path d="M50 47 L46.5 57 Q50 59.5 53.5 57" fill="${shade}" ${sw(1.3)}/>`;
  }
}

function mouth(m: Mouth): string {
  const dark = '#5d1a1a';
  switch (m) {
    case 'grin': return `<path d="M41 62 Q50 72 59 62 Z" fill="${dark}" ${sw(1.3)}/><path d="M42.4 62.5 L57.6 62.5 Q57 65 50 65.5 Q43 65 42.4 62.5 Z" fill="#fff"/>`;
    case 'laugh': return `<path d="M39 61 Q50 77 61 61 Z" fill="${dark}" ${sw(1.3)}/><path d="M40.6 61.6 L59.4 61.6 Q58.6 64.5 50 65 Q41.5 64.5 40.6 61.6 Z" fill="#fff"/><ellipse cx="50" cy="69.6" rx="5.5" ry="2.8" fill="#f06292"/>`;
    case 'smile': return `<path d="M43 63 Q50 68.5 57 63" fill="none" ${sw(1.9)}/>`;
    case 'gap': return `<path d="M41 62 Q50 72 59 62 Z" fill="${dark}" ${sw(1.3)}/><path d="M42.4 62.5 L48.6 62.5 L48.6 65.4 Q44 65 42.4 62.5 Z M51.4 62.5 L57.6 62.5 Q56 65 51.4 65.4 Z" fill="#fff"/>`;
    case 'tongue': return `<path d="M42 63 Q50 68 58 63" fill="none" ${sw(1.9)}/><path d="M46.5 64.6 Q46.5 72 50.5 72 Q54.5 72 54 64.4 Z" fill="#f06292" ${sw(1.2)}/><path d="M50.3 65.5 L50.3 69" stroke="#c2185b" stroke-width="1"/>`;
    case 'frown': return `<path d="M43 67 Q50 61.5 57 67" fill="none" ${sw(1.9)}/>`;
    case 'o': return `<ellipse cx="50" cy="65" rx="3.8" ry="4.8" fill="${dark}" ${sw(1.3)}/>`;
    case 'smirk': return `<path d="M43.5 64.5 Q52 67 57.5 61" fill="none" ${sw(1.9)}/>`;
    case 'worried': return `<path d="M42 65 Q45 62.5 48 65 Q51 67.5 54 65 Q57 62.5 58.5 65" fill="none" ${sw(1.7)}/>`;
    case 'lipstick': return `<path d="M41 62 Q50 72 59 62 Z" fill="${dark}" stroke="#e91e63" stroke-width="2.6" stroke-linejoin="round"/><path d="M43 63 L57 63 Q56.5 65 50 65.4 Q43.5 65 43 63 Z" fill="#fff"/>`;
    case 'toothless': return `<path d="M42 62 Q50 71 58 62 Z" fill="${dark}" ${sw(1.3)}/><rect x="44.4" y="62.4" width="2.6" height="2.6" fill="#fff"/><rect x="53.2" y="62.4" width="2.6" height="2.2" fill="#fff"/>`;
    case 'teeth': return `<rect x="41" y="61" width="18" height="7" rx="2.5" fill="#fff" ${sw(1.3)}/><path d="M41 64.5 L59 64.5 M45.5 61 L45.5 68 M50 61 L50 68 M54.5 61 L54.5 68" stroke="${OUT}" stroke-width=".9"/>`;
  }
}

function mustache(m: Mustache, color: string): string {
  switch (m) {
    case 'big': return `<path d="M35 62 C36 55 44 54.5 50 58 C56 54.5 64 55 65 62 C61 60.5 56 61.5 50 61 C44 61.5 39 60.5 35 62 Z" fill="${color}" ${sw(1.2)}/>`;
    case 'curled': return `<path d="M38 60 C40 55.5 46 55.5 50 58 C54 55.5 60 55.5 62 60 C58 59 54 60 50 60.5 C46 60 42 59 38 60 Z" fill="${color}" ${sw(1.2)}/><path d="M38.5 60 C34 61 32 57 35 55.5 M61.5 60 C66 61 68 57 65 55.5" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'thin': return `<path d="M43 59.5 Q50 57 57 59.5" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`;
  }
}

function beard(b: Beard, color: string): string {
  switch (b) {
    case 'full': return `<path d="M30 53 C30 72 38 84 50 84 C62 84 70 72 70 53 C69 62 64 69 58 69.5 C55 67 45 67 42 69.5 C36 69 31 62 30 53 Z" fill="${color}" ${sw(1.2)}/>`;
    case 'goatee': return `<path d="M45 69.5 Q50 79 55 69.5 Q50 71.5 45 69.5 Z" fill="${color}" ${sw(1.1)}/>`;
    case 'stubble': return `<path d="M31 56 C32 70 40 74 50 74 C60 74 68 70 69 56 C66 66 60 69 50 69.5 C40 69 34 66 31 56 Z" fill="${color}" fill-opacity=".28"/>`;
  }
}

// ------------------------------------------------------------------- extras
const hand = (x: number, y: number, skin: string) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="5" fill="${skin}" ${sw(1.2)}/>`;

function extra(x: Extra, skin: string): string {
  switch (x) {
    case 'dallah':
      return `<path d="M71 96 L73 80 Q80 74 87 80 L89 96 Z" fill="#f9a825" ${sw()}/><path d="M73 84 Q64 80 62 72" fill="none" stroke="#f9a825" stroke-width="3.2" stroke-linecap="round"/><path d="M73 84 Q64 80 62 72" fill="none" ${sw(0.8)}/><path d="M76 78 L80 69 L84 78 Z" fill="#fbc02d" ${sw(1.1)}/><circle cx="80" cy="68" r="1.6" fill="#fbc02d" ${sw(1)}/>` + hand(87, 92, skin);
    case 'finjan':
      return hand(78, 92, skin) + `<path d="M71 82 L85 82 L83 90 Q78 92 73 90 Z" fill="#fff" ${sw(1.2)}/><path d="M72 84 L84 84" stroke="#8bc34a" stroke-width="1.6"/><path d="M75 79 Q76 76 75 73 M80 79 Q81 76 80 73" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>`;
    case 'tea':
      return hand(79, 93, skin) + `<path d="M72 74 L86 74 L84 90 Q79 92 74 90 Z" fill="#fff" fill-opacity=".55" ${sw(1.2)}/><path d="M72.8 79 L85.2 79 L84 90 Q79 92 74 90 Z" fill="#c62828" fill-opacity=".85"/><path d="M81 73 L86 62" ${sw(1.3)}/>`;
    case 'falafel':
      return hand(82, 94, skin) + `<path d="M68 90 L80 66 Q90 68 92 76 Z" fill="#f3d9a4" ${sw(1.2)}/><circle cx="80" cy="72" r="3.2" fill="#8d5524" ${sw(1)}/><circle cx="85" cy="74" r="3" fill="#7b4a1f" ${sw(1)}/><path d="M77 70 Q80 66 84 69 Q88 67 89 71" fill="none" stroke="#43a047" stroke-width="2"/>`;
    case 'shawarma':
      return hand(80, 94, skin) + `<path d="M70 92 L76 66 L86 66 L90 92 Z" fill="#f5e1b8" ${sw(1.2)}/><path d="M76 66 Q81 60 86 66 Z" fill="#a1662f" ${sw(1.1)}/><path d="M74 76 L88 80 M73 84 L89 87" stroke="#e0c08a" stroke-width="1.4"/><path d="M78 64 L80 61 M83 64 L84 60" stroke="#4caf50" stroke-width="1.6"/>`;
    case 'mansaf':
      return `<ellipse cx="74" cy="93" rx="20" ry="6" fill="#cfd8dc" ${sw(1.2)}/><path d="M57 92 Q74 72 91 92 Z" fill="#fff3c4" ${sw(1.2)}/><circle cx="70" cy="84" r="3.5" fill="#8d6e63" ${sw(1)}/><circle cx="78" cy="83" r="3.2" fill="#795548" ${sw(1)}/><circle cx="74" cy="80" r="3" fill="#8d6e63" ${sw(1)}/><circle cx="66" cy="88" r=".9" fill="#c8a165"/><circle cx="82" cy="88" r=".9" fill="#c8a165"/><circle cx="75" cy="88" r=".9" fill="#c8a165"/>`;
    case 'misbaha':
      return Array.from({ length: 11 }, (_, i) => { const a = (i / 11) * Math.PI * 2; return `<circle cx="${(78 + Math.cos(a) * 7).toFixed(1)}" cy="${(84 + Math.sin(a) * 6).toFixed(1)}" r="1.9" fill="#00897b" ${sw(0.7)}/>`; }).join('') + `<path d="M78 90 L78 97" stroke="#00897b" stroke-width="1.6"/><circle cx="78" cy="98" r="1.5" fill="#ffca28"/>` + hand(78, 78, skin);
    case 'books':
      return `<rect x="66" y="88" width="26" height="6" rx="1" fill="#e53935" ${sw(1.1)}/><rect x="68" y="82" width="22" height="6" rx="1" fill="#1e88e5" ${sw(1.1)}/><rect x="65" y="76" width="24" height="6" rx="1" fill="#43a047" ${sw(1.1)}/><path d="M68 79 L86 79 M70 85 L87 85 M69 91 L89 91" stroke="#fff" stroke-width=".9"/>`;
    case 'phone':
      return hand(79, 92, skin) + `<rect x="73" y="68" width="13" height="22" rx="2.5" fill="#263238" ${sw(1.2)}/><rect x="75" y="71" width="9" height="15" rx="1" fill="#4fc3f7"/><circle cx="79.5" cy="88" r=".9" fill="#90a4ae"/>`;
    case 'football':
      return `<circle cx="80" cy="86" r="10" fill="#fff" ${sw(1.3)}/><path d="M80 81 L84.5 84.2 L82.8 89.5 L77.2 89.5 L75.5 84.2 Z" fill="#111"/><path d="M80 81 L80 76.5 M84.5 84.2 L89.3 83 M82.8 89.5 L85.5 94 M77.2 89.5 L74.5 94 M75.5 84.2 L70.7 83" stroke="#111" stroke-width="1.1"/>`;
    case 'whistle':
      return `<path d="M50 81 L60 92" stroke="#e53935" stroke-width="1.4"/><rect x="58" y="89" width="10" height="6" rx="3" fill="#b0bec5" ${sw(1.1)}/><circle cx="66" cy="92" r="4" fill="#cfd8dc" ${sw(1.1)}/>`;
    case 'card':
      return hand(80, 92, skin) + `<rect x="74" y="64" width="12" height="17" rx="1.5" transform="rotate(12 80 72)" fill="#fdd835" ${sw(1.2)}/>`;
    case 'stethoscope':
      return `<path d="M40 79 Q38 92 47 94 Q56 92 60 79" fill="none" stroke="#455a64" stroke-width="2"/><circle cx="47" cy="95" r="3" fill="#90a4ae" ${sw(1.1)}/>`;
    case 'chain':
      return `<path d="M38 79 Q50 96 62 79" fill="none" stroke="#fdd835" stroke-width="2.4" stroke-dasharray="2.4 1"/><circle cx="50" cy="90" r="3.2" fill="#fbc02d" ${sw(1)}/>`;
    case 'rose':
      return `<path d="M64 98 L62 84" stroke="#2e7d32" stroke-width="1.8"/><path d="M62 90 Q57 87 58 84 Q62 86 62 90" fill="#43a047"/><circle cx="62" cy="82" r="4.5" fill="#e53935" ${sw(1.1)}/><path d="M60 81 Q62 79 64 82" fill="none" stroke="#b71c1c" stroke-width="1"/>`;
    case 'brush':
      return hand(80, 93, skin) + `<path d="M74 92 L88 66" stroke="#8d6e63" stroke-width="3" stroke-linecap="round"/><path d="M86 70 L91 60 Q93 64 89 72 Z" fill="#e91e63" ${sw(1)}/>`;
    case 'ladle':
      return hand(80, 93, skin) + `<path d="M77 92 L82 70" stroke="#a1887f" stroke-width="3" stroke-linecap="round"/><ellipse cx="83" cy="66" rx="5.5" ry="4.5" fill="#bcaaa4" ${sw(1.2)}/>`;
    case 'kanafeh':
      return hand(80, 94, skin) + `<path d="M68 86 L92 86 L90 91 L70 91 Z" fill="#cfd8dc" ${sw(1.1)}/><path d="M70 86 Q80 76 90 86 Z" fill="#ef6c00" ${sw(1.1)}/><path d="M73 83 L87 83" stroke="#fff176" stroke-width="1.4" stroke-dasharray="1.4 1.4"/><circle cx="80" cy="80" r="1" fill="#7cb342"/>`;
    case 'heart':
      return `<path d="M80 30 C80 25 87 24 87 29.5 C87 34 80 38 80 38 C80 38 73 34 73 29.5 C73 24 80 25 80 30 Z" fill="#ff4081" ${sw(1.1)}/>`;
    case 'zzz':
      return `<text x="70" y="26" font-size="11" font-family="Arial, sans-serif" font-weight="700" fill="#e3f2fd" stroke="${OUT}" stroke-width=".8">Z</text><text x="80" y="17" font-size="8" font-family="Arial, sans-serif" font-weight="700" fill="#e3f2fd" stroke="${OUT}" stroke-width=".7">z</text><text x="87" y="10" font-size="6" font-family="Arial, sans-serif" font-weight="700" fill="#e3f2fd">z</text>`;
    case 'sweat':
      return `<path d="M70 32 Q66.5 38 70 40 Q73.5 38 70 32 Z" fill="#4fc3f7" ${sw(1)}/>`;
    case 'steam':
      return `<path d="M22 22 q-3 -3 0 -6 q3 -3 0 -6 M78 22 q3 -3 0 -6 q-3 -3 0 -6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'notes':
      return `<path d="M76 30 L76 20 L84 18 L84 28" fill="none" ${sw(1.4)}/><circle cx="74.5" cy="30" r="2.4" fill="#fff" ${sw(1)}/><circle cx="82.5" cy="28" r="2.4" fill="#fff" ${sw(1)}/><path d="M19 34 L19 26" ${sw(1.4)}/><circle cx="17.5" cy="34" r="2.2" fill="#fff" ${sw(1)}/>`;
    case 'bandaid':
      return `<rect x="58" y="56" width="10" height="4.5" rx="2" transform="rotate(-25 63 58)" fill="#ffcc80" ${sw(0.9)}/><path d="M61.5 59 L64.5 57" stroke="#e0a060" stroke-width=".8"/>`;
    case 'pencil':
      return `<path d="M62 41 L77 37" stroke="#fbc02d" stroke-width="3" stroke-linecap="round"/><path d="M77 37 L80.4 36.2" stroke="#5d4037" stroke-width="2" stroke-linecap="round"/><path d="M61 41.3 L63 40.8" stroke="#f48fb1" stroke-width="3" stroke-linecap="round"/>`;
    case 'bowtie':
      return `<path d="M50 80 L42 76 L42 84 Z M50 80 L58 76 L58 84 Z" fill="#c62828" ${sw(1.1)}/><circle cx="50" cy="80" r="1.8" fill="#b71c1c" ${sw(1)}/>`;
    case 'tie':
      return `<path d="M48 79 L52 79 L54 96 L50 99 L46 96 Z" fill="#c62828" ${sw(1)}/>`;
    case 'mug':
      return hand(78, 93, skin) + `<rect x="71" y="72" width="14" height="16" rx="2" fill="#fff" ${sw(1.2)}/><path d="M85 76 Q90 76 90 80 Q90 84 85 84" fill="none" ${sw(1.4)}/><text x="78" y="83" font-size="6" font-family="Arial, sans-serif" font-weight="700" fill="#7c3aed" text-anchor="middle">&lt;/&gt;</text><path d="M75 70 Q76 67 75 64 M80 70 Q81 67 80 64" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.1"/>`;
    case 'headphones':
      return `<path d="M27 50 C25 22 75 22 73 50" fill="none" stroke="#212121" stroke-width="3.4"/><rect x="22" y="44" width="9" height="14" rx="4" fill="#e91e63" ${sw(1.2)}/><rect x="69" y="44" width="9" height="14" rx="4" fill="#e91e63" ${sw(1.2)}/>`;
    case 'blush':
      return `<ellipse cx="36" cy="58" rx="4" ry="2.4" fill="#ff8a80" fill-opacity=".7"/><ellipse cx="64" cy="58" rx="4" ry="2.4" fill="#ff8a80" fill-opacity=".7"/>`;
    case 'stars':
      return [ [20, 24, 3.2], [82, 20, 3.8], [86, 36, 2.4] ].map(([x, y, r]) => `<path d="M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z" fill="#ffee58" ${sw(0.8)}/>`).join('');
    case 'drool':
      return `<path d="M54 66 Q53 72 55 74 Q57 72 55.5 66 Z" fill="#81d4fa" ${sw(0.8)}/>`;
    case 'smudge':
      return `<ellipse cx="62" cy="59" rx="3.4" ry="2" fill="#29b6f6" fill-opacity=".85"/><ellipse cx="38" cy="38" rx="2.4" ry="1.6" fill="#ffca28" fill-opacity=".9"/>`;
  }
}

// ------------------------------------------------------------- characters
export const CHARACTERS: { name: string; spec: CharacterSpec }[] = [
  { name: 'أبو العبد', spec: { skin: 'olive', head: { t: 'shmagh', kind: 'red' }, eyes: 'happy', brows: 'thick', nose: 'big', mouth: 'grin', mustache: 'big', body: 'thobe' } },
  { name: 'أم العبد', spec: { skin: 'olive', head: { t: 'hijab', color: '#212121', trim: '#e53935' }, eyes: 'happy', brows: 'normal', nose: 'small', mouth: 'laugh', body: 'embroidered', extras: ['blush', 'ladle'] } },
  { name: 'الحجّي أبو صالح', spec: { skin: 'tan', head: { t: 'shmagh', kind: 'white' }, eyes: 'dot', glasses: 'round', brows: 'thick', browColor: '#eeeeee', nose: 'big', mouth: 'smile', mustache: 'big', beard: 'full', facialHair: '#f5f5f5', body: 'thobe', bodyColor: '#d7ccc8', extras: ['misbaha'] } },
  { name: 'أبو شنب سوّاق التكسي', spec: { skin: 'olive', head: { t: 'cap', color: '#fdd835', label: 'TAXI' }, eyes: 'dot', glasses: 'sun', nose: 'big', mouth: 'grin', mustache: 'curled', body: 'shirt', bodyColor: '#90a4ae' } },
  { name: 'بيّاع الفلافل', spec: { skin: 'tan', head: { t: 'taqiyah' }, eyes: 'happy', brows: 'normal', nose: 'big', mouth: 'gap', beard: 'stubble', body: 'apron', bodyColor: '#6d4c41', extras: ['falafel'] } },
  { name: 'القهوجي', spec: { skin: 'olive', head: { t: 'tarboush' }, eyes: 'wink', brows: 'raised', nose: 'long', mouth: 'smile', mustache: 'curled', body: 'vest', extras: ['dallah'] } },
  { name: 'الشب الكول', spec: { skin: 'light', head: { t: 'hair', style: 'gel', color: '#3e2723' }, eyes: 'dot', glasses: 'sun', nose: 'small', mouth: 'smirk', beard: 'stubble', body: 'shirt', bodyColor: '#212121', extras: ['chain'] } },
  { name: 'البنت المهضومة', spec: { skin: 'light', head: { t: 'hijab', color: '#f48fb1' }, eyes: 'wink', brows: 'normal', nose: 'small', mouth: 'grin', body: 'tshirt', bodyColor: '#ec407a', extras: ['blush', 'heart'] } },
  { name: 'الولد الشقي', spec: { skin: 'olive', head: { t: 'hair', style: 'messy', color: '#4e342e' }, eyes: 'big', brows: 'raised', nose: 'small', mouth: 'tongue', body: 'tshirt', bodyColor: '#26a69a', extras: ['bandaid'] } },
  { name: 'تيتا', spec: { skin: 'light', head: { t: 'hijab', color: '#fafafa', trim: '#90caf9' }, eyes: 'happy', glasses: 'half', brows: 'normal', browColor: '#bdbdbd', nose: 'small', mouth: 'toothless', body: 'embroidered', extras: ['blush', 'kanafeh'] } },
  { name: 'البدوي', spec: { skin: 'brown', head: { t: 'shmagh', kind: 'red' }, eyes: 'kohl', brows: 'thick', nose: 'long', mouth: 'smile', mustache: 'thin', beard: 'goatee', body: 'thobe', bodyColor: '#8d6e63', extras: ['finjan'] } },
  { name: 'طالب التوجيهي', spec: { skin: 'olive', head: { t: 'hair', style: 'messy', color: '#212121' }, eyes: 'tired', glasses: 'thick', brows: 'worried', nose: 'small', mouth: 'worried', body: 'hoodie', bodyColor: '#78909c', extras: ['books', 'sweat'] } },
  { name: 'الأستاذ', spec: { skin: 'light', head: { t: 'hair', style: 'bald', color: '#616161' }, eyes: 'dot', glasses: 'half', brows: 'raised', nose: 'long', mouth: 'o', mustache: 'big', body: 'suit', bodyColor: '#795548', extras: ['tie', 'pencil'] } },
  { name: 'لاعب النشامى', spec: { skin: 'tan', head: { t: 'hair', style: 'spiky', color: '#212121' }, eyes: 'happy', brows: 'thick', nose: 'small', mouth: 'laugh', body: 'jersey', extras: ['football', 'sweat'] } },
  { name: 'الشيف أبو المناسف', spec: { skin: 'olive', head: { t: 'chef' }, eyes: 'happy', brows: 'thick', nose: 'big', mouth: 'grin', mustache: 'curled', body: 'apron', bodyColor: '#fafafa', extras: ['mansaf'] } },
  { name: 'اليوتيوبر', spec: { skin: 'light', head: { t: 'hair', style: 'curly', color: '#6d4c41' }, eyes: 'big', brows: 'raised', nose: 'small', mouth: 'o', body: 'hoodie', bodyColor: '#ab47bc', extras: ['headphones', 'phone', 'stars'] } },
  { name: 'أم العروس', spec: { skin: 'olive', head: { t: 'hijab', color: '#7b1fa2', sparkle: true }, eyes: 'lashes', brows: 'raised', nose: 'small', mouth: 'lipstick', body: 'tshirt', bodyColor: '#6a1b9a', extras: ['blush', 'notes'] } },
  { name: 'العريس', spec: { skin: 'olive', head: { t: 'hair', style: 'gel', color: '#212121' }, eyes: 'big', brows: 'worried', nose: 'small', mouth: 'teeth', beard: 'stubble', body: 'suit', extras: ['bowtie', 'rose', 'sweat'] } },
  { name: 'أبو نومة', spec: { skin: 'tan', head: { t: 'nightcap', color: '#5c6bc0' }, eyes: 'closed', brows: 'normal', nose: 'big', mouth: 'o', mustache: 'thin', body: 'tshirt', bodyColor: '#9fa8da', extras: ['zzz', 'drool'] } },
  { name: 'أبو زعل', spec: { skin: 'olive', head: { t: 'hair', style: 'short', color: '#3e2723' }, eyes: 'dot', brows: 'angry', nose: 'big', mouth: 'frown', mustache: 'big', body: 'shirt', bodyColor: '#e53935', extras: ['steam'] } },
  { name: 'المبرمج', spec: { skin: 'light', head: { t: 'hair', style: 'messy', color: '#5d4037' }, eyes: 'tired', glasses: 'round', brows: 'normal', nose: 'small', mouth: 'smile', beard: 'full', facialHair: '#5d4037', body: 'hoodie', bodyColor: '#37474f', extras: ['mug'] } },
  { name: 'الدكتورة', spec: { skin: 'light', head: { t: 'hijab', color: '#4fc3f7' }, eyes: 'dot', brows: 'normal', nose: 'small', mouth: 'grin', body: 'coat', bodyColor: '#80deea', extras: ['stethoscope'] } },
  { name: 'الحكم', spec: { skin: 'tan', head: { t: 'hair', style: 'bald', color: '#424242' }, eyes: 'side', brows: 'angry', nose: 'big', mouth: 'o', mustache: 'thin', body: 'shirt', bodyColor: '#212121', extras: ['whistle', 'card'] } },
  { name: 'خالتو الحشرية', spec: { skin: 'olive', head: { t: 'hijab', color: '#ff7043', trim: '#ffe082' }, eyes: 'side', brows: 'raised', nose: 'small', mouth: 'smirk', body: 'tshirt', bodyColor: '#8e24aa', extras: ['phone'] } },
  { name: 'المهندس', spec: { skin: 'tan', head: { t: 'hardhat' }, eyes: 'dot', brows: 'thick', nose: 'big', mouth: 'grin', mustache: 'big', body: 'shirt', bodyColor: '#1565c0', extras: ['pencil'] } },
  { name: 'الدبّيك', spec: { skin: 'olive', head: { t: 'shmagh', kind: 'black' }, eyes: 'happy', brows: 'raised', nose: 'small', mouth: 'laugh', mustache: 'thin', body: 'thobe', bodyColor: '#212121', extras: ['notes', 'stars'] } },
  { name: 'سيدو', spec: { skin: 'light', head: { t: 'hair', style: 'bald', color: '#eeeeee' }, eyes: 'happy', glasses: 'round', brows: 'thick', browColor: '#eeeeee', nose: 'big', mouth: 'smile', mustache: 'big', facialHair: '#f5f5f5', body: 'vest', bodyColor: '#5d4037', extras: ['tea'] } },
  { name: 'أبو الشاورما', spec: { skin: 'olive', head: { t: 'cap', color: '#e53935' }, eyes: 'wink', brows: 'thick', nose: 'big', mouth: 'grin', beard: 'stubble', body: 'apron', bodyColor: '#c62828', extras: ['shawarma'] } },
  { name: 'الفنّانة', spec: { skin: 'light', head: { t: 'beret', color: '#e53935' }, eyes: 'lashes', brows: 'normal', nose: 'small', mouth: 'smile', body: 'tshirt', bodyColor: '#ffca28', extras: ['brush', 'smudge'] } },
  { name: 'الكابتن الطيّار', spec: { skin: 'tan', head: { t: 'pilot' }, eyes: 'dot', glasses: 'pilot', nose: 'small', mouth: 'smirk', mustache: 'big', body: 'uniform' } },
  { name: 'الجمل أبو سنام', spec: { skin: 'tan', head: { t: 'shmagh', kind: 'red' }, eyes: 'tired', nose: 'big', mouth: 'teeth', body: 'thobe' } },
  { name: 'بسبس قطّة الحارة', spec: { skin: 'light', head: { t: 'hair', style: 'short', color: '#9e9e9e' }, eyes: 'side', nose: 'small', mouth: 'smirk', body: 'tshirt' } },
];

// ---------------------------------------------------------------- animals
function camel(): string {
  const fur = '#d9a066', dark = '#b97f45';
  return (
    `<path d="M10 101 C12 86 28 80 50 80 C72 80 88 86 90 101 Z" fill="${fur}" ${sw()}/>` +
    headBack({ t: 'shmagh', kind: 'red' }) +
    `<rect x="42" y="64" width="16" height="18" fill="${dark}" ${sw(1.2)}/>` +
    `<ellipse cx="50" cy="44" rx="17" ry="17" fill="${fur}" ${sw()}/>` +
    `<path d="M33 58 C33 50 67 50 67 58 C67 74 60 80 50 80 C40 80 33 74 33 58 Z" fill="${fur}" ${sw()}/>` +
    `<ellipse cx="44" cy="63" rx="2" ry="1.3" fill="${OUT}"/><ellipse cx="56" cy="63" rx="2" ry="1.3" fill="${OUT}"/>` +
    `<path d="M38 70 Q50 80 62 70 Q61 76 50 77 Q39 76 38 70 Z" fill="#c48550" ${sw(1.2)}/><rect x="45" y="70.5" width="4.2" height="4.4" fill="#fff" ${sw(0.8)}/><rect x="50.8" y="70.5" width="4.2" height="4.4" fill="#fff" ${sw(0.8)}/>` +
    `<ellipse cx="42" cy="45" rx="4.4" ry="4.8" fill="#fff" ${sw(1.1)}/><circle cx="42.5" cy="46" r="2.2" fill="#1b1b1b"/><ellipse cx="58" cy="45" rx="4.4" ry="4.8" fill="#fff" ${sw(1.1)}/><circle cx="58.5" cy="46" r="2.2" fill="#1b1b1b"/>` +
    `<path d="M37.4 45 Q42 39.5 46.6 45 Z M53.4 45 Q58 39.5 62.6 45 Z" fill="${fur}" ${sw(1.1)}/><path d="M37.5 44.5 L35.6 42.6 M39.6 42.4 L38.8 40.4 M60.4 42.4 L61.2 40.4 M62.5 44.5 L64.4 42.6" ${sw(1)}/>` +
    headFront({ t: 'shmagh', kind: 'red' })
  );
}

function cat(): string {
  const fur = '#9e9e9e', light = '#e0e0e0';
  return (
    `<path d="M10 101 C12 86 28 79 50 79 C72 79 88 86 90 101 Z" fill="${fur}" ${sw()}/><path d="M36 101 Q50 82 64 101 Z" fill="${light}"/>` +
    `<path d="M29 40 L27 14 L46 29 Z" fill="${fur}" ${sw()}/><path d="M32 33 L31 21 L41 29 Z" fill="#f8bbd0"/>` +
    `<path d="M71 40 L73 14 L66 20 L68 24 L62 26 L54 29 Z" fill="${fur}" ${sw()}/>` +
    `<ellipse cx="50" cy="52" rx="23" ry="21" fill="${fur}" ${sw()}/>` +
    `<path d="M44 33 L46 40 M50 31 L50 39 M56 33 L54 40" stroke="#616161" stroke-width="2.2" stroke-linecap="round"/><path d="M27 52 L33 52 M27 57 L33 56 M73 52 L67 52 M73 57 L67 56" stroke="#616161" stroke-width="2" stroke-linecap="round"/>` +
    `<ellipse cx="50" cy="61" rx="11" ry="8" fill="${light}"/>` +
    `<ellipse cx="41" cy="49" rx="5" ry="5.4" fill="#cddc39" ${sw(1.1)}/><ellipse cx="42.4" cy="49.4" rx="1.4" ry="3.8" fill="#111"/><ellipse cx="59" cy="49" rx="5" ry="5.4" fill="#cddc39" ${sw(1.1)}/><ellipse cx="60.4" cy="49.4" rx="1.4" ry="3.8" fill="#111"/>` +
    `<path d="M35.8 47.6 L46.2 47.6 Q41 42 35.8 47.6 Z M53.8 47.6 L64.2 47.6 Q59 42 53.8 47.6 Z" fill="${fur}" ${sw(1.1)}/>` +
    `<path d="M47.6 57 L52.4 57 L50 59.6 Z" fill="#f48fb1" ${sw(1)}/><path d="M50 59.6 Q47 64 44 62 M50 59.6 Q54 64 57 61" fill="none" ${sw(1.4)}/>` +
    `<path d="M38 60 L22 57 M38 62.5 L22 64 M62 60 L78 57 M62 62.5 L78 64" stroke="#fafafa" stroke-width="1.1" stroke-linecap="round"/>` +
    `<path d="M70 22 L64 28" stroke="#e0e0e0" stroke-width="0" />`
  );
}

const urlCache = new Map<number, string>();
/** data: URL of a character (cached) — used as <img src>, so each avatar is an isolated document */
export function characterUrl(index: number): string {
  let u = urlCache.get(index);
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(characterSvg(index))}`;
    urlCache.set(index, u);
  }
  return u;
}

/** The character as a standalone SVG document (transparent background, 100x100). */
export function characterSvg(index: number): string {
  const ch = CHARACTERS[index] ?? CHARACTERS[0];
  let inner: string;
  if (ch.name.startsWith('الجمل')) inner = camel();
  else if (ch.name.startsWith('بسبس')) inner = cat();
  else {
    const s = ch.spec;
    const [skin, shade] = SKIN[s.skin];
    const hair = s.head.t === 'hair' ? s.head.color : '#3e2723';
    const fh = s.facialHair ?? (hair === '#9e9e9e' ? '#3e2723' : hair);
    const ex = s.extras ?? [];
    const behind: Extra[] = ex.filter((x) => x === 'headphones');
    inner =
      body(s) +
      headBack(s.head) +
      face(s) +
      (s.beard ? beard(s.beard, fh) : '') +
      eyes(s.eyes, skin) +
      brows(s.brows ?? 'normal', s.browColor ?? (s.head.t === 'hair' ? hair : '#3e2723')) +
      mouth(s.mouth) +
      (s.mustache ? mustache(s.mustache, fh) : '') +
      (s.nose ? nose(s.nose, shade) : '') +
      (s.glasses ? glasses(s.glasses) : '') +
      headFront(s.head) +
      behind.map((x) => extra(x, skin)).join('') +
      ex.filter((x) => !behind.includes(x)).map((x) => extra(x, skin)).join('');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${DEFS}${inner}</svg>`;
}
