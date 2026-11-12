/**
 * Background music, generated live with the Web Audio API (no files, nothing to license).
 * Levantine flavour: maqam scales with quarter tones, an oud-like plucked melody,
 * a soft drone and a darbuka playing the maqsoum rhythm (دُم تَك - تَك دُم - تَك -).
 *
 *  - "lobby": maqam Bayati, relaxed (home pages, room lobby, results)
 *  - "game":  maqam Hijaz, faster and tenser (while a game is being played)
 *
 * Plays only after a user gesture (browser rule), pauses while the tab is hidden,
 * and is quiet by design so it never covers voice chat or the sound effects.
 */
import { audioContext } from './sound.ts';

export type Mood = 'lobby' | 'game';

const D4 = 293.66;
const cents = (c: number) => D4 * Math.pow(2, c / 1200);
// scale degrees in cents above D (one octave + a bit); 150 = E half-flat (the Bayati quarter tone)
const SCALES: Record<Mood, number[]> = {
  lobby: [0, 150, 300, 500, 700, 800, 1000, 1200, 1350, 1500],
  game: [0, 100, 400, 500, 700, 800, 1000, 1200, 1300, 1600],
};
const BPM: Record<Mood, number> = { lobby: 92, game: 118 };
const VOLUME = 0.11;
// maqsoum over 8 eighth notes: D T . T D . T .
const DRUM: ('D' | 'T' | 'k' | null)[] = ['D', 'T', 'k', 'T', 'D', 'k', 'T', 'k'];

let enabled = true;
let mood: Mood = 'lobby';
let playing = false;
let out: GainNode | null = null;
let drone: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0;
let phrase: (number | null)[] = [];
let phraseRepeats = 0;
let noiseBuf: AudioBuffer | null = null;
let waiting = false;

const rand = (n: number) => Math.floor(Math.random() * n);

function makePhrase(): (number | null)[] {
  // 16 eighth notes; a random walk around the lower tetrachord that comes home to the tonic or fifth
  const notes: (number | null)[] = [];
  let deg = [0, 2, 4][rand(3)];
  for (let i = 0; i < 16; i++) {
    const strong = i % 4 === 0;
    if (!strong && Math.random() < (mood === 'game' ? 0.35 : 0.5)) {
      notes.push(null);
      continue;
    }
    const r = Math.random();
    deg += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.82 ? 2 : r < 0.92 ? -2 : 0;
    deg = Math.max(0, Math.min(SCALES[mood].length - 1, deg));
    notes.push(deg);
  }
  notes[14] = null;
  notes[12] = [0, 4][rand(2)];
  notes[15] = null;
  return notes;
}

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 0.2);
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(ac: AudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out!);
  return g;
}

function doum(ac: AudioContext, t: number, v = 1) {
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
  o.connect(env(ac, t, 0.9 * v, 0.005, 0.32));
  o.start(t);
  o.stop(t + 0.4);
}

function tak(ac: AudioContext, t: number, v = 1) {
  const s = ac.createBufferSource();
  s.buffer = noise(ac);
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = v < 0.6 ? 2600 : 3400;
  f.Q.value = 1.2;
  s.connect(f).connect(env(ac, t, 0.55 * v, 0.002, 0.07));
  s.start(t);
  s.stop(t + 0.12);
  const o = ac.createOscillator(); // the "skin" ring of the darbuka
  o.type = 'triangle';
  o.frequency.setValueAtTime(420, t);
  o.connect(env(ac, t, 0.12 * v, 0.002, 0.05));
  o.start(t);
  o.stop(t + 0.08);
}

function oud(ac: AudioContext, t: number, freq: number, len: number) {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(2600, t);
  f.frequency.exponentialRampToValueAtTime(700, t + len);
  f.Q.value = 2;
  const g = env(ac, t, 0.42, 0.004, len);
  f.connect(g);
  for (const [type, detune, vol] of [['sawtooth', 0, 0.5], ['triangle', 7, 0.7]] as const) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    const og = ac.createGain();
    og.gain.value = vol;
    o.connect(og).connect(f);
    o.start(t);
    o.stop(t + len + 0.05);
  }
}

function schedule() {
  const ac = audioContext();
  if (!ac || !out) return;
  const eighth = 60 / BPM[mood] / 2;
  while (nextTime < ac.currentTime + 0.25) {
    const t = nextTime;
    const i = step % 16;
    const hit = DRUM[step % 8];
    if (hit === 'D') doum(ac, t);
    else if (hit === 'T') tak(ac, t);
    else if (hit === 'k' && (mood === 'game' || Math.random() < 0.4)) tak(ac, t, 0.35);
    if (i === 0) {
      if (!phrase.length || phraseRepeats >= 2) {
        phrase = makePhrase();
        phraseRepeats = 0;
      }
      phraseRepeats++;
    }
    const deg = phrase[i];
    if (deg != null) {
      const scale = SCALES[mood];
      oud(ac, t, cents(scale[deg]), eighth * (phrase[i + 1] == null ? 2.2 : 1.3));
      // a qanun-like octave sparkle now and then
      if (mood === 'lobby' && i % 8 === 0 && Math.random() < 0.3) oud(ac, t + eighth / 2, cents(scale[deg] + 1200), eighth);
    }
    nextTime += eighth;
    step++;
  }
}

function startDrone(ac: AudioContext) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, ac.currentTime + 2);
  gain.connect(out!);
  const oscs = [D4 / 2, (D4 / 2) * 1.5].map((f) => {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(gain);
    o.start();
    return o;
  });
  drone = { oscs, gain };
}

function stopDrone(ac: AudioContext) {
  if (!drone) return;
  const d = drone;
  drone = null;
  d.gain.gain.cancelScheduledValues(ac.currentTime);
  d.gain.gain.setTargetAtTime(0.0001, ac.currentTime, 0.2);
  for (const o of d.oscs) o.stop(ac.currentTime + 1);
}

function shouldPlay() {
  return enabled && typeof document !== 'undefined' && !document.hidden;
}

function start() {
  if (playing || !shouldPlay()) return;
  const ac = audioContext();
  if (!ac) return;
  if (ac.state !== 'running') {
    // browsers start audio only after a user gesture: try again as soon as it is allowed
    if (!waiting) {
      waiting = true;
      ac.addEventListener('statechange', () => ac.state === 'running' && refreshMusic());
    }
    return;
  }
  out = ac.createGain();
  out.gain.setValueAtTime(0.0001, ac.currentTime);
  out.gain.exponentialRampToValueAtTime(VOLUME, ac.currentTime + 1.5);
  out.connect(ac.destination);
  playing = true;
  nextTime = ac.currentTime + 0.1;
  step = 0;
  phrase = [];
  startDrone(ac);
  timer = setInterval(schedule, 60);
  schedule();
}

function stop() {
  if (!playing) return;
  playing = false;
  if (timer) clearInterval(timer);
  timer = null;
  const ac = audioContext();
  if (ac && out) {
    stopDrone(ac);
    const o = out;
    o.gain.cancelScheduledValues(ac.currentTime);
    o.gain.setTargetAtTime(0.0001, ac.currentTime, 0.15);
    setTimeout(() => o.disconnect(), 1200);
  }
  out = null;
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
  phrase = [];
  if (playing) {
    // re-sync to the new tempo with a fresh phrase on the next beat
    stop();
    start();
  }
}

export const musicState = () => ({ enabled, mood, playing });

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refreshMusic);
