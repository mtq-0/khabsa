import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { GAME_IDS, GAMES, type GameId } from '../../shared/games.ts';
import { GameArt, PageTitle, cx } from '../components/ui.tsx';

export default function GamesPage() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [tag, setTag] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/platform')
      .then((r) => r.json())
      .then((d: { games: { id: GameId; enabled: boolean }[] }) => setEnabled(Object.fromEntries(d.games.map((g) => [g.id, g.enabled]))))
      .catch(() => {});
  }, []);
  const tags = useMemo(() => Array.from(new Set(GAME_IDS.flatMap((id) => GAMES[id].tags))), []);
  const list = GAME_IDS.filter((id) => !tag || GAMES[id].tags.includes(tag));
  return (
    <div>
      <PageTitle title="مكتبة الألعاب" emoji="🎮" subtitle="سبع ألعاب جماعية... اختار خبصتك" />
      <div className="scrollbar-thin mb-6 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setTag(null)} className={cx('chip shrink-0 px-4 py-2 text-sm', !tag && 'border-brand-400 bg-brand-500/25 text-white')}>
          الكل
        </button>
        {tags.map((t) => (
          <button key={t} onClick={() => setTag(t)} className={cx('chip shrink-0 px-4 py-2 text-sm', tag === t && 'border-brand-400 bg-brand-500/25 text-white')}>
            {t}
          </button>
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((id) => {
          const g = GAMES[id];
          const off = enabled[id] === false;
          return (
            <Link key={id} to={`/games/${id}`} className={cx('card group overflow-hidden transition hover:-translate-y-1 hover:shadow-glow', off && 'opacity-50')} data-testid={`game-card-${id}`}>
              <GameArt gameId={id} className="h-40" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-xl font-bold">{g.name}</h2>
                  {off && <span className="chip text-sun-400">متوقفة</span>}
                </div>
                <p className="text-xs text-ink-400">{g.nameEn}</p>
                <p className="mt-2 text-sm text-ink-300">{g.tagline}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="chip">👥 {g.minPlayers}-{g.maxPlayers}</span>
                  <span className="chip">⏱️ ~{g.durationMin} د</span>
                  {g.tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
