'use server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { guard, zId, zText, zReq } from '@/lib/action';
import { sha256, currentUser, isPlatformEmail } from '@/lib/auth';
import { withPlatform, isUuid } from '@/lib/db';
import { encrypt } from '@/lib/flows';
import { upsertCustomers, dispatchCrm, normMobile, CRM_EVENTS } from '@/lib/crm';
import { saveFile } from '@/lib/files';
import type { ActionResult } from '@/lib/action';

const opt = (max = 200) => zText(max).optional().transform((v) => (v ? v : null));

// ── customers ───────────────────────────────────────────────────────────────────────────────────────────────────────
const Customer = z.object({ id: zId, name: opt(120), email: opt(160).refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email'), city: opt(80),
  segment: opt(60), external_id: opt(80), tags: z.array(z.string().trim().min(1).max(30)).max(20), notes: opt(2000) }).strict();
export async function updateCustomer(input: unknown) {
  return guard('customers.edit', Customer, input, async ({ db, user, data }) => {
    const r = await db.one<any>('UPDATE customers SET name=$3, email=$4, city=$5, segment=$6, external_id=$7, tags=$8, notes=$9, updated_at=now() WHERE id=$1 AND org_id=$2 RETURNING mobile_number',
      [data.id, user.orgId, data.name, data.email, data.city, data.segment, data.external_id, data.tags, data.notes]);
    if (!r) return { ok: false, message: 'Customer not found.' };
    await dispatchCrm(db, user.orgId, 'customer.updated', { customer_id: data.id, mobile_number: r.mobile_number, name: data.name, email: data.email, city: data.city, segment: data.segment, external_id: data.external_id, tags: data.tags });
    revalidatePath(`/customers/${data.id}`);
    return { ok: true, message: 'Customer saved.' };
  }, 'customer.update');
}

