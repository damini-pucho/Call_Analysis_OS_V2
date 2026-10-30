// src/lib/db.ts — the one pool and the tenant boundary. Every tenant query runs inside withOrg(): a transaction that sets
// `app.org_id`, so Postgres row-level security (db/rls.sql) confines it to one organisation even if a WHERE is forgotten.
// withPlatform() is the narrow cross-tenant door (sign-in lookup, sign-up, verified flow callbacks, platform console).
import 'server-only';
import { Pool, types, type PoolClient, type PoolConfig } from 'pg';

// DATE columns stay 'YYYY-MM-DD' strings: as JS Dates they become local midnight and serialise to the previous UTC day
types.setTypeParser(1082, (v: string) => v);

const env = (k: string) => { const v = process.env[k]; return v == null || v.trim() === '' ? undefined : v.trim(); };
const LOCAL = /^(localhost|127\.0\.0\.1|::1)$/i;

function config(): PoolConfig {
  const host = env('DB_HOST');
  if (host) {
    const ssl = env('DB_SSL') ? ['1', 'true', 'require', 'on'].includes(env('DB_SSL')!.toLowerCase()) : !LOCAL.test(host);
    const ca = env('DB_SSL_CA')?.replace(/\\n/g, '\n');
    return {
      host, port: Number(env('DB_PORT') ?? 5432), database: env('DB_NAME'), user: env('DB_USER'), password: env('DB_PASSWORD'),
      max: 10, connectionTimeoutMillis: 5000, ...(ssl ? { ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } } : {}),
    };
  }
  const url = env('DATABASE_URL');
  if (!url) throw new Error('Set DATABASE_URL (development) or DB_HOST + DB_NAME + DB_USER (deployment).');
  return { connectionString: url, max: 10, connectionTimeoutMillis: 5000 };
}

declare global { var __casPool: Pool | undefined } // eslint-disable-line no-var
function makePool() { const p = new Pool(config()); p.on('error', (e) => console.error('pg pool error:', e.message)); return p; }
export const pool: Pool = globalThis.__casPool ?? makePool();
if (process.env.NODE_ENV !== 'production') globalThis.__casPool = pool;

export type Db = { q: <T = any>(sql: string, params?: unknown[]) => Promise<T[]>; one: <T = any>(sql: string, params?: unknown[]) => Promise<T | null> };
const wrap = (c: PoolClient): Db => ({
  q: async (sql, params = []) => (await c.query(sql, params)).rows,
  one: async (sql, params = []) => (await c.query(sql, params)).rows[0] ?? null,
});

async function tx<T>(setup: [string, unknown[]][], fn: (db: Db) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const [sql, p] of setup) await c.query(sql, p);
    const out = await fn(wrap(c));
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Run fn with row-level security pinned to one organisation. */
export function withOrg<T>(orgId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!isUuid(orgId)) throw new Error('withOrg: invalid organisation id');
  return tx([["SELECT set_config('app.org_id', $1, true)", [orgId]]], fn);
}

/** Cross-tenant access. Only for code paths that cannot know the organisation yet, or are verified platform operations. */
export function withPlatform<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return tx([["SELECT set_config('app.platform', 'on', true)", []]], fn);
}
