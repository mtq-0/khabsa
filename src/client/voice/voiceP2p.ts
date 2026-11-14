/**
 * Voice chat without a media server: a WebRTC mesh between the players who are in voice.
 *
 * - Signalling (offers, answers, ICE candidates) goes over the room link that already carries
 *   the game: Socket.IO on the server edition, the host's peer link on GitHub Pages. No third
 *   party signalling service is involved.
 * - "Perfect negotiation": the player with the smaller id is impolite and makes the first offer,
 *   both sides may renegotiate (ICE restart), collisions are resolved without losing the call.
 * - STUN plus optional TURN relays (from the server, or turn.json next to the Pages site).
 * - If two browsers still cannot reach each other (strict mobile networks, no TURN), that pair
 *   switches to the relay: compressed audio through the room link (see relayAudio.ts). So
 *   everybody who can play the game can also hear everybody.
 *
 * Meant for small rooms (every player sends their voice to every other one): up to ~8 talkers.
 * Same API as voiceClient.ts (LiveKit), which is used when the server has LiveKit configured.
 */
import type { VoiceSignal } from '../../shared/protocol.ts';
import { audioContext } from '../fx/sound.ts';
import { api } from '../lib/api.ts';
import { PAGES, asset } from '../lib/mode.ts';
import { getSocket } from '../lib/socket.ts';
import { RelayPlayer, RelaySender } from './relayAudio.ts';
import { publishLevels, useVoice } from './voiceStore.ts';

/** a pair that has not connected directly after this long switches to the relay */
const DIRECT_TIMEOUT_MS = 9000;
/** a direct connection that drops ("disconnected") is given this long to recover before an ICE restart */
const DISCONNECT_GRACE_MS = 3500;
const STUN: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];

type Sig = { from: string; code: string; data: VoiceSignal };
type RoomSock = {
  on: (ev: string, h: (p: never) => void) => unknown;
  off: (ev: string, h: (p: never) => void) => unknown;
  emit: (ev: string, p: unknown) => unknown;
};
const roomSock = () => getSocket() as unknown as RoomSock;

interface Peer {
  id: string;
  /** perfect negotiation: the polite side gives way when both make an offer at once */
  polite: boolean;
  pc: RTCPeerConnection | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingIce: RTCIceCandidateInit[];
  el: HTMLAudioElement | null;
  analyser: AnalyserNode | null;
  mode: 'direct' | 'relay';
  connected: boolean;
  startedAt: number;
  disconnectedAt: number;
  restarts: number;
  lastNudge: number;
}

let code: string | null = null;
let myId = '';
let members: string[] = [];
let present = new Set<string>();
const peers = new Map<string, Peer>();
let iceServers: RTCIceServer[] = STUN;
let blockDirect = false;
let local: MediaStream | null = null;
let silentTrack: MediaStreamTrack | null = null;
let selfAnalyser: AnalyserNode | null = null;
let sender: RelaySender | null = null;
let player: RelayPlayer | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let meter: ReturnType<typeof setInterval> | null = null;
let fallbackCtx: AudioContext | null = null;
const smooth = new Map<string, number>();

/** small live snapshot for support / tests: window.__khabsaVoice() */
const dbg = { step: 'idle' };
if (typeof window !== 'undefined')
  (window as unknown as { __khabsaVoice: () => unknown }).__khabsaVoice = () => ({
    step: dbg.step,
    code,
    me: myId,
    mic: local ? local.getAudioTracks()[0]?.readyState : null,
    ctx: (fallbackCtx ?? audioContext())?.state,
    present: [...present],
    peers: [...peers.values()].map((p) => ({ id: p.id, polite: p.polite, mode: p.mode, connected: p.connected, pc: p.pc?.connectionState, ice: p.pc?.iceConnectionState, signaling: p.pc?.signalingState })),
  });

// ---------------------------------------------------------------- audio helpers
/**
 * The app's shared AudioContext: created and unlocked by the very first tap anywhere in the app
 * (iPhones refuse to start one outside a tap; a context created later stays silent).
 */
