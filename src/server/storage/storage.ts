import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * File storage on a local (persistent) disk.
 *   private/  secret game images — never served statically
 *   public/   avatars and other public media (served under /media)
 * The key format is validated so callers cannot escape the storage root.
 */
const KEY_RE = /^(private|public)\/[a-z0-9-]+\/[a-f0-9-]{36}\.(webp|svg|png|jpg)$/;

export class Storage {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    if (!KEY_RE.test(key)) throw new Error('invalid storage key');
    return join(this.root, key);
  }
  async put(key: string, data: Buffer | string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
  get publicDir() {
    return join(this.root, 'public');
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
