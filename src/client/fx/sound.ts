/**
 * Game sounds synthesised with the Web Audio API: no audio files to download
 * and nothing to license. The context is created on the first user gesture
 * (browser autoplay rules) and everything is a no-op when sound is off.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}
export const soundEnabled = () => enabled;

/** The shared audio context (also used by the music), created lazily. */
export function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function audio(): AudioContext | null {
  return enabled ? audioContext() : null;
}

/** Call from a click/tap so later sounds (and music) are allowed to play. */
export function unlockAudio() {
  audioContext();
}

interface Note {
  f: number; // frequency (Hz)
  t?: number; // start offset (s)
  d?: number; // duration (s)
  type?: OscillatorType;
  v?: number; // volume 0..1
  to?: number; // slide to frequency
}

function play(notes: Note[]) {
  const ac = audio();
  if (!ac || !master) return;
  const now = ac.currentTime + 0.01;
  for (const n of notes) {
    const start = now + (n.t ?? 0);
    const dur = n.d ?? 0.15;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.f, start);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, start + dur);
    const vol = n.v ?? 0.5;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
}

function noise(t: number, d: number, v: number, filterHz: number) {
  const ac = audio();
  if (!ac || !master) return;
  const len = Math.floor(ac.sampleRate * d);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterHz;
  const g = ac.createGain();
  g.gain.value = v;
  src.connect(f).connect(g).connect(master);
  src.start(ac.currentTime + 0.01 + t);
}

export const sfx = {
  /** UI feedback: a bubbly pop for buttons */
  click: () => play([{ f: 420, to: 880, d: 0.07, type: 'sine', v: 0.32 }, { f: 1320, t: 0.02, d: 0.03, type: 'triangle', v: 0.06 }]),
  /** big / main buttons: a brighter double pop */
  press: () => play([{ f: 523, to: 1046, d: 0.07, type: 'sine', v: 0.32 }, { f: 784, to: 1568, t: 0.06, d: 0.09, type: 'sine', v: 0.26 }]),
  /** tabs, toggles, choices: a short wooden tick */
  tick2: () => play([{ f: 1200, to: 700, d: 0.035, type: 'triangle', v: 0.3 }]),
  /** links / navigation: a soft swish */
  swish: () => {
    play([{ f: 300, to: 700, d: 0.12, type: 'sine', v: 0.12 }]);
    noise(0, 0.12, 0.08, 2500);
  },
  /** destructive buttons (leave, stop, kick) */
  thud: () => play([{ f: 260, to: 150, d: 0.12, type: 'triangle', v: 0.32 }]),
  join: () => play([{ f: 523, d: 0.12, type: 'triangle' }, { f: 784, t: 0.09, d: 0.18, type: 'triangle' }]),
  leave: () => play([{ f: 523, d: 0.12, type: 'triangle', v: 0.3 }, { f: 349, t: 0.09, d: 0.2, type: 'triangle', v: 0.3 }]),
  chat: () => play([{ f: 880, d: 0.06, type: 'sine', v: 0.25 }, { f: 1175, t: 0.05, d: 0.08, type: 'sine', v: 0.2 }]),
  phase: () => play([{ f: 300, to: 900, d: 0.22, type: 'sine', v: 0.18 }]),
  start: () => {
    play([
      { f: 392, d: 0.12, type: 'square', v: 0.18 },
      { f: 523, t: 0.12, d: 0.12, type: 'square', v: 0.18 },
      { f: 659, t: 0.24, d: 0.12, type: 'square', v: 0.18 },
      { f: 784, t: 0.36, d: 0.3, type: 'square', v: 0.2 },
    ]);
    noise(0, 0.25, 0.25, 1800);
  },
  yourTurn: () => play([{ f: 988, d: 0.1, type: 'triangle' }, { f: 1319, t: 0.12, d: 0.25, type: 'triangle' }]),
  vote: () => play([{ f: 440, d: 0.1, type: 'sawtooth', v: 0.15 }, { f: 554, t: 0.1, d: 0.1, type: 'sawtooth', v: 0.15 }, { f: 659, t: 0.2, d: 0.2, type: 'sawtooth', v: 0.15 }]),
  tick: (s: number) => play([{ f: s <= 2 ? 1046 : 784, d: 0.05, type: 'square', v: s <= 2 ? 0.22 : 0.14 }]),
  points: () => play([{ f: 988, d: 0.08, type: 'square', v: 0.16 }, { f: 1319, t: 0.08, d: 0.22, type: 'square', v: 0.16 }]),
  correct: () => play([{ f: 659, d: 0.1, type: 'triangle' }, { f: 880, t: 0.1, d: 0.1, type: 'triangle' }, { f: 1319, t: 0.2, d: 0.3, type: 'triangle' }]),
  wrong: () => play([{ f: 220, to: 140, d: 0.35, type: 'sawtooth', v: 0.25 }]),
  drumroll: () => {
    for (let i = 0; i < 10; i++) noise(i * 0.05, 0.05, 0.18 + i * 0.02, 700);
    noise(0.55, 0.3, 0.5, 400);
    play([{ f: 110, t: 0.55, d: 0.3, type: 'sine', v: 0.6 }]);
  },
  sneaky: () => play([{ f: 392, d: 0.12, type: 'triangle', v: 0.3 }, { f: 370, t: 0.14, d: 0.12, type: 'triangle', v: 0.3 }, { f: 349, t: 0.28, d: 0.12, type: 'triangle', v: 0.3 }, { f: 330, t: 0.42, d: 0.3, type: 'triangle', v: 0.3 }]),
  win: () => {
    const m = [523, 659, 784, 1046, 784, 1046];
    play(m.map((f, i) => ({ f, t: i * 0.11, d: i === m.length - 1 ? 0.5 : 0.12, type: 'square' as const, v: 0.18 })));
    noise(0.55, 0.4, 0.3, 3000);
  },
  gameOver: () => play([{ f: 523, d: 0.18, type: 'triangle', v: 0.3 }, { f: 440, t: 0.18, d: 0.18, type: 'triangle', v: 0.3 }, { f: 523, t: 0.36, d: 0.4, type: 'triangle', v: 0.3 }]),
};
