import { useEffect, useRef, useState } from 'react';
import type { DrawSegment, RoomView } from '../../shared/protocol.ts';
import { Button, cx } from '../components/ui.tsx';
import { useRoomContext } from '../lib/room.ts';
import { PhaseHeader, PlayerTag, SecretCard, VoteGrid, useGameAction, useMembers } from '../room/common.tsx';
import { SketchView, Sketchpad } from './Sketch.tsx';

interface DrawOutsiderView {
  phase: string;
  players: string[];
  seenCount: number;
  done: string[];
  readyToVote: string[];
  votedCount: number;
  maxPoints: number;
  me: { isPlayer: boolean; role?: 'insider' | 'outsider'; word?: string; category?: string | null; drawing?: DrawSegment[]; done?: boolean; guessOptions?: string[]; voted?: string | null; guess?: string | null };
  gallery: { pid: string; segments: DrawSegment[] }[] | null;
  reveal: null | { outsiders: string[]; caught: string[]; votes: Record<string, string>; counts: Record<string, number>; answer: string | null; guesses: Record<string, string>; roundPoints: Record<string, number> };
}

function RoleCard({ g }: { g: DrawOutsiderView }) {
  const me = g.me;
  if (!me.isPlayer) return <div className="card p-6 text-center text-ink-300">إنت متفرّج 👀 استنى الجولة الجاية.</div>;
  return me.role === 'outsider' ? (
    <SecretCard tone="zing" testId="role-card">
      <p className="text-5xl">🙈</p>
      <p className="mt-2 font-display text-4xl">إنت برا الرسمة!</p>
      <p className="mt-2 text-sm text-white/85">ما بتعرف الكلمة. ارسم إشي بيمشي مع الجو وخبّص بذكاء، وبعدين حاول تعرف الكلمة من رسوماتهم.</p>
      {me.category && <p className="mt-3 inline-block rounded-full bg-black/25 px-3 py-1 text-sm">التصنيف: {me.category}</p>}
    </SecretCard>
  ) : (
    <SecretCard tone="brand" testId="role-card">
      <p className="text-sm text-white/80">ارسم هالكلمة</p>
      <p className="mt-1 font-display text-5xl" data-testid="secret-word">
        {me.word}
      </p>
      {me.category && <p className="mt-3 inline-block rounded-full bg-black/25 px-3 py-1 text-sm">{me.category}</p>}
      <p className="mt-3 text-xs text-white/75">في لاعب واحد برا الرسمة. ارسمها واضحة بس مش كثير، عشان ما يعرفها منك!</p>
    </SecretCard>
  );
}

/** The private drawing step: autosaves while you draw and hands in the drawing when you're done. */
function DrawStep({ g, total }: { g: DrawOutsiderView & NonNullable<RoomView['game']>; total: number }) {
  const act = useGameAction();
  const { clockOffset } = useRoomContext();
  const me = g.me;
  const latest = useRef<DrawSegment[]>(me.drawing ?? []);
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [done, setDone] = useState(!!me.done);
  const [sending, setSending] = useState(false);

  const save = async () => {
    if (saving.current || !dirty.current || done) return;
    saving.current = true;
    dirty.current = false;
    await act('drawing', { segments: latest.current });
    saving.current = false;
    if (dirty.current) void save();
  };
  const onChange = (segs: DrawSegment[]) => {
    latest.current = segs;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
  };
  // last chance to save just before time runs out
  useEffect(() => {
    if (g.deadline == null) return;
    const ms = g.deadline - (Date.now() + clockOffset) - 1500;
    const t = setTimeout(() => void save(), Math.max(0, ms));
    return () => clearTimeout(t);
  });
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const handIn = async () => {
    if (timer.current) clearTimeout(timer.current);
    setSending(true);
    const r = await act('drawing', { segments: latest.current, done: true });
    setSending(false);
    if (r.ok) setDone(true);
  };

  return (
    <div>
      <PhaseHeader game={g} title={me.role === 'outsider' ? 'ارسم... وخبّص 🙈' : `ارسم: ${me.word}`} subtitle={me.role === 'outsider' ? (me.category ? `إنت برا الرسمة. التصنيف: ${me.category}` : 'إنت برا الرسمة. ارسم إشي يقنعهم!') : 'محدا شايف رسمتك لحد ما يخلص الوقت'} total={total} />
      {me.isPlayer ? (
        <div className="mx-auto max-w-2xl">
          <Sketchpad initial={me.drawing ?? []} disabled={done} maxInk={g.maxPoints - 20} onChange={onChange} />
          <div className="mt-4 text-center">
            {done ? (
              <p className="font-bold text-volt-300" data-testid="draw-handed-in">
                سلّمت رسمتك ✔ بانتظار الباقي...
              </p>
            ) : (
              <Button size="lg" onClick={() => void handIn()} loading={sending} data-testid="draw-done">
                خلصت رسمتي ✔
              </Button>
            )}
            <p className="mt-2 text-sm text-ink-400">
              {g.done.length}/{g.players.length} خلصوا
            </p>
          </div>
        </div>
      ) : (
        <p className="text-center text-ink-300">اللاعبين عم يرسموا... 🎨</p>
      )}
    </div>
  );
}

