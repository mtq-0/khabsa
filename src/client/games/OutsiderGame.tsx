import { useState } from 'react';
import { Eye, ZoomIn } from 'lucide-react';
import type { RoomView } from '../../shared/protocol.ts';
import { Button, Modal, cx } from '../components/ui.tsx';
import { OutsiderRoulette } from './OutsiderRoulette.tsx';
import { PhaseHeader, PlayerTag, SecretCard, VoteGrid, useGameAction, useMembers } from '../room/common.tsx';

interface PhotoCredit {
  author: string;
  license: string;
  licenseUrl?: string;
  page: string;
}

/** attribution line for a real photo (Wikimedia Commons, free license) */
function Credit({ c }: { c: PhotoCredit | null | undefined }) {
  if (!c) return null;
  return (
    <p className="mt-1 text-[11px] leading-snug text-ink-400" dir="ltr" data-testid="photo-credit">
      📷{' '}
      <a href={c.page} target="_blank" rel="noopener noreferrer" className="underline">
        {c.author.length > 60 ? `${c.author.slice(0, 57)}…` : c.author}
      </a>
      {' · '}
      {c.licenseUrl ? (
        <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline">
          {c.license}
        </a>
      ) : (
        c.license
      )}
      {' · Wikimedia Commons'}
    </p>
  );
}

interface OutsiderView {
  phase: string;
  variant: 'word' | 'picture';
  mode: 'easy' | 'normal' | 'hard';
  order: string[];
  asker: string | null;
  turns: number;
  asked: Record<string, number>;
  canVote: boolean;
  maxTurns: number;
  target: string | null;
  seenCount: number;
  readyToVote: string[];
  votedCount: number;
  outsiderCount: number;
  players: string[];
  me: { isPlayer: boolean; role?: 'insider' | 'outsider' | 'unknown'; word?: string; wordImage?: string; category?: string | null; image?: string | null; guessOptions?: string[]; voted?: string | null; guess?: string | null };
  reveal: null | { outsiders: string[]; caught: string[]; votes: Record<string, string>; counts: Record<string, number>; answer: string | null; word: string | null; wordImage?: string | null; imageA: string | null; imageB: string | null; labelB: string | null; credits?: { a: PhotoCredit; b: PhotoCredit | null } | null; guesses: Record<string, string>; roundPoints: Record<string, number> };
}

/**
 * A picture shown IN FULL (never cropped): portrait posters, landscape photos and the drawn
 * cards all keep their own proportions; very tall pictures are scaled down to fit the screen.
 * Tap to zoom.
 */
function PictureCard({ src, label, maxH = 'max-h-[48vh]' }: { src: string; label?: string; maxH?: string }) {
  const [zoom, setZoom] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="grid aspect-[4/3] w-full place-items-center rounded-2xl bg-black/25 p-3 text-center text-sm text-white/80" data-testid="picture-failed">
        ما قدرنا نحمّل الصورة {label ? `(${label})` : ''}
      </div>
    );
  return (
    <>
      <button onClick={() => setZoom(true)} className="group block w-full" aria-label="كبّر الصورة">
        {!loaded && <div className="skeleton aspect-[4/3] w-full" />}
        <span className={cx('relative mx-auto w-fit max-w-full', loaded ? 'block' : 'hidden')}>
          <img
            src={src}
            alt={label ?? 'صورتك السرية'}
            className={cx('block h-auto w-auto max-w-full rounded-2xl object-contain shadow-lg', maxH)}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            draggable={false}
            data-testid="picture-img"
          />
          <span className="absolute bottom-2 end-2 rounded-lg bg-black/50 p-1.5 text-white opacity-80 group-hover:opacity-100">
            <ZoomIn className="size-4" />
          </span>
        </span>
      </button>
      <Modal open={zoom} onClose={() => setZoom(false)} title={label ?? 'صورتك'} wide>
        <img src={src} alt={label ?? ''} className="mx-auto block h-auto max-h-[78vh] w-full rounded-2xl object-contain" />
      </Modal>
    </>
  );
}

