/**
 * LiveKit voice client. Loaded lazily so the ~200KB SDK is only downloaded
 * when a player actually joins voice. Every participant publishes only their
 * own microphone track; leaving disconnects only this client (other players'
 * tracks are unaffected). All listeners are removed and tracks stopped on leave.
 */
import { ConnectionQuality, Room, RoomEvent, Track, type Participant, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from 'livekit-client';
import { api, errorText } from '../lib/api.ts';
import { useVoice } from './voiceStore.ts';

let room: Room | null = null;
let currentCode: string | null = null;
/** our own audio elements, keyed by remote track sid */
const audioEls = new Map<string, HTMLMediaElement>();

function removeAudio(trackSid: string | undefined) {
  if (!trackSid) return;
  audioEls.get(trackSid)?.remove();
  audioEls.delete(trackSid);
}

const q = (c: ConnectionQuality) => (c === ConnectionQuality.Excellent ? 'excellent' : c === ConnectionQuality.Good ? 'good' : c === ConnectionQuality.Poor ? 'poor' : c === ConnectionQuality.Lost ? 'lost' : 'unknown');

function refreshParticipants() {
  if (!room) return;
  const inVoice: Record<string, boolean> = { [room.localParticipant.identity]: true };
  const quality: Record<string, ReturnType<typeof q>> = { [room.localParticipant.identity]: q(room.localParticipant.connectionQuality) };
  for (const p of room.remoteParticipants.values()) {
    inVoice[p.identity] = true;
    quality[p.identity] = q(p.connectionQuality);
  }
  useVoice.setState({ inVoice, quality });
}

function applyVolume(p: RemoteParticipant) {
  const { deafened, volumes } = useVoice.getState();
  p.setVolume(deafened ? 0 : (volumes[p.identity] ?? 1));
}

export async function joinVoice(code: string) {
  if (room && currentCode === code) return;
  await leaveVoice();
  currentCode = code;
  useVoice.setState({ status: 'connecting', error: null });
  let creds: { url: string; token: string };
  try {
    creds = await api<{ url: string; token: string }>('/api/voice/token', { body: { code } });
  } catch (e) {
    useVoice.setState({ status: 'error', error: errorText(e) });
    return;
  }
  const r = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  room = r;
  r.on(RoomEvent.ParticipantConnected, refreshParticipants)
    .on(RoomEvent.ParticipantDisconnected, (p) => {
      for (const pub of p.audioTrackPublications.values()) if (pub.trackSid) removeAudio(pub.trackSid);
      document.querySelectorAll(`audio[data-voice="${CSS.escape(p.identity)}"]`).forEach((el) => el.remove());
      refreshParticipants();
    })
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      removeAudio(track.sid);
      const el = track.attach();
      el.dataset.voice = p.identity;
      document.body.appendChild(el);
      audioEls.set(track.sid ?? `${p.identity}:${Date.now()}`, el);
      applyVolume(p);
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      // LiveKit may already have detached the element before this event, so
      // remove the element we created ourselves (regression: e2e/voice.spec.ts)
      track.detach();
      removeAudio(track.sid);
    })
    .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      useVoice.setState({ speaking: Object.fromEntries(speakers.map((s) => [s.identity, true])) });
    })
    .on(RoomEvent.ConnectionQualityChanged, refreshParticipants)
    .on(RoomEvent.Reconnecting, () => useVoice.setState({ status: 'reconnecting' }))
    .on(RoomEvent.Reconnected, () => useVoice.setState({ status: 'connected' }))
    .on(RoomEvent.AudioPlaybackStatusChanged, () => useVoice.setState({ needsAudioUnlock: !r.canPlaybackAudio }))
    .on(RoomEvent.Disconnected, () => {
      if (room === r) cleanup('off');
    })
    .on(RoomEvent.MediaDevicesError, (e: Error) => useVoice.setState({ error: micError(e) }));
  try {
    await r.connect(creds.url, creds.token, { autoSubscribe: true });
    useVoice.setState({ status: 'connected', needsAudioUnlock: !r.canPlaybackAudio });
    refreshParticipants();
    try {
      await r.localParticipant.setMicrophoneEnabled(!useVoice.getState().muted);
    } catch (e) {
      // listening still works without a microphone
      useVoice.setState({ muted: true, error: micError(e as Error) });
    }
  } catch (e) {
    cleanup('error', 'ما قدرنا نتصل بالصوت: ' + (e as Error).message);
  }
}

function micError(e: Error) {
  if (e.name === 'NotAllowedError') return 'المايك مرفوض. اسمح للمتصفح يستخدم المايك من إعدادات الموقع.';
  if (e.name === 'NotFoundError') return 'ما لقينا مايك على هالجهاز.';
  return 'مشكلة بالمايك: ' + e.message;
}

function cleanup(status: 'off' | 'error', error: string | null = null) {
  for (const el of audioEls.values()) el.remove();
  audioEls.clear();
  room?.removeAllListeners();
  room = null;
  currentCode = null;
  useVoice.setState({ status, error, speaking: {}, inVoice: {}, quality: {} });
}

export async function leaveVoice() {
  const r = room;
  if (!r) return;
  room = null;
  // stops only our own tracks; others keep talking
  await r.disconnect(true).catch(() => {});
  cleanup('off');
}

export async function setMuted(muted: boolean) {
  useVoice.setState({ muted });
  if (room) {
    try {
      await room.localParticipant.setMicrophoneEnabled(!muted);
    } catch (e) {
      useVoice.setState({ muted: true, error: micError(e as Error) });
    }
  }
}

export function setDeafened(deafened: boolean) {
  useVoice.setState({ deafened });
  if (room) for (const p of room.remoteParticipants.values()) applyVolume(p);
}

export function setVolume(identity: string, volume: number) {
  useVoice.setState((s) => ({ volumes: { ...s.volumes, [identity]: volume } }));
  const p = room?.remoteParticipants.get(identity);
  if (p) applyVolume(p);
}

export async function unlockAudio() {
  await room?.startAudio();
  useVoice.setState({ needsAudioUnlock: false });
}

export async function listMics(): Promise<MediaDeviceInfo[]> {
  try {
    return await Room.getLocalDevices('audioinput');
  } catch {
    return [];
  }
}

export async function switchMic(deviceId: string) {
  await room?.switchActiveDevice('audioinput', deviceId);
}

export function activeMic() {
  return room?.getActiveDevice('audioinput') ?? null;
}