function ctx(): AudioContext {
  const shared = audioContext();
  if (shared) return shared;
  fallbackCtx ??= new AudioContext();
  return fallbackCtx;
}

function analyse(stream: MediaStream): AnalyserNode | null {
  try {
    const a = ctx().createAnalyser();
    a.fftSize = 512;
    ctx().createMediaStreamSource(stream).connect(a);
    return a;
  } catch {
    return null;
  }
}

function peak(a: AnalyserNode) {
  const buf = new Uint8Array(a.fftSize);
  a.getByteTimeDomainData(buf);
  let p = 0;
  for (const v of buf) p = Math.max(p, Math.abs(v - 128));
  return p;
}
/** loudness 0..1 from the analyser peak (0..128); speech is roughly 20-90 */
const loud = (a: AnalyserNode) => Math.max(0, Math.min(1, (peak(a) - 3) / 55));

/** a silent track to send while we have no microphone (keeps every call the same shape) */
function silence(): MediaStreamTrack {
  if (silentTrack && silentTrack.readyState === 'live') return silentTrack;
  const c = ctx();
  const dest = c.createMediaStreamDestination();
  const g = c.createGain();
  g.gain.value = 0;
  const o = c.createOscillator();
  o.connect(g).connect(dest);
  o.start();
  silentTrack = dest.stream.getAudioTracks()[0];
  return silentTrack;
}
const outTrack = () => local?.getAudioTracks()[0] ?? silence();

function micError(e: Error) {
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'المايك مرفوض. اسمح للمتصفح يستخدم المايك من إعدادات الموقع (رمز القفل جنب الرابط). إذا فتحت الرابط من داخل واتساب أو إنستا، افتحه بكروم أو سفاري. بتقدر تسمع الباقي بس.';
  if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return 'ما لقينا مايك على هالجهاز. بتقدر تسمع الباقي بس.';
  if (e.name === 'NotReadableError' || e.name === 'AbortError') return 'المايك مستخدم من تطبيق ثاني (مكالمة، زووم...). سكّره واكبس على زر المايك.';
  return 'مشكلة بالمايك: ' + e.message;
}
const NO_MIC = 'هالمتصفح ما بيسمح بالمايك. افتح الرابط بكروم أو سفاري (مش من داخل تطبيق واتساب أو إنستا). بتقدر تسمع الباقي بس.';

const MIC: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };

async function openMic(deviceId?: string): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    useVoice.setState({ muted: true, error: NO_MIC });
    return null;
  }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...MIC, deviceId: { exact: deviceId } } : MIC });
    useVoice.setState({ error: null });
    return s;
  } catch (e) {
    // some phones reject the extra constraints: try once with the plainest request
    if (!deviceId && (e as Error).name === 'OverconstrainedError') {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        /* fall through */
      }
    }
    useVoice.setState({ muted: true, error: micError(e as Error) });
    return null;
  }
}

/** puts a (new) microphone on every live connection and on the relay */
async function useMic(stream: MediaStream | null) {
  const old = local;
  local = stream;
  const track = outTrack();
  track.enabled = stream ? !useVoice.getState().muted : true;
  for (const p of peers.values()) {
    const s = p.pc?.getSenders().find((x) => x.track?.kind === 'audio' || x.track === null);
    await s?.replaceTrack(track).catch(() => {});
  }
  selfAnalyser = stream ? analyse(stream) : null;
  sender?.setStream(stream);
  if (old && old !== stream) old.getTracks().forEach((t) => t.stop());
  // the microphone can be taken away (phone call, unplugged headset, iOS backgrounding)
  stream?.getAudioTracks()[0]?.addEventListener('ended', () => {
    if (local === stream && code) void recoverMic();
  });
}

let recovering = false;
async function recoverMic() {
  if (recovering || !code) return;
  recovering = true;
  try {
    const s = await openMic();
    if (code) await useMic(s);
  } finally {
    recovering = false;
  }
}

