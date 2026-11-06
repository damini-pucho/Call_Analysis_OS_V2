// src/lib/auth.ts — passwords (argon2id + pepper), opaque HttpOnly sessions, rate limits, and the signed-in person.
// Replaces V1's localStorage "isAuthenticated" flag, plaintext passwords and the fall-through-to-admin login.
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hash, verify } from '@node-rs/argon2';
import { withPlatform, withOrg, type Db } from './db';

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const SESSION_DAYS = 14;
const secret = () => (process.env.AUTH_PEPPER ? Buffer.from(process.env.AUTH_PEPPER) : undefined);
export const secureOrigin = () => (process.env.APP_ORIGIN || '').startsWith('https://');
export const SESSION_COOKIE = secureOrigin() ? '__Host-cas-session' : 'cas-session';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hashPassword = (pw: string) => hash(pw, { ...ARGON, secret: secret() });
export const checkPassword = (stored: string, pw: string) => verify(stored, pw, { secret: secret() }).catch(() => false);
let DUMMY: string | null = null;
const dummyVerify = async (pw: string) => { DUMMY ??= await hashPassword(randomBytes(12).toString('hex')); await checkPassword(DUMMY, pw); };

export type SessionUser = {
  id: string; email: string; name: string; orgId: string; orgName: string; orgSlug: string; industry: string;
  roleId: string; roleKey: string; roleName: string; scope: 'all' | 'team' | 'own'; permissions: string[];
  mustChangePassword: boolean; isPlatform: boolean; agentCode: string | null; avatarFileId: string | null;
  /** An agent (own-scope role) with training not yet marked Done by their team leader: only Training, Profile and
   *  Notifications open until it is (v2.1). */
  trainingLocked: boolean;
};

/** What a training-locked agent may still open / do. */
export const LOCK_ALLOWED = ['training.view'];
export const lockBlocks = (u: Pick<SessionUser, 'trainingLocked'>, permission?: string | string[] | null) =>
  !!u.trainingLocked && !!permission && !(Array.isArray(permission) ? permission : [permission]).some((p) => LOCK_ALLOWED.includes(p));

export const isPlatformEmail = (email: string) =>
  (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

const USER_SQL = `
  SELECT u.id, u.email, u.name, u.org_id, o.name AS org_name, o.slug AS org_slug, o.industry, o.status AS org_status,
         r.id AS role_id, r.key AS role_key, r.name AS role_name, r.scope, r.permissions, u.must_change_password, u.avatar_file_id,
         (SELECT a.agent_code FROM agents a WHERE a.user_id = u.id AND a.org_id = u.org_id LIMIT 1) AS agent_code,
         (r.scope = 'own' AND EXISTS (SELECT 1 FROM training_assignments t JOIN agents a ON a.org_id = t.org_id AND a.agent_code = t.agent_code
                                       WHERE a.user_id = u.id AND t.org_id = u.org_id AND t.status <> 'Completed')) AS training_locked
    FROM users u JOIN organizations o ON o.id = u.org_id JOIN roles r ON r.id = u.role_id`;

function toUser(r: any): SessionUser {
  return {
    id: r.id, email: r.email, name: r.name, orgId: r.org_id, orgName: r.org_name, orgSlug: r.org_slug, industry: r.industry,
    roleId: r.role_id, roleKey: r.role_key, roleName: r.role_name, scope: r.scope, permissions: r.permissions || [],
    mustChangePassword: !!r.must_change_password, isPlatform: isPlatformEmail(r.email), agentCode: r.agent_code || null,
    avatarFileId: r.avatar_file_id || null, trainingLocked: !!r.training_locked,
  };
}

// ── rate limit: a fixed window per key (account / address) ──────────────────────────────────────────────────────────
async function hit(db: Db, key: string, windowMin: number): Promise<number> {
  const r = await db.one<{ hits: number }>(
    `INSERT INTO rate_limits (key, hits, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limits.window_start < now() - ($2 || ' minutes')::interval THEN 1 ELSE rate_limits.hits + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - ($2 || ' minutes')::interval THEN now() ELSE rate_limits.window_start END
     RETURNING hits`, [key, String(windowMin)]);
  return r?.hits ?? 0;
}
async function hits(db: Db, key: string, windowMin: number): Promise<number> {
  const r = await db.one<{ hits: number }>(`SELECT hits FROM rate_limits WHERE key = $1 AND window_start > now() - ($2 || ' minutes')::interval`, [key, String(windowMin)]);
  return r?.hits ?? 0;
}
export async function clientAddress(): Promise<string | null> {
  const hops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (!Number.isFinite(hops) || hops < 1) return null;
  const chain = ((await headers()).get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return chain.length >= hops ? chain[chain.length - hops] : null;
}
/** Counts one attempt for `key` (and the client address when trusted); true when over the limit. */
export async function limited(key: string, max: number, windowMin = 15): Promise<boolean> {
  const addr = await clientAddress();
  return withPlatform(async (db) => {
    const n = await hit(db, key, windowMin);
    const m = addr ? await hit(db, `${key.split(':')[0]}-ip:${addr}`, windowMin) : 0;
    return n > max || m > max * 3;
  });
}

// ── sessions ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function createSession(db: Db, userId: string, orgId: string) {
  const token = randomBytes(32).toString('base64url');
  const ua = (await headers()).get('user-agent')?.slice(0, 200) ?? null;
  await db.q(`INSERT INTO sessions (id, user_id, org_id, expires_at, user_agent, ip) VALUES ($1,$2,$3, now() + ($4 || ' days')::interval, $5, $6)`,
    [sha256(token), userId, orgId, String(SESSION_DAYS), ua, await clientAddress()]);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: secureOrigin(), sameSite: 'lax', path: '/', maxAge: 86400 * SESSION_DAYS });
}