function RoleCard({ g }: { g: OutsiderView }) {
  const [hidden, setHidden] = useState(false);
  const me = g.me;
  if (!me.isPlayer) return <p className="text-center text-ink-300">إنت متفرج بهالجولة 👀</p>;
  if (hidden)
    return (
      <button onClick={() => setHidden(false)} className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-3xl border border-dashed border-white/20 p-6 text-ink-300">
        <Eye className="size-5" /> اكبس لتشوف بطاقتك
      </button>
    );
  return (
    <div onDoubleClick={() => setHidden(true)}>
      {g.variant === 'word' ? (
        me.role === 'outsider' ? (
          <SecretCard tone="zing" testId="role-card">
            <p className="text-5xl">🕵️</p>
            <p className="mt-2 font-display text-4xl">إنت برا السالفة!</p>
            <p className="mt-2 text-sm text-white/80">ما بتعرف الكلمة. اسمع منيح، جاوب بذكاء، وحاول تكتشفها.</p>
            {me.category && <p className="mt-3 inline-block rounded-full bg-black/25 px-3 py-1 text-sm">التصنيف: {me.category}</p>}
          </SecretCard>
        ) : (
          <SecretCard testId="role-card">
            <p className="text-sm text-white/80">الكلمة السرية</p>
            <p className="mt-1 font-display text-5xl" data-testid="secret-word">
              {me.word}
            </p>
            {me.wordImage && (
              <div className="mx-auto mt-3 max-w-64" data-testid="word-image">
                <PictureCard src={me.wordImage} label={me.word} maxH="max-h-[38vh]" />
              </div>
            )}
            {me.category && <p className="mt-3 inline-block rounded-full bg-black/25 px-3 py-1 text-sm">{me.category}</p>}
            <p className="mt-3 text-xs text-white/70">في {g.outsiderCount > 1 ? `${g.outsiderCount} لاعبين` : 'لاعب واحد'} برا السالفة. لا تفضح الكلمة!</p>
          </SecretCard>
        )
      ) : (
        <SecretCard tone={me.role === 'outsider' ? 'zing' : 'volt'} testId="role-card">
          {me.image ? (
            <>
              <PictureCard src={me.image} />
              <p className="mt-3 text-sm text-white/85">{me.role === 'insider' ? 'هاي صورة الأغلبية. اوصفها بدون ما تفضحها.' : 'هاي صورتك. اوصفها بدون ما تفضحها... بس انتبه، يمكن تكون مختلفة 😉'}</p>
            </>
          ) : (
            <>
              <p className="text-5xl">🙈</p>
              <p className="mt-2 font-display text-4xl">إنت برا الصورة!</p>
              <p className="mt-2 text-sm text-white/80">ما إلك صورة. اسمع الأوصاف وخبّص بذكاء.</p>
            </>
          )}
          {me.category && <p className="mt-3 inline-block rounded-full bg-black/25 px-3 py-1 text-sm">{me.category}</p>}
        </SecretCard>
      )}
      <p className="mt-2 text-center text-xs text-ink-500">دبل كليك على البطاقة لإخفائها عن اللي حواليك</p>
    </div>
  );
}

