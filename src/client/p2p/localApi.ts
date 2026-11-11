/**
 * GitHub Pages edition of lib/localApi.ts: answers the API calls the UI
 * makes without any server. Unsupported features reply with a clear error.
 */
import { AppError } from '../../shared/errors.ts';
import { GAME_IDS, isGameId } from '../../shared/games.ts';
import { isValidAvatar, randomAvatar } from '../../shared/avatars.ts';
import { ROOM_CODE_ALPHABET } from '../../shared/protocol.ts';
import { cleanText, containsProfanity } from '../../server/security/text.ts';
import { ApiError } from '../lib/api.ts';
import { categoriesFor } from './content.ts';
import { clearIdentity, loadIdentity, saveIdentity, toSessionUser } from './identity.ts';
import { Hub, isHosting, markHosting } from './host.ts';
import { randomInt } from './cryptoShim.ts';

const createdByRequest = new Map<string, string>();

function nickname(v: unknown): string {
  const n = cleanText(v, 24);
  if (n.length < 2) throw new ApiError('VALIDATION', 'الاسم لازم يكون حرفين على الأقل');
  if (containsProfanity(n)) throw new ApiError('VALIDATION', 'اختار اسم ألطف 🙂');
  return n;
}

function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    if (!isHosting(c)) return c;
  }
}

async function handle(path: string, method: string, body: Record<string, unknown>): Promise<unknown> {
  const url = new URL(path, location.origin);
  const p = url.pathname;
  if (p === '/api/auth/me') {
    const me = loadIdentity();
    return { user: me ? toSessionUser(me) : null };
  }
  if (p === '/api/auth/guest' && method === 'POST') {
    const me = saveIdentity({ displayName: nickname(body.nickname), avatar: isValidAvatar(body.avatar) ? body.avatar : randomAvatar() });
    return { user: toSessionUser(me) };
  }
  if (p === '/api/auth/logout') {
    await Hub.current()?.stop();
    clearIdentity();
    return { ok: true };
  }
  if (p === '/api/me' && method === 'PATCH') {
    const cur = loadIdentity();
    if (!cur) throw new ApiError('UNAUTHENTICATED');
    const s = (body.settings ?? {}) as Record<string, unknown>;
    const settings = Object.fromEntries(Object.entries(s).filter(([k, v]) => ['sound', 'reducedMotion', 'showOnline'].includes(k) ? typeof v === 'boolean' : k === 'allowInvites' && typeof v === 'string'));
    const me = saveIdentity({
      displayName: body.displayName !== undefined ? nickname(body.displayName) : undefined,
      avatar: isValidAvatar(body.avatar) ? body.avatar : undefined,
      settings,
      favoriteGames: Array.isArray(body.favoriteGames) ? body.favoriteGames.filter(isGameId) : undefined,
    });
    return { user: toSessionUser(me) };
  }
  if (p === '/api/platform') {
    return {
      announcement: '',
      maintenance: false,
      guestAccess: true,
      allowPublicRooms: false,
      voice: false,
      games: GAME_IDS.map((id, i) => ({ id, enabled: true, featured: i < 3, sort: i })),
      online: { online: 0, rooms: 0, playing: 0, players: 0 },
    };
  }
  if (p === '/api/categories') return { categories: await categoriesFor(url.searchParams.get('game')) };
  if (p === '/api/packs') return { packs: [] };
  if (p === '/api/rooms' && method === 'POST') {
    if (!loadIdentity()) throw new ApiError('UNAUTHENTICATED');
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const prev = requestId && createdByRequest.get(requestId);
    if (prev) return { code: prev };
    const code = newCode();
    markHosting(code, {
      opts: {
        gameId: isGameId(body.gameId) ? body.gameId : 'outsider-word',
        visibility: 'private',
        capacity: typeof body.capacity === 'number' ? body.capacity : 8,
        name: typeof body.name === 'string' ? body.name : undefined,
      },
      createdAt: Date.now(),
    });
    if (requestId) createdByRequest.set(requestId, code);
    return { code };
  }
  throw new ApiError('NOT_FOUND', 'هالميزة مش متوفرة بنسخة GitHub (بدون سيرفر).');
}

export function localApi(path: string, opts: { method: string; body?: unknown }): Promise<unknown> | undefined {
  const body = (opts.body && typeof opts.body === 'object' ? opts.body : {}) as Record<string, unknown>;
  return handle(path, opts.method, body).catch((e) => {
    if (e instanceof AppError) throw new ApiError(e.code, e.message);
    throw e;
  });
}
