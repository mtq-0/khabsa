import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Server } from 'socket.io';
import { AppError, ERROR_MESSAGES_AR } from '../shared/errors.ts';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol.ts';
import type { Config } from './config.ts';
import { createDb, migrate, type Db } from './db/db.ts';
import { seed } from './db/seed/seed.ts';
import { SessionStore } from './auth/auth.ts';
import { ContentRepo } from './content/content.ts';
import { StatsService } from './stats/stats.ts';
import { Platform } from './platform.ts';
import { RoomManager } from './rooms/RoomManager.ts';
import { attachSockets, PresenceTracker } from './rooms/sockets.ts';
import { ImageSigner, Storage } from './storage/storage.ts';
import { VoiceService } from './voice/voice.ts';
import { limits } from './security/rateLimit.ts';
import { createEngines } from './games/registry.ts';
import { SESSION_COOKIE, type AppContext } from './context.ts';
import { authRoutes } from './routes/auth.ts';
import { socialRoutes } from './routes/social.ts';
import { roomRoutes } from './routes/rooms.ts';
import { adminRoutes } from './routes/admin.ts';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
  close(): Promise<void>;
}

export async function buildApp(config: Config, opts: { db?: Db; log?: boolean } = {}): Promise<BuiltApp> {
  const db = opts.db ?? (await createDb(config.databaseUrl));
  if (config.databaseUrl.startsWith('pglite:') && config.databaseUrl !== 'pglite:memory') await mkdir(config.databaseUrl.slice(7), { recursive: true }).catch(() => {});
  await migrate(db, (m) => console.log('[db]', m));
  const storage = new Storage(db, config.storageDir);
  if (config.seedOnBoot) await seed(db, storage, (m) => console.log('[seed]', m));

  const app = Fastify({
    // request-level logs are off; errors are logged by the error handler
    logger: opts.log ? { level: 'warn' } : false,
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
    // signed image tokens are passed as a path parameter
    routerOptions: { maxParamLength: 400 },
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 5 } });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    path: '/socket.io',
    cors: config.env === 'production' ? { origin: config.allowedOrigins, credentials: true } : { origin: true, credentials: true },
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    connectionStateRecovery: { maxDisconnectionDuration: 60_000, skipMiddlewares: false },
  });

  const signer = new ImageSigner(config.sessionSecret);
  const voice = new VoiceService(config.livekit);
  const platform = new Platform(db);
  const content = new ContentRepo(db);
  const stats = new StatsService(db);
  const presence = new PresenceTracker();
  const rooms = new RoomManager({
    db,
    io,
    content,
    stats,
    platform,
    engines: createEngines({ sign: (id, viewer) => signer.sign(id, viewer) }),
    voiceAvailable: voice.available,
    idleMinutes: config.roomIdleMinutes,
    onKick: (room, userId) => void voice.removeParticipant(room.id, userId),
  });
  const ctx: AppContext = { config, db, sessions: new SessionStore(db, config.sessionDays), content, stats, platform, rooms, storage, signer, voice, limits: limits(config.ipRateLimitScale), io };

  // ------------------------------------------------------------ security
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    if (!ctx.limits.api.take(req.ip)) throw new AppError('RATE_LIMITED');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      // CSRF: cookies are SameSite=Lax and every mutating call must carry a
      // custom header (cannot be sent cross-site without a CORS preflight) and
      // a same-origin Origin header when the browser provides one.
      if (req.headers['x-khabsa'] !== '1') throw new AppError('FORBIDDEN', 'طلب غير موثوق.');
      const origin = req.headers.origin;
      if (origin && config.env === 'production' && !config.allowedOrigins.includes(origin)) throw new AppError('FORBIDDEN', 'مصدر غير موثوق.');
    }
    try {
      req.user = await ctx.sessions.resolve(req.cookies[SESSION_COOKIE]);
    } catch (e) {
      if (e instanceof AppError && e.code === 'SESSION_EXPIRED') req.user = null;
      else throw e;
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
    if (config.secureCookies) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (!reply.hasHeader('Content-Security-Policy')) {
      const lk = config.livekit ? ` ${config.livekit.url} ${config.livekit.url.replace(/^ws/, 'http')}` : '';
      reply.header(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:${lk}; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`,
      );
    }
    if (req.url.startsWith('/api/') && !reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send({ ok: false, code: err.code, message: err.message });
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.statusCode === 413 || e.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(413).send({ ok: false, code: 'VALIDATION', message: 'الملف أو الطلب كبير كثير.' });
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ ok: false, code: 'VALIDATION', message: ERROR_MESSAGES_AR.VALIDATION });
    req.log.error(err);
    console.error('[http] error', e.message);
    return reply.status(500).send({ ok: false, code: 'SERVER_ERROR', message: ERROR_MESSAGES_AR.SERVER_ERROR });
  });

  authRoutes(app, ctx);
  socialRoutes(app, ctx, presence);
  roomRoutes(app, ctx);
  adminRoutes(app, ctx);

  // ------------------------------------------------------------- static
  // public media (avatars) are stored in the database; file names are random uuids so they can be cached forever
  app.get('/media/avatars/:file', async (req, reply) => {
    const file = String((req.params as { file: string }).file);
    if (!/^[a-f0-9-]{36}\.webp$/.test(file)) throw new AppError('NOT_FOUND');
    const data = await storage.get(`public/avatars/${file}`);
    if (!data) throw new AppError('NOT_FOUND');
    return reply.header('Content-Type', 'image/webp').header('Cache-Control', 'public, max-age=31536000, immutable').header('X-Content-Type-Options', 'nosniff').send(data);
  });
  const clientDir = resolve(config.clientDir);
  const hasClient = existsSync(join(clientDir, 'index.html'));
  if (hasClient) {
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      wildcard: false,
      setHeaders(res, path) {
        res.header('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/media/') || req.url.startsWith('/socket.io')) {
      return reply.status(404).send({ ok: false, code: 'NOT_FOUND', message: ERROR_MESSAGES_AR.NOT_FOUND });
    }
    if (hasClient && req.method === 'GET') return reply.header('Cache-Control', 'no-cache').sendFile('index.html', clientDir);
    return reply.status(404).send('Not found');
  });

  attachSockets(io, ctx, presence);
  const restored = await rooms.restore();
  if (restored) console.log(`[rooms] restored ${restored} rooms`);
  const purge = setInterval(() => void ctx.sessions.purgeExpired().catch(() => {}), 3600_000);
  purge.unref();

  return {
    app,
    ctx,
    async close() {
      clearInterval(purge);
      await rooms.shutdown();
      io.close();
      await app.close();
      for (const l of Object.values(ctx.limits)) l.dispose();
      if (!opts.db) await db.close();
    },
  };
}
