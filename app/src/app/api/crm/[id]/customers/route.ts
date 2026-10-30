// POST /api/crm/:connectionId/customers — a CRM pushes customer records in. Authorization: Bearer <connection inbound token>.
// Body: { customers: [{ mobile_number, name?, email?, city?, segment?, external_id?, tags?, notes? }] } (≤ 1000 per call).
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withPlatform, withOrg, isUuid } from '@/lib/db';
import { sha256 } from '@/lib/auth';
import { upsertCustomers } from '@/lib/crm';

export const dynamic = 'force-dynamic';
const C = z.object({ mobile_number: z.union([z.string(), z.number()]).transform(String), name: z.string().max(120).nullish(), email: z.string().max(160).nullish(),
  city: z.string().max(80).nullish(), segment: z.string().max(60).nullish(), external_id: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v).slice(0, 80))),
  tags: z.array(z.string().max(30)).max(20).nullish(), notes: z.string().max(2000).nullish() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!isUuid(id) || !token) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const conn = await withPlatform((db) => db.one<{ id: string; org_id: string }>('SELECT c.id, c.org_id FROM crm_connections c JOIN organizations o ON o.id = c.org_id WHERE c.id = $1 AND c.is_active AND c.inbound_token_hash = $2 AND o.status = \'active\'', [id, sha256(token)]));
  if (!conn) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 2 * 1024 * 1024) return NextResponse.json({ ok: false, message: 'Body over 2 MB' }, { status: 413 });
  let body: any; try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, message: 'Body is not valid JSON' }, { status: 400 }); }
  const p = z.object({ customers: z.array(C).min(1).max(1000) }).safeParse(body);
  if (!p.success) return NextResponse.json({ ok: false, message: 'Invalid payload', issues: p.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const n = await withOrg(conn.org_id, async (db) => {
    const count = await upsertCustomers(db, conn.org_id, p.data.customers, 'crm');
    await db.q("INSERT INTO crm_sync_log (org_id, connection_id, direction, event, status, http_status, records) VALUES ($1,$2,'inbound','customers.upsert','ok',200,$3)", [conn.org_id, conn.id, count]);
    await db.q("UPDATE crm_connections SET last_sync_at = now(), last_status = 'ok' WHERE id = $1", [conn.id]);
    return count;
  });
  return NextResponse.json({ ok: true, upserted: n, skipped: p.data.customers.length - n });
}
