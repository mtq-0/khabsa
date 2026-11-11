/**
 * Minimal stand-in for the Postgres Db used by RoomManager in the browser.
 * Only room snapshots are kept (in localStorage of the hosting browser) so a
 * host can refresh the page and the room — including a running game — comes
 * back. Everything else (members audit, blocks, packs, stats) is a no-op.
 */
import type { Db, Queryable } from '../../server/db/db.ts';

const KEY = 'khabsa:p2p:rooms';

interface Stored {
  id: string;
  code: string;
  snapshot: unknown;
  updated_at: string;
}

function readAll(): Record<string, Stored> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Stored>;
  } catch {
    return {};
  }
}
function writeAll(v: Record<string, Stored>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // storage full: keep running without persistence
  }
}

export class LocalDb implements Db {
  readonly kind = 'pglite' as const;
  /** restore only this room code (the one this tab hosts) */
  onlyCode: string | null = null;

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    const s = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (s.startsWith('update rooms set snapshot')) {
      const [id, json] = params as [string, string];
      const snapshot = JSON.parse(json) as { code: string };
      const all = readAll();
      all[id] = { id, code: snapshot.code, snapshot, updated_at: new Date().toISOString() };
      writeAll(all);
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith("update rooms set status = 'closed'")) {
      const all = readAll();
      delete all[params[0] as string];
      writeAll(all);
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('select id, code, snapshot, updated_at from rooms')) {
      const rows = Object.values(readAll()).filter((r) => !this.onlyCode || r.code === this.onlyCode);
      return { rows: rows as T[], rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  }
  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return fn(this);
  }
  async close() {}
}

/** Forget a stored room (e.g. host closed it). */
export function forgetStoredRoom(code: string) {
  const all = readAll();
  for (const [id, r] of Object.entries(all)) if (r.code === code) delete all[id];
  writeAll(all);
}
