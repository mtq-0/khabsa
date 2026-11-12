/**
 * Painting of drawing segments (ارسم وخمّن and the shared canvas of مين برا الرسمة؟).
 * A segment is either a freehand line (pen, highlighter, dashed, spray, eraser), a two-point
 * shape (line, rectangle, ellipse, triangle, star, heart) or a flood fill. Everything is
 * deterministic, so every player's canvas replays to the same picture.
 */
import type { DrawSegment, DrawTool } from '../../shared/protocol.ts';

export const PALETTE = [
  '#111827', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#94a3b8',
  // 12 more: dark and light shades
  '#7f1d1d', '#9a3412', '#854d0e', '#14532d', '#134e4a', '#1e3a8a', '#4c1d95', '#831843', '#fca5a5', '#fdba74', '#fde68a', '#86efac',
];
export const SIZES = [3, 6, 11, 18, 30, 46];

export const SHAPE_TOOLS: DrawTool[] = ['line', 'rect', 'ellipse', 'tri', 'star', 'heart'];
export const isShape = (t: DrawTool | undefined): boolean => !!t && SHAPE_TOOLS.includes(t);

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
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      break;
    case 'rect':
      ctx.rect(x0, y0, w, h);
      break;
    case 'ellipse':
      ctx.ellipse(cx, cy, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
      break;
    case 'tri':
      ctx.moveTo(cx, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x0, y1);
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
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Paint bucket: fills the area of similar colour around the point (edges are blended under the lines). */
function floodFill(ctx: CanvasRenderingContext2D, seg: DrawSegment) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  if (!cw || !ch) return;
  const sx = Math.max(0, Math.min(cw - 1, Math.round((seg.p[0] / 1000) * cw)));
  const sy = Math.max(0, Math.min(ch - 1, Math.round((seg.p[1] / 1000) * ch)));
  const img = ctx.getImageData(0, 0, cw, ch);
  const d = img.data;
  const at = (x: number, y: number) => (y * cw + x) * 4;
  const s0 = at(sx, sy);
  const tr = d[s0];
  const tg = d[s0 + 1];
  const tb = d[s0 + 2];
  const ta = d[s0 + 3];
  const [fr, fg, fb] = hexToRgb(PALETTE[seg.c] ?? '#000000');
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

/** Draws one segment; coordinates are quantized to 0..1000 on both axes. */
export function paint(ctx: CanvasRenderingContext2D, seg: DrawSegment, w: number, h: number) {
  const p = seg.p;
  if (seg.t === 'fill') return floodFill(ctx, seg);
  const X = (v: number) => (v / 1000) * w;
  const Y = (v: number) => (v / 1000) * h;
  ctx.save();
  ctx.globalCompositeOperation = seg.e ? 'destination-out' : 'source-over';
  ctx.strokeStyle = PALETTE[seg.c] ?? '#fff';
  ctx.fillStyle = ctx.strokeStyle;
  const base = (SIZES[seg.w] ?? 6) * (w / 800);
  ctx.lineWidth = base;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isShape(seg.t) && p.length >= 4) {
    shapePath(ctx, seg.t!, X(p[0]), Y(p[1]), X(p[2]), Y(p[3]));
    if (seg.f && seg.t !== 'line') ctx.fill();
    else ctx.stroke();
    // a filled shape also gets a thin outline of the same colour so the edges stay crisp
    if (seg.f && seg.t !== 'line') ctx.stroke();
    ctx.restore();
    return;
  }

  if (seg.t === 'spray') {
    const r = base * 1.6;
    for (let i = 0; i < p.length; i += 2) {
      const rand = rng(p[i] * 1009 + p[i + 1] * 917 + i);
      for (let k = 0; k < 12; k++) {
        const ang = rand() * Math.PI * 2;
        const dist = Math.sqrt(rand()) * r;
        ctx.beginPath();
        ctx.arc(X(p[i]) + Math.cos(ang) * dist, Y(p[i + 1]) + Math.sin(ang) * dist, Math.max(1, base * 0.17), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }

  if (seg.t === 'hl') {
    // butt caps: consecutive pieces of one stroke meet without overlapping (no darker dots at the joints)
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = base * 1.8;
    ctx.lineCap = 'butt';
  } else if (seg.t === 'dash') {
    ctx.setLineDash([base * 1.2, base * 1.9]);
  }
  if (p.length === 2) {
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.arc(X(p[0]), Y(p[1]), ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(X(p[0]), Y(p[1]));
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(X(p[i]), Y(p[i + 1]));
    ctx.stroke();
  }
  ctx.restore();
}
