import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db, Queryable } from '../db/db.ts';
import { AppError } from '../../shared/errors.ts';
import { DEFAULT_USER_SETTINGS, levelForXp, type PublicUser, type SessionUser, type UserSettings } from '../../shared/protocol.ts';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [alg, n, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { ...SCRYPT, N: Number(n) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  username: string;
  display_name: string;
  avatar: string;
  avatar_url: string | null;
  is_guest: boolean;
  role: 'user' | 'admin';
  xp: number;
  settings: Partial<UserSettings> | null;
  banned: boolean;
  favorite_games: string[];
  created_at: string;
  last_seen_at: string;
}

export const USER_COLUMNS = 'id, email, password_hash, username, display_name, avatar, avatar_url, is_guest, role, xp, settings, banned, favorite_games, created_at, last_seen_at';

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatar: u.avatar,
    avatarUrl: u.avatar_url,
    isGuest: u.is_guest,
    xp: u.xp,
    level: levelForXp(u.xp),
  };
}

export function toSessionUser(u: UserRow): SessionUser {
  return { ...toPublicUser(u), email: u.email, role: u.role, settings: { ...DEFAULT_USER_SETTINGS, ...(u.settings ?? {}) }, favoriteGames: u.favorite_games ?? [] };
}

export class SessionStore {
  private db: Db;
  private days: number;
  /** small cache so every socket event does not hit the DB */
  private cache = new Map<string, { user: UserRow; expires: number; cachedAt: number }>();
  constructor(db: Db, days: number) {
    this.db = db;
    this.days = days;
  }

  async create(userId: string, userAgent: string | undefined, q: Queryable = this.db): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.days * 86400_000);
    await q.query('insert into sessions (user_id, token_hash, expires_at, user_agent) values ($1, $2, $3, $4)', [userId, sha256(token), expiresAt.toISOString(), (userAgent ?? '').slice(0, 200)]);
    return { token, expiresAt };
  }

  async resolve(token: string | undefined | null): Promise<UserRow | null> {
    if (!token || token.length > 100) return null;
    const hash = sha256(token);
    const hit = this.cache.get(hash);
    const now = Date.now();
    if (hit && hit.expires > now && now - hit.cachedAt < 15_000) return hit.user;
    const r = await this.db.query<UserRow & { expires_at: string; session_id: string }>(
      `select s.id as session_id, s.expires_at, ${USER_COLUMNS.split(', ').map((c) => 'u.' + c).join(', ')}
       from sessions s join users u on u.id = s.user_id where s.token_hash = $1`,
      [hash],
    );
    const row = r.rows[0];
    if (!row) {
      this.cache.delete(hash);
      return null;
    }
    const expires = new Date(row.expires_at).getTime();
    if (expires <= now) {
      await this.db.query('delete from sessions where id = $1', [row.session_id]);
      this.cache.delete(hash);
      throw new AppError('SESSION_EXPIRED');
    }
    if (row.banned) throw new AppError('FORBIDDEN', 'هالحساب موقوف.');
    if (!hit || now - hit.cachedAt > 300_000) {
      await this.db.query('update sessions set last_used_at = now() where id = $1', [row.session_id]);
      await this.db.query('update users set last_seen_at = now() where id = $1', [row.id]);
    }
    this.cache.set(hash, { user: row, expires, cachedAt: now });
    if (this.cache.size > 5000) this.cache.delete(this.cache.keys().next().value!);
    return row;
  }

  async revoke(token: string) {
    const hash = sha256(token);
    this.cache.delete(hash);
    await this.db.query('delete from sessions where token_hash = $1', [hash]);
  }

  async revokeAllForUser(userId: string) {
    for (const [k, v] of this.cache) if (v.user.id === userId) this.cache.delete(k);
    await this.db.query('delete from sessions where user_id = $1', [userId]);
  }

  /** Drop cached user rows so profile changes are visible immediately. */
  invalidateUser(userId: string) {
    for (const [k, v] of this.cache) if (v.user.id === userId) this.cache.delete(k);
  }

  async purgeExpired() {
    await this.db.query('delete from sessions where expires_at < now()', []);
  }
}

export function guestUsername(): string {
  return 'guest_' + randomBytes(5).toString('hex');
}
