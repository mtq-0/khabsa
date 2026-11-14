/**
 * Background music: one song (public/music/theme.mp3, 2 minutes), looped.
 *
 *  - "lobby": home pages, room lobby, results (a bit louder)
 *  - "game":  while a game is being played (quieter, so talking and the sound effects stay clear)
 *
 * Plays only after a user gesture (browser rule), pauses while the tab is hidden,
 * fades in and out, and is quiet by design so it never covers voice chat.
 */
import { asset } from '../lib/mode.ts';

export type Mood = 'lobby' | 'game';

const VOLUME: Record<Mood, number> = { lobby: 0.22, game: 0.14 };
const FADE_MS = 1200;

let enabled = true;
let mood: Mood = 'lobby';
let el: HTMLAudioElement | null = null;
let fade: ReturnType<typeof setInterval> | null = null;
let gestureWait = false;

function audio(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null;
  if (!el) {
    el = new Audio(asset('music/theme.mp3'));
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0;
    el.dataset.music = '1';
    el.setAttribute('playsinline', '');
    // the music is not part of the page's audio elements that voice chat looks at; keep it out of the DOM
  }
  return el;
}

function shouldPlay() {
  return enabled && typeof document !== 'undefined' && !document.hidden;
}

/** moves the volume to `to` over FADE_MS, then calls `done` */
function fadeTo(a: HTMLAudioElement, to: number, done?: () => void) {
  if (fade) clearInterval(fade);
  const from = a.volume;
  const t0 = performance.now();
  fade = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / FADE_MS);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k >= 1) {
      if (fade) clearInterval(fade);
      fade = null;
      done?.();
    }
  }, 50);
}

function waitForGesture() {
  if (gestureWait || typeof window === 'undefined') return;
  gestureWait = true;
  const retry = () => {
    window.removeEventListener('pointerdown', retry);
    window.removeEventListener('keydown', retry);
    gestureWait = false;
    refreshMusic();
  };
  window.addEventListener('pointerdown', retry, { once: true, passive: true });
  window.addEventListener('keydown', retry, { once: true });
}

function start() {
  const a = audio();
  if (!a) return;
  if (!a.paused) {
    fadeTo(a, VOLUME[mood]);
    return;
  }
  // browsers start audio only after a user gesture: play() is rejected until then, so try again at the next tap
  void a.play().then(
    () => fadeTo(a, VOLUME[mood]),
    () => waitForGesture(),
  );
}

function stop() {
  const a = el;
  if (!a || a.paused) return;
  fadeTo(a, 0, () => a.pause());
}

/** Re-evaluate after a gesture, a setting change or a visibility change. */
export function refreshMusic() {
  if (shouldPlay()) start();
  else stop();
}

export function setMusicEnabled(on: boolean) {
  enabled = on;
  refreshMusic();
}

export function setMusicMood(m: Mood) {
  if (m === mood) return;
  mood = m;
  if (el && !el.paused) fadeTo(el, VOLUME[mood]);
}

export const musicState = () => ({ enabled, mood, playing: !!el && !el.paused });

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refreshMusic);

/** live snapshot for tests / support: window.__khabsaMusic() */
if (typeof window !== 'undefined')
  (window as unknown as { __khabsaMusic: () => unknown }).__khabsaMusic = () => ({ playing: !!el && !el.paused, time: el?.currentTime ?? 0, volume: el?.volume ?? 0, mood, enabled });
