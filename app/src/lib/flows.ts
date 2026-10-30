// src/lib/flows.ts — the app's side of the Pucho Studio contract (method/webhook-contract.md).
// The app calls a flow through WEBHOOK_<FLOW>; the flow writes back through /api/inbound/* with INBOUND_TOKEN.
// A flow that is not wired is NOT simulated: the record stays queued and the UI says "flow not connected".
import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from './db';
// @ts-ignore
import { INDUSTRIES as IND, SOP_DEFS, KPI_DEFS } from './catalog.mjs';
const INDUSTRIES: Record<string, any> = IND;

export const FLOWS = {
  call_processing: { env: 'WEBHOOK_CALL_PROCESSING', label: 'Call processing (STT + AI analysis)' },
  sop_extraction: { env: 'WEBHOOK_SOP_EXTRACTION', label: 'SOP & policy extraction' },
  email: { env: 'WEBHOOK_EMAIL', label: 'Email (credentials & notifications)' },
} as const;
export type FlowName = keyof typeof FLOWS;
export const flowUrl = (f: FlowName) => (process.env[FLOWS[f].env] || '').trim();
export const flowConnected = (f: FlowName) => /^https:\/\//.test(flowUrl(f));
export const publicAppUrl = () => (process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || '').replace(/\/$/, '');

/** POST to a flow and record the run. Returns 'not_connected' without any network call when the URL is unset. */
export async function callFlow(db: Db, orgId: string, flow: FlowName, refId: string | null, payload: Record<string, unknown>)
  : Promise<{ status: 'sent' | 'not_connected' | 'failed'; httpStatus?: number; detail?: string }> {
  const url = flowUrl(flow);
  if (!flowConnected(flow)) {
    await db.q("INSERT INTO flow_runs (org_id, flow, ref_id, status, detail) VALUES ($1,$2,$3,'not_connected',$4)", [orgId, flow, refId, `${FLOWS[flow].env} is not set`]);
    return { status: 'not_connected', detail: `${FLOWS[flow].label} flow is not connected (${FLOWS[flow].env} is empty).` };
  }
  const body = { ...payload, org_id: orgId, app_url: publicAppUrl(), inbound_token: process.env.INBOUND_TOKEN || '' };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const ok = res.ok;
    await db.q('INSERT INTO flow_runs (org_id, flow, ref_id, status, http_status, detail) VALUES ($1,$2,$3,$4,$5,$6)',
      [orgId, flow, refId, ok ? 'sent' : 'failed', res.status, ok ? null : (await res.text().catch(() => '')).slice(0, 300)]);
    return ok ? { status: 'sent', httpStatus: res.status } : { status: 'failed', httpStatus: res.status, detail: `Flow answered HTTP ${res.status}` };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await db.q("INSERT INTO flow_runs (org_id, flow, ref_id, status, detail) VALUES ($1,$2,$3,'failed',$4)", [orgId, flow, refId, detail.slice(0, 300)]);
    return { status: 'failed', detail: `Could not reach the flow: ${detail}` };
  }
}

/** The organisation's scoring context the call flow injects into its prompt (replaces V1's hardcoded Prudent taxonomy).
 *  Built from the company profile and its active rules; an organisation with no rules gets its industry template. */
export async function companyContext(db: Db, orgId: string) {
  const org = await db.one<any>('SELECT name, industry, description, config FROM organizations WHERE id = $1', [orgId]);
  const rules = await db.q<any>('SELECT kind, code, title, description, na_rule, pass_criteria, severity FROM sop_rules WHERE org_id = $1 AND is_active ORDER BY kind, sort_order, created_at', [orgId]);
  const camps = await db.q<any>('SELECT name, full_name, direction, greeting_standard, core_topics FROM campaigns WHERE org_id = $1 ORDER BY name', [orgId]);
  const ind = INDUSTRIES[org?.industry] || INDUSTRIES.generic;
  const by = (k: string) => rules.filter((r) => r.kind === k);
  const sops = by('sop').length ? by('sop') : SOP_DEFS;
  return {
    company_name: org?.name || '',
    industry: ind.label,
    company_description: org?.description || '',
    aht_target_min: org?.config?.aht_target_min ?? ind.aht_target_min,
    campaigns: camps.map((c) => ({ name: c.name, full_name: c.full_name || c.name, direction: c.direction,
      greeting_standard: c.greeting_standard || `"Good morning/afternoon, this is [Name] from ${org?.name}. How may I assist you?"`, core_topics: c.core_topics || [] })),
    sops: sops.map((s: any, i: number) => ({ id: i + 1, code: s.code, title: s.title, rule: s.description, na_rule: s.na_rule || null })),
    kpis: (by('kpi').length ? by('kpi') : KPI_DEFS.map((k: any) => ({ code: `KPI${k.id}`, title: k.name, description: k.desc, pass_criteria: k.scale })))
      .map((k: any) => ({ code: k.code, title: k.title, rule: k.description, scale: k.pass_criteria })),
    compliance_rules: by('compliance').map((r) => ({ title: r.title, rule: r.description, severity: r.severity })),
    policies: by('policy').map((r) => ({ title: r.title, rule: r.description, severity: r.severity })),
    ztp_scenarios: by('ztp').map((r) => r.title),
    intents: { inbound: by('topic').filter((t) => t.code === 'IN').map((t) => t.title), outbound: by('topic').filter((t) => t.code === 'OUT').map((t) => t.title) },
  };
}

// ── inbound token check (one shared INBOUND_TOKEN; INBOUND_TOKEN_NEXT allows rotation without downtime) ───────────────
export function inboundTokenOk(header: string | null): boolean {
  const got = (header || '').replace(/^Bearer\s+/i, '').trim();
  if (!got) return false;
  return [process.env.INBOUND_TOKEN, process.env.INBOUND_TOKEN_NEXT].filter((t): t is string => !!t && t.length >= 24).some((t) => {
    const a = Buffer.from(createHash('sha256').update(t).digest('hex')); const b = Buffer.from(createHash('sha256').update(got).digest('hex'));
    return timingSafeEqual(a, b);
  });
}

// ── field encryption for stored secrets (CRM signing secrets) ───────────────────────────────────────────────────────
const fieldKey = () => createHash('sha256').update(process.env.FIELD_KEY || '').digest();
export function encrypt(plain: string, aad: string) {
  if (!process.env.FIELD_KEY) throw new Error('FIELD_KEY is not set');
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', fieldKey(), iv); c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}
export function decrypt(stored: string, aad: string) {
  const [, iv, tag, ct] = stored.split(':');
  const d = createDecipheriv('aes-256-gcm', fieldKey(), Buffer.from(iv, 'base64')); d.setAAD(Buffer.from(aad)); d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