/** CSV import of customers (mobile_number required; name, email, city, segment, external_id, tags optional). */
export async function importCustomers(form: FormData) {
  const file = form.get('file');
  return guard('crm.manage', z.object({}).strict(), {}, async ({ db, user }) => {
    if (!(file instanceof File) || !/\.csv$/i.test(file.name) || file.size > 5 * 1024 * 1024) return { ok: false, message: 'Upload a .csv file under 5 MB.' };
    const text = Buffer.from(await file.arrayBuffer()).toString('utf8').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { ok: false, message: 'The file has no rows.' };
    const split = (l: string) => { const out: string[] = []; let cur = ''; let q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
    const head = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    const mi = head.findIndex((h) => ['mobile_number', 'mobile', 'phone', 'phone_number'].includes(h));
    if (mi < 0) return { ok: false, message: 'Add a "mobile_number" column.' };
    const col = (row: string[], k: string) => { const i = head.indexOf(k); return i >= 0 && row[i] ? row[i] : null; };
    const rows = lines.slice(1, 5001).map(split).map((r) => ({ mobile_number: r[mi], name: col(r, 'name'), email: col(r, 'email'), city: col(r, 'city'), segment: col(r, 'segment'), external_id: col(r, 'external_id'), tags: col(r, 'tags')?.split(/[;|]/).map((t) => t.trim()).filter(Boolean) || null }));
    await saveFile(db, user.orgId, user.id, 'import', file.name, Buffer.from(text));
    const n = await upsertCustomers(db, user.orgId, rows, 'csv');
    await db.q("INSERT INTO crm_sync_log (org_id, direction, event, status, records, detail) VALUES ($1,'import','customers.csv','ok',$2,$3)", [user.orgId, n, `${file.name}: ${rows.length - n} row(s) skipped (no valid mobile)`]);
    revalidatePath('/crm'); revalidatePath('/customers');
    return { ok: true, message: `${n} customer(s) imported${rows.length - n ? `, ${rows.length - n} skipped (no valid mobile number)` : ''}.` };
  }, 'customer.import');
}

// ── CRM connections ─────────────────────────────────────────────────────────────────────────────────────────────────
const Conn = z.object({ id: zId.optional(), name: zReq('Name', 80), outbound_url: opt(500).refine((v) => !v || /^https:\/\//.test(v), 'Use an https:// URL'),
  events: z.array(z.enum(CRM_EVENTS)).max(CRM_EVENTS.length), is_active: z.boolean() }).strict();
/** Creating a connection returns its signing secret and inbound token ONCE; only hashes / ciphertext are stored. */
export async function saveConnection(input: unknown) {
  return guard('crm.manage', Conn, input, async ({ db, user, data }) => {
    if (data.id) {
      await db.q('UPDATE crm_connections SET name=$3, outbound_url=$4, events=$5, is_active=$6 WHERE id=$1 AND org_id=$2', [data.id, user.orgId, data.name, data.outbound_url, data.events, data.is_active]);
      revalidatePath('/crm');
      return { ok: true, message: 'Connection saved.' };
    }
    const secret = randomBytes(24).toString('base64url'); const token = `cas_${randomBytes(24).toString('base64url')}`;
    const row = await db.one<{ id: string }>('INSERT INTO crm_connections (org_id, name, outbound_url, events, is_active, inbound_token_hash, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [user.orgId, data.name, data.outbound_url, data.events, data.is_active, sha256(token), user.id]);
    await db.q('UPDATE crm_connections SET secret_enc = $2 WHERE id = $1', [row!.id, encrypt(secret, `crm:${row!.id}`)]);
    revalidatePath('/crm');
    return { ok: true, message: 'Connection created. Copy the secret and token now — they are not shown again.', data: { id: row!.id, secret, token } };
  }, 'crm.save');
}
export async function rotateConnection(input: unknown) {
  return guard('crm.manage', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    const secret = randomBytes(24).toString('base64url'); const token = `cas_${randomBytes(24).toString('base64url')}`;
    const r = await db.one('UPDATE crm_connections SET secret_enc = $3, inbound_token_hash = $4 WHERE id = $1 AND org_id = $2 RETURNING id', [data.id, user.orgId, encrypt(secret, `crm:${data.id}`), sha256(token)]);
    if (!r) return { ok: false, message: 'Connection not found.' };
    revalidatePath('/crm');
    return { ok: true, message: 'New secret and token issued. The old ones stop working now.', data: { id: data.id, secret, token } };
  }, 'crm.rotate');
}
export async function deleteConnection(input: unknown) {
  return guard('crm.manage', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    await db.q('DELETE FROM crm_connections WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    revalidatePath('/crm');
    return { ok: true, message: 'Connection removed.' };
  }, 'crm.delete');
}
export async function testConnection(input: unknown) {
  return guard('crm.manage', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    const c = await db.one<{ outbound_url: string | null }>('SELECT outbound_url FROM crm_connections WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    if (!c?.outbound_url) return { ok: false, message: 'This connection has no outbound URL.' };
    await db.q("UPDATE crm_connections SET events = CASE WHEN 'call.processed' = ANY(events) THEN events ELSE array_append(events, 'call.processed') END WHERE id = $1", [data.id]);
    await dispatchCrm(db, user.orgId, 'call.processed', { test: true, message: 'Test event from Call Analysis OS', mobile_number: normMobile('9000000000') });
    const last = await db.one<{ status: string; http_status: number | null; detail: string | null }>('SELECT status, http_status, detail FROM crm_sync_log WHERE connection_id = $1 ORDER BY created_at DESC LIMIT 1', [data.id]);
    revalidatePath('/crm');
    return last?.status === 'ok' ? { ok: true, message: `Test delivered (HTTP ${last.http_status}).` } : { ok: false, message: `Test failed${last?.http_status ? ` (HTTP ${last.http_status})` : ''}: ${last?.detail || 'no response'}` };
  }, 'crm.test');
}

// ── notifications ───────────────────────────────────────────────────────────────────────────────────────────────────
export async function markNotifications(input: unknown) {
  return guard(null, z.object({ ids: z.array(zId).max(500).optional() }).strict(), input, async ({ db, user, data }) => {
    if (data.ids?.length) await db.q('UPDATE notifications SET read_at = now() WHERE org_id = $1 AND user_id = $2 AND id = ANY($3::uuid[]) AND read_at IS NULL', [user.orgId, user.id, data.ids]);
    else await db.q('UPDATE notifications SET read_at = now() WHERE org_id = $1 AND user_id = $2 AND read_at IS NULL', [user.orgId, user.id]);
    revalidatePath('/', 'layout');
    return { ok: true };
  });
}

// ── profile ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function updateProfile(input: unknown) {
  return guard(null, z.object({ name: zReq('Name', 120), phone: opt(40) }).strict(), input, async ({ db, user, data }) => {
    await db.q('UPDATE users SET name = $2, phone = $3, updated_at = now() WHERE id = $1', [user.id, data.name, data.phone]);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Profile saved.' };
  }, 'profile.update');
}
export async function uploadAvatar(form: FormData) {
  const file = form.get('file');
  return guard(null, z.object({}).strict(), {}, async ({ db, user }) => {
    if (!(file instanceof File) || !/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 2 * 1024 * 1024) return { ok: false, message: 'Upload a PNG, JPG or WebP under 2 MB.' };
    const f = await saveFile(db, user.orgId, user.id, 'avatar', file.name, Buffer.from(await file.arrayBuffer()));
    await db.q('UPDATE users SET avatar_file_id = $2 WHERE id = $1', [user.id, f.id]);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Photo updated.' };
  }, 'profile.avatar');
}

// ── platform console (PLATFORM_ADMIN_EMAILS only) ───────────────────────────────────────────────────────────────────
export async function setOrgStatus(input: unknown): Promise<ActionResult> {
  const u = await currentUser();
  if (!u || !isPlatformEmail(u.email)) return { ok: false, message: 'Platform access only.' };
  const p = z.object({ id: zId, status: z.enum(['active', 'suspended']) }).strict().safeParse(input);
  if (!p.success || !isUuid(p.data.id)) return { ok: false, message: 'Invalid request.' };
  if (p.data.id === u.orgId) return { ok: false, message: 'You cannot suspend your own organisation.' };
  await withPlatform(async (db) => {
    await db.q('UPDATE organizations SET status = $2, updated_at = now() WHERE id = $1', [p.data.id, p.data.status]);
    if (p.data.status === 'suspended') await db.q('UPDATE sessions SET revoked_at = now() WHERE org_id = $1 AND revoked_at IS NULL', [p.data.id]);
    await db.q("INSERT INTO audit_log (org_id, user_id, action, entity, entity_id) VALUES ($1,$2,'platform.org_status','organization',$3)", [u.orgId, u.id, p.data.id]);
  });
  revalidatePath('/platform');
  return { ok: true, message: p.data.status === 'suspended' ? 'Organisation suspended; its users were signed out.' : 'Organisation reactivated.' };
}
