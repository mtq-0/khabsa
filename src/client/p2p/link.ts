/**
 * A message link between a player and the hosting browser: either a WebRTC
 * data channel (PeerJS) or, for the host's own tab, an in-memory loopback.
 * Messages are JSON objects. A heartbeat detects silently dead connections.
 */
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';

export type Msg = Record<string, unknown> & { t: string };

export interface Link {
  send(msg: Msg): void;
  onMessage(cb: (msg: Msg) => void): void;
  onClose(cb: () => void): void;
  close(): void;
  readonly open: boolean;
}

export const PEER_PREFIX = 'khabsa-v1-';
export const peerIdFor = (code: string) => PEER_PREFIX + code;

/** Public PeerJS signaling + public STUN servers (no account needed). */
export const PEER_OPTIONS: PeerOptions = {
  debug: 0,
  config: {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }],
  },
};

const HEARTBEAT_MS = 4000;
const DEAD_AFTER_MS = 15000;

class BaseLink implements Link {
  protected msgCbs: ((m: Msg) => void)[] = [];
  protected closeCbs: (() => void)[] = [];
  protected closed = false;
  private lastSeen = Date.now();
  private hb: ReturnType<typeof setInterval> | null = null;
  private transmit: (m: Msg) => void;
  private shutdown: () => void;
  constructor(transmit: (m: Msg) => void, shutdown: () => void, heartbeat: boolean) {
    this.transmit = transmit;
    this.shutdown = shutdown;
    if (heartbeat)
      this.hb = setInterval(() => {
        if (Date.now() - this.lastSeen > DEAD_AFTER_MS) return this.close();
        this.send({ t: 'hb' });
      }, HEARTBEAT_MS);
  }
  get open() {
    return !this.closed;
  }
  send(msg: Msg) {
    if (this.closed) return;
    try {
      this.transmit(msg);
    } catch {
      this.close();
    }
  }
  receive(raw: unknown) {
    if (this.closed || !raw || typeof raw !== 'object') return;
    this.lastSeen = Date.now();
    const m = raw as Msg;
    if (m.t === 'hb') return;
    for (const cb of this.msgCbs) cb(m);
  }
  onMessage(cb: (m: Msg) => void) {
    this.msgCbs.push(cb);
  }
  onClose(cb: () => void) {
    if (this.closed) cb();
    else this.closeCbs.push(cb);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.hb) clearInterval(this.hb);
    try {
      this.shutdown();
    } catch {
      /* already closed */
    }
    const cbs = this.closeCbs;
    this.closeCbs = [];
    this.msgCbs = [];
    for (const cb of cbs) cb();
  }
}

/** Wrap an open PeerJS data connection. */
export function peerLink(conn: DataConnection): Link {
  const link = new BaseLink(
    (m) => void conn.send(m),
    () => conn.close(),
    true,
  );
  conn.on('data', (d) => link.receive(d));
  conn.on('close', () => link.close());
  conn.on('error', () => link.close());
  return link;
}

/** Two in-memory ends; messages are JSON round-tripped like on the wire. */
export function loopbackPair(): [Link, Link] {
  let a!: BaseLink;
  let b!: BaseLink;
  const deliver = (to: () => BaseLink) => (m: Msg) => {
    const copy = JSON.parse(JSON.stringify(m)) as Msg;
    queueMicrotask(() => to().receive(copy));
  };
  a = new BaseLink(deliver(() => b), () => queueMicrotask(() => b.close()), false);
  b = new BaseLink(deliver(() => a), () => queueMicrotask(() => a.close()), false);
  return [a, b];
}

export { Peer };
