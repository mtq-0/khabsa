import type { RoomView } from '../../shared/protocol.ts';
import { Button, cx } from '../components/ui.tsx';
import { PhaseHeader, PlayerTag, VoteGrid, useGameAction, useMembers } from '../room/common.tsx';

interface MLView {
  phase: string;
  prompt: string;
  anonymous: boolean;
  players: string[];
  me: { isPlayer: boolean; voted: string | null };
  votedCount: number;
  result: null | { counts: Record<string, number>; winners: string[]; votes: Record<string, string> | null; roundPoints: Record<string, number> };
  titles: Record<string, number>;
}

export function MostLikelyGame({ view }: { view: RoomView }) {
  const g = view.game as unknown as MLView & NonNullable<RoomView['game']>;
  const act = useGameAction();
  const { byId, name } = useMembers(view);
  const max = g.result ? Math.max(1, ...Object.values(g.result.counts)) : 1;
  return (
    <div>
      <PhaseHeader game={g} title={g.phase === 'vote' ? 'مين غالباً...' : 'النتيجة 😂'} subtitle={g.anonymous ? 'التصويت مخفي' : 'التصويت مكشوف'} total={20} />
      <div className="card relative mb-5 overflow-hidden p-6 text-center">
        <div className="absolute -start-10 -top-10 size-32 rounded-full bg-sun-400/20 blur-2xl" />
        <p className="relative font-display text-3xl leading-snug sm:text-4xl" data-testid="ml-prompt">
          {g.prompt}
        </p>
      </div>
      {g.phase === 'vote' ? (
        <>
          {g.me.isPlayer ? (
            <VoteGrid candidates={g.players} view={view} voted={g.me.voted} onVote={(id) => void act('vote', { target: id })} />
          ) : (
            <p className="text-center text-ink-300">عم يصوّتوا...</p>
          )}
          <p className="mt-3 text-center text-sm text-ink-400">
            {g.votedCount}/{g.players.length} صوّتوا
          </p>
        </>
      ) : (
        g.result && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-center gap-4">
              {g.result.winners.map((w) => (
                <div key={w} className="flex animate-pop flex-col items-center gap-2">
                  <span className="text-4xl">👑</span>
                  <PlayerTag m={byId.get(w)} size={64} />
                </div>
              ))}
              {!g.result.winners.length && <p className="text-ink-300">محدا صوّت 😶</p>}
            </div>
            <div className="card space-y-2 p-4">
              {g.players
                .slice()
                .sort((a, b) => (g.result!.counts[b] ?? 0) - (g.result!.counts[a] ?? 0))
                .map((p) => (
                  <div key={p} className="flex items-center gap-3">
                    <span className="w-28 truncate text-sm">{name(p)}</span>
                    <span className="h-6 flex-1 overflow-hidden rounded-full bg-white/5">
                      <span className={cx('flex h-full items-center justify-end rounded-full px-2 text-xs font-bold transition-[width] duration-700', g.result!.winners.includes(p) ? 'bg-gradient-to-l from-sun-400 to-zing-500 text-ink-950' : 'bg-brand-500/60')} style={{ width: `${((g.result!.counts[p] ?? 0) / max) * 100}%` }}>
                        {g.result!.counts[p] || ''}
                      </span>
                    </span>
                  </div>
                ))}
            </div>
            {g.result.votes && (
              <div className="card p-4 text-sm">
                {Object.entries(g.result.votes).map(([v, t]) => (
                  <p key={v}>
                    {name(v)} ← {name(t)}
                  </p>
                ))}
              </div>
            )}
            {view.hostId === view.you && g.phase === 'results' && (
              <div className="text-center">
                <Button onClick={() => void act('host:next')}>السؤال الجاي ←</Button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
