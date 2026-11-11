/**
 * Voice chat via LiveKit (SFU). The server only mints short-lived access
 * tokens for verified room members; media never touches this server.
 * LiveKit Cloud provides TURN/TLS relays automatically; for self-hosted
 * LiveKit see docs/DEPLOYMENT.md (TURN section).
 */
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { Config } from '../config.ts';

export class VoiceService {
  private cfg: Config['livekit'];
  private rooms: RoomServiceClient | null;
  constructor(cfg: Config['livekit']) {
    this.cfg = cfg;
    this.rooms = cfg ? new RoomServiceClient(cfg.url.replace(/^ws/, 'http'), cfg.apiKey, cfg.apiSecret) : null;
  }
  get available() {
    return !!this.cfg;
  }
  livekitRoomName(roomId: string) {
    return `khabsa-${roomId}`;
  }
  async token(roomId: string, user: { id: string; name: string; avatar: string }): Promise<{ url: string; token: string; room: string; expiresIn: number }> {
    if (!this.cfg) throw new Error('voice not configured');
    const room = this.livekitRoomName(roomId);
    const ttl = 60 * 60 * 2;
    const at = new AccessToken(this.cfg.apiKey, this.cfg.apiSecret, {
      identity: user.id,
      name: user.name,
      ttl,
      metadata: JSON.stringify({ avatar: user.avatar }),
    });
    at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: [TrackSource.MICROPHONE] });
    return { url: this.cfg.url, token: await at.toJwt(), room, expiresIn: ttl };
  }
  /** Best effort: remove a kicked player from the voice room. */
  async removeParticipant(roomId: string, userId: string) {
    if (!this.rooms) return;
    try {
      await this.rooms.removeParticipant(this.livekitRoomName(roomId), userId);
    } catch {
      /* participant may not be connected to voice */
    }
  }
}
