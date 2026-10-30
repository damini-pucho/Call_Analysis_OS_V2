// POST /api/inbound/sop-extraction — the SOP & policy extraction flow writes the rules it found in an uploaded document.
// Authorization: Bearer INBOUND_TOKEN. Rules replace the document's previous extraction; manual / template rules are untouched.
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withPlatform, withOrg } from '@/lib/db';
import { inboundTokenOk } from '@/lib/flows';

export const dynamic = 'force-dynamic';

const s = (max: number) => z.union([z.string(), z.number()]).nullish().transform((v) => (v == null || v === '' ? null : String(v).slice(0, max)));
const Rule = z.object({
  kind: z.string().transform((k) => k.toLowerCase().trim()).pipe(z.enum(['sop', 'kpi', 'policy', 'ztp', 'topic', 'compliance'])),
  code: s(20), title: z.string().trim().min(2).max(200), description: s(2000), na_rule: s(400), pass_criteria: s(400),
  severity: z.string().nullish().transform((v) => { const x = (v || 'normal').toLowerCase(); return ['low', 'normal', 'high', 'critical'].includes(x) ? x : 'normal'; }),
});
const Body = z.object({
  org_id: z.string().uuid(), document_id: z.string().uuid(), status: z.enum(['extracted', 'failed']).default('extracted'),
  status_reason: s(500), summary: s(4000),
  rules: z.union([z.array(z.any()), z.string()]).nullish().transform((v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } } return v ?? []; }),
});

export async function POST(req: NextRequest) {
  if (!inboundTokenOk(req.headers.get('authorization'))) return NextResponse.json({ ok: false, message: 'Invalid inbound token' }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 1024 * 1024) return NextResponse.json({ ok: false, message: 'Body over 1 MB' }, { status: 413 });
  let body: any; try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, message: 'Body is not valid JSON' }, { status: 400 }); }
  const data = body?.data && typeof body.data === 'object' ? body.data : body;
  const p = Body.safeParse(data);
  if (!p.success) return NextResponse.json({ ok: false, message: 'Invalid payload', issues: p.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  const org = await withPlatform((db) => db.one<{ id: string }>("SELECT id FROM organizations WHERE id = $1 AND status = 'active'", [p.data.org_id]));
  if (!org) return NextResponse.json({ ok: false, message: 'Unknown organisation' }, { status: 404 });
  const rules = (Array.isArray(p.data.rules) ? p.data.rules : []).map((r: unknown) => Rule.safeParse(r)).filter((r) => r.success).map((r) => (r as any).data).slice(0, 300);
  const out = await withOrg(org.id, async (db) => {
    const doc = await db.one<{ id: string }>('SELECT id FROM company_documents WHERE id = $1 AND org_id = $2', [p.data.document_id, org.id]);
    if (!doc) return null;
    if (p.data.status === 'failed') {
      await db.q("UPDATE company_documents SET status = 'failed', status_reason = $2 WHERE id = $1", [doc.id, p.data.status_reason || 'Extraction failed']);
      return 0;
    }
    await db.q("DELETE FROM sop_rules WHERE org_id = $1 AND document_id = $2 AND source = 'extracted'", [org.id, doc.id]);
    let i = 0;
    for (const r of rules) {
      i++;
      await db.q(`INSERT INTO sop_rules (org_id, document_id, kind, code, title, description, na_rule, pass_criteria, severity, sort_order, source)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'extracted')`, [org.id, doc.id, r.kind, r.code, r.title, r.description, r.na_rule, r.pass_criteria, r.severity, 500 + i]);
    }
    await db.q("UPDATE company_documents SET status = 'extracted', status_reason = NULL, summary = $2, extracted_at = now() WHERE id = $1", [doc.id, p.data.summary]);
    await db.q("INSERT INTO flow_runs (org_id, flow, ref_id, status, detail) VALUES ($1,'sop_extraction',$2,'completed',$3)", [org.id, doc.id, `${rules.length} rules`]);
    return rules.length;
  });
  if (out === null) return NextResponse.json({ ok: false, message: 'No such document in this organisation' }, { status: 404 });
  return NextResponse.json({ ok: true, rules: out });
}
