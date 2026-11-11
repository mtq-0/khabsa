import { useState } from 'react';
import type { RoomView } from '../../shared/protocol.ts';
import { Button, cx } from '../components/ui.tsx';
import { PhaseHeader, PlayerTag, SecretCard, VoteGrid, useGameAction, useMembers } from '../room/common.tsx';

interface OddView {
  phase: string;
  players: string[];
  round: number;
  totalRounds: number;
  category: string;
  me: { isPlayer: boolean; question: string | null; answer: string | null; voted: string | null };
  answeredCount: number;
  answeredBy: string[];
  majorityQuestion: string | null;
  answers: Record<string, string> | null;
  readyToVote: string[];
  votedCount: number;
  reveal: null | { outsider: string; outsiderQuestion: string; caught: boolean; votes: Record<string, string>; counts: Record<string, number>; roundPoints: Record<string, number> };
}

export function OddQuestionGame({ view }: { view: RoomView }) {
  const g = view.game as unknown as OddView & NonNullable<RoomView['game']>;
  const act = useGameAction();
  const { byId, name } = useMembers(view);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const answers = g.answers && (
    <div className="grid gap-2 sm:grid-cols-2">
      {g.players.map((p) => (
        <div key={p} className={cx('card flex items-center gap-3 p-3', g.reveal?.outsider === p && 'border-zing-400')}>
          <PlayerTag m={byId.get(p)} size={34} />
          <p className="ms-auto max-w-[60%] text-end font-bold text-volt-200">{g.answers?.[p] ?? <span className="text-ink-500">ما جاوب</span>}</p>
        </div>
      ))}
    </div>
  );

  switch (g.phase) {
    case 'answer':
      return (
        <div>
          <PhaseHeader game={g} title="جاوب بسرعة ✍️" subtitle={`التصنيف: ${g.category}`} total={45} />
          {g.me.isPlayer ? (
            <>
              <SecretCard testId="question-card">
                <p className="text-sm text-white/75">سؤالك</p>
                <p className="mt-2 font-display text-3xl leading-snug" data-testid="my-question">
                  {g.me.question}
                </p>
              </SecretCard>
              <form
                className="mx-auto mt-5 flex max-w-md gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  const r = await act('answer', { text });
                  setBusy(false);
                  if (r.ok) setText('');
                }}
              >
                <input className="field" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder={g.me.answer ? `جوابك: ${g.me.answer}` : 'جوابك (قصير)'} data-testid="answer-input" />
                <Button type="submit" loading={busy} disabled={!text.trim()}>
                  {g.me.answer ? 'عدّل' : 'إرسال'}
                </Button>
              </form>
            </>
          ) : (
            <p className="text-center text-ink-300">اللاعبين عم يجاوبوا...</p>
          )}
          <p className="mt-4 text-center text-sm text-ink-400">
            {g.answeredCount}/{g.players.length} جاوبوا
          </p>
        </div>
      );
    case 'discuss':
      return (
        <div>
          <PhaseHeader game={g} title="مين الأطرش؟ 🤔" total={60} />
          <div className="card mb-4 p-4 text-center">
            <p className="text-xs text-ink-400">سؤال الأغلبية كان</p>
            <p className="mt-1 text-xl font-bold">{g.majorityQuestion}</p>
          </div>
          {answers}
          <div className="mt-5 text-center">
            {g.me.isPlayer && (
              <Button onClick={() => void act('ready-vote')} disabled={g.readyToVote.includes(view.you)} data-testid="ready-vote">
                {g.readyToVote.includes(view.you) ? 'بانتظار الباقي...' : 'جاهز للتصويت'}
              </Button>
            )}
            <p className="mt-2 text-sm text-ink-400">
              {g.readyToVote.length}/{g.players.length}
            </p>
          </div>
        </div>
      );
    case 'vote':
      return (
        <div>
          <PhaseHeader game={g} title="صوّت سراً 🗳️" subtitle={`${g.votedCount}/${g.players.length} صوّتوا`} total={30} />
          <div className="mb-4">{answers}</div>
          {g.me.isPlayer && <VoteGrid candidates={g.players} view={view} voted={g.me.voted} disabledIds={[view.you]} onVote={(id) => void act('vote', { target: id })} />}
        </div>
      );
    default: {
      const r = g.reveal;
      if (!r) return null;
      return (
        <div>
          <PhaseHeader game={g} title={r.caught ? 'انكشف الأطرش! 😱' : 'الأطرش هرب! 😎'} total={10} />
          <div className="card mb-4 flex flex-col items-center gap-2 p-5 text-center">
            <div className="animate-pop">
              <PlayerTag m={byId.get(r.outsider)} size={64} />
            </div>
            <p className="text-sm text-ink-300">سؤاله كان:</p>
            <p className="text-lg font-bold text-zing-400">{r.outsiderQuestion}</p>
            <p className="text-sm text-ink-300">وسؤالكم: {g.majorityQuestion}</p>
          </div>
          {answers}
          <div className="card mt-4 p-4">
            <p className="mb-2 font-bold">نقاط الجولة</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(r.roundPoints).map(([p, pts]) => (
                <span key={p} className="chip text-lime-400">
                  {name(p)} +{pts}
                </span>
              ))}
            </div>
          </div>
          {g.phase === 'roundEnd' && view.hostId === view.you && (
            <div className="mt-4 text-center">
              <Button onClick={() => void act('host:next')}>{g.round >= g.totalRounds ? 'النتيجة النهائية' : 'السؤال الجاي ←'}</Button>
            </div>
          )}
        </div>
      );
    }
  }
}
