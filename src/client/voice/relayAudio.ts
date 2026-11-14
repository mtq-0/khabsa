/**
 * Fallback audio for pairs of players whose browsers cannot connect directly (strict mobile
 * networks, no TURN relay). The microphone is cut into 60 ms frames, resampled to 16 kHz and
 * compressed with G.711 μ-law (telephone quality, 128 kbit/s while talking, nothing while silent),
 * then sent over the room link that already works for the game. Received frames are scheduled
 * on a small jitter buffer. Playback goes through a local WebRTC loopback so Chrome's echo
 * canceller hears it too (Chrome does not cancel audio that is played through Web Audio).
 */

export const RELAY_RATE = 16_000;
export const FRAME_SAMPLES = 960; // 60 ms at 16 kHz

// ------------------------------------------------------------------ G.711 μ-law
const BIAS = 0x84;
const CLIP = 32635;
export function muLawEncode(sample: number): number {
  let s = Math.max(-1, Math.min(1, sample)) * 32767;
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  s = Math.min(CLIP, s) + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}
const DECODE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const v = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  DECODE[i] = (sign ? -v : v) / 32768;
}
export const muLawDecode = (b: number) => DECODE[b & 0xff];

export function encodeFrame(pcm16k: Float32Array): string {
  let bin = '';
  for (let i = 0; i < pcm16k.length; i++) bin += String.fromCharCode(muLawEncode(pcm16k[i]));
  return btoa(bin);
}
export function decodeFrame(b64: string): Float32Array {
  const bin = atob(b64);
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = DECODE[bin.charCodeAt(i)];
  return out;
}

/** linear resampling (good enough for speech at these rates) */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input.slice();
  const n = Math.max(1, Math.round((input.length * to) / from));
  const out = new Float32Array(n);
  const step = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const i0 = Math.floor(x);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const f = x - i0;
    out[i] = input[Math.min(i0, input.length - 1)] * (1 - f) + input[i1] * f;
  }
  return out;
}

const rms = (a: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a.length));
};

// ------------------------------------------------------------------ sending
/**
 * Taps a microphone stream and calls `send` with one encoded frame every 60 ms while the
 * player is talking (with a short hang-over so word endings are not clipped).
 */
export class RelaySender {
  private ctx: AudioContext;
  private src: MediaStreamAudioSourceNode | null = null;
  private proc: ScriptProcessorNode | null = null;
  private sink: GainNode;
  private buf: number[] = [];
  private lastVoice = 0;
  private send: (frame: string) => void;
  enabled = true;
  constructor(ctx: AudioContext, send: (frame: string) => void) {
    this.ctx = ctx;
    this.send = send;
    this.sink = ctx.createGain();
    this.sink.gain.value = 0; // the processor has to be connected to run; nothing is heard
    this.sink.connect(ctx.destination);
  }

  setStream(stream: MediaStream | null) {
    this.src?.disconnect();
    this.proc?.disconnect();
    this.src = null;
    this.proc = null;
    this.buf = [];
    if (!stream || !stream.getAudioTracks().length) return;
    this.src = this.ctx.createMediaStreamSource(stream);
    // ScriptProcessor works in every browser (AudioWorklet modules would need an extra script file)
    this.proc = this.ctx.createScriptProcessor(2048, 1, 1);
    this.proc.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0));
    this.src.connect(this.proc);
    this.proc.connect(this.sink);
  }

  private onAudio(input: Float32Array) {
    if (!this.enabled) {
      this.buf = [];
      return;
    }
    const down = resample(input, this.ctx.sampleRate, RELAY_RATE);
    for (let i = 0; i < down.length; i++) this.buf.push(down[i]);
    while (this.buf.length >= FRAME_SAMPLES) {
      const frame = Float32Array.from(this.buf.splice(0, FRAME_SAMPLES));
      const now = performance.now();
      if (rms(frame) > 0.006) this.lastVoice = now;
      if (now - this.lastVoice < 450) this.send(encodeFrame(frame));
    }
  }

  dispose() {
    this.setStream(null);
    this.sink.disconnect();
  }
}

// ------------------------------------------------------------------ receiving
interface Incoming {
  gain: GainNode;
  analyser: AnalyserNode;
  next: number;
  last: number;
}

