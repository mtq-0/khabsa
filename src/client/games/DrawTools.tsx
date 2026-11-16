/**
 * Tool bar of ارسم وخمّن: brushes, shapes, colours (palette, custom colour, eyedropper, recent),
 * size and opacity, undo / redo, mirror drawing, clear and the big board toggle.
 * The chosen tools are remembered between turns.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Brush,
  Circle,
  Cloud,
  Diamond,
  Ellipsis,
  Eraser,
  FlipHorizontal2,
  Heart,
  Hexagon,
  Highlighter,
  Minus,
  PaintBucket,
  PenTool,
  Pencil,
  Pipette,
  Plus,
  Rainbow,
  Redo2,
  Square,
  SquareRoundCorner,
  SprayCan,
  Star,
  Trash2,
  Triangle,
  Undo2,
  Wind,
  Zap,
} from 'lucide-react';
import { FREEHAND_TOOLS, type DrawSegment, type DrawTool } from '../../shared/protocol.ts';
import { cx } from '../components/ui.tsx';
import { PALETTE, SIZES, SIZE_ORDER, hexToInt, isShape, segColor } from './drawPaint.ts';
import { BigToggle } from './BigBoard.tsx';

export type ToolId = 'pen' | 'eraser' | 'pick' | DrawTool;

export interface DrawStyle {
  tool: ToolId;
  /** palette index (used when `custom` is null) */
  color: number;
  /** custom colour 0xRRGGBB */
  custom: number | null;
  /** index into SIZES */
  size: number;
  /** 1..10 (10 = opaque) */
  opacity: number;
  filled: boolean;
  mirror: boolean;
  recent: number[];
}

const BRUSHES: { id: ToolId; label: string; icon: ReactNode; key?: string }[] = [
  { id: 'pen', label: 'قلم', icon: <Pencil className="size-4" />, key: 'B' },
  { id: 'cal', label: 'خط عربي', icon: <PenTool className="size-4" /> },
  { id: 'crayon', label: 'ألوان شمع', icon: <Brush className="size-4" /> },
  { id: 'soft', label: 'فرشاة ناعمة', icon: <Wind className="size-4" /> },
  { id: 'hl', label: 'تظليل', icon: <Highlighter className="size-4" /> },
  { id: 'neon', label: 'نيون', icon: <Zap className="size-4" /> },
  { id: 'rainbow', label: 'قوس قزح', icon: <Rainbow className="size-4" /> },
  { id: 'spray', label: 'بخّاخ', icon: <SprayCan className="size-4" /> },
  { id: 'dash', label: 'خط متقطع', icon: <Ellipsis className="size-4" /> },
  {
    id: 'fill',
    label: 'تعبئة لون',
    icon: <PaintBucket className="size-4" />,
    key: 'F',
  },
  {
    id: 'pick',
    label: 'قطّارة لون',
    icon: <Pipette className="size-4" />,
    key: 'I',
  },
  {
    id: 'eraser',
    label: 'ممحاة',
    icon: <Eraser className="size-4" />,
    key: 'E',
  },
];
const SHAPES: { id: ToolId; label: string; icon: ReactNode }[] = [
  { id: 'line', label: 'خط مستقيم', icon: <Minus className="size-4" /> },
  { id: 'arrow', label: 'سهم', icon: <ArrowUpRight className="size-4" /> },
  { id: 'rect', label: 'مستطيل', icon: <Square className="size-4" /> },
  {
    id: 'rrect',
    label: 'مستطيل مدوّر',
    icon: <SquareRoundCorner className="size-4" />,
  },
  { id: 'ellipse', label: 'دائرة', icon: <Circle className="size-4" /> },
  { id: 'tri', label: 'مثلث', icon: <Triangle className="size-4" /> },
  { id: 'diamond', label: 'معيّن', icon: <Diamond className="size-4" /> },
  { id: 'hex', label: 'مسدّس', icon: <Hexagon className="size-4" /> },
  { id: 'star', label: 'نجمة', icon: <Star className="size-4" /> },
  { id: 'heart', label: 'قلب', icon: <Heart className="size-4" /> },
  { id: 'cloud', label: 'غيمة', icon: <Cloud className="size-4" /> },
];

