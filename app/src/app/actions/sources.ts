'use server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { guard, zId, zText, zReq } from '@/lib/action';
import { sha256 } from '@/lib/auth';
import { withOrg } from '@/lib/db';
import { encrypt } from '@/lib/flows';
import { PRESETS, processEvent } from '@/lib/sources';

const opt = (max = 200) => zText(max).optional().transform((v) => (v ? v : null));
const MapSchema = z.object({ call_id: zReq('Call ID field', 200), recording_url: zReq('Recording URL field', 200), agent: zReq('Agent field', 200), customer_number: zReq('Customer number field', 200),
  direction: opt(200), started_at: opt(200), duration: opt(200), campaign: opt(200) }).strict();
const Source = z.object({
  id: zId.optional(), provider: z.enum(Object.keys(PRESETS) as [string, ...string[]]), name: zReq('Name', 80),
  default_campaign: opt(40).refine((v) => !v || /^[A-Za-z0-9_\-]{1,40}$/.test(v), 'Letters, numbers, - and _ (a campaign code)'),
  download_auth: z.string().max(400).optional(),   // "" = keep, "-" = clear, otherwise "user:password" or "Bearer …"
  field_map: MapSchema.optional(), is_active: z.boolean(),
}).strict();

/** Creating a source (or rotating it) returns its webhook token once; only the hash is stored. */
export async function saveSource(input: unknown) {
  return guard('upload.analyze', Source, input, async ({ db, user, data }) => {
    const map = data.field_map ? Object.fromEntries(Object.entries(data.field_map).filter(([, v]) => v)) : PRESETS[data.provider].map;
    if (data.id) {
      const r = await db.one('UPDATE call_sources SET provider=$3, name=$4, default_campaign=$5, field_map=$6, is_active=$7 WHERE id=$1 AND org_id=$2 RETURNING id', [data.id, user.orgId, data.provider, data.name, data.default_campaign, JSON.stringify(map), data.is_active]);
      if (!r) return { ok: false, message: 'Source not found.' };
      if (data.download_auth === '-') await db.q('UPDATE call_sources SET download_auth_enc = NULL WHERE id = $1', [data.id]);
      else if (data.download_auth) await db.q('UPDATE call_sources SET download_auth_enc = $2 WHERE id = $1', [data.id, encrypt(data.download_auth, `source:${data.id}`)]);
      revalidatePath('/sources');
      return { ok: true, message: 'Source saved.' };
    }
    const token = randomBytes(24).toString('base64url');
    const row = await db.one<{ id: string }>('INSERT INTO call_sources (org_id, provider, name, token_hash, field_map, default_campaign, is_active, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [user.orgId, data.provider, data.name, sha256(token), JSON.stringify(map), data.default_campaign, data.is_active, user.id]);
    if (data.download_auth && data.download_auth !== '-') await db.q('UPDATE call_sources SET download_auth_enc = $2 WHERE id = $1', [row!.id, encrypt(data.download_auth, `source:${row!.id}`)]);
    revalidatePath('/sources');
    return { ok: true, message: 'Source created. Copy the webhook URL now — the token is not shown again.', data: { id: row!.id, token } };
  }, 'source.save');
}
export async function rotateSourceToken(input: unknown) {
  return guard('upload.analyze', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    const token = randomBytes(24).toString('base64url');
    const r = await db.one('UPDATE call_sources SET token_hash = $3 WHERE id = $1 AND org_id = $2 RETURNING id', [data.id, user.orgId, sha256(token)]);
    if (!r) return { ok: false, message: 'Source not found.' };
    revalidatePath('/sources');
    return { ok: true, message: 'New webhook URL issued. Update it in your dialer — the old one stops working now.', data: { id: data.id, token } };
  }, 'source.rotate');
}
export async function deleteSource(input: unknown) {
  return guard('upload.analyze', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    await db.q('DELETE FROM call_sources WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    revalidatePath('/sources');
    return { ok: true, message: 'Source removed. Calls already received stay.' };
  }, 'source.delete');
}
/** Try a failed event again (e.g. after fixing the recording download credentials). */
export async function retryEvent(input: unknown) {
  return guard('upload.analyze', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    const e = await db.one<{ status: string }>('SELECT status FROM ingest_events WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    if (!e) return { ok: false, message: 'Event not found.' };
    if (!['failed', 'skipped'].includes(e.status)) return { ok: false, message: 'Only failed or skipped events can be retried.' };
    await db.q("UPDATE ingest_events SET status = 'received', detail = NULL, updated_at = now() WHERE id = $1", [data.id]);
    const orgId = user.orgId;
    after(() => withOrg(orgId, (d) => processEvent(d, orgId, data.id)).catch(() => {}));
    revalidatePath('/sources');
    return { ok: true, message: 'Retrying — refresh in a few seconds.' };
  }, 'source.retry');
}
