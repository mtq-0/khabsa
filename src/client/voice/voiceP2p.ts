/**
 * Voice for the GitHub Pages (serverless) edition: a small WebRTC mesh over
 * PeerJS media calls. Every player in voice owns a voice Peer whose id is
 * derived from the room code and their user id, and dials all other room
 * members; members who are not in voice simply do not answer. Meant for small
 * rooms (mesh scales to roughly 6-8 speakers). Same API as voiceClient.ts.
 */
import type { DataConnection, MediaConnection } from 'peerjs';
import { audioContext } from '../fx/sound.ts';
import { getSocket } from '../lib/socket.ts';
import { asset } from '../lib/mode.ts';
import { loadIdentity } from '../p2p/identity.ts';
import { PEER_OPTIONS, Peer } from '../p2p/link.ts';
import { useVoice } from './voiceStore.ts';

const voicePeerId = (code: string, userId: string) => `khabsa-v1-voice-${code}-${userId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

let peer: Peer | null = null;
let currentCode: string | null = null;
let myId = '';
let members: string[] = [];
let local: MediaStream | null = null;
let silent: MediaStream | null = null;
let ctx: AudioContext | null = null;
let redial: ReturnType<typeof setInterval> | null = null;
let meter: ReturnType<typeof setInterval> | null = null;

interface Remote {
  call: MediaConnection;
  el?: HTMLAudioElement;
  analyser?: AnalyserNode;
}
const remotes = new Map<string, Remote>();
let selfAnalyser: AnalyserNode | null = null;
/** tiny control channel per remote: its close event is how we learn quickly that someone left voice */
const ctl = new Map<string, Set<DataConnection>>();

function drop(id: string) {
  const r = remotes.get(id);
  if (!r) return;
  r.el?.remove();
  r.call.close();
  remotes.delete(id);
  setPeerState(id, null);
  refresh();
}

function watch(id: string, conn: DataConnection) {
  // both sides may dial at once: keep every connection, the remote is gone when all are closed
  const set = ctl.get(id) ?? ctl.set(id, new Set()).get(id)!;
  set.add(conn);
  const gone = () => {
    set.delete(conn);
    if (set.size === 0 && ctl.get(id) === set) {
      ctl.delete(id);
      drop(id);
    }
  };
  conn.on('close', gone);
  conn.on('error', gone);
}

/**
 * The app's shared AudioContext: it is created and unlocked by the very first tap anywhere in the
 * app (iPhones refuse to start a new one outside a tap, and then every call stays silent).
 */
function audioCtx(): AudioContext {
  const shared = audioContext();
  if (shared) return shared;
  ctx ??= new AudioContext();
  return ctx;
}

function silentStream(): MediaStream {
  const c = audioCtx();
  const dest = c.createMediaStreamDestination();
  const g = c.createGain();
  g.gain.value = 0;
  // an oscillator needs start(); a muted one is enough to keep the call alive
  const o = c.createOscillator();
  o.connect(g);
  g.connect(dest);
  o.start();
  return dest.stream;
}

function outgoing(): MediaStream {
  return local ?? (silent ??= silentStream());
}

function micError(e: Error) {
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'المايك مرفوض. اسمح للمتصفح يستخدم المايك من إعدادات الموقع. (إذا فتحت الرابط من داخل واتساب أو إنستا، افتحه بكروم أو سفاري.)';
  if (e.name === 'NotFoundError') return 'ما لقينا مايك على هالجهاز.';
  if (e.name === 'NotReadableError') return 'المايك مستخدم من تطبيق ثاني. سكّره وجرّب من جديد.';
  return 'مشكلة بالمايك: ' + e.message;
}

const NO_MIC = 'هالمتصفح ما بيسمح بالمايك. افتح الرابط بكروم أو سفاري (مش من داخل تطبيق واتساب أو إنستا). بتقدر تسمع بس.';

/** Extra STUN/TURN servers an owner may drop next to the site as turn.json (an array of RTCIceServer). */
let extraIce: Promise<RTCIceServer[]> | null = null;
function loadExtraIce(): Promise<RTCIceServer[]> {
  extraIce ??= fetch(asset('turn.json'), { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : []))
    .then((j) => (Array.isArray(j) ? (j as RTCIceServer[]).filter((x) => x && (typeof x.urls === 'string' || Array.isArray(x.urls))).slice(0, 8) : []))
    .catch(() => []);
  return extraIce;
}

function memberIdOf(call: MediaConnection): string | null {
  // peer id is khabsa-v1-voice-<code>-<userId>; user ids can contain '-'
  const prefix = `khabsa-v1-voice-${currentCode}-`;
  const id = call.peer.startsWith(prefix) ? call.peer.slice(prefix.length) : null;
  if (!id) return null;
  return members.find((m) => m.replace(/[^a-zA-Z0-9_-]/g, '') === id) ?? id;
}

function refresh() {
  const inVoice: Record<string, boolean> = { [myId]: true };
  for (const id of remotes.keys()) inVoice[id] = true;
  useVoice.setState({ inVoice });
}

function analyse(stream: MediaStream): AnalyserNode {
  const c = audioCtx();
  const a = c.createAnalyser();
  a.fftSize = 512;
  c.createMediaStreamSource(stream).connect(a);
  return a;
}

function level(a: AnalyserNode) {
  const buf = new Uint8Array(a.fftSize);
  a.getByteTimeDomainData(buf);
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
  return peak;
}

function startMeter() {
  meter ??= setInterval(() => {
    const speaking: Record<string, boolean> = {};
    if (selfAnalyser && !useVoice.getState().muted && level(selfAnalyser) > 6) speaking[myId] = true;
    for (const [id, r] of remotes) if (r.analyser && level(r.analyser) > 6) speaking[id] = true;
    const prev = useVoice.getState().speaking;
    const same = Object.keys(speaking).length === Object.keys(prev).length && Object.keys(speaking).every((k) => prev[k]);
    if (!same) useVoice.setState({ speaking });
  }, 150);
}

function applyVolume(id: string) {
  const r = remotes.get(id);
  if (!r?.el) return;
  const { deafened, volumes } = useVoice.getState();
  r.el.volume = deafened ? 0 : (volumes[id] ?? 1);
}

function register(call: MediaConnection) {
  const id = memberIdOf(call);
  if (!id || id === myId) return call.close();
  const prev = remotes.get(id);
  call.on('stream', (stream) => {
    const cur = remotes.get(id);
    if (cur && cur.call !== call) {
      // duplicate call (both sides dialled at once): keep the newest audio, drop the old element
      cur.el?.remove();
      if (cur.call !== call) cur.call.close();
    }
    const el = document.createElement('audio');
    el.autoplay = true;
    el.srcObject = stream;
    el.dataset.voice = id;
    document.body.appendChild(el);
    remotes.set(id, { call, el, analyser: analyse(stream) });
    setPeerState(id, 'connected');
    applyVolume(id);
    void el.play().catch(() => useVoice.setState({ needsAudioUnlock: true }));
    refresh();
  });
  const gone = () => {
    const cur = remotes.get(id);
    if (cur?.call !== call) return;
    cur.el?.remove();
    remotes.delete(id);
    setPeerState(id, null);
    refresh();
  };
  call.on('close', gone);
  call.on('error', gone);
  if (!prev) remotes.set(id, { call });
}

/** How long a call may take to connect before we hang up and try again. */
const CONNECT_TIMEOUT_MS = 10_000;
const dialedAt = new Map<string, number>();

/**
 * Who is in voice right now. Every browser announces itself over the room link (the host relays it)
 * once its voice peer is registered, so we only ever dial players who are really there. (Calling
 * somebody who has not registered yet leaves a dead call that only times out much later.)
 */
type RoomSock = { on: (ev: string, h: (p: { ids?: string[] }) => void) => unknown; off: (ev: string, h: (p: { ids?: string[] }) => void) => unknown; emit: (ev: string, p: unknown) => unknown };
const roomSock = () => getSocket() as unknown as RoomSock;
let present = new Set<string>();
const onPresence = (p: { ids?: string[] }) => {
  present = new Set(Array.isArray(p?.ids) ? p.ids.filter((x) => typeof x === 'string') : []);
  dialAll();
};
const announce = () => roomSock().emit('voice:presence', { on: true });

function setPeerState(id: string, state: 'connecting' | 'connected' | 'failed' | null) {
  useVoice.setState((s) => {
    const next = { ...s.peerState };
    if (state) next[id] = state;
    else delete next[id];
    return { peerState: next };
  });
}

/**
 * Only ONE side of every pair dials (the one with the smaller id), the other just answers.
 * When both sides dialled at the same time the two calls cancelled each other out and the pair
 * stayed silent (that is what broke voice with 3+ people).
 */
function dialAll() {
  if (!peer || peer.destroyed || !currentCode) return;
  const now = Date.now();
  for (const m of members) {
    if (m === myId || myId > m || !present.has(m)) continue;
    const r = remotes.get(m);
    if (r?.el) continue;
    if (r) {
      // a call exists but never produced sound: hang up so the next round dials again
      if (now - (dialedAt.get(m) ?? now) > CONNECT_TIMEOUT_MS) {
        r.call.close();
        remotes.delete(m);
        setPeerState(m, 'failed');
      }
      continue;
    }
    try {
      const pid = voicePeerId(currentCode, m);
      dialedAt.set(m, now);
      register(peer.call(pid, outgoing()));
      setPeerState(m, 'connecting');
      const c = peer.connect(pid, { reliable: true });
      c.on('open', () => watch(m, c));
    } catch {
      /* peer not ready */
    }
  }
}

/** Called by the panel whenever the room's member list changes. */
export function syncMembers(ids: string[]) {
  members = ids;
}

export async function joinVoice(code: string, memberIds: string[] = []) {
  if (peer && currentCode === code) return;
  await leaveVoice();
  const me = loadIdentity();
  if (!me) {
    useVoice.setState({ status: 'error', error: 'لازم تسجّل دخول أول.' });
    return;
  }
  currentCode = code;
  myId = me.id;
  members = memberIds;
  useVoice.setState({ status: 'connecting', error: null });
  // microphone: listening still works without it
  if (!navigator.mediaDevices?.getUserMedia) {
    useVoice.setState({ muted: true, error: NO_MIC });
  } else {
    try {
      local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      local.getAudioTracks().forEach((t) => (t.enabled = !useVoice.getState().muted));
      selfAnalyser = analyse(local);
    } catch (e) {
      local = null;
      useVoice.setState({ muted: true, error: micError(e as Error) });
    }
  }
  await audioCtx().resume().catch(() => {});
  const extra = await loadExtraIce();
  if (currentCode !== code) return; // left while we were setting up
  const p = new Peer(voicePeerId(code, me.id), { ...PEER_OPTIONS, config: { ...PEER_OPTIONS.config, iceServers: [...(PEER_OPTIONS.config?.iceServers ?? []), ...extra] } });
  peer = p;
  p.on('connection', (conn) => {
    const id = members.find((m) => conn.peer === voicePeerId(code, m));
    if (id) conn.on('open', () => watch(id, conn));
    else conn.close();
  });
  p.on('call', (call) => {
    call.answer(outgoing());
    register(call);
  });
  p.on('disconnected', () => setTimeout(() => !p.destroyed && p.reconnect(), 2000));
  p.on('error', (e: Error & { type?: string }) => {
    if (e.type === 'peer-unavailable') {
      // that member is not in voice (yet): forget the failed call so we retry later
      const m = /khabsa-v1-voice-\S+/.exec(e.message)?.[0];
      for (const [id, r] of remotes)
        if (!r.el && m && r.call.peer === m) {
          r.call.close();
          remotes.delete(id);
          setPeerState(id, null);
        }
      return;
    }
    if (e.type === 'unavailable-id') {
      cleanup('error', 'أنت داخل للصوت من تبويب ثاني. سكّره وجرّب من جديد.');
      return;
    }
    if (peer === p && useVoice.getState().status === 'connecting') cleanup('error', 'ما قدرنا نتصل بخادم الربط. تأكد من الإنترنت.');
  });
  await new Promise<void>((resolve) => {
    if (p.open) return resolve();
    p.on('open', () => resolve());
    p.on('error', () => resolve());
  });
  if (peer !== p || p.destroyed) return;
  useVoice.setState({ status: 'connected', needsAudioUnlock: false });
  refresh();
  // tell the room we are here (and again if the room link reconnects); everybody who is in voice dials us / we dial them
  const sock = roomSock();
  sock.on('voice:presence', onPresence);
  sock.on('connect', announce as never);
  announce();
  dialAll();
  redial = setInterval(dialAll, 2500);
  startMeter();
}

function cleanup(status: 'off' | 'error', error: string | null = null) {
  try {
    const sock = roomSock();
    if (currentCode) sock.emit('voice:presence', { on: false });
    sock.off('voice:presence', onPresence);
    sock.off('connect', announce as never);
  } catch {
    /* the room link may already be gone */
  }
  present = new Set();
  if (redial) clearInterval(redial);
  if (meter) clearInterval(meter);
  redial = meter = null;
  for (const r of remotes.values()) {
    r.el?.remove();
    r.call.close();
  }
  remotes.clear();
  const conns = [...ctl.values()].flatMap((x) => [...x]);
  ctl.clear();
  for (const c of conns) if (c.open) c.close();
  local?.getTracks().forEach((t) => t.stop());
  local = null;
  selfAnalyser = null;
  peer?.destroy();
  peer = null;
  currentCode = null;
  dialedAt.clear();
  useVoice.setState({ status, error, speaking: {}, inVoice: {}, quality: {}, peerState: {}, needsAudioUnlock: false });
}

export async function leaveVoice() {
  if (!peer && useVoice.getState().status === 'off') return;
  cleanup('off');
}

export async function setMuted(muted: boolean) {
  useVoice.setState({ muted });
  local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  if (!local && !muted && peer) {
    // retry getting the microphone when un-muting
    try {
      local = await navigator.mediaDevices.getUserMedia({ audio: true });
      selfAnalyser = analyse(local);
      useVoice.setState({ error: null });
      // replace the silent track on live calls
      const track = local.getAudioTracks()[0];
      for (const r of remotes.values()) {
        const pc = (r.call as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
        await pc?.getSenders().find((s) => s.track?.kind === 'audio')?.replaceTrack(track);
      }
    } catch (e) {
      useVoice.setState({ muted: true, error: micError(e as Error) });
    }
  }
}

export function setDeafened(deafened: boolean) {
  useVoice.setState({ deafened });
  for (const id of remotes.keys()) applyVolume(id);
}

export function setVolume(identity: string, volume: number) {
  useVoice.setState((s) => ({ volumes: { ...s.volumes, [identity]: volume } }));
  applyVolume(identity);
}

export async function unlockAudio() {
  await audioCtx().resume().catch(() => {});
  for (const r of remotes.values()) await r.el?.play().catch(() => {});
  useVoice.setState({ needsAudioUnlock: false });
}

export async function listMics(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  } catch {
    return [];
  }
}

export async function switchMic(deviceId: string) {
  try {
    const next = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
    const track = next.getAudioTracks()[0];
    track.enabled = !useVoice.getState().muted;
    for (const r of remotes.values()) {
      const pc = (r.call as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
      await pc?.getSenders().find((s) => s.track?.kind === 'audio')?.replaceTrack(track);
    }
    local?.getTracks().forEach((t) => t.stop());
    local = next;
    selfAnalyser = analyse(next);
  } catch (e) {
    useVoice.setState({ error: micError(e as Error) });
  }
}

export function activeMic() {
  return local?.getAudioTracks()[0]?.getSettings().deviceId ?? null;
}
