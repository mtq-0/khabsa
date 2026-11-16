/**
 * Painting of drawing segments (ارسم وخمّن and the shared canvas of مين برا الرسمة؟).
 * A segment is either a freehand line (pen, highlighter, dashed, spray, calligraphy, crayon,
 * soft brush, neon, rainbow, eraser), a two-point shape (line, arrow, rectangle, rounded
 * rectangle, ellipse, triangle, diamond, hexagon, star, heart, cloud) or a flood fill.
 * Everything is deterministic, so every player's canvas replays to the same picture.
 */
import type { DrawSegment, DrawTool } from '../../shared/protocol.ts';

/**
 * Palette. The first 24 entries keep their index (older drawings and the player colours of
 * مين برا الرسمة؟ refer to them); new colours are only ever appended.
 */
export const PALETTE = [
  '#111827', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#94a3b8',
  // 12 more: dark and light shades
  '#7f1d1d', '#9a3412', '#854d0e', '#14532d', '#134e4a', '#1e3a8a', '#4c1d95', '#831843', '#fca5a5', '#fdba74', '#fde68a', '#86efac',
  // skin tones, greys
  '#fde7d3', '#f6c9a4', '#e3a77c', '#c68642', '#8d5524', '#5c3a21', '#374151', '#6b7280', '#d1d5db',
  // bright, pastel and deep
  '#f43f5e', '#d946ef', '#06b6d4', '#0ea5e9', '#84cc16', '#eab308', '#bfdbfe', '#c4b5fd', '#fbcfe8', '#a5f3fc', '#d9f99d', '#fecaca', '#78350f', '#065f46', '#be123c',
];
/** Brush sizes (px on an 800 px wide board). The first 6 keep their index; the display order is SIZE_ORDER. */
export const SIZES = [3, 6, 11, 18, 30, 46, 1.5, 8.5, 14, 23, 38, 62];
export const SIZE_ORDER = SIZES.map((s, i) => [s, i])
  .sort((a, b) => a[0] - b[0])
  .map(([, i]) => i);

export const SHAPE_TOOLS: DrawTool[] = ['line', 'arrow', 'rect', 'rrect', 'ellipse', 'tri', 'diamond', 'hex', 'star', 'heart', 'cloud'];
export const isShape = (t: DrawTool | undefined): boolean => !!t && SHAPE_TOOLS.includes(t);

/** The colour of a segment: its custom colour, or the palette entry. */
export function segColor(seg: Pick<DrawSegment, 'c' | 'k'>): string {
  if (seg.k !== undefined) return '#' + seg.k.toString(16).padStart(6, '0');
  return PALETTE[seg.c] ?? '#111827';
}
export const hexToInt = (hex: string) => parseInt(hex.replace('#', '').slice(0, 6), 16) & 0xffffff;