// ---------------------------------------------------------------- UI state
function setPeerState(id: string, state: 'connecting' | 'connected' | 'relay' | 'failed' | null) {
  useVoice.setState((s) => {
    if ((s.peerState[id] ?? null) === state) return {};
    const next = { ...s.peerState };
    if (state) next[id] = state;
    else delete next[id];
    return { peerState: next };
  });
}

function refreshInVoice() {
  const inVoice: Record<string, boolean> = { [myId]: true };
  for (const id of present) if (id !== myId) inVoice[id] = true;
  useVoice.setState({ inVoice });
}

function applyVolume(p: Peer) {
  const { deafened, volumes } = useVoice.getState();
  const v = volumes[p.id] ?? 1;
  if (p.el) {
    p.el.muted = deafened; // iPhones ignore .volume, but honour .muted
    p.el.volume = Math.max(0, Math.min(1, v));
  }
  player?.setVolume(p.id, deafened ? 0 : v);
}

// ---------------------------------------------------------------- signalling
const send = (to: string, data: VoiceSignal) => code && roomSock().emit('voice:signal', { code, to, data });

function newPeer(id: string): Peer {
  const p: Peer = { id, polite: myId > id, pc: null, makingOffer: false, ignoreOffer: false, pendingIce: [], el: null, analyser: null, mode: 'direct', connected: false, startedAt: Date.now(), disconnectedAt: 0, restarts: 0, lastNudge: 0 };
  peers.set(id, p);
  setPeerState(id, 'connecting');
  return p;
}

function createPc(p: Peer) {
  const pc = new RTCPeerConnection(blockDirect ? { iceServers: [], iceTransportPolicy: 'relay' } : { iceServers, bundlePolicy: 'max-bundle' });
  p.pc = pc;
  p.startedAt = Date.now();
  const track = outTrack();
  pc.addTrack(track, new MediaStream([track]));

  pc.onnegotiationneeded = async () => {
    try {
      p.makingOffer = true;
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return; // something arrived meanwhile; it will renegotiate
      await pc.setLocalDescription(offer);
      send(p.id, { k: 'offer', sdp: pc.localDescription!.sdp });
    } catch {
      /* retried by the watchdog */
    } finally {
      p.makingOffer = false;
    }
  };
  pc.onicecandidate = (e) => {
    const c = e.candidate;
    send(p.id, { k: 'ice', c: c ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment } : null });
  };
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    if (!p.el) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', ''); // iOS: never take over the screen
      el.dataset.voice = p.id;
      document.body.appendChild(el);
      p.el = el;
    }
    p.el.srcObject = stream;
    // Chrome only feeds a remote WebRTC stream into Web Audio while it is also attached to an element (it is)
    p.analyser = analyse(stream);
    applyVolume(p);
    void p.el.play().catch(() => useVoice.setState({ needsAudioUnlock: true }));
  };
  const onState = () => {
    const st = pc.connectionState ?? pc.iceConnectionState;
    const ok = st === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed';
    if (ok) {
      p.connected = true;
      p.disconnectedAt = 0;
      if (p.mode === 'relay') p.mode = 'direct'; // a late direct connection wins over the relay
      setPeerState(p.id, 'connected');
    } else if (st === 'disconnected' || pc.iceConnectionState === 'disconnected') {
      p.disconnectedAt ||= Date.now();
    } else if (st === 'failed' || pc.iceConnectionState === 'failed') {
      p.connected = false;
      onDirectFailed(p);
    }
  };
  pc.onconnectionstatechange = onState;
  pc.oniceconnectionstatechange = onState;
  return pc;
}

function closePc(p: Peer) {
  if (!p.pc) return;
  p.pc.onnegotiationneeded = p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = p.pc.oniceconnectionstatechange = null;
  p.pc.close();
  p.pc = null;
  p.connected = false;
}

