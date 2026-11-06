// POST /api/calls/expire-stale — a call sent to the call-processing flow that never got a result (the flow stopped, the app was
// unreachable, a recording was dropped) would wait forever. After 60 minutes — or 3 minutes per recording of a large ZIP sent
// together — it is marked failed with a reason, so it can be sent again from Upload. Called every 10 minutes by
// src/instrumentation.ts, or by any scheduler. Authorization: Bearer INBOUND_TOKEN.
import { NextResponse, type NextRequest } from 'next/server';
import { withPlatform } from '@/lib/db';
import { inboundTokenOk } from '@/lib/flows';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!inboundTokenOk(req.headers.get('authorization'))) return NextResponse.json({ ok: false, message: 'Invalid token' }, { status: 401 });
  const expired = await withPlatform(async (db) => {
    const rows = await db.q<{ id: string; org_id: string; minutes: number }>(
      `UPDATE calls c SET status = 'failed', updated_at = now(),
         status_reason = 'No result from the call-processing flow within ' || w.minutes || ' minutes. Check the flow run in Studio, then send it again.'
       FROM (SELECT x.id, GREATEST(60, 3 * (SELECT count(*) FROM calls b WHERE b.org_id = x.org_id AND b.status = 'processing'
                                            AND b.upload_batch IS NOT DISTINCT FROM x.upload_batch AND b.sent_to_flow_at = x.sent_to_flow_at))::int AS minutes
             FROM calls x WHERE x.status = 'processing' AND x.sent_to_flow_at IS NOT NULL) w
       WHERE c.id = w.id AND c.sent_to_flow_at < now() - make_interval(mins => w.minutes)
       RETURNING c.id, c.org_id, w.minutes`);
    for (const r of rows) {
      await db.q("INSERT INTO flow_runs (org_id, flow, ref_id, status, detail) VALUES ($1,'call_processing',$2,'failed',$3)", [r.org_id, r.id, `no result within ${r.minutes} minutes`]);
      await db.q("UPDATE ingest_events SET status = 'failed', detail = $2, updated_at = now() WHERE call_id = $1 AND status IN ('queued','processing')", [r.id, `No result from the flow within ${r.minutes} minutes`]);
    }
    return rows.length;
  });
  return NextResponse.json({ ok: true, expired });
}
