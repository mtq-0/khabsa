/**
 * GitHub Pages edition of lib/socketTransport.ts.
 * Exposes the small part of the Socket.IO client API the app uses, but the
 * "server" is either this tab's own Hub (when it hosts the room) or the
 * host's browser reached over WebRTC. Reconnects automatically with backoff.
 */
import { ERROR_MESSAGES_AR, type ErrorCode } from '../../shared/errors.ts';
import { normalizeRoomCode, ROOM_CODE_RE } from '../../shared/protocol.ts';
import type { Sock } from '../lib/socketTransport.ts';
import { Hub, isHosting } from './host.ts';
import { loadIdentity } from './identity.ts';
import { PEER_OPTIONS, Peer, peerIdFor, peerLink, type Link, type Msg } from './link.ts';

type Handler = (...args: never[]) => void;
type Ack = (err: Error | null, res?: unknown) => void;
type Fail = { ok: false; code: ErrorCode; message: string };

const fail = (code: ErrorCode, message?: string): Fail => ({ ok: false, code, message: message ?? ERROR_MESSAGES_AR[code] });
const NOT_FOUND_MSG = 'ما لقينا الغرفة. يا إما الرمز غلط، أو المضيف سكّر صفحة اللعبة.';
const MAX_RECONNECTS = 12;

// one guest Peer per tab, created on demand
let guestPeer: Promise<Peer> | null = null;
function getGuestPeer(): Promise<Peer> {
  guestPeer ??= new Promise<Peer>((resolve, reject) => {
    const p = new Peer(PEER_OPTIONS);
    const t = setTimeout(() => reject(fail('NETWORK', 'ما قدرنا نتصل بخادم الربط. تأكد من الإنترنت.')), 15_000);
    p.on('open', () => {
      clearTimeout(t);
      resolve(p);
    });
    p.on('error', (e: Error & { type?: string }) => {
      if (e.type === 'peer-unavailable') return; // handled per connection
      clearTimeout(t);
      reject(fail('NETWORK', 'ما قدرنا نتصل بخادم الربط. تأكد من الإنترنت.'));
    });
    p.on('disconnected', () => setTimeout(() => !p.destroyed && p.reconnect(), 2000));
  }).catch((e) => {
    guestPeer = null;
    throw e;
  });
  return guestPeer;
}

async function connectToHost(code: string): Promise<Link> {
  const peer = await getGuestPeer();
  const target = peerIdFor(code);
  return new Promise<Link>((resolve, reject) => {
    const conn = peer.connect(target, { reliable: true, serialization: 'json' });
    const cleanup = () => {
      clearTimeout(timer);
      peer.off('error', onErr);
    };
    const onErr = (e: Error & { type?: string }) => {
      if (e.type === 'peer-unavailable' && String(e.message).includes(target)) {
        cleanup();
        reject(fail('ROOM_NOT_FOUND', NOT_FOUND_MSG));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      conn.close();
      reject(fail('TIMEOUT', 'المضيف موجود بس ما قدرنا نوصله. جرّب شبكة ثانية (واي فاي بدل بيانات الموبايل) أو اطلب من المضيف يحدّث الصفحة.'));
    }, 20_000);
    peer.on('error', onErr);
    conn.on('open', () => {
      cleanup();
      resolve(peerLink(conn));
    });
  });
}

class ClientSocket {
  connected = false;
  private handlers = new Map<string, Set<Handler>>();
  private ioHandlers = new Map<string, Set<Handler>>();
  private link: Link | null = null;
  private linking: Promise<Fail | null> | null = null;
  private code: string | null = null;
  private pending = new Map<number, { ack: Ack; timer: ReturnType<typeof setTimeout> }>();
  private seq = 0;
  private manualClosed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;

  readonly io = {
    on: (ev: string, h: Handler) => {
      (this.ioHandlers.get(ev) ?? this.ioHandlers.set(ev, new Set()).get(ev)!).add(h);
    },
  };

  constructor() {
    // "connected" to the local hub machinery right away; room links are opened on join
    setTimeout(() => this.markConnected(), 0);
  }

  // ------------------------------------------------------------- events
  on(ev: string, h: Handler) {
    (this.handlers.get(ev) ?? this.handlers.set(ev, new Set()).get(ev)!).add(h);
    return this;
  }
  off(ev: string, h: Handler) {
    this.handlers.get(ev)?.delete(h);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    this.ioHandlers.clear();
    return this;
  }
  private fire(ev: string, ...args: unknown[]) {
    for (const h of [...(this.handlers.get(ev) ?? [])]) (h as (...a: unknown[]) => void)(...args);
  }
  private fireIo(ev: string, ...args: unknown[]) {
    for (const h of [...(this.ioHandlers.get(ev) ?? [])]) (h as (...a: unknown[]) => void)(...args);
  }
  private markConnected() {
    if (this.manualClosed) return;
    this.connected = true;
    this.attempts = 0;
    this.fire('connect');
  }