function closePeer(id: string, sayBye = false) {
  const p = peers.get(id);
  if (!p) return;
  if (sayBye) send(id, { k: 'bye' });
  closePc(p);
  p.el?.remove();
  player?.forget(id);
  peers.delete(id);
  smooth.delete(id);
  setPeerState(id, null);
}

/** direct connection failed: try an ICE restart once or twice, and use the relay meanwhile */
function onDirectFailed(p: Peer) {
  if (p.mode !== 'relay') {
    p.mode = 'relay';
    send(p.id, { k: 'relay' });
  }
  setPeerState(p.id, 'relay');
  if (p.restarts >= 2 || blockDirect) return;
  p.restarts += 1;
  if (!p.polite && p.pc) p.pc.restartIce?.();
  else send(p.id, { k: 'restart' });
}

async function onSignal(msg: Sig) {
  if (!code || msg.code !== code || msg.from === myId || typeof msg.from !== 'string') return;
  const d = msg.data;
  let p = peers.get(msg.from);
  if (d.k === 'bye') {
    if (p) {
      closePc(p);
      p.el?.remove();
      p.el = null;
      p.startedAt = Date.now();
      setPeerState(p.id, 'connecting');
    }
    return;
  }
  p ??= newPeer(msg.from);
  if (d.k === 'relay') {
    p.mode = 'relay';
    if (!p.connected) setPeerState(p.id, 'relay');
    return;
  }
  if (d.k === 'restart') {
    if (!p.pc) createPc(p);
    else if (!p.polite) p.pc.restartIce?.();
    return;
  }
  const pc = p.pc ?? createPc(p);
  try {
    if (d.k === 'offer' || d.k === 'answer') {
      const collision = d.k === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
      p.ignoreOffer = !p.polite && collision;
      if (p.ignoreOffer) return;
      if (collision) await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
      if (d.k === 'answer' && pc.signalingState !== 'have-local-offer') return; // stale answer
      await pc.setRemoteDescription({ type: d.k, sdp: d.sdp });
      for (const c of p.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (d.k === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send(p.id, { k: 'answer', sdp: pc.localDescription!.sdp });
      }
    } else if (d.k === 'ice') {
      if (!d.c) return;
      if (!pc.remoteDescription) p.pendingIce.push(d.c);
      else await pc.addIceCandidate(d.c).catch((e) => {
        if (!p!.ignoreOffer) throw e;
      });
    }
  } catch {
    /* a broken negotiation is repaired by the watchdog (restart / relay) */
  }
}

function onPresence(msg: { ids?: unknown }) {
  if (!code) return;
  const ids = Array.isArray(msg?.ids) ? msg.ids.filter((x): x is string => typeof x === 'string') : [];
  present = new Set(ids);
  refreshInVoice();
  for (const id of [...peers.keys()]) if (!present.has(id)) closePeer(id);
  for (const id of present) if (id !== myId && !peers.has(id)) newPeer(id);
  tick();
}

function onAudio(msg: { from?: unknown; code?: unknown; d?: unknown }) {
  if (!code || msg.code !== code || typeof msg.from !== 'string' || typeof msg.d !== 'string' || msg.from === myId) return;
  const p = peers.get(msg.from);
  // a pair with a working direct connection ignores stray relay frames (no double voice)
  if (p?.connected && p.mode === 'direct') return;
  player?.push(msg.from, msg.d);
  if (p && !p.connected) setPeerState(p.id, 'relay');
}

const announce = () => code && roomSock().emit('voice:presence', { code, on: true });

/** called every second: starts calls, nudges silent partners, restarts dropped ones, falls back to the relay */
function tick() {
  const now = Date.now();
  for (const p of peers.values()) {
    if (!present.has(p.id)) continue;
    if (!p.pc && !p.polite) createPc(p);
    if (!p.pc && p.polite && now - p.lastNudge > 3000) {
      // the other side starts the call; remind it if nothing came
      p.lastNudge = now;
      send(p.id, { k: 'restart' });
    }
    if (p.pc && p.disconnectedAt && now - p.disconnectedAt > DISCONNECT_GRACE_MS && p.pc.connectionState !== 'connected') {
      p.connected = false;
      p.disconnectedAt = 0;
      onDirectFailed(p);
    }
    if (!p.connected && p.mode === 'direct' && now - p.startedAt > DIRECT_TIMEOUT_MS) onDirectFailed(p);
    if (p.mode === 'relay' && !p.connected && !player?.receiving(p.id) && useVoice.getState().peerState[p.id] !== 'relay') setPeerState(p.id, 'relay');
  }
}

/** relay frames go to every partner without a working direct connection */
function relayTargets(): string[] {
  const out: string[] = [];
  for (const p of peers.values()) if (present.has(p.id) && p.mode === 'relay' && !p.connected) out.push(p.id);
  return out;
}

function startMeter() {
  meter ??= setInterval(() => {
    const raw: Record<string, number> = {};
    const feed = (id: string, v: number) => {
      // rises at once, falls slowly: a ring that follows the voice without flickering
      const l = Math.max(v, (smooth.get(id) ?? 0) * 0.7);
      smooth.set(id, l);
      raw[id] = l;
    };
    if (selfAnalyser && local && !useVoice.getState().muted) feed(myId, loud(selfAnalyser));
    else smooth.delete(myId);
    for (const p of peers.values()) {
      const a = p.connected ? p.analyser : (player?.analyser(p.id) ?? null);
      if (a) feed(p.id, loud(a));
      else smooth.delete(p.id);
    }
    publishLevels(raw);
  }, 90);
}

// ---------------------------------------------------------------- lifecycle
const onVisible = () => {
  if (document.visibilityState !== 'visible' || !code) return;
  void unlockAudio();
  if (local && local.getAudioTracks()[0]?.readyState === 'ended') void recoverMic();
};
const onAnyTap = () => {
  if (useVoice.getState().needsAudioUnlock) void unlockAudio();
};

async function loadIceServers(): Promise<RTCIceServer[]> {
  if (blockDirect) return [];
  let extra: unknown = [];
  try {
    extra = PAGES
      ? await fetch(asset('turn.json'), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : []))
      : (await api<{ iceServers: unknown }>('/api/voice/ice', { timeoutMs: 6000 })).iceServers;
  } catch {
    /* STUN only (and the relay) */
  }
  const ok = Array.isArray(extra) ? (extra as RTCIceServer[]).filter((x) => x && (typeof x.urls === 'string' || Array.isArray(x.urls))).slice(0, 8) : [];
  return [...STUN, ...ok];
}

