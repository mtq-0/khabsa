import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Trash2 } from 'lucide-react';
import { api, errorText } from '../lib/api.ts';
import { useSession } from '../lib/session.ts';
import { RequireSession } from '../components/GuestGate.tsx';
import { Button, EmptyState, Modal, PageTitle, toast } from '../components/ui.tsx';

const KINDS: { kind: string; label: string; hint: string; fields: { key: string; label: string; list?: boolean }[] }[] = [
  { kind: 'word', label: '🕵️ كلمات (مين برا السالفة)', hint: 'كلمة بكل سطر', fields: [{ key: 'word', label: 'الكلمة' }] },
  { kind: 'question-pair', label: '🎭 أسئلة (الأطرش بالزفة)', hint: 'سؤال الأغلبية | سؤال الأطرش', fields: [{ key: 'majority', label: 'سؤال الأغلبية' }, { key: 'outsider', label: 'سؤال الأطرش' }] },
  { kind: 'most-likely', label: '😂 أسئلة مين غالباً', hint: 'سؤال بكل سطر', fields: [{ key: 'text', label: 'السؤال' }] },
  { kind: 'taboo-card', label: '🚫 بطاقات ممنوع تحكي', hint: 'الكلمة | ممنوع1، ممنوع2، ممنوع3', fields: [{ key: 'word', label: 'الكلمة' }, { key: 'forbidden', label: 'الممنوعات', list: true }] },
  { kind: 'trivia', label: '⚡ أسئلة تحدي السرعة', hint: 'السؤال | الجواب الصح | غلط | غلط | غلط', fields: [] },
  { kind: 'draw-word', label: '✏️ كلمات ارسم وخمّن', hint: 'كلمة بكل سطر', fields: [{ key: 'word', label: 'الكلمة' }] },
];

interface Pack {
  id: string;
  kind: string;
  name: string;
  items: number;
  mine: boolean;
  official: boolean;
}

/** Turns pasted lines into content data for the given kind. */
export function linesToItems(kind: string, text: string): { data: Record<string, unknown> }[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split('|').map((p) => p.trim());
      switch (kind) {
        case 'question-pair':
          return { data: { majority: parts[0], outsider: parts[1] ?? '' } };
        case 'most-likely':
          return { data: { text: l } };
        case 'taboo-card':
          return { data: { word: parts[0], forbidden: (parts[1] ?? '').split(/[،,]/).map((x) => x.trim()).filter(Boolean) } };
        case 'trivia':
          return { data: { question: parts[0], options: parts.slice(1, 5), answer: 0 } };
        default:
          return { data: { word: l } };
      }
    });
}

export default function PacksPage() {
  return (
    <RequireSession title="حزم المحتوى">
      <Packs />
    </RequireSession>
  );
}

function Packs() {
  const user = useSession((s) => s.user)!;
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Pack | null>(null);
  const load = useCallback(() => api<{ packs: Pack[] }>('/api/packs').then((r) => setPacks(r.packs.filter((p) => p.mine))).catch((e) => toast.error(errorText(e))), []);
  useEffect(() => {
    void load();
  }, [load]);

  if (user.isGuest)
    return (
      <div className="card mx-auto max-w-lg">
        <EmptyState emoji="📦" title="الحزم الخاصة للحسابات المسجلة" action={<Link to="/register"><Button>سجّل حساب</Button></Link>} />
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="حزم المحتوى الخاصة" emoji="📦" subtitle="اعمل كلمات وأسئلة خاصة بشلتك واختارها من إعدادات الغرفة" action={<Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>حزمة جديدة</Button>} />
      {!packs?.length ? (
        <div className="card">
          <EmptyState emoji="✏️" title="ما عندك حزم" text="اعمل حزمة كلمات عن الشلة، الشغل، أو العيلة!" />
        </div>
      ) : (
        <ul className="space-y-2">
          {packs.map((p) => (
            <li key={p.id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{p.name}</p>
                <p className="text-xs text-ink-400">
                  {KINDS.find((k) => k.kind === p.kind)?.label} · {p.items} عنصر
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setOpen(p)}>
                عدّل
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  if (!confirm('حذف الحزمة؟')) return;
                  await api(`/api/packs/${p.id}`, { method: 'DELETE' }).catch((e) => toast.error(errorText(e)));
                  void load();
                }}
                aria-label="حذف"
              />
            </li>
          ))}
        </ul>
      )}
      <CreatePack open={creating} onClose={() => setCreating(false)} onDone={() => void load()} />
      {open && <PackEditor pack={open} onClose={() => { setOpen(null); void load(); }} />}
    </div>
  );
}

function CreatePack({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState('word');
  const [name, setName] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="حزمة جديدة">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/api/packs', { body: { kind, name } });
            toast.success('انعملت الحزمة');
            setName('');
            onClose();
            onDone();
          } catch (e2) {
            toast.error(errorText(e2));
          }
        }}
      >
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <input className="field" placeholder="اسم الحزمة" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        <Button type="submit" className="w-full">
          اعمل
        </Button>
      </form>
    </Modal>
  );
}

function PackEditor({ pack, onClose }: { pack: Pack; onClose: () => void }) {
  const meta = KINDS.find((k) => k.kind === pack.kind)!;
  const [items, setItems] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [text, setText] = useState('');
  const load = useCallback(() => api<{ items: { id: string; data: Record<string, unknown> }[] }>(`/api/packs/${pack.id}/items`).then((r) => setItems(r.items)), [pack.id]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Modal open onClose={onClose} title={pack.name} wide>
      <div className="space-y-4">
        <div>
          <label className="label">أضف عناصر ({meta.hint})</label>
          <textarea className="field min-h-32 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            className="mt-2"
            onClick={async () => {
              const list = linesToItems(pack.kind, text);
              if (!list.length) return;
              try {
                const r = await api<{ inserted: number; skipped: number; errors: { index: number; message: string }[] }>(`/api/packs/${pack.id}/items`, { body: { items: list } });
                toast.success(`انضاف ${r.inserted}${r.skipped ? ` · مكرر ${r.skipped}` : ''}${r.errors.length ? ` · فيه أخطاء ${r.errors.length}` : ''}`);
                if (r.errors.length) toast.warning(`سطر ${r.errors[0].index + 1}: ${r.errors[0].message}`);
                setText('');
                void load();
              } catch (e) {
                toast.error(errorText(e));
              }
            }}
          >
            أضف
          </Button>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
              <span className="flex-1 truncate">{Object.values(it.data).map((v) => (Array.isArray(v) ? v.join('، ') : String(v))).join(' | ')}</span>
              <button
                className="text-ink-400 hover:text-zing-400"
                onClick={async () => {
                  await api(`/api/packs/${pack.id}/items/${it.id}`, { method: 'DELETE' });
                  void load();
                }}
                aria-label="حذف"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {!items.length && <li className="text-sm text-ink-400">فاضية لسا.</li>}
        </ul>
      </div>
    </Modal>
  );
}