/** Pseudo-random numbers from a seed (same on every client). */
function rng(seed: number) {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shapePath(ctx: CanvasRenderingContext2D, t: DrawTool, ax: number, ay: number, bx: number, by: number) {
  const x0 = Math.min(ax, bx);
  const x1 = Math.max(ax, bx);
  const y0 = Math.min(ay, by);
  const y1 = Math.max(ay, by);
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  ctx.beginPath();
  switch (t) {
    case 'line':
    case 'arrow':
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      break;
    case 'rect':
      ctx.rect(x0, y0, w, h);
      break;
    case 'rrect': {
      const r = Math.min(w, h) * 0.22;
      ctx.moveTo(x0 + r, y0);
      ctx.arcTo(x1, y0, x1, y1, r);
      ctx.arcTo(x1, y1, x0, y1, r);
      ctx.arcTo(x0, y1, x0, y0, r);
      ctx.arcTo(x0, y0, x1, y0, r);
      ctx.closePath();
      break;
    }
    case 'ellipse':
      ctx.ellipse(cx, cy, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
      break;
    case 'tri':
      ctx.moveTo(cx, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x0, y1);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(cx, y0);
      ctx.lineTo(x1, cy);
      ctx.lineTo(cx, y1);
      ctx.lineTo(x0, cy);
      ctx.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3;
        const px = cx + Math.cos(ang) * (w / 2);
        const py = cy + Math.sin(ang) * (h / 2);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.42;
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + Math.cos(ang) * r * (w / 2);
        const py = cy + Math.sin(ang) * r * (h / 2);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    case 'heart':
      ctx.moveTo(cx, y0 + h * 0.25);
      ctx.bezierCurveTo(cx, y0, x0, y0, x0, y0 + h * 0.35);
      ctx.bezierCurveTo(x0, y0 + h * 0.65, cx, y0 + h * 0.8, cx, y1);
      ctx.bezierCurveTo(cx, y0 + h * 0.8, x1, y0 + h * 0.65, x1, y0 + h * 0.35);
      ctx.bezierCurveTo(x1, y0, cx, y0, cx, y0 + h * 0.25);
      ctx.closePath();
      break;
    case 'cloud': {
      // puffy bumps around an ellipse
      const N = 9;
      const rx = w / 2 / 1.18;
      const ry = h / 2 / 1.18;
      const at = (a: number) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
      const ang = (i: number) => (i / N) * Math.PI * 2 + Math.PI / 2;
      const [sx, sy] = at(ang(0));
      ctx.moveTo(sx, sy);
      for (let i = 0; i < N; i++) {
        const [qx, qy] = at(ang(i + 1));
        const mid = ang(i + 0.5);
        ctx.quadraticCurveTo(cx + Math.cos(mid) * rx * 1.42, cy + Math.sin(mid) * ry * 1.42, qx, qy);
      }
      ctx.closePath();
      break;
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Paint bucket: fills the area of similar colour around the point (edges are blended under the lines). */
function floodFill(ctx: CanvasRenderingContext2D, seg: DrawSegment, px: number, py: number) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  if (!cw || !ch) return;
  const sx = Math.max(0, Math.min(cw - 1, Math.round((px / 1000) * cw)));
  const sy = Math.max(0, Math.min(ch - 1, Math.round((py / 1000) * ch)));
  const img = ctx.getImageData(0, 0, cw, ch);
  const d = img.data;
  const at = (x: number, y: number) => (y * cw + x) * 4;
  const s0 = at(sx, sy);
  const tr = d[s0];
  const tg = d[s0 + 1];
  const tb = d[s0 + 2];
  const ta = d[s0 + 3];
  const [fr, fg, fb] = hexToRgb(segColor(seg));
  if (ta === 255 && Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 6) return; // already that colour
  const TOL = 140;
  const similar = (i: number) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) + Math.abs(d[i + 3] - ta) <= TOL;
  const filled = new Uint8Array(cw * ch);
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    while (x >= 0 && !filled[y * cw + x] && similar(at(x, y))) x--;
    x++;
    let up = false;
    let down = false;
    while (x < cw && !filled[y * cw + x] && similar(at(x, y))) {
      filled[y * cw + x] = 1;
      if (y > 0) {
        const ok = !filled[(y - 1) * cw + x] && similar(at(x, y - 1));
        if (ok && !up) stack.push(x, y - 1);
        up = ok;
      }
      if (y < ch - 1) {
        const ok = !filled[(y + 1) * cw + x] && similar(at(x, y + 1));
        if (ok && !down) stack.push(x, y + 1);
        down = ok;
      }
      x++;
    }
  }
  const edge: number[] = [];
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const p = y * cw + x;
      if (filled[p]) {
        const i = p * 4;
        d[i] = fr;
        d[i + 1] = fg;
        d[i + 2] = fb;
        d[i + 3] = 255;
      } else if ((x > 0 && filled[p - 1]) || (x < cw - 1 && filled[p + 1]) || (y > 0 && filled[p - cw]) || (y < ch - 1 && filled[p + cw])) edge.push(p);
    }
  // anti-aliased edge pixels keep their line colour on top of the new fill (no light halo)
  for (const p of edge) {
    const i = p * 4;
    const a = d[i + 3] / 255;
    if (a >= 1) continue;
    d[i] = Math.round(d[i] * a + fr * (1 - a));
    d[i + 1] = Math.round(d[i + 1] * a + fg * (1 - a));
    d[i + 2] = Math.round(d[i + 2] * a + fb * (1 - a));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** A smooth path through the points (quadratic curves through the midpoints). */
function smoothPath(ctx: CanvasRenderingContext2D, xs: number[], ys: number[]) {
  ctx.beginPath();
  ctx.moveTo(xs[0], ys[0]);
  if (xs.length === 2) ctx.lineTo(xs[1], ys[1]);
  for (let i = 1; i < xs.length - 1; i++) ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
  if (xs.length > 2) ctx.lineTo(xs[xs.length - 1], ys[ys.length - 1]);
}

/**
 * See-through brushes (any opacity, highlighter, soft brush, crayon, neon) would show darker seams
 * where the pieces of one line overlap, so the pieces of such a line are always painted as ONE line.
 */
export const mergeable = (s: DrawSegment) => !s.e && !isShape(s.t) && s.t !== 'fill' && s.t !== 'spray' && (s.o !== undefined || s.t === 'hl' || s.t === 'soft' || s.t === 'crayon' || s.t === 'neon');
const sameLine = (a: DrawSegment, b: DrawSegment) => a.s === b.s && a.t === b.t && a.c === b.c && a.k === b.k && a.o === b.o && a.w === b.w && a.m === b.m;

/** the pieces of one line joined into one segment (each piece starts at the previous piece's last point) */
export function joinLine(parts: DrawSegment[]): DrawSegment {
  const p: number[] = [...parts[0].p];
  for (const s of parts.slice(1)) p.push(...(s.p[0] === p[p.length - 2] && s.p[1] === p[p.length - 1] ? s.p.slice(2) : s.p));
  return { ...parts[0], p };
}

/** groups the segments: see-through lines joined, everything else one by one */
function groups(segs: DrawSegment[]): DrawSegment[][] {
  const out: DrawSegment[][] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && mergeable(s) && mergeable(last[0]) && sameLine(last[0], s)) last.push(s);
    else out.push([s]);
  }
  return out;
}

/**
 * Paints segments onto a canvas as they arrive. A see-through line is repainted as one line on top of
 * a copy of the board taken before it started, so it never shows seams on anyone's screen.
 */
export class BoardPainter {
  private snap: HTMLCanvasElement | null = null;
  private parts: DrawSegment[] = [];

  /** paint everything again (e.g. after undo or a resize) */
  repaint(ctx: CanvasRenderingContext2D, segs: DrawSegment[]) {
    const c = ctx.canvas;
    ctx.clearRect(0, 0, c.width, c.height);
    const gs = groups(segs);
    const tail = gs.length && mergeable(gs[gs.length - 1][0]) ? gs.pop()! : null;
    for (const g of gs) paint(ctx, g.length > 1 ? joinLine(g) : g[0], c.width, c.height);
    this.parts = [];
    // the last line may still be growing: keep the board without it, so it can continue seamlessly
    if (tail) this.add(ctx, ...tail);
  }

  add(ctx: CanvasRenderingContext2D, ...segs: DrawSegment[]) {
    const c = ctx.canvas;
    for (const seg of segs) {
      if (!mergeable(seg)) {
        this.parts = [];
        paint(ctx, seg, c.width, c.height);
        continue;
      }
      if (!this.parts.length || !sameLine(this.parts[0], seg) || !this.snap || this.snap.width !== c.width || this.snap.height !== c.height) {
        this.snap ??= document.createElement('canvas');
        this.snap.width = c.width;
        this.snap.height = c.height;
        this.snap.getContext('2d')!.drawImage(c, 0, 0);
        this.parts = [];
      }
      this.parts.push(seg);
      ctx.save();
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(this.snap, 0, 0);
      ctx.restore();
      paint(ctx, joinLine(this.parts), c.width, c.height);
    }
  }

  /** the next segment starts a new line */
  reset() {
    this.parts = [];
  }
}

/** Draws one segment; coordinates are quantized to 0..1000 on both axes. Mirrored segments are drawn twice. */
export function paint(ctx: CanvasRenderingContext2D, seg: DrawSegment, w: number, h: number) {
  paintOne(ctx, seg, w, h, false);
  if (seg.m) paintOne(ctx, seg, w, h, true);
}

function paintOne(ctx: CanvasRenderingContext2D, seg: DrawSegment, w: number, h: number, mirror: boolean) {
  const p = mirror ? seg.p.map((v, i) => (i % 2 === 0 ? 1000 - v : v)) : seg.p;
  if (seg.t === 'fill') return floodFill(ctx, seg, p[0], p[1]);
  const X = (v: number) => (v / 1000) * w;
  const Y = (v: number) => (v / 1000) * h;
  const color = segColor(seg);
  ctx.save();
  ctx.globalCompositeOperation = seg.e ? 'destination-out' : 'source-over';
  // keep any outer alpha (faded lines in مين برا الرسمة؟) and add the segment's own opacity
  const outer = ctx.globalAlpha;
  const alpha = seg.o ? seg.o / 10 : 1;
  ctx.globalAlpha = outer * alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const base = (SIZES[seg.w] ?? 6) * (w / 800);
  ctx.lineWidth = base;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isShape(seg.t) && p.length >= 4) {
    const ax = X(p[0]);
    const ay = Y(p[1]);
    const bx = X(p[2]);
    const by = Y(p[3]);
    shapePath(ctx, seg.t!, ax, ay, bx, by);
    const closed = seg.t !== 'line' && seg.t !== 'arrow';
    if (seg.f && closed) ctx.fill();
    ctx.lineCap = 'round';
    // a filled shape also gets a thin outline of the same colour so the edges stay crisp
    ctx.stroke();
    if (seg.t === 'arrow') {
      const ang = Math.atan2(by - ay, bx - ax);
      const len = Math.min(Math.hypot(bx - ax, by - ay) * 0.45, Math.max(base * 3.2, w * 0.035));
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - Math.cos(ang - 0.45) * len, by - Math.sin(ang - 0.45) * len);
      ctx.lineTo(bx - Math.cos(ang + 0.45) * len, by - Math.sin(ang + 0.45) * len);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < p.length; i += 2) {
    xs.push(X(p[i]));
    ys.push(Y(p[i + 1]));
  }
  const dot = () => {
    ctx.beginPath();
    ctx.arc(xs[0], ys[0], ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = () => {
    if (xs.length === 1) return dot();
    smoothPath(ctx, xs, ys);
    ctx.stroke();
  };

  switch (seg.t) {
    case 'spray': {
      const r = base * 1.6;
      for (let i = 0; i < p.length; i += 2) {
        const rand = rng(p[i] * 1009 + p[i + 1] * 917 + i);
        for (let k = 0; k < 12; k++) {
          const ang = rand() * Math.PI * 2;
          const dist = Math.sqrt(rand()) * r;
          ctx.beginPath();
          ctx.arc(xs[i / 2] + Math.cos(ang) * dist, ys[i / 2] + Math.sin(ang) * dist, Math.max(1, base * 0.17), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'cal': {
      // calligraphy: a flat nib at 45°, thick on one diagonal and thin on the other
      const nx = Math.cos(-Math.PI / 4) * base * 0.95;
      const ny = Math.sin(-Math.PI / 4) * base * 0.95;
      ctx.lineWidth = Math.max(1, base * 0.12);
      if (xs.length === 1) {
        ctx.beginPath();
        ctx.moveTo(xs[0] - nx, ys[0] - ny);
        ctx.lineTo(xs[0] + nx, ys[0] + ny);
        ctx.stroke();
        break;
      }
      for (let i = 1; i < xs.length; i++) {
        ctx.beginPath();
        ctx.moveTo(xs[i - 1] - nx, ys[i - 1] - ny);
        ctx.lineTo(xs[i - 1] + nx, ys[i - 1] + ny);
        ctx.lineTo(xs[i] + nx, ys[i] + ny);
        ctx.lineTo(xs[i] - nx, ys[i] - ny);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'crayon': {
      // waxy texture: a few thin, slightly shaky passes (the shake of each point depends only on
      // that point, so a growing line keeps its look)
      const shake = (i: number, pass: number, axis: number) => rng(p[i * 2] * 7919 + p[i * 2 + 1] * 104729 + pass * 31 + axis)() - 0.5;
      const lw = Math.max(1, base * 0.42);
      ctx.globalAlpha = outer * alpha * 0.55;
      for (let pass = 0; pass < 4; pass++) {
        const jx = xs.map((x, i) => x + shake(i, pass, 0) * base * 0.75);
        const jy = ys.map((y, i) => y + shake(i, pass, 1) * base * 0.75);
        ctx.lineWidth = lw;
        if (xs.length === 1) {
          ctx.beginPath();
          ctx.arc(jx[0], jy[0], lw / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          smoothPath(ctx, jx, jy);
          ctx.stroke();
        }
      }
      break;
    }
    case 'soft':
      // airbrush: wide faint layers that get stronger towards the middle
      ctx.lineCap = 'round';
      for (const [k, a] of [
        [2.3, 0.08],
        [1.7, 0.1],
        [1.15, 0.14],
        [0.7, 0.2],
      ]) {
        ctx.globalAlpha = outer * alpha * a;
        ctx.lineWidth = base * k;
        line();
      }
      break;
    case 'neon':
      ctx.shadowColor = color;
      ctx.shadowBlur = base * 1.6;
      line();
      // bright core
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = outer * alpha * 0.85;
      ctx.lineWidth = Math.max(1, base * 0.32);
      line();
      break;
    case 'rainbow': {
      // the colour follows the position on the board, so a long line runs through the rainbow
      ctx.lineCap = 'round';
      const hue = (i: number) => Math.round(((p[i * 2] + p[i * 2 + 1]) * 0.36) % 360);
      if (xs.length === 1) {
        ctx.fillStyle = `hsl(${hue(0)} 90% 55%)`;
        dot();
        break;
      }
      for (let i = 1; i < xs.length; i++) {
        ctx.strokeStyle = `hsl(${hue(i)} 90% 55%)`;
        ctx.beginPath();
        ctx.moveTo(xs[i - 1], ys[i - 1]);
        ctx.lineTo(xs[i], ys[i]);
        ctx.stroke();
      }
      break;
    }
    case 'hl':
      // butt caps: consecutive pieces of one stroke meet without overlapping (no darker dots at the joints)
      ctx.globalAlpha = outer * alpha * 0.35;
      ctx.lineWidth = base * 1.8;
      ctx.lineCap = 'butt';
      line();
      break;
    default:
      // pen, dashed line, eraser
      if (seg.t === 'dash' && xs.length > 1) ctx.setLineDash([base * 1.2, base * 1.9]);
      line();
  }
  ctx.restore();
}
