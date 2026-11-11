import { Link, useNavigate, useParams } from 'react-router';
import { Plus, Zap } from 'lucide-react';
import { GAMES, isGameId } from '../../shared/games.ts';
import { Button, GameArt } from '../components/ui.tsx';
import { PAGES } from '../lib/mode.ts';
import NotFoundPage from './NotFound.tsx';

export default function GameDetailsPage() {
  const { id } = useParams();
  const nav = useNavigate();
  if (!isGameId(id)) return <NotFoundPage />;
  const g = GAMES[id];
  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/games" className="text-sm text-ink-300 hover:text-white">
        → كل الألعاب
      </Link>
      <div className="card mt-4 overflow-hidden">
        <GameArt gameId={id} className="h-56 sm:h-72" big />
        <div className="p-6 sm:p-8">
          <h1 className="font-display text-5xl">{g.name}</h1>
          <p className="text-sm text-ink-400">{g.nameEn}</p>
          <p className="mt-4 text-lg text-ink-200">{g.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="chip">👥 {g.minPlayers}-{g.maxPlayers} لاعبين</span>
            <span className="chip">⏱️ ~{g.durationMin} دقيقة</span>
            {g.tags.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" icon={<Plus className="size-5" />} onClick={() => nav(`/create?game=${id}`)} data-testid="create-with-game">
              اعمل غرفة بهاللعبة
            </Button>
            {!PAGES && (
              <Button size="lg" variant="secondary" icon={<Zap className="size-5" />} onClick={() => nav(`/play?game=${id}`)}>
                لعب سريع
              </Button>
            )}
          </div>
          <h2 className="mt-10 text-2xl font-bold">طريقة اللعب</h2>
          <ol className="mt-4 space-y-3">
            {g.rules.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-500/25 text-sm font-bold text-brand-300">{i + 1}</span>
                <span className="text-ink-200">{r}</span>
              </li>
            ))}
          </ol>
          <h2 className="mt-10 text-2xl font-bold">الإعدادات المتاحة</h2>
          <ul className="mt-3 grid gap-2 text-sm text-ink-300 sm:grid-cols-2">
            {g.settings.map((s) => (
              <li key={s.key} className="rounded-xl bg-white/5 px-3 py-2">
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