/** Plays relayed frames from any number of players, each with its own volume and level meter. */
export class RelayPlayer {
  private ctx: AudioContext;
  private mix: GainNode;
  private from = new Map<string, Incoming>();
  private loop: { a: RTCPeerConnection; b: RTCPeerConnection; el: HTMLAudioElement } | null = null;
  private direct = false;
  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.mix = ctx.createGain();
    void this.setupOutput();
  }

  /** route the mix through a local WebRTC loopback into an <audio> element (echo cancellation sees it) */
  private async setupOutput() {
    try {
      if (typeof this.ctx.createMediaStreamDestination !== 'function' || typeof RTCPeerConnection === 'undefined') throw new Error('no loopback');
      const dest = this.ctx.createMediaStreamDestination();
      this.mix.connect(dest);
      const a = new RTCPeerConnection();
      const b = new RTCPeerConnection();
      a.onicecandidate = (e) => e.candidate && void b.addIceCandidate(e.candidate).catch(() => {});
      b.onicecandidate = (e) => e.candidate && void a.addIceCandidate(e.candidate).catch(() => {});
      const el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.dataset.voiceRelay = '1';
      document.body.appendChild(el);
      b.ontrack = (e) => {
        el.srcObject = e.streams[0] ?? new MediaStream([e.track]);
        void el.play().catch(() => {});
      };
      for (const t of dest.stream.getAudioTracks()) a.addTrack(t, dest.stream);
      const offer = await a.createOffer();
      await a.setLocalDescription(offer);
      await b.setRemoteDescription(offer);
      const answer = await b.createAnswer();
      await b.setLocalDescription(answer);
      await a.setRemoteDescription(answer);
      this.loop = { a, b, el };
      // if the loopback never connects (very old browser), play straight to the speakers
      setTimeout(() => {
        if (this.loop && b.connectionState !== 'connected' && b.iceConnectionState !== 'connected' && b.iceConnectionState !== 'completed') this.playDirect();
      }, 4000);
    } catch {
      this.playDirect();
    }
  }

  private playDirect() {
    if (this.direct) return;
    this.direct = true;
    if (this.loop) {
      this.loop.a.close();
      this.loop.b.close();
      this.loop.el.remove();
      this.loop = null;
    }
    try {
      this.mix.disconnect();
    } catch {
      /* not connected */
    }
    this.mix.connect(this.ctx.destination);
  }

  private track(id: string): Incoming {
    let s = this.from.get(id);
    if (!s) {
      const gain = this.ctx.createGain();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      gain.connect(analyser);
      gain.connect(this.mix);
      s = { gain, analyser, next: 0, last: 0 };
      this.from.set(id, s);
    }
    return s;
  }

  push(id: string, b64: string) {
    let pcm: Float32Array;
    try {
      pcm = decodeFrame(b64);
    } catch {
      return;
    }
    if (!pcm.length) return;
    const s = this.track(id);
    const up = resample(pcm, RELAY_RATE, this.ctx.sampleRate);
    const buffer = this.ctx.createBuffer(1, up.length, this.ctx.sampleRate);
    buffer.getChannelData(0).set(up);
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(s.gain);
    const now = this.ctx.currentTime;
    // 120 ms jitter buffer; if we fell far behind (tab was asleep), drop the backlog
    let at = Math.max(now + 0.12, s.next);
    if (at - now > 0.6) at = now + 0.12;
    node.start(at);
    s.next = at + buffer.duration;
    s.last = performance.now();
  }

  analyser(id: string): AnalyserNode | null {
    const s = this.from.get(id);
    // only while frames are arriving (a silent relay must not light the ring)
    return s && performance.now() - s.last < 400 ? s.analyser : null;
  }

  receiving(id: string) {
    const s = this.from.get(id);
    return !!s && performance.now() - s.last < 2000;
  }

  setVolume(id: string, v: number) {
    this.track(id).gain.gain.value = v;
  }

  setMuted(muted: boolean) {
    if (this.loop) this.loop.el.muted = muted;
    this.mix.gain.value = muted && !this.loop ? 0 : 1;
  }

  async resume() {
    await this.loop?.el.play().catch(() => {});
  }

  forget(id: string) {
    const s = this.from.get(id);
    if (!s) return;
    s.gain.disconnect();
    this.from.delete(id);
  }

  dispose() {
    for (const id of [...this.from.keys()]) this.forget(id);
    if (this.loop) {
      this.loop.a.close();
      this.loop.b.close();
      this.loop.el.remove();
      this.loop = null;
    }
    try {
      this.mix.disconnect();
    } catch {
      /* already */
    }
  }
}
