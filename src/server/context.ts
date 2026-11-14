import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Server } from 'socket.io';
import type { ZodType } from 'zod';
import type { Config } from './config.ts';
import type { Db } from './db/db.ts';
import type { SessionStore, UserRow } from './auth/auth.ts';
import type { ContentRepo } from './content/content.ts';
import type { StatsService } from './stats/stats.ts';
import type { Platform } from './platform.ts';
import type { RoomManager } from './rooms/RoomManager.ts';
import type { Storage, ImageSigner } from './storage/storage.ts';
import type { VoiceService } from './voice/voice.ts';
import type { IceService } from './voice/ice.ts';
import type { TmdbService } from './content/tmdb.ts';
import type { Limits } from './security/rateLimit.ts';
import { AppError } from '../shared/errors.ts';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol.ts';

export const SESSION_COOKIE = 'khabsa_sid';

export interface AppContext {
  config: Config;
  db: Db;
  sessions: SessionStore;
  content: ContentRepo;
  stats: StatsService;
  platform: Platform;
  rooms: RoomManager;
  storage: Storage;
  signer: ImageSigner;
  voice: VoiceService;
  /** optional TURN relays for the peer-to-peer voice mesh */
  ice: IceService;
  tmdb: TmdbService;
  limits: Limits;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

export function requireUser(req: FastifyRequest): UserRow {
  if (!req.user) throw new AppError('UNAUTHENTICATED');
  return req.user;
}

export function requireRegistered(req: FastifyRequest): UserRow {
  const u = requireUser(req);
  if (u.is_guest) throw new AppError('FORBIDDEN', 'هالميزة للحسابات المسجلة. سجّل حسابك من الإعدادات.');
  return u;
}

export function requireAdmin(req: FastifyRequest): UserRow {
  const u = requireUser(req);
  if (u.role !== 'admin') throw new AppError('FORBIDDEN');
  return u;
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new AppError('VALIDATION', issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : undefined);
  }
  return r.data;
}

export function setSessionCookie(ctx: AppContext, reply: FastifyReply, token: string, expires: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.secureCookies,
    expires,
  });
}

export function rateLimit(ctx: AppContext, bucket: keyof Limits, key: string, cost = 1) {
  if (!ctx.limits[bucket].take(key, cost)) throw new AppError('RATE_LIMITED');
}

export async function audit(ctx: AppContext, actorId: string, action: string, target: string | null, details: unknown = {}) {
  await ctx.db.query('insert into audit_log (actor_id, action, target, details) values ($1, $2, $3, $4::jsonb)', [actorId, action, target, JSON.stringify(details)]);
}
