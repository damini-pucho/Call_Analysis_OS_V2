// GET /api/calls/status?ids=a,b — the upload page polls this while the flow works (V1 polled Supabase every 3 s).
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { withOrg, isUuid } from '@/lib/db';
import { agentScope } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  if (u.trainingLocked) return NextResponse.json({ ok: false, message: 'Locked until your training is marked Done' }, { status: 423 });
  const ids = (req.nextUrl.searchParams.get('ids') || '').split(',').filter(isUuid).slice(0, 500);
  if (!ids.length) return NextResponse.json({ ok: true, calls: [] });
  const rows = await withOrg(u.orgId, async (db) => {
    const scope = await agentScope(db, u);
    return db.q(`SELECT id, filename, status, status_reason, agent_code, agent_name, quality_score::float AS quality_score, kpi_score::float AS kpi_score, sop_score::float AS sop_score,
                        call_intent, call_summary, improvement_areas, coaching_priority, sentiment, compliance_risk, duration, duration_seconds, campaign, intelligence, kpi_results
                   FROM calls WHERE org_id = $1 AND id = ANY($2::uuid[]) AND ($3::text[] IS NULL OR agent_code = ANY($3::text[]))`, [u.orgId, ids, scope]);
  });
  return NextResponse.json({ ok: true, calls: rows });
}
