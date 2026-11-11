import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Db } from '../db/db.ts';

/**
 * File storage in PostgreSQL (table `files`), so the app needs no persistent
 * disk and runs on free hosting tiers.
 *   private/  secret game images — only served through signed tokens
 *   public/   avatars (served under /media)
 * The key format is validated so callers cannot inject arbitrary keys.
 * Files written by older versions to a local directory are still readable
 * (legacyDir) and are copied into the database on first read.
 */
const KEY_RE = /^(private|public)\/[a-z0-9-]+\/[a-f0-9-]{36}\.(webp|svg|png|jpg)$/;
const MIME: Record<string, string> = { webp: 'image/webp', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' };

export function mimeForKey(key: string): string {
  return MIME[key.split('.').pop() ?? ''] ?? 'application/octet-stream';
}

const CACHE_MAX_BYTES = 32 * 1024 * 1024;

export class Storage {
  private db: Db;
  private legacyDir: string | null;
  /** small LRU so hot game images do not hit the database on every request */
  private cache = new Map<string, Buffer>();
  private cacheBytes = 0;
  constructor(db: Db, legacyDir?: string | null) {
    this.db = db;
    this.legacyDir = legacyDir ? resolve(legacyDir) : null;
  }
  private remember(key: string, buf: Buffer) {
    this.forget(key);
    if (buf.length > 2 * 1024 * 1024) return;
    this.cache.set(key, buf);
    this.cacheBytes += buf.length;
    while (this.cacheBytes > CACHE_MAX_BYTES) {
      const oldest = this.cache.keys().next().value!;
      this.forget(oldest);
    }
  }
  private forget(key: string) {
    const old = this.cache.get(key);
    if (old) {
      this.cacheBytes -= old.length;
      this.cache.delete(key);
    }
  }
  private check(key: string) {
    if (!KEY_RE.test(key)) throw new Error('invalid storage key');
  }
  async put(key: string, data: Buffer | string) {
    this.check(key);
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    await this.db.query(
      'insert into files (key, mime, data, bytes) values ($1, $2, $3, $4) on conflict (key) do update set data = excluded.data, bytes = excluded.bytes, mime = excluded.mime',
      [key, mimeForKey(key), buf, buf.length],
    );
    this.remember(key, buf);
  }
  async get(key: string): Promise<Buffer | null> {
    this.check(key);
    const hit = this.cache.get(key);
    if (hit) {
      // refresh LRU position
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const r = await this.db.query<{ data: Uint8Array }>('select data from files where key = $1', [key]);
    if (r.rows[0]) {
      const buf = Buffer.from(r.rows[0].data);
      this.remember(key, buf);
      return buf;
    }
    if (!this.legacyDir) return null;
    try {
      const buf = await readFile(join(this.legacyDir, key));
      await this.put(key, buf).catch(() => {});
      return buf;
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    this.check(key);
    this.forget(key);
    await this.db.query('delete from files where key = $1', [key]);
  }
}

/**
 * Short-lived, viewer-bound image tokens. Tokens are stable within a
 * 5-minute window so repeated state broadcasts do not change the URL (keeps
 * browser caching effective), and expire 5–10 minutes after issue.
 */
export class ImageSigner {
  private secret: string;
  constructor(secret: string) {
    this.secret = secret;
  }
  private mac(payload: string) {
    return createHmac('sha256', this.secret).update('img:' + payload).digest('base64url');
  }
  sign(imageId: string, viewerId: string, now = Date.now()): string {
    const window = 5 * 60_000;
    const exp = Math.ceil(now / window) * window + window;
    const payload = Buffer.from(JSON.stringify({ i: imageId, u: viewerId, e: exp })).toString('base64url');
    return `/api/game-image/${payload}.${this.mac(payload)}`;
  }
  verify(token: string, now = Date.now()): { imageId: string; viewerId: string } | null {
    const [payload, mac] = token.split('.');
    if (!payload || !mac || payload.length > 400) return null;
    const expected = Buffer.from(this.mac(payload));
    const got = Buffer.from(mac);
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
    try {
      const d = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { i: string; u: string; e: number };
      if (typeof d.e !== 'number' || d.e < now) return null;
      return { imageId: d.i, viewerId: d.u };
    } catch {
      return null;
    }
  }
}
