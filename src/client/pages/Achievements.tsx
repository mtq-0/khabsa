import { useEffect, useState } from 'react';
import { RANKS } from '../../shared/protocol.ts';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/session.ts';
import { PageTitle, Skeleton, cx } from '../components/ui.tsx';

interface Data {
  achievements: { id: string; title: string; description: string; emoji: string; xp: number }[];
  unlocked: Record<string, string>;
  counts: Record<string, number>;
}

export default function AchievementsPage() {
  const user = useSession((s) => s.user);
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    api<Data>('/api/achievements').then(setData).catch(() => {});
  }, [user?.id]);
  const done = data ? Object.keys(data.unlocked).length : 0;
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="الإنجازات" emoji="🏅" subtitle={data ? `فتحت ${done} من ${data.achievements.length}` : 'اجمعهم كلهم!'} />
      {!data ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.achievements.map((a) => {
            const got = data.unlocked[a.id];
            return (
              <div key={a.id} className={cx('card flex items-center gap-4 p-4', got ? 'border-sun-400/40' : 'opacity-60')}>
                <span className={cx('grid size-14 shrink-0 place-items-center rounded-2xl text-3xl', got ? 'bg-gradient-to-br from-sun-400/30 to-zing-500/30' : 'bg-white/5 grayscale')}>{a.emoji}</span>
                <div className="min-w-0">
                  <p className="font-bold">{a.title}</p>
                  <p className="text-xs text-ink-300">{a.description}</p>
                  <p className="mt-1 text-[11px] text-ink-400">
                    {a.xp ? `+${a.xp} XP · ` : ''}
                    {data.counts[a.id] ?? 0} لاعب فتحوه {got && `· فتحته ${new Date(got).toLocaleDateString('ar')}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <h2 className="mb-3 mt-10 font-display text-3xl">الرتب</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {RANKS.map((r) => (
          <div key={r.name} className={cx('card p-4 text-center', user && user.level >= r.min ? 'border-brand-400/50' : 'opacity-60')}>
            <p className="text-3xl">{r.emoji}</p>
            <p className="mt-1 text-sm font-bold">{r.name}</p>
            <p className="text-xs text-ink-400">من المستوى {r.min}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
