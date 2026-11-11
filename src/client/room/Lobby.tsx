import { useEffect, useState } from 'react';
import { Play, Settings2 } from 'lucide-react';
import { GAME_IDS, GAMES, type GameId, type GameSettings, type SettingField } from '../../shared/games.ts';
import type { RoomView } from '../../shared/protocol.ts';
import { api } from '../lib/api.ts';
import { useRoomContext } from '../lib/room.ts';
import { Button, GameArt, Toggle, cx, toast } from '../components/ui.tsx';
import { PAGES } from '../lib/mode.ts';

function useCategories(gameId: GameId) {
  const [cats, setCats] = useState<{ slug: string; name: string; emoji: string; items?: number }[]>([]);
  useEffect(() => {
    let alive = true;
    api<{ categories: typeof cats }>(`/api/categories?game=${gameId}`)
      .then((r) => alive && setCats(r.categories))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [gameId]);
  return cats;
}

function usePacks(gameId: GameId, enabled: boolean) {
  const [packs, setPacks] = useState<{ id: string; name: string; items: number; official: boolean }[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api<{ packs: typeof packs }>(`/api/packs?game=${gameId}`)
      .then((r) => alive && setPacks(r.packs))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [gameId, enabled]);
  return packs;
}

function SettingInput({ f, value, onChange, disabled, cats }: { f: SettingField; value: unknown; onChange: (v: unknown) => void; disabled: boolean; cats: { slug: string; name: string; emoji: string }[] }) {
  switch (f.type) {
    case 'number':
      return (
        <label className="block">
          <span className="label flex justify-between">
            {f.label}
            <b className="text-volt-300">
              {String(value)} {f.unit ?? ''}
            </b>
          </span>
          <input type="range" min={f.min} max={f.max} step={f.step ?? 1} value={Number(value)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand-500 disabled:opacity-50" />
        </label>
      );
    case 'boolean':
      return disabled ? (
        <p className="text-sm text-ink-300">
          {f.label}: <b>{value ? 'نعم' : 'لا'}</b>
        </p>
      ) : (
        <Toggle checked={!!value} onChange={onChange} label={f.label} />
      );
    case 'select':
      return (
        <label className="block">
          <span className="label">{f.label}</span>
          <select className="field py-2.5" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'category':
      return (
        <label className="block">
          <span className="label">{f.label}</span>
          <select className="field py-2.5" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            <option value="any">🎲 كل التصنيفات</option>
            {cats.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </label>
      );
  }
}

export function Lobby({ view }: { view: RoomView }) {
  const room = useRoomContext();
  const isHost = view.hostId === view.you;
  const me = view.members.find((m) => m.id === view.you);
  const game = GAMES[view.selectedGame];
  const cats = useCategories(view.selectedGame);
  const packs = usePacks(view.selectedGame, isHost && !PAGES);
  const [starting, setStarting] = useState(false);
  const [draft, setDraft] = useState<GameSettings>(view.settings);
  useEffect(() => setDraft(view.settings), [view.settings, view.selectedGame]);

  const connected = view.members.filter((m) => m.connected);
  const notReady = connected.filter((m) => !m.isHost && !m.ready);
  const enough = connected.length >= game.minPlayers;

  const save = async (next: GameSettings) => {
    setDraft(next);
    const r = await room.act('settings', { settings: next });
    if (!r.ok) toast.error(r.message);
  };
  const packId = view.packId;

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <GameArt gameId={view.selectedGame} className="h-32 sm:h-40" big />
        <div className="p-5">
          <h2 className="font-display text-3xl">{game.name}</h2>
          <p className="text-sm text-ink-300">{game.tagline}</p>
          <details className="mt-3 text-sm text-ink-300">
            <summary className="cursor-pointer font-semibold text-ink-200">طريقة اللعب</summary>
            <ul className="mt-2 list-disc space-y-1 ps-5">
              {game.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      {isHost && (
        <div className="card p-4">
          <p className="mb-3 text-sm font-bold">غيّر اللعبة</p>
          <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
            {GAME_IDS.map((id) => (
              <button
                key={id}
                onClick={async () => {
                  const r = await room.act('select-game', { gameId: id });
                  if (!r.ok) toast.error(r.message);
                }}
                className={cx('chip shrink-0 px-3 py-2 text-sm', view.selectedGame === id && 'border-volt-400 bg-volt-400/15 text-white')}
                data-testid={`select-game-${id}`}
              >
                {GAMES[id].emoji} {GAMES[id].name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <p className="mb-4 flex items-center gap-2 font-bold">
          <Settings2 className="size-4" /> الإعدادات {!isHost && <span className="text-xs font-normal text-ink-400">(المضيف بيغيّرها)</span>}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {game.settings.map((f) => (
            <SettingInput key={f.key} f={f} value={draft[f.key] ?? f.default} disabled={!isHost} cats={cats} onChange={(v) => void save({ ...draft, [f.key]: v as never })} />
          ))}
          {isHost && !PAGES && view.selectedGame !== 'outsider-picture' && (
            <label className="block sm:col-span-2">
              <span className="label">حزمة المحتوى</span>
              <select
                className="field py-2.5"
                value={packId ?? ''}
                onChange={async (e) => {
                  const r = await room.act('set-pack', { packId: e.target.value || null });
                  if (r.ok) toast.success('تم اختيار الحزمة');
                  else toast.error(r.message);
                }}
              >
                <option value="">المحتوى الرسمي لخبصة</option>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.official ? '⭐ ' : '✏️ '}
                    {p.name} ({p.items})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="card sticky bottom-20 z-10 flex flex-wrap items-center gap-3 p-4 md:bottom-4">
        {!isHost && (
          <Button
            size="lg"
            variant={me?.ready ? 'secondary' : 'volt'}
            className="flex-1"
            onClick={async () => {
              const r = await room.act('ready', { ready: !me?.ready });
              if (!r.ok) toast.error(r.message);
            }}
            data-testid="ready-btn"
          >
            {me?.ready ? 'جاهز ✔ (اكبس للإلغاء)' : 'أنا جاهز!'}
          </Button>
        )}
        {isHost && (
          <>
            <div className="min-w-0 flex-1 text-sm text-ink-300">
              {!enough ? `بدنا ${game.minPlayers} لاعبين متصلين على الأقل (${connected.length} هلأ)` : notReady.length ? `بانتظار: ${notReady.map((m) => m.name).join('، ')}` : 'الكل جاهز! 🎉'}
            </div>
            <Button
              size="lg"
              icon={<Play className="size-5" />}
              loading={starting}
              disabled={!enough || notReady.length > 0}
              onClick={async () => {
                setStarting(true);
                const r = await room.act('start');
                setStarting(false);
                if (!r.ok) toast.error(r.message);
              }}
              data-testid="start-game"
            >
              ابدأ اللعبة
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