/** Called by the panel whenever the room's member list changes. */
export function syncMembers(ids: string[]) {
  members = ids;
  for (const id of [...peers.keys()]) if (!members.includes(id)) closePeer(id);
}

export async function joinVoice(roomCode: string, memberIds: string[] = [], meId = '') {
  if (code === roomCode) return;
  await leaveVoice();
  if (!meId) {
    useVoice.setState({ status: 'error', error: 'لازم تسجّل دخول أول.' });
    return;
  }
  code = roomCode;
  myId = meId;
  members = memberIds;
  present = new Set();
  useVoice.setState({ status: 'connecting', error: null });
  dbg.step = 'starting';
  try {
    blockDirect = localStorage.getItem('khabsa:voice:test-block-direct') === '1';
  } catch {
    blockDirect = false;
  }
  // the microphone prompt must come straight from the tap. We do NOT wait for it: you connect and
  // hear the others right away, and your microphone is put on every call the moment it is ready
  // (a permission prompt can stay open for a long time, some browsers only answer once the tab has focus)
  const micPromise = openMic();
  // resume() can stay pending in some browsers until they allow audio: never wait on it for long
  await Promise.race([ctx().resume().catch(() => {}), new Promise((r) => setTimeout(r, 800))]);
  const ice = await loadIceServers();
  if (code !== roomCode) {
    void micPromise.then((st) => st?.getTracks().forEach((t) => t.stop()));
    return; // left while we were setting up
  }
  iceServers = ice;
  sender = new RelaySender(ctx(), (frame) => {
    const to = relayTargets();
    if (to.length && code) roomSock().emit('voice:audio', { code, to, d: frame });
  });
  player = new RelayPlayer(ctx());
  sender.enabled = false;
  dbg.step = 'waiting-mic';
  void micPromise.then(async (stream) => {
    if (code !== roomCode) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    dbg.step = stream ? 'mic' : 'no-mic';
    if (!stream) {
      useVoice.setState({ muted: true });
      return;
    }
    await useMic(stream);
    if (sender) sender.enabled = !useVoice.getState().muted;
  });
  const sock = roomSock();
  sock.on('voice:presence', onPresence as never);
  sock.on('voice:signal', onSignal as never);
  sock.on('voice:audio', onAudio as never);
  sock.on('connect', announce as never);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pointerdown', onAnyTap, { passive: true });
  useVoice.setState({ status: 'connected', needsAudioUnlock: false });
  dbg.step = dbg.step === 'waiting-mic' ? 'connected-waiting-mic' : 'connected';
  refreshInVoice();
  announce();
  ticker = setInterval(tick, 1000);
  startMeter();
}