  // ------------------------------------------------------------- emitting
  timeout(ms: number) {
    return {
      emit: (ev: string, payload: unknown, ack?: Ack) => {
        // socket.io allows emit(event, callback) with no payload (e.g. presence:ping)
        if (typeof payload === 'function' && ack === undefined) return void this.request(ev, undefined, ms, payload as Ack);
        if (typeof ack === 'function') void this.request(ev, payload, ms, ack);
      },
    };
  }
  emit(ev: string, payload?: unknown, ack?: (res: unknown) => void) {
    if (typeof payload === 'function' && ack === undefined) {
      ack = payload as (res: unknown) => void;
      payload = undefined;
    }
    if (typeof ack === 'function') return void this.request(ev, payload, 10_000, (_e, r) => ack(r ?? fail('TIMEOUT')));
    // fire-and-forget (canvas strokes)
    this.link?.send({ t: 'emit', ev, p: payload as never });
    return true;
  }

  private async request(ev: string, payload: unknown, ms: number, ack: Ack) {
    if (ev === 'presence:ping') return ack(null, { ok: true, data: { now: Date.now() } });
    if (ev === 'room:join') {
      const raw = (payload as { code?: unknown })?.code;
      const code = typeof raw === 'string' ? normalizeRoomCode(raw) : '';
      if (!ROOM_CODE_RE.test(code)) return ack(null, fail('INVALID_CODE'));
      const err = await this.ensureLink(code);
      if (err) return ack(null, err);
      ms = Math.max(ms, 15_000);
    }
    const link = this.link;
    if (!link || !link.open) return ack(null, fail('NETWORK', ERROR_MESSAGES_AR.REALTIME_FAILED));
    const id = ++this.seq;
    const timer = setTimeout(() => {
      this.pending.delete(id);
      ack(new Error('timeout'));
    }, ms);
    this.pending.set(id, { ack, timer });
    link.send({ t: 'req', id, ev, p: payload as never });
  }

  // ------------------------------------------------------------- links
  private ensureLink(code: string): Promise<Fail | null> {
    if (this.link?.open && this.code === code) return Promise.resolve(null);
    if (this.linking && this.code === code) return this.linking;
    if (this.code !== code) this.dropLink(false);
    this.code = code;
    this.linking = this.openLink(code).finally(() => {
      this.linking = null;
    });
    return this.linking;
  }

  private async openLink(code: string): Promise<Fail | null> {
    const me = loadIdentity();
    if (!me) return fail('UNAUTHENTICATED');
    let link: Link;
    try {
      link = isHosting(code) ? (await Hub.ensure(code, me)).localLink() : await connectToHost(code);
    } catch (e) {
      if (e && typeof e === 'object' && 'ok' in e) return e as Fail;
      console.error('[p2p] link failed', e);
      return fail('NETWORK');
    }
    const welcome = await new Promise<Fail | null>((resolve) => {
      const t = setTimeout(() => resolve(fail('TIMEOUT')), 10_000);
      link.onMessage((m: Msg) => {
        if (m.t === 'welcome') {
          clearTimeout(t);
          resolve(null);
        } else if (m.t === 'reject') {
          clearTimeout(t);
          resolve(fail(m.code as ErrorCode, String(m.message ?? '')));
        } else this.onMessage(m);
      });
      link.onClose(() => resolve(fail('NETWORK', 'انقطع الاتصال بالمضيف.')));
      link.send({ t: 'hello', user: { id: me.id, token: me.token, name: me.displayName, avatar: me.avatar } });
    });
    if (welcome) {
      link.close();
      return welcome;
    }
    if (this.code !== code) {
      link.close();
      return fail('NETWORK');
    }
    this.link = link;
    link.onClose(() => {
      if (this.link === link) this.handleDrop();
    });
    return null;
  }

  private onMessage(m: Msg) {
    if (m.t === 'res') {
      const p = this.pending.get(m.id as number);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(m.id as number);
      p.ack(null, m.r);
    } else if (m.t === 'evt' && typeof m.ev === 'string') {
      this.fire(m.ev, m.p);
    }
  }

  private failPending() {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.ack(null, fail('NETWORK', 'انقطع الاتصال بالمضيف.'));
      this.pending.delete(id);
    }
  }

  private dropLink(emit: boolean) {
    const l = this.link;
    this.link = null;
    this.failPending();
    l?.close();
    if (emit && this.connected) {
      this.connected = false;
      this.fire('disconnect', 'transport close');
    }
  }

  private handleDrop() {
    this.link = null;
    this.failPending();
    if (this.manualClosed) return;
    this.connected = false;
    this.fire('disconnect', 'transport close');
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.retryTimer || !this.code || this.manualClosed) return;
    if (this.attempts >= MAX_RECONNECTS) {
      this.fireIo('reconnect_failed');
      return;
    }
    this.attempts++;
    this.fireIo('reconnect_attempt', this.attempts);
    const delay = Math.min(8000, 800 * 2 ** (this.attempts - 1));
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      const code = this.code;
      if (!code || this.manualClosed) return;
      const err = await this.ensureLink(code);
      if (!err) this.markConnected();
      else if (err.code === 'FORBIDDEN' || err.code === 'VALIDATION') this.fire('connect_error', Object.assign(new Error(err.code), { data: { code: err.code } }));
      else this.scheduleReconnect();
    }, delay);
  }

  connect() {
    this.manualClosed = false;
    this.attempts = 0;
    if (this.code && !this.link?.open) {
      this.scheduleReconnect();
    } else if (!this.connected) this.markConnected();
    return this;
  }

  disconnect() {
    this.manualClosed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.dropLink(false);
    if (this.connected) {
      this.connected = false;
      this.fire('disconnect', 'io client disconnect');
    }
    return this;
  }
}

export function createSocket(): Sock {
  return new ClientSocket() as unknown as Sock;
}
