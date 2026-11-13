import { create } from 'zustand';

export type VoiceStatus = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'unavailable';

export interface VoiceState {
  status: VoiceStatus;
  error: string | null;
  muted: boolean;
  deafened: boolean;
  speaking: Record<string, boolean>;
  quality: Record<string, 'excellent' | 'good' | 'poor' | 'lost' | 'unknown'>;
  inVoice: Record<string, boolean>;
  volumes: Record<string, number>;
  needsAudioUnlock: boolean;
  /** serverless edition: connection state per other player in voice (undefined = not in voice) */
  peerState: Record<string, 'connecting' | 'connected' | 'failed'>;
}

export const useVoice = create<VoiceState>(() => ({
  status: 'off',
  error: null,
  muted: false,
  deafened: false,
  speaking: {},
  quality: {},
  inVoice: {},
  volumes: {},
  needsAudioUnlock: false,
  peerState: {},
}));