function cleanup(status: 'off' | 'error', error: string | null = null) {
  const leaving = code;
  dbg.step = 'idle';
  try {
    const sock = roomSock();
    if (leaving) sock.emit('voice:presence', { code: leaving, on: false });
    sock.off('voice:presence', onPresence as never);
    sock.off('voice:signal', onSignal as never);
    sock.off('voice:audio', onAudio as never);
    sock.off('connect', announce as never);
  } catch {
    /* the room link may already be gone */
  }
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('pointerdown', onAnyTap);
  for (const id of [...peers.keys()]) closePeer(id, true);
  code = null;
  present = new Set();
  if (ticker) clearInterval(ticker);
  if (meter) clearInterval(meter);
  ticker = meter = null;
  sender?.dispose();
  player?.dispose();
  sender = null;
  player = null;
  local?.getTracks().forEach((t) => t.stop());
  local = null;
  selfAnalyser = null;
  smooth.clear();
  useVoice.setState({ status, error, speaking: {}, levels: {}, inVoice: {}, quality: {}, peerState: {}, needsAudioUnlock: false });
}

export async function leaveVoice() {
  if (!code && useVoice.getState().status === 'off') return;
  cleanup('off');
}

export async function setMuted(muted: boolean) {
  useVoice.setState({ muted });
  if (!muted && !local && code) {
    // no microphone yet (denied or busy before): ask again on un-mute
    const s = await openMic();
    if (!s) {
      useVoice.setState({ muted: true });
      return;
    }
    await useMic(s);
  }
  local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  if (sender) sender.enabled = !!local && !muted;
}

export function setDeafened(deafened: boolean) {
  useVoice.setState({ deafened });
  for (const p of peers.values()) applyVolume(p);
  player?.setMuted(deafened);
}

export function setVolume(identity: string, volume: number) {
  useVoice.setState((s) => ({ volumes: { ...s.volumes, [identity]: volume } }));
  const p = peers.get(identity);
  if (p) applyVolume(p);
}

export async function unlockAudio() {
  await ctx().resume().catch(() => {});
  let ok = true;
  for (const p of peers.values()) if (p.el) await p.el.play().catch(() => (ok = false));
  await player?.resume();
  useVoice.setState({ needsAudioUnlock: !ok });
}

export async function listMics(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  } catch {
    return [];
  }
}

export async function switchMic(deviceId: string) {
  const s = await openMic(deviceId);
  if (s) await useMic(s);
}

export function activeMic() {
  return local?.getAudioTracks()[0]?.getSettings().deviceId ?? null;
}
