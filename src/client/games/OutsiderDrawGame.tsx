import type { DrawSegment, RoomView } from '../../shared/protocol.ts';
import { Button, cx } from '../components/ui.tsx';
import { useRoomContext } from '../lib/room.ts';
import { OutsiderRoulette } from './OutsiderRoulette.tsx';
import { PhaseHeader, PlayerTag, SecretCard, VoteGrid, useGameAction, useMembers } from '../room/common.tsx';
import { SharedCanvas, colorOf, type StrokeView } from './Sketch.tsx';

interface DrawOutsiderView {
  phase: string;
  players: string[];
  seenCount: number;
  order: string[];
  colors: Record<string, number>;
  drawer: string | null;
  turnNumber: number;
  minTurns: number;
  maxTurns: number;
  canVote: boolean;
  drawn: Record<string, number>;
  lap: number;
  laps: number;
  turnSeconds: number;
  maxStrokePoints: number;
  strokes: StrokeView[];
  readyToVote: string[];
  votedCount: number;
  me: { isPlayer: boolean; color: number | null; role?: 'insider' | 'outsider'; word?: string; category?: string | null; guessOptions?: string[]; voted?: string | null; guess?: string | null };
  reveal: null | { outsiders: string[]; caught: string[]; votes: Record<string, string>; counts: Record<string, number>; answer: string | null; guesses: Record<string, string>; roundPoints: Record<string, number> };
}
type G = DrawOutsiderView & NonNullable<RoomView['game']>;

function RoleCard({ g, compact }: { g: G; compact?: boolean }) {
  const me = g.me;
  if (!me.isPlayer) return <div className="card p-4 text-center text-ink-300">إنت متفرّج 👀 استنى الجولة الجاية.</div>;
  if (compact)
    return (
      <p className="mb-3 text-center text-sm" data-testid="role-reminder">
        {me.role === 'outsider' ? (
          <span className="chip text-zing-400">🙈 إنت برا الرسمة{me.category ? ` · ${me.category}` : ''}</span>
        ) : (
          <span className="chip text-volt-300">
            الكلمة: <b className="ms-1">{me.word}</b>
          </span>
        )}
      </p>
    );
  return me.role === 'outsider' ? (
    <SecretCard tone="zing" testId="role-card">
      <p className="text-5xl">🙈</p>
      <p className="mt-2 font-display text-4xl">إنت برا الرسمة!</p>
      <p className="mt-2 text-sm text-white/85">ما بتعرف الكلمة. لما ييجي دورك ارسم خط بيمشي مع رسمتهم وخبّص بذكاء... وحاول تعرف شو عم يرسموا.</p>
      {me.category && <p className="mt-3 inline-block rounded-full bg-black/25 px-3 py-1 text-sm">التصنيف: {me.category}</p>}
    </SecretCard>
  ) : (
    <SecretCard tone="brand" testId="role-card">
      <p className="text-sm text-white/80">كلكم بترسموا هالكلمة، كل واحد خط</p>
      <p className="mt-1 font-display text-5xl" data-testid="secret-word">
        {me.word}
      </p>
      {me.category && <p className="mt-3 inline-block rounded-full bg-black/25 px-3 py-1 text-sm">{me.category}</p>}
      <p className="mt-3 text-xs text-white/75">في لاعب واحد برا الرسمة. خطّك لازم يبيّن إنك بتعرفها، بس مش واضح كثير!</p>
    </SecretCard>
  );
}

/** Drawing order with each player's colour; the current drawer is highlighted. */
function Order({ g, view, mark }: { g: G; view: RoomView; mark?: string[] }) {
  const { byId } = useMembers(view);
  return (
    <ol className="mb-4 flex flex-wrap justify-center gap-2" data-testid="draw-order">
      {g.order.map((id) => (
        <li key={id} className={cx('chip gap-2', g.drawer === id && 'border-volt-400 bg-volt-400/15 text-white', mark?.includes(id) && 'border-zing-400 bg-zing-500/15')}>
          <span className="size-3 rounded-full ring-1 ring-white/40" style={{ background: colorOf(g.colors[id]) }} aria-hidden />
          {byId.get(id)?.name ?? 'لاعب'}
          {g.drawn && <span className="text-ink-400">· {g.drawn[id] ?? 0}</span>}
          {g.readyToVote?.includes(id) && ' ✅'}
          {mark?.includes(id) && ' 🙈'}
        </li>
      ))}
    </ol>
  );
}

