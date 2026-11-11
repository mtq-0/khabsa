import { create } from 'zustand';
import type { SessionUser } from '../../shared/protocol.ts';
import { api } from './api.ts';

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  load(): Promise<void>;
  set(user: SessionUser | null): void;
  guest(nickname: string, avatar: string): Promise<SessionUser>;
  logout(): Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  loading: true,
  error: null,
  async load() {
    try {
      const r = await api<{ user: SessionUser | null }>('/api/auth/me');
      set({ user: r.user, loading: false, error: null });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },
  set(user) {
    set({ user });
  },
  async guest(nickname, avatar) {
    const r = await api<{ user: SessionUser }>('/api/auth/guest', { body: { nickname, avatar } });
    set({ user: r.user });
    return r.user;
  },
  async logout() {
    await api('/api/auth/logout', { body: {} }).catch(() => {});
    set({ user: null });
  },
}));
