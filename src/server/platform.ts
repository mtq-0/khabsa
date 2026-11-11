import type { Db } from './db/db.ts';
import { DEFAULT_PLATFORM_SETTINGS } from './db/seed/seed.ts';
import type { GameId } from '../shared/games.ts';

export interface PlatformSettings {
  maintenance: boolean;
  announcement: string;
  maxRoomCapacity: number;
  guestAccess: boolean;
  allowPublicRooms: boolean;
  chatEnabled: boolean;
}

/** Cached platform-wide settings and game toggles (admin editable). */
export class Platform {
  private db: Db;
  private cache: { at: number; settings: PlatformSettings; games: Record<string, { enabled: boolean; featured: boolean; sort: number }> } | null = null;
  constructor(db: Db) {
    this.db = db;
  }
  private async load() {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache;
    const s = await this.db.query<{ key: string; value: unknown }>('select key, value from platform_settings', []);
    const g = await this.db.query<{ id: string; enabled: boolean; featured: boolean; sort: number }>('select id, enabled, featured, sort from games', []);
    const settings = { ...DEFAULT_PLATFORM_SETTINGS, ...Object.fromEntries(s.rows.map((r) => [r.key, r.value])) } as unknown as PlatformSettings;
    this.cache = { at: Date.now(), settings, games: Object.fromEntries(g.rows.map((r) => [r.id, { enabled: r.enabled, featured: r.featured, sort: r.sort }])) };
    return this.cache;
  }
  async settings() {
    return (await this.load()).settings;
  }
  async games() {
    return (await this.load()).games;
  }
  async gameEnabled(id: GameId) {
    const g = (await this.load()).games[id];
    return g ? g.enabled : true;
  }
  invalidate() {
    this.cache = null;
  }
}