const KEY = 'khabsa:draw:style';
const DEFAULT: DrawStyle = {
  tool: 'pen',
  color: 0,
  custom: null,
  size: 1,
  opacity: 10,
  filled: false,
  mirror: false,
  recent: [],
};

export function useDrawStyle(): [DrawStyle, (patch: Partial<DrawStyle>) => void] {
  const [style, setStyle] = useState<DrawStyle>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<DrawStyle> | null;
      if (!s) return DEFAULT;
      const ok = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
      return {
        ...DEFAULT,
        tool: [...BRUSHES, ...SHAPES].some((t) => t.id === s.tool) && s.tool !== 'pick' ? s.tool! : 'pen',
        color: ok(s.color, PALETTE.length - 1) ? s.color! : 0,
        custom: ok(s.custom, 0xffffff) ? s.custom! : null,
        size: ok(s.size, SIZES.length - 1) ? s.size! : 1,
        opacity: ok(s.opacity, 10) && s.opacity! >= 1 ? s.opacity! : 10,
        filled: !!s.filled,
        mirror: false, // mirror drawing is never switched on by surprise
        recent: Array.isArray(s.recent) ? s.recent.filter((c) => ok(c, 0xffffff)).slice(0, 8) : [],
      };
    } catch {
      return DEFAULT;
    }
  });
  const update = useCallback((patch: Partial<DrawStyle>) => {
    setStyle((s) => {
      const n = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(n));
      } catch {
        /* private mode */
      }
      return n;
    });
  }, []);
  return [style, update];
}

/** the style fields every segment drawn with this style carries (pen, brushes, eraser) */
export function strokeFields(st: DrawStyle): Omit<DrawSegment, 's' | 'p'> {
  const eraser = st.tool === 'eraser';
  const t = (FREEHAND_TOOLS as readonly string[]).includes(st.tool) ? (st.tool as DrawTool) : undefined;
  return {
    c: st.color,
    w: st.size,
    ...(st.custom !== null && !eraser ? { k: st.custom } : {}),
    ...(st.opacity < 10 && !eraser ? { o: st.opacity } : {}),
    ...(st.mirror ? { m: 1 as const } : {}),
    ...(eraser ? { e: 1 as const } : {}),
    ...(t ? { t } : {}),
  };
}

/** a colour the user picked (custom colour or eyedropper) becomes the current one and goes to "recent" */
export function useCustomColor(style: DrawStyle, update: (p: Partial<DrawStyle>) => void) {
  return useCallback(
    (rgb: number, keepTool = false) => {
      update({
        custom: rgb,
        recent: [rgb, ...style.recent.filter((c) => c !== rgb)].slice(0, 8),
        ...(keepTool || style.tool !== 'eraser' ? {} : { tool: 'pen' }),
      });
    },
    [style.recent, style.tool, update],
  );
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/**
 * A toolbar row that scrolls sideways on phones. The edge that still has hidden buttons fades out,
 * so the player can see there is more to scroll to (and the fade goes away at the end).
 */
function ScrollRow({ className, children, ...rest }: { className: string; children: ReactNode; role?: string; 'aria-label'?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rtl = getComputedStyle(el).direction === 'rtl';
      const pos = Math.abs(el.scrollLeft);
      const max = el.scrollWidth - el.clientWidth;
      const moreAtEnd = pos < max - 2;
      const moreAtStart = pos > 2;
      const next = { left: rtl ? moreAtEnd : moreAtStart, right: rtl ? moreAtStart : moreAtEnd };
      setFade((f) => (f.left === next.left && f.right === next.right ? f : next));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);
  const mask = fade.left || fade.right ? `linear-gradient(to right, ${fade.left ? 'transparent 0, #000 2rem' : '#000 0'}, ${fade.right ? '#000 calc(100% - 2rem), transparent 100%' : '#000 100%'})` : undefined;
  return (
    <div ref={ref} className={className} style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined} {...rest}>
      {children}
    </div>
  );
}