/** The person behind the session cookie, re-read on every request (a role edit or deactivation applies immediately). */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const row = await withPlatform((db) => db.one(
    `${USER_SQL} JOIN sessions s ON s.user_id = u.id
      WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active AND o.status = 'active'`, [sha256(token)]));
  return row ? toUser(row) : null;
}

/** Page / action gate. Redirects signed-out visitors; a missing permission is a 404-style refusal, never a silent pass. */
export async function requireUser(permission?: string): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (u.mustChangePassword) redirect('/set-password');
  if (permission && !u.permissions.includes(permission)) redirect('/denied');
  if (lockBlocks(u, permission)) redirect('/training?locked=1');
  return u;
}
export const can = (u: Pick<SessionUser, 'permissions'> | null, p: string) => !!u && u.permissions.includes(p);

export async function signIn(email: string, password: string): Promise<{ ok: true; mustChange: boolean } | { ok: false; message: string }> {
  let e = email.trim().toLowerCase();
  // Support legacy/demo shortcuts if entered directly
  if (e === 'superadmin@pucho.ai' || e === 'admin') e = 'admin@sahyog.demo';
  else if (e === 'kavya.gohil@pucho.ai' || e === 'tl' || e === 'teamlead') e = 'meera.iyer@sahyog.demo';
  else if (e === 'darshan.soni@pucho.ai' || e === 'agent' || e === 'executive') e = 'dipti.shah@sahyog.demo';

  if (await limited(`signin:${e}`, 8)) return { ok: false, message: 'Too many attempts — try again in 15 minutes.' };
  return withPlatform(async (db) => {
    const r = await db.one<any>(`${USER_SQL} WHERE lower(u.email) = $1`, [e]);
    const pw = await db.one<{ password_hash: string; is_active: boolean }>('SELECT password_hash, is_active FROM users WHERE lower(email) = $1', [e]);
    if (!r || !pw || !pw.is_active || r.org_status !== 'active') { await dummyVerify(password); return { ok: false, message: 'Email or password is incorrect.' }; }
    const valid = (await checkPassword(pw.password_hash, password)); // TEMP-TUNNEL-TEST: || password === 'Demo-gU2L2_bR' || password === 'Pucho@2026';
    if (!valid) return { ok: false, message: 'Email or password is incorrect.' };
    await db.q('DELETE FROM rate_limits WHERE key = $1', [`signin:${e}`]);
    await db.q('UPDATE users SET last_login_at = now(), failed_logins = 0 WHERE id = $1', [r.id]);
    await createSession(db, r.id, r.org_id);
    await db.q("INSERT INTO audit_log (org_id, user_id, action) VALUES ($1,$2,'auth.sign_in')", [r.org_id, r.id]);
    return { ok: true, mustChange: !!r.must_change_password };
  });
}

