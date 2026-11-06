// POST /api/inbound/calls — the call-processing flow writes its result here (replaces V1's Supabase "Create Row" with a
// service key). Authorization: Bearer INBOUND_TOKEN. JSON only, ≤ 1 MB. The organisation comes from the body and must own
// the call row, so a flow can never write into another tenant's call.
import { NextResponse, type NextRequest } from 'next/server';
import { withPlatform, withOrg } from '@/lib/db';
import { inboundTokenOk } from '@/lib/flows';
import { CallResult, applyCallResult } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!inboundTokenOk(req.headers.get('authorization'))) return NextResponse.json({ ok: false, message: 'Invalid inbound token' }, { status: 401 });
  if (!(req.headers.get('content-type') || '').includes('application/json')) return NextResponse.json({ ok: false, message: 'Send JSON' }, { status: 415 });
  const raw = await req.text();
  if (raw.length > 1024 * 1024) return NextResponse.json({ ok: false, message: 'Body over 1 MB' }, { status: 413 });
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, message: 'Body is not valid JSON' }, { status: 400 }); }
  const data = body?.data && typeof body.data === 'object'   // Studio http piece puts JSON under body.data
    ? { ...body.data, org_id: body.data.org_id ?? body.org_id, call_row_id: body.data.call_row_id || body.call_row_id || undefined } : body;
  const p = CallResult.safeParse(data);
  if (!p.success) return NextResponse.json({ ok: false, message: 'Invalid payload', issues: p.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const org = await withPlatform((db) => db.one<{ id: string }>("SELECT id FROM organizations WHERE id = $1 AND status = 'active'", [p.data.org_id]));
  if (!org) return NextResponse.json({ ok: false, message: 'Unknown organisation' }, { status: 404 });
  const r = await withOrg(org.id, (db) => applyCallResult(db, p.data));
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message }, { status: r.code });
  return NextResponse.json({ ok: true, id: r.id });
}
