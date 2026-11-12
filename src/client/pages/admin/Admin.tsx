import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { Download, Upload } from 'lucide-react';
import { GAMES, isGameId } from '../../../shared/games.ts';
import { api, errorText } from '../../lib/api.ts';
import { useSession } from '../../lib/session.ts';
import { Button, EmptyState, Modal, PageTitle, Skeleton, Toggle, cx, toast } from '../../components/ui.tsx';
import { linesToItems } from '../Packs.tsx';
import { TmdbNotice } from '../../components/TmdbNotice.tsx';

const KINDS = [
  ['word', 'كلمات برا السالفة'],
  ['question-pair', 'أسئلة الأطرش'],
  ['picture-pair', 'أزواج الصور'],
  ['most-likely', 'مين غالباً'],
  ['taboo-card', 'بطاقات ممنوع تحكي'],
  ['trivia', 'أسئلة السرعة'],
  ['draw-word', 'كلمات الرسم'],
] as const;

export default function AdminPage() {
  const user = useSession((s) => s.user);
  if (!user || user.role !== 'admin') return <EmptyState emoji="⛔" title="هالصفحة للإدارة بس" />;
  const tabs = [
    ['', 'نظرة عامة'],
    ['games', 'الألعاب'],
    ['content', 'المحتوى'],
    ['images', 'الصور'],
    ['tmdb', 'صور TMDB'],
    ['categories', 'التصنيفات'],
    ['reports', 'البلاغات'],
    ['users', 'المستخدمين'],
    ['settings', 'الإعدادات'],
    ['audit', 'السجل'],
  ];
  return (
    <div>
      <PageTitle title="لوحة الإدارة" emoji="🛡️" />
      <nav className="scrollbar-thin mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-white/5 p-1">
        {tabs.map(([p, l]) => (
          <NavLink key={p} to={`/admin/${p}`} end className={({ isActive }) => cx('shrink-0 rounded-xl px-4 py-2 text-sm font-semibold', isActive ? 'bg-brand-500 text-white' : 'text-ink-300')}>
            {l}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="games" element={<Games />} />
        <Route path="content" element={<Content />} />
        <Route path="images" element={<Images />} />
        <Route path="tmdb" element={<TmdbPosters />} />
        <Route path="categories" element={<Categories />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<Users />} />
        <Route path="settings" element={<PlatformSettings />} />
        <Route path="audit" element={<Audit />} />
      </Routes>
    </div>
  );
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(() => api<T>(path).then(setData).catch((e) => toast.error(errorText(e))), [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return [data, load] as const;
}

const run = async (fn: () => Promise<unknown>, after?: () => void, msg = 'تم ✔') => {
  try {
    await fn();
    toast.success(msg);
    after?.();
  } catch (e) {
    toast.error(errorText(e));
  }
};

function Overview() {
  const [d] = useLoad<Record<string, any>>('/api/admin/overview');
  if (!d) return <Skeleton className="h-64" />;
  const max = Math.max(1, ...d.daily.map((x: { matches: number }) => x.matches));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['المستخدمين', d.users],
          ['المسجلين', d.registered],
          ['جدد هالأسبوع', d.newUsersWeek],
          ['ألعاب منتهية', d.matches],
          ['ألعاب اليوم', d.matchesToday],
          ['أونلاين الآن', d.live.online],
          ['غرف مفتوحة', d.live.rooms],
          ['بلاغات مفتوحة', d.reportsOpen],
        ].map(([l, v]) => (
          <div key={l} className="card p-4">
            <p className="text-xs text-ink-400">{l}</p>
            <p className="font-display text-3xl">{v}</p>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <p className="mb-3 font-bold">الألعاب آخر 14 يوم</p>
        <div className="flex h-32 items-end gap-1">
          {d.daily.map((x: { day: string; matches: number }) => (
            <div key={x.day} className="flex flex-1 flex-col items-center gap-1" title={`${x.day}: ${x.matches}`}>
              <div className="w-full rounded-t bg-brand-500" style={{ height: `${(x.matches / max) * 100}%` }} />
              <span className="text-[9px] text-ink-500">{x.day.slice(5)}</span>
            </div>
          ))}
          {!d.daily.length && <p className="text-sm text-ink-400">ما في بيانات لسا.</p>}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="card p-5">
          <p className="mb-2 font-bold">حسب اللعبة</p>
          {d.perGame.map((g: { game_id: string; matches: number; avg_players: number }) => (
            <p key={g.game_id} className="text-sm">
              {isGameId(g.game_id) ? GAMES[g.game_id].name : g.game_id}: {g.matches} لعبة · {g.avg_players.toFixed(1)} لاعب
            </p>
          ))}
        </div>
        <div className="card p-5">
          <p className="mb-2 font-bold">المحتوى</p>
          {d.contentByKind.map((c: { kind: string; status: string; n: number }) => (
            <p key={c.kind + c.status} className="text-sm">
              {c.kind} ({c.status}): {c.n}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function Games() {
  const [d, load] = useLoad<{ games: { id: string; enabled: boolean; featured: boolean; sort: number }[] }>('/api/admin/games');
  if (!d) return <Skeleton className="h-64" />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {d.games.map((g) => (
        <div key={g.id} className="card p-4">
          <p className="font-bold">{isGameId(g.id) ? `${GAMES[g.id].emoji} ${GAMES[g.id].name}` : g.id}</p>
          <Toggle label="مفعّلة" checked={g.enabled} onChange={(v) => run(() => api(`/api/admin/games/${g.id}`, { method: 'PATCH', body: { enabled: v } }), load)} />
          <Toggle label="مميزة بالرئيسية" checked={g.featured} onChange={(v) => run(() => api(`/api/admin/games/${g.id}`, { method: 'PATCH', body: { featured: v } }), load)} />
        </div>
      ))}
    </div>
  );
}

function summarize(kind: string, data: Record<string, unknown>) {
  switch (kind) {
    case 'question-pair':
      return `${data.majority}  ⟷  ${data.outsider}`;
    case 'taboo-card':
      return `${data.word} — 🚫 ${(data.forbidden as string[]).join('، ')}`;
    case 'trivia':
      return `${data.question} — ✅ ${(data.options as string[])[data.answer as number]}`;
    case 'most-likely':
      return String(data.text);
    case 'picture-pair':
      return `${data.labelA} / ${data.labelB} (${data.mode})`;
    default:
      return String(data.word);
  }
}

function Content() {
  const [kind, setKind] = useState<string>('question-pair');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: { id: string; category: string; difficulty: string; data: Record<string, unknown>; status: string }[] } | null>(null);
  const [edit, setEdit] = useState<{ id?: string; category: string; difficulty: string; json: string; status: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [cats, setCats] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    api<{ categories: { slug: string; name: string }[] }>('/api/admin/categories').then((r) => setCats(r.categories)).catch(() => {});
  }, []);
  const load = useCallback(() => {
    const p = new URLSearchParams({ kind, page: String(page) });
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    api<typeof data>(`/api/admin/content?${p}`).then(setData).catch((e) => toast.error(errorText(e)));
  }, [kind, status, q, page]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-2 p-3">
        <select className="field w-auto py-2" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
          {KINDS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select className="field w-auto py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          <option value="active">فعّال</option>
          <option value="pending">بانتظار المراجعة</option>
          <option value="disabled">موقوف</option>
        </select>
        <input className="field w-48 py-2" placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ms-auto flex gap-2">
          {kind !== 'picture-pair' && (
            <Button size="sm" onClick={() => setEdit({ category: cats[0]?.slug ?? 'general', difficulty: 'medium', json: '{}', status: 'active' })}>
              + عنصر
            </Button>
          )}
          {kind !== 'picture-pair' && (
            <Button size="sm" variant="secondary" icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
              استيراد
            </Button>
          )}
          <a href={`/api/admin/content/export?kind=${kind}&format=csv`} className="inline-flex h-9 items-center gap-1 rounded-lg bg-white/8 px-3 text-sm">
            <Download className="size-4" /> CSV
          </a>
          <a href={`/api/admin/content/export?kind=${kind}&format=json`} className="inline-flex h-9 items-center gap-1 rounded-lg bg-white/8 px-3 text-sm">
            <Download className="size-4" /> JSON
          </a>
        </div>
      </div>
      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <p className="text-sm text-ink-400">{data.total} عنصر</p>
          <ul className="space-y-1.5">
            {data.items.map((it) => (
              <li key={it.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className={cx('chip', it.status === 'active' ? 'text-lime-400' : it.status === 'pending' ? 'text-sun-400' : 'text-zing-400')}>{it.status}</span>
                <span className="chip">{it.category}</span>
                <span className="chip">{it.difficulty}</span>
                <span className="min-w-0 flex-1 truncate">{summarize(kind, it.data)}</span>
                <Button size="sm" variant="ghost" onClick={() => setEdit({ id: it.id, category: it.category, difficulty: it.difficulty, json: JSON.stringify(it.data, null, 2), status: it.status })}>
                  تعديل
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => api(`/api/admin/content/${it.id}`, { method: 'PATCH', body: { status: it.status === 'active' ? 'disabled' : 'active' } }), load)}>
                  {it.status === 'active' ? 'وقّف' : 'فعّل'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm('حذف نهائي؟') && run(() => api(`/api/admin/content/${it.id}`, { method: 'DELETE' }), load)}>
                  حذف
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex justify-center gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              السابق
            </Button>
            <span className="self-center text-sm">
              {page} / {Math.max(1, Math.ceil(data.total / 50))}
            </span>
            <Button size="sm" variant="secondary" disabled={page * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>
              التالي
            </Button>
          </div>
        </>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'تعديل عنصر' : 'عنصر جديد'} wide>
        {edit && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              let dataObj: unknown;
              try {
                dataObj = JSON.parse(edit.json);
              } catch {
                return toast.error('JSON غير صالح');
              }
              await run(
                () =>
                  edit.id
                    ? api(`/api/admin/content/${edit.id}`, { method: 'PATCH', body: { category: edit.category, difficulty: edit.difficulty, data: dataObj, status: edit.status } })
                    : api('/api/admin/content', { body: { kind, category: edit.category, difficulty: edit.difficulty, data: dataObj, status: edit.status } }),
                () => {
                  setEdit(null);
                  load();
                },
              );
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              <select className="field" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {cats.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select className="field" value={edit.difficulty} onChange={(e) => setEdit({ ...edit, difficulty: e.target.value })}>
                <option value="easy">سهل</option>
                <option value="medium">متوسط</option>
                <option value="hard">صعب</option>
              </select>
              <select className="field" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                <option value="active">فعّال</option>
                <option value="pending">مراجعة</option>
                <option value="disabled">موقوف</option>
              </select>
            </div>
            <textarea className="field min-h-48 font-mono text-sm" dir="ltr" value={edit.json} onChange={(e) => setEdit({ ...edit, json: e.target.value })} />
            <p className="text-xs text-ink-400">
              أمثلة: {'{"majority":"...","outsider":"..."}'} · {'{"word":"منسف","forbidden":["رز","جميد","لحمة"]}'} · {'{"question":"...","options":["أ","ب","ج","د"],"answer":0}'}
            </p>
            <Button type="submit">احفظ</Button>
          </form>
        )}
      </Modal>
      <ImportModal open={importing} kind={kind} onClose={() => setImporting(false)} onDone={load} />
    </div>
  );
}

function ImportModal({ open, kind, onClose, onDone }: { open: boolean; kind: string; onClose: () => void; onDone: () => void }) {
  const [format, setFormat] = useState<'csv' | 'json' | 'lines'>('csv');
  const [payload, setPayload] = useState('');
  const [status, setStatus] = useState('active');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open={open} onClose={onClose} title="استيراد جماعي" wide>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select className="field w-auto py-2" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
            <option value="lines">سطور (بفاصل |)</option>
          </select>
          <select className="field w-auto py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">فعّال مباشرة</option>
            <option value="pending">بانتظار المراجعة</option>
          </select>
          <input ref={fileRef} type="file" accept=".csv,.json,.txt" className="hidden" onChange={async (e) => setPayload(await e.target.files![0].text())} />
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            اختار ملف
          </Button>
        </div>
        <p className="text-xs text-ink-400">CSV للأسئلة: category,difficulty,majority,outsider · للبطاقات: category,difficulty,word,forbidden (ممنوعات بفاصل |) · للتريفيا: category,difficulty,question,options,answer</p>
        <textarea className="field min-h-56 font-mono text-xs" dir="ltr" value={payload} onChange={(e) => setPayload(e.target.value)} />
        {result && <p className="rounded-xl bg-white/5 p-3 text-sm">{result}</p>}
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const body =
                format === 'lines'
                  ? { kind, format: 'json', status, payload: JSON.stringify(linesToItems(kind, payload).map((x) => ({ category: 'custom', difficulty: 'medium', data: x.data }))) }
                  : { kind, format, status, payload };
              const r = await api<{ inserted: number; skipped: number; errorCount: number; total: number; errors: { index: number; message: string }[] }>('/api/admin/content/import', { body, timeoutMs: 120_000 });
              setResult(`من ${r.total}: انضاف ${r.inserted} · مكرر ${r.skipped} · أخطاء ${r.errorCount}${r.errors[0] ? ` (أول خطأ بالصف ${r.errors[0].index + 1}: ${r.errors[0].message})` : ''}`);
              onDone();
            } catch (e) {
              setResult(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          استورد
        </Button>
      </div>
    </Modal>
  );
}

function Images() {
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [form, setForm] = useState({ labelA: '', labelB: '', mode: 'normal', category: 'objects' });
  const upload = async (file: File, set: (id: string) => void) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api<{ id: string }>('/api/admin/images', { form: fd, timeoutMs: 60_000 });
      set(r.id);
      toast.success('انرفعت الصورة (مخزنة بشكل خاص)');
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const Slot = ({ id, set, label }: { id: string | null; set: (v: string) => void; label: string }) => (
    <label className="card flex cursor-pointer flex-col items-center gap-2 p-4 text-center">
      <span className="font-bold">{label}</span>
      {id ? <img src={`/api/admin/images/${id}`} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" /> : <span className="grid aspect-[4/3] w-full place-items-center rounded-xl border border-dashed border-white/20 text-ink-400">اختار صورة</span>}
      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0], set)} />
    </label>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-300">ارفع صورتين (الأغلبية والبرّا) لتعمل زوج جديد للعبة "مين برا الصورة". الصور بتنعاد معالجتها وبتتخزن بشكل خاص، وما بتوصل للاعبين إلا بروابط مؤقتة.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slot id={a} set={setA} label="صورة الأغلبية (A)" />
        <Slot id={b} set={setB} label="صورة البرّا (B)" />
      </div>
      <div className="card grid gap-3 p-4 sm:grid-cols-4">
        <input className="field" placeholder="وصف A" value={form.labelA} onChange={(e) => setForm({ ...form, labelA: e.target.value })} />
        <input className="field" placeholder="وصف B" value={form.labelB} onChange={(e) => setForm({ ...form, labelB: e.target.value })} />
        <select className="field" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
          <option value="normal">عادي (مختلفة)</option>
          <option value="hard">صعب (فرق بسيط)</option>
        </select>
        <input className="field" placeholder="التصنيف (slug)" dir="ltr" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      </div>
      <Button disabled={!a || !b || !form.labelA || !form.labelB} onClick={() => run(() => api('/api/admin/picture-pairs', { body: { imageA: a, imageB: b, ...form } }), () => { setA(null); setB(null); setForm({ ...form, labelA: '', labelB: '' }); })}>
        أضف الزوج
      </Button>
    </div>
  );
}

interface Poster {
  tmdbId: number;
  type: 'movie' | 'tv';
  path: string;
  title?: string;
}
interface Match {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  year: string | null;
  posterPath: string;
}
const CAT_NAMES: Record<string, string> = { cartoons: 'كرتون', movies: 'أفلام', tv: 'مسلسلات وبرامج' };

function TmdbPosters() {
  const [d, load] = useLoad<{ configured: boolean; words: { id: string; category: string; word: string; poster: Poster | null; hasPicture: boolean; suggestedQuery: string | null }[] }>('/api/admin/tmdb/words');
  const [matches, setMatches] = useState<Record<string, { match: Match | null; error?: string; query: string }>>({});
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!d) return <Skeleton className="h-64" />;
  if (!d.configured)
    return (
      <div className="card max-w-2xl space-y-2 p-5 text-sm">
        <p className="font-bold">TMDB مش مفعّل لسا</p>
        <p className="text-ink-300">١. اعمل حساب ببلاش على themoviedb.org ← Settings ← API ← اطلب مفتاح (Developer).</p>
        <p className="text-ink-300">٢. انسخ <b>API Read Access Token</b> (الطويل اللي بيبلّش بـ eyJ).</p>
        <p className="text-ink-300">٣. بـ Render: khabsa ← Environment ← ضيف <code dir="ltr">TMDB_TOKEN</code> والصق المفتاح ← Save. لا تبعته لحدا.</p>
      </div>
    );
  const search = async (ids: string[]) => {
    setBusy(true);
    try {
      for (let i = 0; i < ids.length; i += 30) {
        const items = ids.slice(i, i + 30).map((id) => ({ id, ...(queries[id] ? { query: queries[id] } : {}) }));
        const r = await api<{ results: { id: string; match: Match | null; error?: string; query: string }[] }>('/api/admin/tmdb/search', { body: { items }, timeoutMs: 120_000 });
        setMatches((m) => ({ ...m, ...Object.fromEntries(r.results.map((x) => [x.id, x])) }));
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const apply = (id: string, poster: Poster | null) => run(() => api('/api/admin/tmdb/apply', { body: { id, poster } }), load, poster ? 'انحفظت الصورة' : 'رجعت الرسمة');
  const missing = d.words.filter((w) => !w.poster && w.suggestedQuery).map((w) => w.id);
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="text-ink-300">
          اكتب <code dir="ltr">tv:</code> أو <code dir="ltr">movie:</code> قبل الاسم لتدوّر على مسلسلات أو أفلام بس (مثلاً <code dir="ltr">tv:Jinn</code>). 
          {d.words.filter((w) => w.poster).length} من {d.words.length} كلمة إلها صورة TMDB. راجع كل نتيجة قبل ما توافق، البحث أحياناً بيجيب عمل ثاني.
        </span>
        <Button size="sm" className="ms-auto" loading={busy} disabled={!missing.length} onClick={() => void search(missing)}>
          دوّر على الكل ({missing.length})
        </Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {d.words.map((w) => {
          const m = matches[w.id];
          return (
            <li key={w.id} className="card flex gap-3 p-3 text-sm">
              <div className="w-20 shrink-0">
                {w.poster ? (
                  <img src={`/api/admin/tmdb/poster?path=${encodeURIComponent(w.poster.path)}`} alt="" className="aspect-[2/3] w-full rounded-lg object-cover" loading="lazy" />
                ) : m?.match ? (
                  <img src={`/api/admin/tmdb/poster?path=${encodeURIComponent(m.match.posterPath)}`} alt="" className="aspect-[2/3] w-full rounded-lg object-cover opacity-80 ring-2 ring-sun-400" loading="lazy" />
                ) : (
                  <div className="grid aspect-[2/3] place-items-center rounded-lg bg-white/5 text-xs text-ink-500">{w.hasPicture ? 'رسمة' : '—'}</div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-bold">
                  {w.word} <span className="chip">{CAT_NAMES[w.category] ?? w.category}</span>
                </p>
                {w.poster ? (
                  <>
                    <p className="text-xs text-lime-400">✓ صورة TMDB: {w.poster.title}</p>
                    <Button size="sm" variant="ghost" onClick={() => apply(w.id, null)}>
                      شيلها (ارجع للرسمة)
                    </Button>
                  </>
                ) : m ? (
                  m.match ? (
                    <>
                      <p className="text-xs text-sun-400">
                        لقينا: {m.match.title} {m.match.originalTitle && m.match.originalTitle !== m.match.title ? `(${m.match.originalTitle})` : ''} {m.match.year ? `· ${m.match.year}` : ''} · {m.match.type === 'tv' ? 'مسلسل' : 'فيلم'}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => apply(w.id, { tmdbId: m.match!.tmdbId, type: m.match!.type, path: m.match!.posterPath, title: m.match!.title })}>
                          صح، اعتمدها
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setMatches((x) => ({ ...x, [w.id]: { ...x[w.id], match: null, error: 'رفضتها. جرّب اسم ثاني.' } }))}>
                          غلط
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-ink-400">{m.error ?? 'ما لقينا صورة. جرّب اسم ثاني (مثلاً بالإنجليزي).'}</p>
                  )
                ) : null}
                {!w.poster && (
                  <div className="flex gap-2">
                    <input className="field py-1.5 text-xs" placeholder={w.suggestedQuery && w.suggestedQuery !== w.word ? `بحث: ${w.suggestedQuery}` : 'اسم بديل للبحث (اختياري)'} value={queries[w.id] ?? ''} onChange={(e) => setQueries((q) => ({ ...q, [w.id]: e.target.value }))} />
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void search([w.id])}>
                      دوّر
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <TmdbNotice />
    </div>
  );
}

function Categories() {
  const [d, load] = useLoad<{ categories: { slug: string; name: string; emoji: string; items: number }[] }>('/api/admin/categories');
  const [f, setF] = useState({ slug: '', name: '', emoji: '🎲' });
  return (
    <div className="space-y-4">
      <form className="card flex flex-wrap gap-2 p-3" onSubmit={(e) => { e.preventDefault(); void run(() => api('/api/admin/categories', { body: f }), () => { setF({ slug: '', name: '', emoji: '🎲' }); void load(); }); }}>
        <input className="field w-32" placeholder="slug" dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} required pattern="[a-z0-9-]{1,40}" />
        <input className="field w-48" placeholder="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input className="field w-20" value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} />
        <Button type="submit">حفظ</Button>
      </form>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {d?.categories.map((c) => (
          <li key={c.slug} className="card flex items-center gap-2 p-3 text-sm">
            <span className="text-xl">{c.emoji}</span>
            <span className="flex-1">
              {c.name} <span className="text-ink-500" dir="ltr">({c.slug})</span>
            </span>
            <span className="chip">{c.items}</span>
            <button className="text-ink-400" onClick={() => setF({ slug: c.slug, name: c.name, emoji: c.emoji })}>
              تعديل
            </button>
            {!c.items && (
              <button className="text-zing-400" onClick={() => run(() => api(`/api/admin/categories/${c.slug}`, { method: 'DELETE' }), load)}>
                حذف
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reports() {
  const [status, setStatus] = useState('open');
  const [d, load] = useLoad<{ reports: Record<string, any>[] }>(`/api/admin/reports?status=${status}`);
  return (
    <div className="space-y-3">
      <select className="field w-auto py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="open">مفتوحة</option>
        <option value="resolved">محلولة</option>
        <option value="dismissed">مرفوضة</option>
      </select>
      {!d ? (
        <Skeleton className="h-40" />
      ) : !d.reports.length ? (
        <EmptyState emoji="😇" title="ما في بلاغات" />
      ) : (
        d.reports.map((r) => (
          <div key={r.id} className="card space-y-2 p-4 text-sm">
            <p>
              <b>{r.reporter_name}</b> بلّغ عن <b>{r.target_name ?? `محتوى (${r.content_kind})`}</b> · {r.reason} {r.room_code && <span className="font-mono">· {r.room_code}</span>}
            </p>
            {r.details && <p className="text-ink-300">{r.details}</p>}
            <p className="text-xs text-ink-500">{new Date(r.created_at).toLocaleString('ar')}</p>
            {status === 'open' && (
              <div className="flex flex-wrap gap-2">
                {r.target_id && !r.target_banned && (
                  <Button size="sm" variant="danger" onClick={() => run(async () => { await api(`/api/admin/users/${r.target_id}`, { method: 'PATCH', body: { banned: true } }); await api(`/api/admin/reports/${r.id}`, { method: 'PATCH', body: { status: 'resolved', resolution: 'banned' } }); }, load)}>
                    أوقف الحساب
                  </Button>
                )}
                {r.content_item_id && (
                  <Button size="sm" variant="danger" onClick={() => run(async () => { await api(`/api/admin/content/${r.content_item_id}`, { method: 'PATCH', body: { status: 'disabled' } }); await api(`/api/admin/reports/${r.id}`, { method: 'PATCH', body: { status: 'resolved', resolution: 'content disabled' } }); }, load)}>
                    أوقف المحتوى
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => run(() => api(`/api/admin/reports/${r.id}`, { method: 'PATCH', body: { status: 'resolved' } }), load)}>
                  تم الحل
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => api(`/api/admin/reports/${r.id}`, { method: 'PATCH', body: { status: 'dismissed' } }), load)}>
                  رفض
                </Button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const [d, setD] = useState<{ users: Record<string, any>[] } | null>(null);
  const load = useCallback(() => api<typeof d>(`/api/admin/users?q=${encodeURIComponent(q)}`).then(setD).catch(() => {}), [q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <div className="space-y-3">
      <input className="field max-w-sm" placeholder="بحث بالاسم أو الإيميل" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="space-y-1.5">
        {d?.users.map((u) => (
          <li key={u.id} className="card flex flex-wrap items-center gap-2 p-3 text-sm">
            <span className="flex-1 truncate">
              <b>{u.displayName}</b> <span className="text-ink-400" dir="ltr">@{u.username}</span> {u.email && <span className="text-ink-500" dir="ltr">{u.email}</span>}
            </span>
            {u.isGuest && <span className="chip">ضيف</span>}
            {u.role === 'admin' && <span className="chip text-sun-400">أدمن</span>}
            {u.banned && <span className="chip text-zing-400">موقوف</span>}
            <span className="chip">{u.xp} XP</span>
            <Button size="sm" variant="ghost" onClick={() => run(() => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { banned: !u.banned } }), load)}>
              {u.banned ? 'فك الإيقاف' : 'أوقف'}
            </Button>
            {!u.isGuest && (
              <Button size="sm" variant="ghost" onClick={() => confirm('تغيير الصلاحية؟') && run(() => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role: u.role === 'admin' ? 'user' : 'admin' } }), load)}>
                {u.role === 'admin' ? 'شيل الأدمن' : 'خلّيه أدمن'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlatformSettings() {
  const [d, load] = useLoad<{ settings: Record<string, any> }>('/api/admin/settings');
  const [ann, setAnn] = useState<string | null>(null);
  if (!d) return <Skeleton className="h-40" />;
  const s = d.settings;
  const save = (body: Record<string, unknown>) => run(() => api('/api/admin/settings', { method: 'PATCH', body }), load);
  return (
    <div className="card max-w-xl space-y-2 p-5">
      <Toggle label="وضع الصيانة (يمنع إنشاء غرف)" checked={s.maintenance} onChange={(v) => save({ maintenance: v })} />
      <Toggle label="السماح بالدخول كضيف" checked={s.guestAccess} onChange={(v) => save({ guestAccess: v })} />
      <Toggle label="السماح بالغرف العامة" checked={s.allowPublicRooms} onChange={(v) => save({ allowPublicRooms: v })} />
      <Toggle label="الشات مفعّل" checked={s.chatEnabled} onChange={(v) => save({ chatEnabled: v })} />
      <label className="flex items-center justify-between py-2 text-sm">
        أقصى عدد لاعبين بالغرفة
        <input type="number" min={2} max={12} className="field w-24 py-2" defaultValue={s.maxRoomCapacity} onBlur={(e) => save({ maxRoomCapacity: Number(e.target.value) })} />
      </label>
      <label className="block pt-2 text-sm">
        إعلان بالرئيسية
        <textarea className="field mt-1" maxLength={300} value={ann ?? s.announcement} onChange={(e) => setAnn(e.target.value)} />
      </label>
      <Button onClick={() => save({ announcement: ann ?? s.announcement })}>احفظ الإعلان</Button>
    </div>
  );
}

function Audit() {
  const [d] = useLoad<{ entries: { id: number; action: string; target: string | null; actor: string; created_at: string; details: unknown }[] }>('/api/admin/audit');
  return (
    <ul className="space-y-1 text-sm">
      {d?.entries.map((e) => (
        <li key={e.id} className="card flex flex-wrap gap-2 p-2">
          <span className="text-ink-500">{new Date(e.created_at).toLocaleString('ar')}</span>
          <b>{e.actor}</b>
          <span className="font-mono text-volt-300" dir="ltr">
            {e.action}
          </span>
          <span className="truncate text-ink-400" dir="ltr">
            {e.target}
          </span>
        </li>
      ))}
      {d && !d.entries.length && <EmptyState emoji="📜" title="السجل فاضي" />}
    </ul>
  );
}