function Gallery({ g, view, highlight }: { g: DrawOutsiderView; view: RoomView; highlight?: string[] }) {
  const { byId } = useMembers(view);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3" data-testid="gallery">
      {(g.gallery ?? []).map(({ pid, segments }) => (
        <figure key={pid} className={cx('card overflow-hidden p-2 transition', highlight?.includes(pid) && 'ring-2 ring-zing-400')} data-testid={`drawing-${pid}`}>
          <SketchView segments={segments} label={`رسمة ${byId.get(pid)?.name ?? ''}`} />
          <figcaption className="mt-2 flex items-center justify-between gap-2 px-1">
            <PlayerTag m={byId.get(pid)} size={24} />
            {highlight?.includes(pid) && <span className="chip text-zing-400">برا 🙈</span>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function OutsiderDrawGame({ view }: { view: RoomView }) {
  const g = view.game as unknown as DrawOutsiderView & NonNullable<RoomView['game']>;
  const act = useGameAction();
  const { byId, name } = useMembers(view);
  const me = g.me;

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
    case 'draw':
      // keyed by round so a new round starts with an empty pad
      return <DrawStep key={g.phaseKey} g={g} total={Number(view.settings.drawSeconds) || 50} />;
    case 'gallery':
      return (
        <div>
          <PhaseHeader game={g} title="معرض الرسومات 🖼" subtitle="مين رسمته مش راكبة؟ احكوا بالصوت أو بالشات" total={60} />
          <Gallery g={g} view={view} />
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
          <div className="mt-5">
            <Gallery g={g} view={view} />
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
      return (
        <div>
          <PhaseHeader game={g} title={g.phase === 'guess' ? 'فرصة أخيرة 🎯' : r.caught.length ? 'انكشف! 😱' : 'هرب! 😎'} total={g.phase === 'guess' ? 25 : 10} />
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
              <p className="mb-5 text-center text-ink-300">{outsiders.map(name).join(' و ')} عم يخمّن الكلمة من رسوماتكم...</p>
            ))}
          {(g.phase === 'roundEnd' || g.phase === 'finished') && (
            <div className="mb-5 space-y-4">
              <div className="card p-5 text-center">
                <p>
                  الكلمة كانت: <b className="font-display text-3xl text-volt-300" data-testid="answer-word">{r.answer}</b>
                </p>
                {outsiders.map((o) => (
                  <p key={o} className="mt-2 text-sm">
                    {name(o)} خمّن: <b>{r.guesses[o] ?? '—'}</b> {r.guesses[o] === r.answer ? '✅ +2' : r.guesses[o] ? '❌' : ''}
                  </p>
                ))}
              </div>
              <div className="card p-5">
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
            </div>
          )}
          <Gallery g={g} view={view} highlight={outsiders} />
          {g.phase === 'roundEnd' && view.hostId === view.you && (
            <div className="mt-5 text-center">
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