function ToolButton({ on, label, icon, onClick, testId, hint }: { on: boolean; label: string; icon: ReactNode; onClick: () => void; testId?: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      aria-pressed={on}
      data-testid={testId}
      className={cx(
        'flex min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold leading-none',
        on ? 'bg-volt-400 text-[#07050f]' : 'bg-white/5 text-ink-100 hover:bg-white/10',
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export function DrawToolbar({
  style,
  update,
  onUndo,
  onRedo,
  onClear,
  big,
  onBig,
  wide,
}: {
  style: DrawStyle;
  update: (p: Partial<DrawStyle>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  big: boolean;
  onBig: () => void;
  /** laid out in a side column (big board, landscape) */
  wide?: boolean;
}) {
  const [allColors, setAllColors] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const pickColor = useCustomColor(style, update);
  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 2500);
    return () => clearTimeout(t);
  }, [confirmClear]);
  const current = style.tool === 'eraser' ? '#ffffff' : segColor({ c: style.color, k: style.custom ?? undefined });
  const shapeOn = isShape(style.tool === 'pen' || style.tool === 'eraser' || style.tool === 'pick' ? undefined : style.tool);
  const sizeIdx = Math.max(0, SIZE_ORDER.indexOf(style.size));
  const px = SIZES[style.size] ?? 6;
  const colors = allColors || wide ? PALETTE : PALETTE.slice(0, 24);
  // phones: one row that scrolls sideways; wider screens: the buttons wrap
  const row = wide ? 'flex flex-wrap gap-1' : 'scrollbar-thin flex gap-1 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0';

  return (
    <div className="space-y-2 text-sm" data-testid="draw-toolbar">
      {/* brushes */}
      <ScrollRow className={cx(row, 'rounded-xl bg-white/5 p-1')} role="toolbar" aria-label="الفراشي">
        {BRUSHES.map((t) => (
          <ToolButton key={t.id} on={style.tool === t.id} label={t.label} icon={t.icon} hint={t.key} testId={`tool-${t.id}`} onClick={() => update({ tool: t.id })} />
        ))}
      </ScrollRow>
      {/* shapes */}
      <ScrollRow className={cx(row, 'rounded-xl bg-white/5 p-1')} role="toolbar" aria-label="الأشكال">
        {SHAPES.map((t) => (
          <ToolButton key={t.id} on={style.tool === t.id} label={t.label} icon={t.icon} testId={`tool-${t.id}`} onClick={() => update({ tool: t.id })} />
        ))}
      </ScrollRow>
      {shapeOn && style.tool !== 'line' && style.tool !== 'arrow' && (
        <div className="flex gap-1 text-xs" role="group" aria-label="نوع الشكل">
          <button
            type="button"
            onClick={() => update({ filled: false })}
            aria-pressed={!style.filled}
            data-testid="shape-outline"
            className={cx('rounded-lg px-3 py-1.5 font-semibold', !style.filled ? 'bg-white/20' : 'bg-white/5')}
          >
            ⬜ فاضي
          </button>
          <button
            type="button"
            onClick={() => update({ filled: true })}
            aria-pressed={style.filled}
            data-testid="shape-filled"
            className={cx('rounded-lg px-3 py-1.5 font-semibold', style.filled ? 'bg-white/20' : 'bg-white/5')}
          >
            ⬛ ممتلئ
          </button>
        </div>
      )}

      {/* colours */}
      <div className="rounded-xl bg-white/5 p-2">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="size-8 shrink-0 rounded-full border-2 border-white/60 shadow" style={{ background: current }} data-testid="current-color" aria-label="اللون الحالي" />
          <label className="relative flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold hover:bg-white/15" title="اختار أي لون بدك">
            <span
              className="size-5 rounded-full"
              style={{
                background: 'conic-gradient(#ef4444,#facc15,#22c55e,#06b6d4,#3b82f6,#d946ef,#ef4444)',
              }}
            />
            لون مخصص
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={hex(style.custom ?? hexToInt(PALETTE[style.color] ?? '#111827'))}
              onChange={(e) => pickColor(hexToInt(e.target.value))}
              data-testid="custom-color"
              aria-label="لون مخصص"
            />
          </label>
          {style.recent.length > 0 && (
            <div className="flex gap-1" aria-label="ألوان استعملتها">
              {style.recent.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickColor(c)}
                  aria-label={`لون ${hex(c)}`}
                  className={cx('size-6 rounded-full border border-white/25', style.custom === c && style.tool !== 'eraser' && 'ring-2 ring-volt-400 ring-offset-1 ring-offset-ink-900')}
                  style={{ background: hex(c) }}
                />
              ))}
            </div>
          )}
        </div>
        <div className={cx('grid gap-1', wide ? 'grid-cols-8' : 'grid-cols-12')} data-testid="palette">
          {colors.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() =>
                update({
                  color: i,
                  custom: null,
                  ...(style.tool === 'eraser' || style.tool === 'pick' ? { tool: 'pen' } : {}),
                })
              }
              aria-label={`لون ${i + 1}`}
              className={cx(
                'aspect-square w-full max-w-9 rounded-full border border-white/20',
                style.custom === null && style.color === i && style.tool !== 'eraser' && 'ring-2 ring-volt-400 ring-offset-2 ring-offset-ink-900',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        {!wide && (
          <button type="button" onClick={() => setAllColors((v) => !v)} className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-volt-300 hover:text-volt-200" data-testid="more-colors">
            <Plus className="size-3.5" />
            {allColors ? 'ألوان أقل' : `ألوان أكثر (${PALETTE.length})`}
          </button>
        )}
      </div>

      {/* size + opacity */}
      <div className="grid gap-2 rounded-xl bg-white/5 p-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xs font-semibold">
          <span className="w-10 shrink-0">الحجم</span>
          <input
            type="range"
            min={0}
            max={SIZE_ORDER.length - 1}
            value={sizeIdx}
            onChange={(e) => update({ size: SIZE_ORDER[Number(e.target.value)] })}
            className="min-w-0 flex-1 accent-volt-400"
            aria-label="حجم الفرشاة"
            data-testid="brush-size"
          />
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-black/30">
            <span
              className="rounded-full"
              style={{
                width: Math.max(2, Math.min(30, px * 0.55)),
                height: Math.max(2, Math.min(30, px * 0.55)),
                background: style.tool === 'eraser' ? '#fff' : current,
                opacity: style.opacity / 10,
              }}
            />
          </span>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold">
          <span className="w-10 shrink-0">الشفافية</span>
          <input
            type="range"
            min={1}
            max={10}
            value={style.opacity}
            onChange={(e) => update({ opacity: Number(e.target.value) })}
            className="min-w-0 flex-1 accent-volt-400"
            aria-label="شفافية اللون"
            data-testid="brush-opacity"
          />
          <span className="w-9 shrink-0 text-center tabular-nums">{style.opacity * 10}%</span>
        </label>
      </div>

      {/* actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          title="تراجع (Ctrl+Z)"
          className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15"
          data-testid="draw-undo"
        >
          <Undo2 className="size-4" /> تراجع
        </button>
        <button
          type="button"
          onClick={onRedo}
          title="إعادة (Ctrl+Y)"
          className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15"
          data-testid="draw-redo"
        >
          <Redo2 className="size-4" /> إعادة
        </button>
        <button
          type="button"
          onClick={() => update({ mirror: !style.mirror })}
          aria-pressed={style.mirror}
          title="رسم متناظر يمين ويسار (M)"
          className={cx('inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold', style.mirror ? 'bg-volt-400 text-[#07050f]' : 'bg-white/10 hover:bg-white/15')}
          data-testid="draw-mirror"
        >
          <FlipHorizontal2 className="size-4" /> تناظر
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirmClear) return setConfirmClear(true);
            setConfirmClear(false);
            onClear();
          }}
          className={cx('inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold', confirmClear ? 'bg-zing-500 text-white' : 'bg-zing-500/20 text-zing-200 hover:bg-zing-500/30')}
          data-testid="draw-clear"
        >
          <Trash2 className="size-4" /> {confirmClear ? 'أكيد؟ اكبس كمان' : 'امسح الكل'}
        </button>
        {!big && <BigToggle big={false} onToggle={onBig} className="ms-auto" />}
      </div>
      <p className="hidden text-[11px] text-ink-500 lg:block">اختصارات: Ctrl+Z تراجع · Ctrl+Y إعادة · B قلم · E ممحاة · F تعبئة · I قطّارة · M تناظر · [ ] الحجم</p>
    </div>
  );
}