export function OutsiderDrawGame({ view }: { view: RoomView }) {
  const g = view.game as unknown as G;
  const act = useGameAction();
  const { byId, name } = useMembers(view);
  const { code } = useRoomContext();
  const me = g.me;
  const sendStroke = async (segs: DrawSegment[]) => (await act('stroke', { segments: segs })).ok;

  switch (g.phase) {
    case 'reveal':
      return (
        <div>
          <PhaseHeader game={g} title="شوف بطاقتك 🤫" subtitle="محدا غيرك شايفها" total={12} />
          <RoleCard g={g} />
          <div className="mt-6 text-center">
            {me.isPlayer && (
              <Button size="lg" onClick={() => void act('seen')} data-testid="seen-btn">
                شفت، يلا نرسم 🖍
              </Button>
            )}
            <p className="mt-2 text-sm text-ink-400">
              {g.seenCount}/{g.players.length} جاهزين
            </p>
          </div>
        </div>
      );
    case 'turn': {
      const mine = g.drawer === view.you;
      return (
        <div>
          <PhaseHeader
            game={g}
            title={mine ? 'دورك! ارسم خط واحد ✍' : <>دور {name(g.drawer)} 🖍</>}
            subtitle={`الخط رقم ${g.turnNumber}${mine ? ' · حط إصبعك وارسم بدون ما تشيله' : ''}`}
            total={g.turnSeconds}
          />
          <RoleCard g={g} compact />
          <Order g={g} view={view} />
          <div className="mx-auto max-w-2xl">
            <SharedCanvas
              key={`${g.turnNumber}`}
              strokes={g.strokes}
              canDraw={mine}
              color={me.color ?? 0}
              maxPoints={g.maxStrokePoints}
              onStroke={sendStroke}
              live={{ code, turnKey: g.phaseKey, color: g.colors[g.drawer ?? ''] ?? 0 }}
            />
            {mine ? (
              <p className="mt-2 flex items-center justify-center gap-2 text-sm text-volt-300" data-testid="your-turn">
                لونك <span className="size-4 rounded-full ring-1 ring-white/50" style={{ background: colorOf(me.color) }} /> · خط واحد بس، فكّر قبل!
              </p>
            ) : (
              <p className="mt-2 text-center text-sm text-ink-400">استنى دورك... وراقب مين خطّه غريب 👀</p>
            )}
            {me.isPlayer && (
              <div className="mt-4 text-center">
                <Button variant={g.readyToVote.includes(view.you) ? 'secondary' : 'primary'} onClick={() => void act('ready-vote')} disabled={!g.canVote || g.readyToVote.includes(view.you)} data-testid="ready-vote">
                  {g.readyToVote.includes(view.you) ? 'بانتظار الباقي...' : 'جاهز للتصويت 🗳'}
                </Button>
                <p className="mt-2 text-sm text-ink-400" data-testid="ready-count">
                  {g.canVote ? `${g.readyToVote.length}/${g.players.length} جاهزين للتصويت · الدور عشوائي وبيضل لحد ما الكل يكبس` : `كل واحد لازم يرسم ${g.laps === 1 ? 'خط' : `${g.laps} خطوط`} على الأقل قبل التصويت`}
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }
    case 'discuss':
      return (
        <div>
          <PhaseHeader game={g} title="نقاش 🔥" subtitle="مين خطّه مش راكب؟ احكوا بالصوت أو بالشات" total={60} />
          <RoleCard g={g} compact />
          <Order g={g} view={view} />
          <div className="mx-auto max-w-2xl">
            <SharedCanvas strokes={g.strokes} canDraw={false} color={0} maxPoints={0} />
          </div>
          <div className="mt-5 text-center">
            {me.isPlayer && (
              <Button onClick={() => void act('ready-vote')} disabled={g.readyToVote.includes(view.you)} data-testid="ready-vote">
                {g.readyToVote.includes(view.you) ? 'بانتظار الباقي...' : 'جاهز للتصويت'}
              </Button>
            )}
            <p className="mt-2 text-sm text-ink-400">
              {g.readyToVote.length}/{g.players.length} جاهزين للتصويت
            </p>
          </div>
        </div>
      );
    case 'vote':
      return (
        <div>
          <PhaseHeader game={g} title="صوّت سراً 🗳" subtitle={`مين برا الرسمة؟ ${g.votedCount}/${g.players.length} صوّتوا`} total={30} />
          {me.isPlayer ? (
            <VoteGrid candidates={g.players} view={view} voted={me.voted ?? null} disabledIds={[view.you]} onVote={(id) => void act('vote', { target: id })} />
          ) : (
            <p className="text-center text-ink-300">اللاعبين عم يصوّتوا...</p>
          )}
          <div className="mx-auto mt-5 max-w-2xl">
            <Order g={g} view={view} />
            <SharedCanvas strokes={g.strokes} canDraw={false} color={0} maxPoints={0} />
          </div>
        </div>
      );
    case 'verdict':
    case 'guess':
    case 'roundEnd':
    case 'finished': {
      const r = g.reveal!;
      const outsiders = r.outsiders;
      const iAmOutsider = outsiders.includes(view.you);
      const done = g.phase === 'roundEnd' || g.phase === 'finished';
      return (
        <div>
          <PhaseHeader game={g} title={g.phase === 'guess' ? 'فرصة أخيرة 🎯' : r.caught.length ? 'انكشف! 😱' : 'هرب! 😎'} total={g.phase === 'guess' ? 25 : 10} />
          {g.phase === 'verdict' ? (
            <OutsiderRoulette view={view} players={g.players} outsiders={outsiders} caught={r.caught} label="برا الرسمة" seed={`${g.phaseKey}`} />
          ) : (
          <div className="card mb-5 p-5 text-center">
            <p className="text-sm text-ink-300">اللي كان برا الرسمة</p>
            <div className="mt-2 flex flex-wrap justify-center gap-4">
              {outsiders.map((o) => (
                <div key={o} className="flex animate-pop flex-col items-center gap-1">
                  <PlayerTag m={byId.get(o)} size={56} />
                  <span className={cx('chip', r.caught.includes(o) ? 'text-zing-400' : 'text-lime-400')}>{r.caught.includes(o) ? 'انكشف' : 'ما انكشف'}</span>
                </div>
              ))}
            </div>
          </div>
          )}
          {g.phase === 'guess' &&
            (iAmOutsider && me.guessOptions ? (
              <div className="card mb-5 p-5">
                <p className="mb-3 text-center font-bold">شو كانت الكلمة اللي رسموها؟</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {me.guessOptions.map((o) => (
                    <Button key={o} variant={me.guess === o ? 'volt' : 'secondary'} disabled={!!me.guess} onClick={() => void act('guess', { choice: o })} data-testid="guess-option">
                      {o}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mb-5 text-center text-ink-300">{outsiders.map(name).join(' و ')} عم يخمّن الكلمة من الرسمة...</p>
            ))}
          {done && (
            <div className="card mb-5 p-5 text-center">
              <p>
                الكلمة كانت: <b className="font-display text-3xl text-volt-300" data-testid="answer-word">{r.answer}</b>
              </p>
              {outsiders.map((o) => (
                <p key={o} className="mt-2 text-sm">
                  {name(o)} خمّن: <b>{r.guesses[o] ?? '—'}</b> {r.guesses[o] === r.answer ? '✅ +2' : r.guesses[o] ? '❌' : ''}
                </p>
              ))}
            </div>
          )}
          <div className="mx-auto mb-5 max-w-2xl">
            <Order g={g} view={view} mark={outsiders} />
            {/* at the end, the outsider's lines stand out */}
            <SharedCanvas strokes={g.strokes} canDraw={false} color={0} maxPoints={0} dimExcept={done ? outsiders : undefined} />
            {done && <p className="mt-2 text-center text-xs text-ink-400">الخطوط الواضحة هي خطوط اللي كان برا 🙈</p>}
          </div>
          {done && (
            <div className="card mb-5 p-5">
              <p className="mb-3 font-bold">مين صوّت لمين</p>
              <ul className="space-y-1 text-sm">
                {Object.entries(r.votes).map(([v, t]) => (
                  <li key={v}>
                    {name(v)} ← {name(t)} {outsiders.includes(t) && !outsiders.includes(v) ? '✅' : ''}
                  </li>
                ))}
                {!Object.keys(r.votes).length && <li className="text-ink-400">محدا صوّت 🤷</li>}
              </ul>
              <p className="mt-4 mb-2 font-bold">نقاط الجولة</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(r.roundPoints).map(([p, pts]) => (
                  <span key={p} className="chip text-lime-400">
                    {name(p)} +{pts}
                  </span>
                ))}
                {!Object.keys(r.roundPoints).length && <span className="text-sm text-ink-400">ما حدا أخذ نقاط</span>}
              </div>
            </div>
          )}
          {g.phase === 'roundEnd' && view.hostId === view.you && (
            <div className="text-center">
              <Button onClick={() => void act('host:next')}>{g.round >= g.totalRounds ? 'شوف النتيجة النهائية' : 'الجولة الجاية ←'}</Button>
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}
