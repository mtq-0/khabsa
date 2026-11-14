import { create } from 'zustand';

export type VoiceStatus = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'unavailable';

export interface VoiceState {
  status: VoiceStatus;
  error: string | null;
  muted: boolean;
  deafened: boolean;
  speaking: Record<string, boolean>;
  /** how loud each player is right now, 0..1 (drives the green ring around their avatar) */
  levels: Record<string, number>;
  quality: Record<string, 'excellent' | 'good' | 'poor' | 'lost' | 'unknown'>;
  inVoice: Record<string, boolean>;
  volumes: Record<string, number>;
  needsAudioUnlock: boolean;
  /** serverless edition: connection state per other player in voice (undefined = not in voice) */
  peerState: Record<string, 'connecting' | 'connected' | 'relay' | 'failed'>;
}

export const useVoice = create<VoiceState>(() => ({
  status: 'off',
  error: null,
  muted: false,
  deafened: false,
  speaking: {},
  levels: {},
  quality: {},
  inVoice: {},
  volumes: {},
  needsAudioUnlock: false,
  peerState: {},
}));

/**
 * Publish the current loudness of every player (0..1). Values are rounded so the store (and every
 * avatar) only updates when something visibly changed; a ring is shown above SPEAK_MIN.
 */
export const SPEAK_MIN = 0.1;
export function publishLevels(raw: Record<string, number>) {
  const next: Record<string, number> = {};
  const speaking: Record<string, boolean> = {};
  for (const [id, v] of Object.entries(raw)) {
    const q = Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
    if (q >= SPEAK_MIN) {
      next[id] = q;
      speaking[id] = true;
    }
  }
  const cur = useVoice.getState();
  const same = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
  if (same(cur.levels, next)) return;
  useVoice.setState({ levels: next, speaking });
}
