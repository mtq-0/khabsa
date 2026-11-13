/**
 * The hosting browser runs the real, tested RoomManager and game engines.
 * Friends connect over WebRTC data channels; each one only ever receives
 * the personalised view the engines compute for them (same privacy rules as
 * the server edition). The host's own UI talks to it over a loopback link.
 */
import { create } from 'zustand';
import { AppError, ERROR_MESSAGES_AR } from '../../shared/errors.ts';
import { isValidAvatar } from '../../shared/avatars.ts';
import { RoomManager, type RoomDeps } from '../../server/rooms/RoomManager.ts';
import { createEngines } from '../../server/games/registry.ts';
import { limits as makeLimits } from '../../server/security/rateLimit.ts';
import { cleanText } from '../../server/security/text.ts';
import type { UserRow } from '../../server/auth/auth.ts';
import type { RoomView } from '../../shared/protocol.ts';
import { BrowserContent, imageUrl, primeImages } from './content.ts';
import { LocalDb, forgetStoredRoom } from './localDb.ts';
import { PEER_OPTIONS, Peer, loopbackPair, peerIdFor, peerLink, type Link, type Msg } from './link.ts';
import type { LocalIdentity } from './identity.ts';

const HOSTING_KEY = (code: string) => `khabsa:p2p:hosting:${code}`;
const USERS_KEY = (code: string) => `khabsa:p2p:users:${code}`;

export interface HostingRecord {
  opts: { gameId?: string; visibility?: string; capacity?: number; name?: string };
  createdAt: number;
}

export function isHosting(code: string): boolean {
  return localStorage.getItem(HOSTING_KEY(code)) != null;
}
export function markHosting(code: string, rec: HostingRecord) {
  localStorage.setItem(HOSTING_KEY(code), JSON.stringify(rec));
}
function hostingRecord(code: string): HostingRecord | null {
  try {
    return JSON.parse(localStorage.getItem(HOSTING_KEY(code)) ?? 'null') as HostingRecord | null;
  } catch {
    return null;
  }
}

/** Status of the public (peer) side of the hosted room, shown in the room header. */
export const useHubStatus = create<{ state: 'idle' | 'connecting' | 'online' | 'error'; message: string | null; guests: number }>(() => ({
  state: 'idle',
  message: null,
  guests: 0,
}));

// ---------------------------------------------------------------------------
// Socket.IO-like shim for RoomManager
// ---------------------------------------------------------------------------
class FakeSocket {
  readonly id: string;
  readonly data: { rooms: Set<string>; userId: string } = { rooms: new Set(), userId: '' };
  readonly channels = new Set<string>();
  private io: FakeIO;
  private out: (ev: string, p: unknown) => void;
  constructor(id: string, io: FakeIO, out: (ev: string, p: unknown) => void) {
    this.id = id;
    this.io = io;
    this.out = out;
  }
  join(ch: string) {
    this.channels.add(ch);
  }
  leave(ch: string) {
    this.channels.delete(ch);
  }
  emit(ev: string, p: unknown) {
    this.out(ev, p);
  }
  to(ch: string) {
    return { emit: (ev: string, p: unknown) => this.io.broadcast(ch, ev, p, this.id) };
  }
}

class FakeIO {
  readonly sockets = { sockets: new Map<string, FakeSocket>() };
  to(target: string) {
    return { emit: (ev: string, p: unknown) => this.broadcast(target, ev, p) };
  }
  broadcast(target: string, ev: string, p: unknown, except?: string) {
    for (const s of this.sockets.sockets.values()) {
      if (s.id === except) continue;
      if (s.id === target || s.channels.has(target)) s.emit(ev, p);
    }
  }
}

