/**
 * Audio UI glue: sound/music toggles, a click sound for anything you press,
 * and the music on/off + mood wiring.
 */
import { useEffect } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';
import type { SessionUser, UserSettings } from '../../shared/protocol.ts';
import { api, errorText } from '../lib/api.ts';
import { useSession } from '../lib/session.ts';
import { cx, toast } from '../components/ui.tsx';
import { refreshMusic, setMusicEnabled, setMusicMood, type Mood } from './music.ts';
import { setSoundEnabled, sfx, unlockAudio } from './sound.ts';

export function useAudioSettings() {
  const user = useSession((s) => s.user);
  const set = useSession((s) => s.set);
  const soundOn = user?.settings.sound !== false;
  const musicOn = user?.settings.music !== false;
  const toggle = async (key: keyof Pick<UserSettings, 'sound' | 'music'>) => {
    const next = !(key === 'sound' ? soundOn : musicOn);
    // apply at once (and play the click if sound was just turned on); the server keeps the choice
    if (key === 'sound') {
      setSoundEnabled(next);
      if (next) sfx.click();
    } else setMusicEnabled(next);
    if (!user) return;
    try {
      const r = await api<{ user: SessionUser }>('/api/me', { method: 'PATCH', body: { settings: { [key]: next } } });
      set(r.user);
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return { soundOn, musicOn, toggle };
}

/** The two speaker / music buttons. */
export function AudioToggles({ className }: { className?: string }) {
  const { soundOn, musicOn, toggle } = useAudioSettings();
  const btn = 'relative grid size-9 place-items-center rounded-xl text-ink-300 transition hover:bg-white/10';
  return (
    <div className={cx('flex items-center', className)}>
      <button type="button" className={btn} onClick={() => void toggle('music')} aria-label={musicOn ? 'سكّر الموسيقى' : 'شغّل الموسيقى'} aria-pressed={musicOn} title="الموسيقى" data-testid="music-toggle">
        <Music className={cx('size-5', !musicOn && 'opacity-40')} />
        {!musicOn && <span className="absolute h-0.5 w-6 rotate-45 rounded bg-zing-400" aria-hidden />}
      </button>
      <button type="button" className={btn} onClick={() => void toggle('sound')} aria-label={soundOn ? 'سكّر الصوت' : 'شغّل الصوت'} aria-pressed={!soundOn} title="الأصوات" data-testid="sound-toggle">
        {soundOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
      </button>
    </div>
  );
}

const PRESSABLE = 'button, a[href], [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], [role="option"], input[type="checkbox"], input[type="radio"], select, summary';

function clickSound(el: Element) {
  const hint = el.getAttribute('data-sfx');
  if (hint === 'none') return;
  if (hint === 'press' || hint === 'thud' || hint === 'swish' || hint === 'tick2') return sfx[hint]();
  const role = el.getAttribute('role');
  if (role === 'tab' || role === 'radio' || role === 'switch' || role === 'checkbox' || role === 'option' || el.matches('input, select, summary')) return sfx.tick2();
  if (el.matches('a[href]')) return sfx.swish();
  const cls = el.getAttribute('class') ?? '';
  if (cls.includes('bg-zing-500')) return sfx.thud();
  if (cls.includes('from-brand-500') || cls.includes('shadow-glow')) return sfx.press();
  return sfx.click();
}

/** Mount once (in the Layout): wires settings, click sounds and the music. */
export function useAudioRuntime() {
  const settings = useSession((s) => s.user?.settings);
  useEffect(() => {
    setSoundEnabled(settings?.sound !== false);
    setMusicEnabled(settings?.music !== false);
  }, [settings?.sound, settings?.music]);

  useEffect(() => {
    // browsers only allow audio after a user gesture
    const unlock = () => {
      unlockAudio();
      refreshMusic();
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(PRESSABLE);
      if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
      clickSound(el);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('click', onClick, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('click', onClick, { capture: true });
    };
  }, []);
}

/** Pick the music mood for the current screen ("game" while playing). */
export function useMusicMood(mood: Mood) {
  useEffect(() => {
    setMusicMood(mood);
    return () => setMusicMood('lobby');
  }, [mood]);
}
