import { useState } from 'react';
import { Ban, Check, SkipForward } from 'lucide-react';
import type { RoomView } from '../../shared/protocol.ts';
import { Button, cx } from '../components/ui.tsx';
import { PhaseHeader, PlayerTag, useGameAction, useMembers } from '../room/common.tsx';

interface TabooView {
  phase: string;
  teams: Record<string, number>;
  teamScores: number[];
  turnTeam: number;
  explainer: string | null;
  turnNumber: number;
  totalTurns: number;
  skipsLeft: number;
  cardIndex: number;
  card: { word: string; forbidden: string[] } | null;
  played: { result: 'correct' | 'skip' | 'buzz'; word: string | null }[];
  feed: { id: number; pid: string; text: string; correct: boolean }[];
  me: { isPlayer: boolean; team: number | null; role: 'explainer' | 'guesser' | 'watcher' | 'spectator' };
}

const TEAM = [
  { name: 'البنفسجي', cls: 'from-brand-500 to-brand-700', dot: 'bg-brand-400' },
  { name: 'الكهربائي', cls: 'from-volt-500 to-brand-600', dot: 'bg-volt-400' },
];

export function TabooGame({ view }: { view: RoomView }) {
  const g = view.game as unknown as TabooView & NonNullable<RoomView['game']>;
  const act = useGameAction();
  const { byId, name } = useMembers(view);
  const [guess, setGuess] = useState('');
  const role = g.me.role;
  const cardPayload = { card: g.cardIndex };

  return (
    <div>
      <PhaseHeader game={{ ...g, round: g.turnNumber, totalRounds: g.totalTurns }} title={g.phase === 'ready' ? 'استعدوا!' : g.phase === 'turn' ? `دور ${TEAM[g.turnTeam].name}` : 'خلص الدور'} total={60} />
      <div className="mb-5 grid grid-cols-2 gap-3">
        {[0, 1].map((t) => (
          <div key={t} className={cx('theme-dark rounded-2xl bg-gradient-to-br p-3', TEAM[t].cls, g.turnTeam === t ? 'ring-2 ring-white/70' : 'opacity-70')}>
            <p className="text-sm font-bold">الفريق {TEAM[t].name}</p>
            <p className="font-display text-4xl" data-testid={`team-score-${t}`}>
              {g.teamScores[t]}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(g.teams)
                .filter(([, tt]) => tt === t)
                .map(([p]) => (
                  <span key={p} className="rounded-full bg-black/25 px-2 py-0.5 text-xs">
                    {name(p)}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      {g.phase === 'ready' && (
        <div className="card p-6 text-center">
          <p className="mb-3">الشارح:</p>
          <PlayerTag m={byId.get(g.explainer ?? '')} size={56} />
          {role === 'explainer' ? (
            <Button size="lg" className="mt-5 w-full" onClick={() => void act('start')} data-testid="taboo-start">
              أنا جاهز، بلّش!
            </Button>
          ) : (
            <p className="mt-4 text-ink-300">{role === 'guesser' ? 'إنت بتخمّن! جهّز حالك.' : 'إنت بتراقب. إذا قال كلمة ممنوعة اكبس "ممنوع!"'}</p>
          )}
        </div>
      )}

      {g.phase === 'turn' && (
        <div className="space-y-4">
          {g.card ? (
            <div className="mx-auto max-w-sm animate-flip overflow-hidden rounded-3xl border border-white/15 bg-ink-800 shadow-glow" data-testid="taboo-card">
              <div className="theme-dark bg-gradient-to-l from-zing-500 to-brand-600 p-5 text-center">
                <p className="font-display text-4xl">{g.card.word}</p>
              </div>
              <ul className="space-y-1 p-4 text-center">
                {g.card.forbidden.map((f) => (
                  <li key={f} className="flex items-center justify-center gap-2 text-lg text-ink-200">
                    <Ban className="size-4 text-zing-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="card p-8 text-center">
              <p className="text-5xl">🤔</p>
              <p className="mt-2 text-lg">
                <b>{name(g.explainer)}</b> عم يشرح... خمّنوا بالصوت أو اكتبوا!
              </p>
            </div>
          )}
          {role === 'explainer' && (
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" variant="volt" icon={<Check className="size-5" />} onClick={() => void act('correct', cardPayload)} data-testid="taboo-correct">
                صح!
              </Button>
              <Button size="lg" variant="secondary" icon={<SkipForward className="size-5" />} disabled={g.skipsLeft <= 0} onClick={() => void act('skip', cardPayload)}>
                تخطي ({g.skipsLeft})
              </Button>
            </div>
          )}
          {role === 'watcher' && (
            <Button size="lg" variant="danger" className="w-full" icon={<Ban className="size-5" />} onClick={() => void act('buzz', cardPayload)} data-testid="taboo-buzz">
              ممنوع!
            </Button>
          )}
          {role === 'guesser' && (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!guess.trim()) return;
                await act('guess', { text: guess });
                setGuess('');
              }}
            >
              <input className="field" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="اكتب تخمينك" maxLength={60} data-testid="taboo-guess" />
              <Button type="submit">خمّن</Button>
            </form>
          )}
          {!!g.feed.length && (
            <div className="card max-h-40 space-y-1 overflow-y-auto p-3 text-sm">
              {g.feed
                .slice()
                .reverse()
                .map((f) => (
                  <p key={f.id} className={f.correct ? 'font-bold text-lime-400' : 'text-ink-300'}>
                    {name(f.pid)}: {f.text} {f.correct && '✅'}
                  </p>
                ))}
            </div>
          )}
        </div>
      )}

      {(g.phase === 'turnEnd' || g.phase === 'turn') && !!g.played.length && (
        <div className="card mt-4 p-4">
          <p className="mb-2 text-sm font-bold">بطاقات هالدور</p>
          <div className="flex flex-wrap gap-2">
            {g.played.map((p, i) => (
              <span key={i} className={cx('chip', p.result === 'correct' ? 'text-lime-400' : p.result === 'buzz' ? 'text-zing-400' : 'text-ink-400')}>
                {p.result === 'correct' ? '✅' : p.result === 'buzz' ? '🚫' : '⏭️'} {p.word ?? '؟'}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
