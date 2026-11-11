import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { DoorOpen, Mic, MessageCircle, Plus, Sparkles, Users, Zap, ShieldCheck, Smartphone } from 'lucide-react';
import { GAME_IDS, GAMES, type GameId } from '../../shared/games.ts';
import { Button, GameArt, LogoMark, cx } from '../components/ui.tsx';
import { useSession } from '../lib/session.ts';
import { api } from '../lib/api.ts';
import { PAGES } from '../lib/mode.ts';

interface PlatformInfo {
  announcement: string;
  online: { online: number; rooms: number; playing: number };
  games: { id: GameId; enabled: boolean; featured: boolean }[];
}

export default function HomePage() {
  const nav = useNavigate();
  const user = useSession((s) => s.user);
  const [info, setInfo] = useState<PlatformInfo | null>(null);
  const [code, setCode] = useState('');
  useEffect(() => {
    api<PlatformInfo>('/api/platform')
      .then(setInfo)
      .catch(() => {});
  }, []);
  const featured = (info?.games.filter((g) => g.featured && g.enabled).map((g) => g.id) ?? ['outsider-word', 'odd-question', 'outsider-picture']) as GameId[];

  return (
    <div className="space-y-20">
      {info?.announcement && <div className="card border-sun-400/30 px-4 py-3 text-center text-sm text-sun-400">📣 {info.announcement}</div>}

      {/* ---------------------------------------------------------------- hero */}
      <section className="relative grid items-center gap-10 overflow-x-clip pt-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-rise">
          <span className="chip mb-5 border-brand-400/30 bg-brand-500/10 text-brand-300">
            <Sparkles className="size-3.5" /> اللعب بلّش... والخبصة علينا!
          </span>
          <h1 className="font-display text-6xl leading-[1.05] sm:text-7xl lg:text-8xl">
            وين الشلّة؟
            <br />
            <span className="text-gradient">يلا نخبّص!</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-200 sm:text-xl">ألعاب، تحديات، ضحك وخداع... كلهم بمكان واحد. اعمل غرفة، ابعت الرابط للشلة، واحكوا مع بعض بالصوت وانتو بتلعبوا.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" variant="volt" icon={<Zap className="size-5" />} onClick={() => nav(PAGES ? '/create' : '/play')} data-testid="play-now">
              العب هلأ
            </Button>
            <Button size="lg" icon={<Plus className="size-5" />} onClick={() => nav('/create')} data-testid="create-room">
              اعمل غرفة
            </Button>
          </div>
          <form
            className="mt-4 flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/join?code=${encodeURIComponent(code)}`);
            }}
          >
            <input className="field h-12 text-center font-mono text-lg tracking-[0.3em] uppercase" placeholder="رمز الغرفة" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} aria-label="رمز الغرفة" dir="ltr" />
            <Button type="submit" variant="secondary" className="h-12" icon={<DoorOpen className="size-4" />}>
              ادخل
            </Button>
          </form>
          {PAGES && (
            <p className="mt-6 max-w-xl rounded-xl bg-white/5 px-4 py-3 text-sm text-ink-300">
              🔗 نسخة GitHub: اللي بيعمل الغرفة بيصير هو السيرفر. خلّي صفحته مفتوحة طول ما إنتو بتلعبوا، والباقي بيدخلوا بالرابط من أي مكان.
            </p>
          )}
          <div className={cx('mt-8 flex flex-wrap items-center gap-5 text-sm text-ink-300', PAGES && 'hidden')}>
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-lime-400 shadow-[0_0_10px] shadow-lime-400" />
              <b className="text-ink-100">{info?.online.online ?? '—'}</b> لاعب أونلاين
            </span>
            <span>
              <b className="text-ink-100">{info?.online.playing ?? '—'}</b> لعبة شغالة هلأ
            </span>
            <span>
              <b className="text-ink-100">7</b> ألعاب
            </span>
          </div>
        </div>

        {/* floating game cards */}
        <div className="relative mx-auto aspect-square w-full max-w-md" aria-hidden>
          <div className="absolute inset-8 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="absolute inset-0 grid place-items-center">
            <LogoMark className="size-40 animate-float sm:size-48" />
          </div>
          {(['outsider-word', 'draw-guess', 'speed-quiz', 'odd-question'] as GameId[]).map((id, i) => (
            <div
              key={id}
              className="card absolute w-[38%] overflow-hidden sm:w-40"
              style={{
                top: ['2%', '8%', '62%', '58%'][i],
                insetInlineStart: ['0%', '58%', '4%', '56%'][i],
                transform: `rotate(${[-10, 8, 6, -7][i]}deg)`,
                animation: `float ${5 + i}s ease-in-out ${i * 0.6}s infinite`,
              }}
            >
              <GameArt gameId={id} className="h-20" />
              <p className="truncate px-3 py-2 text-xs font-bold">{GAMES[id].name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------------- actions */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/create', icon: Plus, title: 'اعمل غرفة', text: 'غرفة خاصة لشلتك برمز ورابط', color: 'from-brand-500/30' },
          { to: '/join', icon: DoorOpen, title: 'ادخل غرفة', text: 'معك رمز؟ اكتبه وادخل فوراً', color: 'from-volt-500/25' },
          { to: '/play', icon: Zap, title: 'لعب سريع', text: 'انضم لغرفة عامة مع ناس جداد', color: 'from-zing-500/25' },
          { to: '/friends', icon: Users, title: 'الأصحاب والدعوات', text: user ? 'شوف مين أونلاين واعزمهم' : 'سجّل لتضيف أصحابك', color: 'from-sun-400/20' },
        ]
          .filter((a) => !PAGES || a.to === '/create' || a.to === '/join')
          .map((a) => (
          <Link key={a.to} to={a.to} className={cx('card group bg-gradient-to-b to-transparent p-5 transition hover:-translate-y-1 hover:shadow-glow', a.color)}>
            <a.icon className="size-8 text-volt-300 transition group-hover:scale-110" />
            <h3 className="mt-4 text-lg font-bold">{a.title}</h3>
            <p className="mt-1 text-sm text-ink-300">{a.text}</p>
          </Link>
        ))}
      </section>

      {/* ------------------------------------------------------------- featured */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-display text-4xl">ألعاب مميزة 🔥</h2>
            <p className="text-ink-300">الأكثر خبصة هالأسبوع</p>
          </div>
          <Link to="/games" className="text-sm font-semibold text-volt-300 hover:underline">
            كل الألعاب ←
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {featured.slice(0, 3).map((id) => (
            <Link key={id} to={`/games/${id}`} className="card group overflow-hidden transition hover:-translate-y-1 hover:shadow-glow">
              <GameArt gameId={id} className="h-44" big />
              <div className="p-5">
                <h3 className="text-xl font-bold">{GAMES[id].name}</h3>
                <p className="mt-1 text-sm text-ink-300">{GAMES[id].tagline}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="chip">
                    {GAMES[id].minPlayers}-{GAMES[id].maxPlayers} لاعبين
                  </span>
                  <span className="chip">~{GAMES[id].durationMin} دقيقة</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- library row */}
      <section>
        <h2 className="mb-6 font-display text-4xl">مكتبة الألعاب</h2>
        <div className="scrollbar-thin -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3">
          {GAME_IDS.map((id) => (
            <Link key={id} to={`/games/${id}`} className="card w-52 shrink-0 snap-start overflow-hidden transition hover:-translate-y-1">
              <GameArt gameId={id} className="h-28" />
              <div className="p-3">
                <p className="font-bold">{GAMES[id].name}</p>
                <p className="truncate text-xs text-ink-300">{GAMES[id].tagline}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- how to play */}
      <section className="card relative overflow-hidden p-6 sm:p-10">
        <div className="absolute -end-20 -top-20 size-72 rounded-full bg-brand-500/20 blur-3xl" />
        <h2 className="relative font-display text-4xl">كيف بنلعب؟</h2>
        <div className="relative mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: '١', t: 'اختار اسم وشكل', d: 'بدون تسجيل. ادخل كضيف بثواني، أو سجّل لتحفظ نقاطك وأصحابك.' },
            { n: '٢', t: 'اعمل غرفة', d: 'خاصة أو عامة، واختار اللعبة والإعدادات.' },
            { n: '٣', t: 'ابعت الرابط', d: 'شارك الرمز أو الرابط على واتساب، والشلة بتدخل من أي جهاز وأي بلد.' },
            { n: '٤', t: 'احكوا والعبوا', d: 'صوت وشات مباشر، والخادم هو اللي بيوزع الأسرار ويحسب النقاط.' },
          ].map((s) => (
            <div key={s.n}>
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-volt-500 font-display text-2xl">{s.n}</span>
              <h3 className="mt-4 text-lg font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-300">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="relative mt-10 grid gap-3 text-sm text-ink-200 sm:grid-cols-4">
          <span className="flex items-center gap-2"><Mic className="size-4 text-volt-300" /> دردشة صوتية جماعية</span>
          <span className="flex items-center gap-2"><MessageCircle className="size-4 text-volt-300" /> شات مع إيموجي</span>
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-volt-300" /> أسرار محمية ضد الغش</span>
          <span className="flex items-center gap-2"><Smartphone className="size-4 text-volt-300" /> موبايل، تابلت وكمبيوتر</span>
        </div>
      </section>
    </div>
  );
}
