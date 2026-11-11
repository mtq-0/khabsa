/** RFC 4180-style CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i++;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      if (ch === '\r' && src[i + 1] === '\n') i++;
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => (/[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n');
}

/**
 * Convert CSV rows to content data for a kind. Header names map to data
 * fields; list fields (forbidden, options, alternatives) use "|" separators.
 * Required columns per kind:
 *   question-pair: category, difficulty, majority, outsider
 *   word / draw-word: category, difficulty, word[, alternatives]
 *   most-likely: category, text
 *   taboo-card: category, difficulty, word, forbidden
 *   trivia: category, difficulty, question, options, answer (0-3)
 */
export function csvToItems(kind: string, text: string): { category: string; difficulty: string; data: Record<string, unknown> }[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (r[i] ?? '').trim() : '';
  };
  const list = (v: string) => v.split('|').map((s) => s.trim()).filter(Boolean);
  return rows.slice(1).map((r) => {
    const category = col(r, 'category') || 'custom';
    const difficulty = col(r, 'difficulty') || 'medium';
    let data: Record<string, unknown>;
    switch (kind) {
      case 'question-pair':
        data = { majority: col(r, 'majority'), outsider: col(r, 'outsider') };
        break;
      case 'word':
      case 'draw-word': {
        const alts = list(col(r, 'alternatives'));
        data = { word: col(r, 'word'), ...(alts.length ? { alternatives: alts } : {}) };
        break;
      }
      case 'most-likely':
        data = { text: col(r, 'text') };
        break;
      case 'taboo-card':
        data = { word: col(r, 'word'), forbidden: list(col(r, 'forbidden')) };
        break;
      case 'trivia':
        data = { question: col(r, 'question'), options: list(col(r, 'options')), answer: Number(col(r, 'answer')) };
        break;
      default:
        data = {};
    }
    return { category, difficulty, data };
  });
}
