// src/lib/action.ts — every Server Action runs through guard(): session → permission → Zod (.strict) → withOrg → audit row.
// Identity and organisation come from the session, never from the payload.
import 'server-only';
import { z } from 'zod';
import { currentUser, lockBlocks, type SessionUser } from './auth';
import { withOrg, type Db } from './db';

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; message: string; fields?: Partial<Record<string, string>> };

export function fieldErrors(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) { const k = String(i.path[0] ?? 'form'); if (!out[k]) out[k] = i.message; }
  return out;
}

export async function guard<S extends z.ZodTypeAny, T>(permission: string | string[] | null, schema: S, input: unknown,
  fn: (ctx: { db: Db; user: SessionUser; data: z.infer<S> }) => Promise<ActionResult<T>>, audit?: string): Promise<ActionResult<T>> {
  const user = await currentUser();
  if (!user) return { ok: false, message: 'Your session has ended. Sign in again.' };
  const perms = permission == null ? [] : Array.isArray(permission) ? permission : [permission];
  if (perms.length && !perms.some((p) => user.permissions.includes(p))) return { ok: false, message: 'Your role does not allow this action.' };
  if (lockBlocks(user, perms)) return { ok: false, message: 'Your dashboard is locked until your team leader marks your training Done.' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Please fix the highlighted fields.', fields: fieldErrors(parsed.error) };
  try {
    return await withOrg(user.orgId, async (db) => {
      const res = await fn({ db, user, data: parsed.data });
      if (res.ok && audit) {
        const d = parsed.data as Record<string, unknown>;
        await db.q('INSERT INTO audit_log (org_id, user_id, action, entity_id, detail) VALUES ($1,$2,$3,$4,$5)',
          [user.orgId, user.id, audit, typeof d?.id === 'string' ? d.id : null, JSON.stringify(Object.fromEntries(Object.entries(d || {}).filter(([k]) => !/password|secret|token/i.test(k))).valueOf())]);
      }
      return res;
    });
  } catch (e: any) {
    if (e?.code === '23505') return { ok: false, message: 'That already exists.', fields: { name: 'Already exists' } };
    if (e?.code === '23514') return { ok: false, message: 'A value is outside the allowed range.' };
    console.error('action failed:', audit || '', e?.message);
    return { ok: false, message: 'Something went wrong while saving. Nothing was changed.' };
  }
}

export const zId = z.string().uuid();
export const zText = (max = 200) => z.string().trim().max(max);
export const zReq = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max);
export const zEmail = z.string().trim().toLowerCase().email('Enter a valid email').max(160);
