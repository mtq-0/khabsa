import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { io as ioc, type Socket } from 'socket.io-client';
import { buildApp, type BuiltApp } from '../../src/server/app.ts';
import { loadConfig } from '../../src/server/config.ts';
import type { Db } from '../../src/server/db/db.ts';
import type { ClientToServerEvents, RoomView, ServerToClientEvents } from '../../src/shared/protocol.ts';

export interface TestServer {
  built: BuiltApp;
  url: string;
  close(): Promise<void>;
}

export async function startServer(overrides: Record<string, unknown> = {}, db?: Db): Promise<TestServer> {
  mkdirSync(join(process.cwd(), '.tools'), { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), '.tools', 'it-'));
  const config = loadConfig({
    env: 'test',
    port: 0,
    databaseUrl: 'pglite:memory',
    storageDir: join(dir, 'storage'),
    clientDir: join(dir, 'no-client'),
    sessionSecret: 'test-secret-'.padEnd(40, 'x'),
    adminEmails: ['admin@khabsa.test'],
    ipRateLimitScale: 100,
    ...overrides,
  });
  const built = await buildApp(config, { db });
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = built.app.server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}`;
  return { built, url, close: () => built.close() };
}

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A simulated player: its own cookie jar, HTTP client and socket. */
export class Player {
  cookie = '';
  socket: ClientSocket | null = null;
  user: { id: string; displayName: string } | null = null;
  views: RoomView[] = [];
  chats: { text: string; kind: string; userId: string | null }[] = [];
  raw: string[] = [];
  draws: unknown[] = [];
  base: string;
  constructor(base: string) {
    this.base = base;
  }
  /** Mirrors the real client: never let an older room version replace a newer one. */
  accept(v: RoomView, fresh = false) {
    const cur = this.views[this.views.length - 1];
    if (!fresh && cur && cur.id === v.id && v.version < cur.version) return;
    if (fresh && cur && cur.id === v.id && v.version < cur.version) return;
    this.views.push(v);
  }
  get last(): RoomView {
    return this.views[this.views.length - 1];
  }

  async http<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: T }> {
    const res = await fetch(this.base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), 'x-khabsa': '1', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* binary or text */
    }
    return { status: res.status, data };
  }

  async guest(nickname: string) {
    const r = await this.http('POST', '/api/auth/guest', { nickname });
    if (r.status !== 200) throw new Error('guest failed ' + JSON.stringify(r.data));
    this.user = r.data.user;
    return r.data.user;
  }

  async connect(): Promise<ClientSocket> {
    const s: ClientSocket = ioc(this.base, { transports: ['websocket'], extraHeaders: { cookie: this.cookie }, reconnection: false, forceNew: true });
    s.on('room:state', (v) => {
      this.raw.push(JSON.stringify(v));
      this.accept(v);
    });
    s.on('room:chat', (m) => this.chats.push(m));
    s.on('draw:event', (e) => this.draws.push(e));
    await new Promise<void>((resolve, reject) => {
      s.once('connect', () => resolve());
      s.once('connect_error', (e) => reject(e));
    });
    this.socket = s;
    return s;
  }

  emit<T = any>(event: string, payload: unknown): Promise<{ ok: boolean; data?: T; code?: string; message?: string }> {
    return new Promise((resolve) => (this.socket as any).emit(event, payload, resolve));
  }

  async join(code: string) {
    const r = await this.emit<RoomView>('room:join', { code });
    if (!r.ok) throw new Error(`join failed: ${r.code}`);
    this.accept(r.data!, true);
    return r.data!;
  }

  act(code: string, type: string, payload?: unknown, extra: Record<string, unknown> = {}) {
    return this.emit('room:action', { code, actionId: randomUUID(), type, payload, ...extra });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export async function waitFor<T>(fn: () => T | undefined | null | false, timeout = 5000, label = 'condition'): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
