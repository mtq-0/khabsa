/** Local player identity for the GitHub Pages edition (no accounts). */
import { isValidAvatar } from '../../shared/avatars.ts';
import { DEFAULT_USER_SETTINGS, type SessionUser, type UserSettings } from '../../shared/protocol.ts';
import { randomUUID } from './cryptoShim.ts';

const KEY = 'khabsa:p2p:user';

export interface LocalIdentity {
  id: string;
  /** secret proving this identity to a host (prevents impersonation) */
  token: string;
  displayName: string;
  avatar: string;
  settings: Partial<UserSettings>;
  favoriteGames: string[];
}

export function loadIdentity(): LocalIdentity | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LocalIdentity | null;
    if (!v || typeof v.id !== 'string' || typeof v.token !== 'string' || typeof v.displayName !== 'string') return null;
    if (!isValidAvatar(v.avatar)) v.avatar = '0-0';
    return v;
  } catch {
    return null;
  }
}

export function saveIdentity(patch: Partial<LocalIdentity> & { displayName?: string; avatar?: string }): LocalIdentity {
  const cur = loadIdentity();
  const next: LocalIdentity = {
    id: cur?.id ?? randomUUID(),
    token: cur?.token ?? randomUUID() + randomUUID(),
    displayName: patch.displayName ?? cur?.displayName ?? 'لاعب',
    avatar: patch.avatar ?? cur?.avatar ?? '0-0',
    settings: { ...(cur?.settings ?? {}), ...(patch.settings ?? {}) },
    favoriteGames: patch.favoriteGames ?? cur?.favoriteGames ?? [],
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearIdentity() {
  localStorage.removeItem(KEY);
}

export function toSessionUser(i: LocalIdentity): SessionUser {
  return {
    id: i.id,
    username: 'player_' + i.id.slice(0, 8).replace(/[^a-z0-9]/g, ''),
    displayName: i.displayName,
    avatar: i.avatar,
    avatarUrl: null,
    isGuest: true,
    xp: 0,
    level: 1,
    email: null,
    role: 'user',
    settings: { ...DEFAULT_USER_SETTINGS, ...i.settings },
    favoriteGames: i.favoriteGames,
  };
}
