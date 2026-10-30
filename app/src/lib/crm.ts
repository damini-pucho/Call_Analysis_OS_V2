// src/lib/crm.ts — the CRM integration layer. V1 had no CRM; V2 ships a vendor-neutral connector: a signed outbound webhook
// (HMAC-SHA256 over the raw body, header X-CAS-Signature) and an inbound customer endpoint with a per-connection token.
import 'server-only';
import { createHmac } from 'node:crypto';
import type { Db } from './db';
import { decrypt } from './flows';

export const CRM_EVENTS = ['call.processed', 'customer.updated', 'training.assigned'] as const;

export async function dispatchCrm(db: Db, orgId: string, event: (typeof CRM_EVENTS)[number], data: Record<string, unknown>) {
  const conns = await db.q<any>("SELECT id, outbound_url, secret_enc FROM crm_connections WHERE org_id = $1 AND is_active AND outbound_url IS NOT NULL AND $2 = ANY(events)", [orgId, event]);
  for (const c of conns) {
    const body = JSON.stringify({ event, org_id: orgId, sent_at: new Date().toISOString(), data });
    let status = 'failed'; let http: number | null = null; let detail: string | null = null;
    try {
      const secret = c.secret_enc ? decrypt(c.secret_enc, `crm:${c.id}`) : '';
      const sig = createHmac('sha256', secret).update(body).digest('hex');
      const res = await fetch(c.outbound_url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CAS-Event': event, 'X-CAS-Signature': `sha256=${sig}` }, body, signal: AbortSignal.timeout(10000) });
      http = res.status; status = res.ok ? 'ok' : 'failed'; detail = res.ok ? null : (await res.text().catch(() => '')).slice(0, 200);
    } catch (e) { detail = e instanceof Error ? e.message : String(e); }
    await db.q('INSERT INTO crm_sync_log (org_id, connection_id, direction, event, status, http_status, records, detail) VALUES ($1,$2,$3,$4,$5,$6,1,$7)',
      [orgId, c.id, 'outbound', event, status, http, detail]);
    await db.q('UPDATE crm_connections SET last_sync_at = now(), last_status = $2 WHERE id = $1', [c.id, status]);
  }
}

export type CustomerIn = { mobile_number: string; name?: string | null; email?: string | null; city?: string | null; segment?: string | null; external_id?: string | null; tags?: string[] | null; notes?: string | null };
export const normMobile = (m: string) => { const d = String(m || '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };

export async function upsertCustomers(db: Db, orgId: string, rows: CustomerIn[], source: string) {
  let n = 0;
  for (const r of rows) {
    const mobile = normMobile(r.mobile_number);
    if (mobile.length < 8) continue;
    await db.q(`INSERT INTO customers (org_id, mobile_number, name, email, city, segment, external_id, crm_source, tags, notes)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::text[],'{}'::text[]),$10)
                ON CONFLICT (org_id, mobile_number) DO UPDATE SET
                  name = COALESCE(EXCLUDED.name, customers.name), email = COALESCE(EXCLUDED.email, customers.email),
                  city = COALESCE(EXCLUDED.city, customers.city), segment = COALESCE(EXCLUDED.segment, customers.segment),
                  external_id = COALESCE(EXCLUDED.external_id, customers.external_id), crm_source = EXCLUDED.crm_source,
                  tags = CASE WHEN array_length(EXCLUDED.tags, 1) > 0 THEN EXCLUDED.tags ELSE customers.tags END,
                  notes = COALESCE(EXCLUDED.notes, customers.notes), updated_at = now()`,
      [orgId, mobile, r.name || null, r.email || null, r.city || null, r.segment || null, r.external_id || null, source, r.tags || null, r.notes || null]);
    n++;
  }
  return n;
}