export function OutsiderGame({ view }: { view: RoomView }) {
  const g = view.game as unknown as OutsiderView & RoomView['game'];
  const act = useGameAction();
  const { byId, name } = useMembers(view);
  const me = g.me;
  const isWord = g.variant === 'word';

  switch (g.phase) {
    case 'reveal':
      return (
        <div>
          <PhaseHeader game={g!} title="شوف بطاقتك 🤫" subtitle="محدا غيرك شايفها" total={12} />
          <RoleCard g={g} />
          <div className="mt-6 text-center">
            {me.isPlayer && (
              <Button size="lg" onClick={() => void act('seen')} data-testid="seen-btn">
                شفت، يلا نبلّش
              </Button>
            )}
            <p className="mt-2 text-sm text-ink-400">
              {g.seenCount}/{g.players.length} جاهزين
            </p>
          </div>
        </div>
      );
    case 'turns': {
      const myTurn = g.asker === view.you;
      return (
        <div>
          <PhaseHeader game={g!} title={isWord ? 'دور الأسئلة ❓' : 'دور الوصف 🗣️'} total={30} />
          <div className="card mb-5 flex flex-col items-center gap-3 p-5 text-center">
            {isWord ? (
              <p className="text-lg">
                <PlayerTag m={byId.get(g.asker!)} highlight /> <span className="mx-2 text-ink-400">بيسأل</span> <PlayerTag m={byId.get(g.target!)} />
              </p>
            ) : (
              <p className="text-lg">
                دور <PlayerTag m={byId.get(g.asker!)} highlight /> يوصف صورته بكلمة أو جملة
              </p>
            )}
            {myTurn && (
              <Button onClick={() => void act('turn:done')} data-testid="turn-done">
                خلصت دوري ✔
              </Button>
            )}
          </div>
          <ol className="mb-4 flex flex-wrap justify-center gap-2" data-testid="turn-list">
            {g.order.map((id) => (
              <li key={id} className={cx('chip', g.asker === id && 'border-volt-400 bg-volt-400/15 text-ink-100', g.readyToVote.includes(id) && 'border-lime-400/60')}>
                {name(id)} · {g.asked[id] ?? 0}
                {g.readyToVote.includes(id) && ' ✅'}
              </li>
            ))}
          </ol>
          {me.isPlayer && (
            <div className="mb-5 text-center">
              <Button variant={g.readyToVote.includes(view.you) ? 'secondary' : 'primary'} onClick={() => void act('ready-vote')} disabled={!g.canVote || g.readyToVote.includes(view.you)} data-testid="ready-vote">
                {g.readyToVote.includes(view.you) ? 'بانتظار الباقي...' : 'جاهز للتصويت 🗳'}
              </Button>
              <p className="mt-2 text-sm text-ink-400" data-testid="ready-count">
                {g.canVote ? `${g.readyToVote.length}/${g.players.length} جاهزين للتصويت · الأسئلة عشوائية وبتضل لحد ما الكل يكبس` : 'خلّوا كل واحد يسأل مرة على الأقل، بعدها بتقدروا تصوّتوا'}
              </p>
            </div>
          )}
          <RoleCard g={g} />
        </div>
      );
    }
    case 'discuss':
      return (
        <div>
          <PhaseHeader game={g!} title="نقاش 🔥" subtitle="مين جوابه غريب؟ احكوا بالصوت أو بالشات" total={60} />
          <RoleCard g={g} />
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
          <PhaseHeader game={g!} title="صوّت سراً 🗳️" subtitle={`مين ${isWord ? 'برا السالفة' : 'برا الصورة'}؟ ${g.votedCount}/${g.players.length} صوّتوا`} total={30} />
          {me.isPlayer ? (
            <VoteGrid candidates={g.players} view={view} voted={me.voted ?? null} disabledIds={[view.you]} onVote={(id) => void act('vote', { target: id })} />
          ) : (
            <p className="text-center text-ink-300">اللاعبين عم يصوّتوا...</p>
          )}
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
          <PhaseHeader game={g!} title={g.phase === 'guess' ? 'فرصة أخيرة 🎯' : r.caught.length ? 'انكشف! 😱' : 'هرب! 😎'} total={g.phase === 'guess' ? 25 : 10} />
          {g.phase === 'verdict' ? (
            <OutsiderRoulette view={view} players={g.players} outsiders={outsiders} caught={r.caught} label={isWord ? 'برا السالفة' : 'برا الصورة'} seed={`${g.phaseKey}`} />
          ) : (
          <div className="card mb-5 p-5 text-center">
            <p className="text-sm text-ink-300">{outsiders.length > 1 ? 'اللي كانوا برا' : 'اللي كان برا'}</p>
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
              <div className="card p-5">
                <p className="mb-3 text-center font-bold">{isWord ? 'شو الكلمة السرية؟' : 'شو كانت صورة الأغلبية؟'}</p>
                <div className="grid grid-cols-2 gap-2">
                  {me.guessOptions.map((o) => (
                    <Button key={o} variant={me.guess === o ? 'volt' : 'secondary'} disabled={!!me.guess} onClick={() => void act('guess', { choice: o })} data-testid="guess-option">
                      {o}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-ink-300">{outsiders.map(name).join(' و ')} عم {outsiders.length > 1 ? 'يخمّنوا' : 'يخمّن'}...</p>
            ))}
          {(g.phase === 'roundEnd' || g.phase === 'finished') && (
            <div className="space-y-4">
              <div className="card p-5 text-center">
                {isWord ? (
                  <div>
                    <p>
                      الكلمة كانت: <b className="font-display text-3xl text-volt-300">{r.word}</b>
                    </p>
                    {r.wordImage && (
                      <div className="mx-auto mt-3 max-w-xs">
                        <PictureCard src={r.wordImage} label={r.word ?? ''} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {r.imageA && (
                      <div>
                        <p className="mb-1 text-sm text-ink-300">صورة الأغلبية: {r.answer}</p>
                        <PictureCard src={r.imageA} label={r.answer ?? ''} />
                        <Credit c={r.credits?.a} />
                      </div>
                    )}
                    {r.imageB && (
                      <div>
                        <p className="mb-1 text-sm text-ink-300">صورة البرّا: {r.labelB}</p>
                        <PictureCard src={r.imageB} label={r.labelB ?? ''} />
                        <Credit c={r.credits?.b} />
                      </div>
                    )}
                    {!r.imageB && <p className="self-center text-ink-300">البرّا ما كان معه صورة. الصورة: {r.answer}</p>}
                  </div>
                )}
                {outsiders.map((o) => (
                  <p key={o} className="mt-2 text-sm">
                    {name(o)} خمّن: <b>{r.guesses[o] ?? '—'}</b> {r.guesses[o] === r.answer ? '✅ +1' : r.guesses[o] ? '❌' : ''}
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
              {g.phase === 'roundEnd' && view.hostId === view.you && (
                <div className="text-center">
                  <Button onClick={() => void act('host:next')}>{g.round >= g.totalRounds ? 'شوف النتيجة النهائية' : 'الجولة الجاية ←'}</Button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}
