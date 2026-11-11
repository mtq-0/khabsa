import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Minimal database abstraction so the same SQL runs on:
 *  - PostgreSQL (production: Supabase Postgres, Neon, RDS, ...) via `pg`
 *  - PGlite (embedded Postgres compiled to WASM) for local dev and tests
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: 'pg' | 'pglite';
}

export async function createDb(url: string): Promise<Db> {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return createPgDb(url);
  if (url.startsWith('pglite:')) return createPgliteDb(url.slice('pglite:'.length));
  throw new Error('DATABASE_URL must start with postgres://, postgresql:// or pglite:');
}

async function createPgDb(url: string): Promise<Db> {
  const pg = await import('pg');
  const ssl = /sslmode=(require|verify)/.test(url) || process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined;
  const pool = new pg.default.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10), ssl });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));
  return {
    kind: 'pg',
    async query(sql, params) {
      const r = await pool.query(sql, params as unknown[]);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const res = await fn({
          async query(sql, params) {
            const r = await client.query(sql, params as unknown[]);
            return { rows: r.rows, rowCount: r.rowCount ?? 0 };
          },
        });
        await client.query('commit');
        return res;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

async function createPgliteDb(path: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = path === 'memory' || path === '' ? new PGlite() : new PGlite(path);
  await db.waitReady;
  // PGlite is single-connection: serialize transactions so they cannot interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  const q = async (sql: string, params?: unknown[]) => {
    const r = params ? await db.query(sql, params as unknown[]) : await db.exec(sql).then((rs) => rs[rs.length - 1] ?? { rows: [], affectedRows: 0 });
    return { rows: r.rows as never[], rowCount: pgliteRowCount(r) };
  };
  return {
    kind: 'pglite',
    query: (sql, params) => exclusive(() => q(sql, params)) as never,
    transaction: (fn) =>
      exclusive(() =>
        db.transaction(async (tx) =>
          fn({
            async query(sql, params) {
              if (!params) {
                const rs = await tx.exec(sql);
                const last = rs[rs.length - 1];
                return { rows: (last?.rows ?? []) as never[], rowCount: last ? pgliteRowCount(last) : 0 };
              }
              const r = await tx.query(sql, params as unknown[]);
              return { rows: r.rows as never[], rowCount: pgliteRowCount(r) };
            },
          }),
        ),
      ),
    async close() {
      await db.close();
    },
  };
}

/** Match node-postgres: SELECT/RETURNING report returned rows, DML reports affected rows. */
function pgliteRowCount(r: { rows: unknown[]; affectedRows?: number }): number {
  return r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0);
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(db: Db, log: (m: string) => void = () => {}): Promise<string[]> {
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())', []);
  const done = new Set((await db.query<{ name: string }>('select name from schema_migrations', [])).rows.map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    await db.transaction(async (tx) => {
      // multi-statement scripts: run without params
      await tx.query(sql);
      await tx.query('insert into schema_migrations (name) values ($1)', [f]);
    });
    log(`applied migration ${f}`);
    applied.push(f);
  }
  return applied;
}