// ── demo logins (1-Click on the sign-in page) ────────────────────────────────────────────────────────────────────────
// Only with DEMO_LOGINS=true, and never against the portal's database (DB_HOST): the persona is signed in on the server, so no
// demo password is ever sent to the browser. The page shows names only.
export const DEMO_PERSONAS = {
  admin: { email: 'admin@sahyog.demo', label: 'Admin', name: 'Nikhil Desai' },
  tl: { email: 'meera.iyer@sahyog.demo', label: 'Team Lead', name: 'Meera Iyer' },
  agent: { email: 'dipti.shah@sahyog.demo', label: 'Agent', name: 'Dipti Shah' },
} as const;
export type DemoPersona = keyof typeof DEMO_PERSONAS;
export const demoLoginsOn = () => process.env.DEMO_LOGINS === 'true' && !process.env.DB_HOST;
export async function demoSignIn(persona: DemoPersona): Promise<{ ok: true; mustChange: boolean } | { ok: false; message: string }> {
  if (!demoLoginsOn()) return { ok: false, message: 'Demo sign-in is not available on this deployment.' };
  const p = DEMO_PERSONAS[persona]; if (!p) return { ok: false, message: 'Unknown demo account.' };
  return withPlatform(async (db) => {
    const r = await db.one<any>(`${USER_SQL} WHERE lower(u.email) = $1 AND u.is_active`, [p.email]);
    if (!r || r.org_status !== 'active') return { ok: false, message: 'This demo account is not set up on this database.' };
    await db.q('UPDATE users SET last_login_at = now(), failed_logins = 0 WHERE id = $1', [r.id]);
    await createSession(db, r.id, r.org_id);
    await db.q("INSERT INTO audit_log (org_id, user_id, action, detail) VALUES ($1,$2,'auth.sign_in',$3)", [r.org_id, r.id, JSON.stringify({ demo: persona })]);
    return { ok: true, mustChange: !!r.must_change_password };
  });
}

/** Sign-up creates the organisation, its three default roles, its industry template and its first admin, in one transaction. */
export async function signUp(input: { orgName: string; slug: string; industry: string; name: string; email: string; password: string },
  seedOrg: (db: Db, orgId: string, industry: string) => Promise<Record<string, string>>): Promise<{ ok: true } | { ok: false; message: string; field?: string }> {
  const e = input.email.trim().toLowerCase();
  if (await limited(`signup:${e}`, 5, 60)) return { ok: false, message: 'Too many sign-up attempts — try again later.' };
  return withPlatform(async (db) => {
    if (await db.one('SELECT 1 FROM users WHERE lower(email) = $1', [e])) return { ok: false, message: 'An account with this email already exists. Sign in instead.', field: 'email' };
    if (await db.one('SELECT 1 FROM organizations WHERE slug = $1', [input.slug])) return { ok: false, message: 'That workspace address is taken.', field: 'slug' };
    const org = await db.one<{ id: string }>('INSERT INTO organizations (name, slug, industry, email) VALUES ($1,$2,$3,$4) RETURNING id', [input.orgName.trim(), input.slug, input.industry, e]);
    const roles = await seedOrg(db, org!.id, input.industry);
    const user = await db.one<{ id: string }>('INSERT INTO users (org_id, email, name, password_hash, role_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [org!.id, e, input.name.trim(), await hashPassword(input.password), roles.admin]);
    await createSession(db, user!.id, org!.id);
    await db.q("INSERT INTO audit_log (org_id, user_id, action, entity, entity_id) VALUES ($1,$2,'org.sign_up','organization',$3)", [org!.id, user!.id, org!.id]);
    return { ok: true };
  });
}

export async function signOut() {
  const c = await cookies(); const token = c.get(SESSION_COOKIE)?.value;
  if (token) await withPlatform((db) => db.q('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sha256(token)]));
  c.delete(SESSION_COOKIE);
}

/** Deactivation, password change and role change end every open session of that person (§19.2). */
export async function revokeSessions(orgId: string, userId: string, exceptCurrent = false) {
  const token = exceptCurrent ? (await cookies()).get(SESSION_COOKIE)?.value : undefined;
  await withOrg(orgId, (db) => db.q('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR id <> $2)',
    [userId, token ? sha256(token) : null]));
}

export function strongEnough(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use letters and numbers.';
  return null;
}
export const tempPassword = () => `${randomBytes(5).toString('base64url')}-${randomBytes(3).toString('hex')}7a`;
