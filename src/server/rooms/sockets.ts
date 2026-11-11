import type { Server, Socket } from 'socket.io';
import { AppError, ERROR_MESSAGES_AR } from '../../shared/errors.ts';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol.ts';
import type { UserRow } from '../auth/auth.ts';
import type { AppContext } from '../context.ts';
import { SESSION_COOKIE } from '../context.ts';

type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Wraps a handler so every failure becomes a typed ack instead of a crash. */
function handle<P>(fn: (p: P) => Promise<unknown> | unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (p: P, ack?: Ack<any>) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const data = await fn(p);
      reply({ ok: true, data: data ?? null });
    } catch (e) {
      if (e instanceof AppError) reply({ ok: false, code: e.code, message: e.message });
      else {
        console.error('[socket] handler error', e);
        reply({ ok: false, code: 'SERVER_ERROR', message: ERROR_MESSAGES_AR.SERVER_ERROR });
      }
    }
  };
}

export class PresenceTracker {
  private counts = new Map<string, number>();
  add(userId: string) {
    this.counts.set(userId, (this.counts.get(userId) ?? 0) + 1);
  }
  remove(userId: string) {
    const n = (this.counts.get(userId) ?? 1) - 1;
    if (n <= 0) this.counts.delete(userId);
    else this.counts.set(userId, n);
  }
  isOnline(userId: string) {
    return this.counts.has(userId);
  }
  get size() {
    return this.counts.size;
  }
}

export function attachSockets(io: Server<ClientToServerEvents, ServerToClientEvents>, ctx: AppContext, presence: PresenceTracker) {
  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && !ctx.config.allowedOrigins.includes(origin) && ctx.config.env === 'production') return next(Object.assign(new Error('FORBIDDEN'), { data: { code: 'FORBIDDEN' } }));
      const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      const user = await ctx.sessions.resolve(token);
      if (!user) return next(Object.assign(new Error('UNAUTHENTICATED'), { data: { code: 'UNAUTHENTICATED' } }));
      socket.data.userId = user.id;
      socket.data.token = token;
      socket.data.rooms = new Set<string>();
      next();
    } catch (e) {
      const code = e instanceof AppError ? e.code : 'SERVER_ERROR';
      next(Object.assign(new Error(code), { data: { code } }));
    }
  });

  io.on('connection', (socket: Sock) => {
    const userId = socket.data.userId as string;
    presence.add(userId);
    void socket.join(`user:${userId}`);

    /** Always re-resolve the session so bans/expiry take effect on live sockets. */
    const user = async (): Promise<UserRow> => {
      const u = await ctx.sessions.resolve(socket.data.token as string);
      if (!u) {
        socket.disconnect(true);
        throw new AppError('SESSION_EXPIRED');
      }
      return u;
    };
    const limit = (bucket: keyof AppContext['limits'], cost = 1) => {
      if (!ctx.limits[bucket].take(`${userId}`, cost)) throw new AppError('RATE_LIMITED');
    };

    socket.on(
      'room:join',
      handle(async (p: { code: string }) => {
        limit('roomJoin');
        const u = await user();
        const view = await ctx.rooms.join(u, socket, p?.code);
        const room = ctx.rooms.roomByCode(view.code);
        if (room) for (const m of ctx.rooms.chatHistory(room)) socket.emit('room:chat', m);
        return view;
      }),
    );
    socket.on(
      'room:leave',
      handle(async (p: { code: string }) => {
        await ctx.rooms.leave(userId, p?.code);
        return null;
      }),
    );
    socket.on(
      'room:sync',
      handle(async (p: { code: string }) => ctx.rooms.getView(userId, p?.code)),
    );
    socket.on(
      'room:action',
      handle(async (p) => {
        limit('action');
        const u = await user();
        return ctx.rooms.action(u, p ?? {});
      }),
    );
    socket.on(
      'room:chat',
      handle(async (p) => {
        limit('chat');
        const u = await user();
        await ctx.rooms.chat(u, p ?? {});
        return null;
      }),
    );
    socket.on(
      'draw:event',
      handle(async (p) => {
        limit('draw');
        const u = await user();
        ctx.rooms.draw(u, socket, p ?? {});
        return null;
      }),
    );
    socket.on(
      'draw:sync',
      handle(async (p: { code: string }) => ctx.rooms.drawSync(userId, p?.code)),
    );
    socket.on('presence:ping', (ack) => {
      if (typeof ack === 'function') ack({ ok: true, data: { now: Date.now() } });
    });

    socket.on('disconnect', () => {
      presence.remove(userId);
      ctx.rooms.onDisconnect(socket);
    });
  });
}
