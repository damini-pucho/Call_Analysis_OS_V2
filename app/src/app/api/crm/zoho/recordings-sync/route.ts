// POST /api/crm/zoho/recordings-sync — imports new Zoho call recordings for every organisation with an active Zoho
// connection (unless its "sync_recordings" setting is off). Called every few minutes by src/instrumentation.ts, or by any
// scheduler. Authorization: Bearer INBOUND_TOKEN.
import { NextResponse, type NextRequest } from 'next/server';
import { withOrg, withPlatform } from '@/lib/db';
import { inboundTokenOk } from '@/lib/flows';
import { syncZohoRecordings } from '@/lib/sources';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!inboundTokenOk(req.headers.get('authorization'))) return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
  const orgs = await withPlatform((db) => db.q<{ org_id: string }>(
    "SELECT c.org_id FROM crm_connections c JOIN organizations o ON o.id = c.org_id WHERE c.provider = 'zoho' AND c.is_active AND o.status = 'active' AND COALESCE(c.settings->>'sync_recordings', 'true') <> 'false'"));
  const results = [];
  for (const { org_id } of orgs) {
    try { results.push({ org_id, ...(await withOrg(org_id, (db) => syncZohoRecordings(db, org_id))) }); }
    catch (e) { results.push({ org_id, ok: false, message: e instanceof Error ? e.message : String(e) }); }
  }
  return NextResponse.json({ ok: true, orgs: results.length, results });
}
