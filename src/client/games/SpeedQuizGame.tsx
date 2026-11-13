import type { RoomView } from '../../shared/protocol.ts';
import { cx } from '../components/ui.tsx';
import { PhaseHeader, Scoreboard, useGameAction, useMembers } from '../room/common.tsx';

interface QuizView {
  phase: string;
  question: { text: string; options: string[]; category: string } | null;
  correct: number | null;
  answeredCount: number;
  players: string[];
  scores: Record<string, number>;
  me: { isPlayer: boolean; answer: number | null; streak: number };
  reveal: null | { answers: Record<string, number>; roundPoints: Record<string, number>; firstCorrect: string | null; streaks: Record<string, number> };
}

const COLORS = ['from-brand-500 to-brand-700', 'from-volt-500 to-sky-700', 'from-zing-500 to-rose-700', 'from-amber-400 to-orange-600'];
const LETTERS = ['أ', 'ب', 'ج', 'د'];

export function SpeedQuizGame({ view }: { view: RoomView }) {
  const g = view.game as unknown as QuizView & NonNullable<RoomView['game']>;
  const act = useGameAction();
  const { name } = useMembers(view);
  if (g.phase === 'countdown')
    return (
      <div className="py-16 text-center">
        <p className="font-display text-6xl text-gradient">استعدوا!</p>
        <p className="mt-3 text-ink-300">أول سؤال جاي هلأ... ⚡</p>
      </div>
    );
  const q = g.question;
  if (!q) return null;
  const revealed = g.phase === 'reveal';
  return (
    <div>
      <PhaseHeader game={g} title={`سؤال ${g.round}`} subtitle={q.category} total={15} />
      <div className="card mb-5 p-6 text-center">
        <p className="text-2xl font-bold leading-relaxed sm:text-3xl" data-testid="quiz-question">
          {q.text}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => {
          const mine = g.me.answer === i;
          const right = revealed && g.correct === i;
          const wrong = revealed && mine && g.correct !== i;
          return (
            <button
              key={i}
              disabled={!g.me.isPlayer || g.me.answer != null || revealed}
              onClick={() => void act('answer', { choice: i })}
              data-testid={`quiz-option-${i}`}
              className={cx(
                'theme-dark flex min-h-16 items-center gap-3 rounded-2xl bg-gradient-to-l p-4 text-start text-lg font-bold text-[#fff] transition active:scale-[0.98]',
                COLORS[i],
                mine && !revealed && 'ring-4 ring-[#fff]',
                right && 'ring-4 ring-lime-400',
                wrong && 'opacity-60 ring-4 ring-zing-500',
                revealed && !right && !mine && 'opacity-40',
                g.me.answer != null && !mine && !revealed && 'opacity-50',
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-black/25">{LETTERS[i]}</span>
              <span>{o}</span>
              {right && <span className="ms-auto">✅</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-center text-sm text-ink-400">
        {g.answeredCount}/{g.players.length} جاوبوا {g.me.streak >= 2 && <span className="ms-2 text-sun-400">🔥 سلسلة {g.me.streak}</span>}
      </p>
      {revealed && g.reveal && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="card p-4">
            <p className="mb-2 font-bold">نقاط السؤال</p>
            {g.reveal.firstCorrect && <p className="mb-2 text-sm text-sun-400">⚡ الأسرع: {name(g.reveal.firstCorrect)}</p>}
            <div className="flex flex-wrap gap-2">
              {g.players.map((p) => (
                <span key={p} className={cx('chip', (g.reveal!.roundPoints[p] ?? 0) > 0 ? 'text-lime-400' : 'text-ink-400')}>
                  {name(p)} +{g.reveal!.roundPoints[p] ?? 0}
                </span>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <p className="mb-2 font-bold">الترتيب</p>
            <Scoreboard view={view} scores={g.scores} />
          </div>
        </div>
      )}
    </div>
  );
}