function userRow(i: { id: string; name: string; avatar: string }): UserRow {
  return {
    id: i.id,
    email: null,
    password_hash: null,
    username: 'player_' + i.id.slice(0, 8).replace(/[^a-z0-9]/g, ''),
    display_name: i.name,
    avatar: i.avatar,
    avatar_url: null,
    is_guest: true,
    role: 'user',
    xp: 0,
    settings: {},
    banned: false,
    favorite_games: [],
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------
let current: Hub | null = null;

export class Hub {
  readonly code: string;
  private rooms: RoomManager;
  private io = new FakeIO();
  private db = new LocalDb();
  private limits = makeLimits(1);
  private peer: Peer | null = null;
  private peerRetry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private seq = 0;
  /** user id → secret token, so nobody can take over another player's seat */
  private tokens: Record<string, string>;
  private links = new Set<Link>();
  /** players currently in voice chat (announced by their browsers, relayed to everybody so they can dial each other) */
  private voice = new Set<string>();

  private constructor(code: string) {
    this.code = code;
    this.db.onlyCode = code;
    try {
      this.tokens = JSON.parse(localStorage.getItem(USERS_KEY(code)) ?? '{}') as Record<string, string>;
    } catch {
      this.tokens = {};
    }
    const deps: RoomDeps = {
      db: this.db,
      io: this.io as unknown as RoomDeps['io'],
      content: new BrowserContent() as unknown as RoomDeps['content'],
      stats: { startMatch: async () => crypto.randomUUID(), finishMatch: async () => [] } as unknown as RoomDeps['stats'],
      platform: {
        settings: async () => ({ maintenance: false, announcement: '', maxRoomCapacity: 12, guestAccess: true, allowPublicRooms: false, chatEnabled: true }),
        gameEnabled: async () => true,
        games: async () => ({}),
        invalidate() {},
      } as unknown as RoomDeps['platform'],
      engines: createEngines({ sign: (id) => imageUrl(id) }),
      voiceAvailable: true,
      idleMinutes: 60,
    };
    this.rooms = new RoomManager(deps);
  }

  /** Start (or reuse) the hub for a room this browser hosts. */
  static async ensure(code: string, host: LocalIdentity): Promise<Hub> {
    if (current && current.code === code && !current.stopped) return current;
    if (current) await current.stop();
    const hub = new Hub(code);
    current = hub;
    await hub.rooms.restore();
    // pictures of a restored game are not in memory any more: load them again before anyone looks
    for (const r of hub.rooms.rooms.values()) if (r.game) await primeImages(JSON.stringify(r.game)).catch(() => {});
    if (!hub.rooms.roomByCode(code)) {
      const rec = hostingRecord(code);
      await hub.rooms.create(userRow({ id: host.id, name: host.displayName, avatar: host.avatar }), rec?.opts ?? {}, code);
    }
    hub.tokens[host.id] = host.token;
    hub.saveTokens();
    hub.registerPeer();
    return hub;
  }

  static current(): Hub | null {
    return current;
  }

  /** In-memory link for the host's own tab. */
  localLink(): Link {
    const [mine, theirs] = loopbackPair();
    this.attach(theirs, true);
    return mine;
  }

  private saveTokens() {
    try {
      localStorage.setItem(USERS_KEY(this.code), JSON.stringify(this.tokens));
    } catch {
      /* ignore */
    }
  }

  private setStatus(state: 'connecting' | 'online' | 'error', message: string | null = null) {
    useHubStatus.setState({ state, message });
  }

  private registerPeer(attempt = 0) {
    if (this.stopped) return;
    this.setStatus('connecting');
    const peer = new Peer(peerIdFor(this.code), PEER_OPTIONS);
    this.peer = peer;
    peer.on('open', () => this.setStatus('online'));
    peer.on('connection', (conn) => {
      conn.on('open', () => this.attach(peerLink(conn), false));
    });
    peer.on('disconnected', () => {
      // signaling server lost: existing players keep playing; re-register for new ones
      if (!this.stopped && !peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 3000);
    });
    peer.on('error', (err: Error & { type?: string }) => {
      if (this.stopped) return;
      if (err.type === 'peer-unavailable') return; // not relevant for the host
      // 'unavailable-id' happens right after a refresh while the old session expires
      const msg = err.type === 'unavailable-id' ? 'عم نرجّع الغرفة بعد التحديث... استنى ثواني.' : 'مشكلة بالاتصال بخادم الربط. عم نحاول مرة ثانية...';
      this.setStatus('error', msg);
      peer.destroy();
      const delay = Math.min(30_000, 3000 * 2 ** Math.min(attempt, 4));
      this.peerRetry = setTimeout(() => this.registerPeer(attempt + 1), delay);
    });
  }

  private attach(link: Link, local: boolean) {
    this.links.add(link);
    useHubStatus.setState({ guests: this.links.size - 1 });
    let sock: FakeSocket | null = null;
    let user: UserRow | null = null;
    const reply = (id: unknown, r: unknown) => link.send({ t: 'res', id, r });
    const fail = (id: unknown, e: unknown) => {
      if (e instanceof AppError) reply(id, { ok: false, code: e.code, message: e.message });
      else {
        console.error('[hub] handler error', e);
        reply(id, { ok: false, code: 'SERVER_ERROR', message: ERROR_MESSAGES_AR.SERVER_ERROR });
      }
    };
    const limit = (bucket: 'roomJoin' | 'action' | 'chat' | 'draw') => {
      if (!local && !this.limits[bucket].take(user!.id)) throw new AppError('RATE_LIMITED');
    };

    link.onMessage(async (m: Msg) => {
      try {
        if (m.t === 'hello') {
          const u = (m.user ?? {}) as { id?: unknown; token?: unknown; name?: unknown; avatar?: unknown };
          const id = typeof u.id === 'string' && /^[0-9a-f-]{36}$/.test(u.id) ? u.id : null;
          const token = typeof u.token === 'string' && u.token.length >= 32 && u.token.length <= 200 ? u.token : null;
          const name = cleanText(u.name, 24);
          if (!id || !token || name.length < 2) return link.send({ t: 'reject', code: 'VALIDATION', message: ERROR_MESSAGES_AR.VALIDATION });
          const known = this.tokens[id];
          if (known && known !== token) return link.send({ t: 'reject', code: 'FORBIDDEN', message: 'هالهوية مستخدمة من جهاز ثاني.' });
          if (!known) {
            this.tokens[id] = token;
            this.saveTokens();
          }
          user = userRow({ id, name, avatar: isValidAvatar(u.avatar) ? u.avatar : '0-0' });
          sock = new FakeSocket(`s${++this.seq}`, this.io, (ev, p) => link.send({ t: 'evt', ev, p }));
          sock.data.userId = id;
          this.io.sockets.sockets.set(sock.id, sock);
          return link.send({ t: 'welcome' });
        }
        if (!user || !sock) return;
        if (m.t === 'emit') {
          if (m.ev === 'voice:presence') {
            const on = !!(m.p as { on?: unknown } | undefined)?.on;
            if (on) this.voice.add(user.id);
            else this.voice.delete(user.id);
            this.sendVoicePresence();
            return;
          }
          if (m.ev === 'draw:event') {
            limit('draw');
            try {
              this.rooms.draw(user, sock as never, (m.p ?? {}) as never);
            } catch {
              /* invalid/stale strokes are dropped */
            }
          }
          return;
        }
        if (m.t !== 'req') return;
        const p = (m.p ?? {}) as Record<string, unknown>;
        switch (m.ev) {
          case 'room:join': {
            limit('roomJoin');
            const view: RoomView = await this.rooms.join(user, sock as never, p.code);
            const room = this.rooms.roomByCode(view.code);
            if (room) for (const msg of this.rooms.chatHistory(room)) sock.emit('room:chat', msg);
            sock.emit('voice:presence', { ids: [...this.voice] });
            return reply(m.id, { ok: true, data: view });
          }
          case 'room:leave':
            if (local) {
              // the hosting tab is the server: leaving closes the room for everyone
              await this.rooms.closeRoom(this.code, 'host-left');
              reply(m.id, { ok: true, data: null });
              await this.stop(true);
              return;
            }
            await this.rooms.leave(user.id, p.code);
            return reply(m.id, { ok: true, data: null });
          case 'room:sync':
            return reply(m.id, { ok: true, data: this.rooms.getView(user.id, p.code) });
          case 'room:action':
            limit('action');
            return reply(m.id, { ok: true, data: await this.rooms.action(user, p) });
          case 'room:chat':
            limit('chat');
            await this.rooms.chat(user, p);
            return reply(m.id, { ok: true, data: null });
          case 'draw:sync':
            return reply(m.id, { ok: true, data: this.rooms.drawSync(user.id, p.code) });
          case 'presence:ping':
            return reply(m.id, { ok: true, data: { now: Date.now() } });
          default:
            return reply(m.id, { ok: false, code: 'INVALID_ACTION', message: ERROR_MESSAGES_AR.INVALID_ACTION });
        }
      } catch (e) {
        if (m.t === 'req') fail(m.id, e);
      }
    });

    link.onClose(() => {
      this.links.delete(link);
      useHubStatus.setState({ guests: Math.max(0, this.links.size - 1) });
      if (user && this.voice.delete(user.id)) this.sendVoicePresence();
      if (sock) {
        this.rooms.onDisconnect(sock as never);
        this.io.sockets.sockets.delete(sock.id);
      }
    });
  }

  private sendVoicePresence() {
    const ids = [...this.voice];
    for (const s of this.io.sockets.sockets.values()) s.emit('voice:presence', { ids });
  }

  /** Stop hosting. With forget=true the room is removed from this browser. */
  async stop(forget = false) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.peerRetry) clearTimeout(this.peerRetry);
    for (const l of [...this.links]) l.close();
    this.peer?.destroy();
    await this.rooms.shutdown().catch(() => {});
    for (const l of Object.values(this.limits)) l.dispose();
    if (forget) {
      localStorage.removeItem(HOSTING_KEY(this.code));
      localStorage.removeItem(USERS_KEY(this.code));
      forgetStoredRoom(this.code);
    }
    if (current === this) current = null;
    useHubStatus.setState({ state: 'idle', message: null, guests: 0 });
  }
}
