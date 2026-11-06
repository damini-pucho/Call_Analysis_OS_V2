// src/lib/ingest.ts — recordings in, analysis back. Upload stores the file, creates (or re-queues) the call row and sends it
// to the call-processing flow; the flow's write-back lands in applyCallResult(). Deterministic work (filename parsing,
// dedupe, customer linking, repeat-call detection, notifications) is code; the flow does only STT and the model's words.
import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db';
import { saveFile, signedFileUrl, readStored, safeName, deleteFile } from './files';
import { callFlow, companyContext } from './flows';
import { notify, managersOf } from './notify';
import { dispatchCrm, normMobile } from './crm';
import { pushCallToZoho } from './zoho';

/** V1 filename format: YYYYMMDD-LEADID_MOBILE_AGENTCODE_CAMPAIGN-FLAG.ext */
export function parseFilename(filename: string) {
  const base = filename.split(/[\\/]/).pop() || '';
  const stem = base.replace(/\.(mp3|wav|ogg|flac|m4a|webm|aac)$/i, '');
  const parts = stem.split('_');
  if (parts.length < 4) return { ok: false as const };
  const [date, leadId = ''] = parts[0].split('-');
  const [campaign, ...flag] = (parts[3] || '').split('-');
  const ymd = /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : null;
  return { ok: true as const, date: ymd, rawDate: date, leadId, mobile: parts[1] || '', agentCode: parts[2] || '', campaign: (campaign || '').toUpperCase(), coachingFlag: flag.join('-') || 'all' };
}

async function linkCustomer(db: Db, orgId: string, mobile: string | null) {
  const m = mobile ? normMobile(mobile) : '';
  if (m.length < 8) return null;
  const row = await db.one<{ id: string }>(
    `INSERT INTO customers (org_id, mobile_number, first_call_at, last_call_at) VALUES ($1,$2,now(),now())
     ON CONFLICT (org_id, mobile_number) DO UPDATE SET last_call_at = now(), first_call_at = COALESCE(customers.first_call_at, now())
     RETURNING id`, [orgId, m]);
  return row?.id ?? null;
}

export async function queueRecording(db: Db, orgId: string, userId: string | null, filename: string, data: Buffer, batch: string | null) {
  // the same recording (same bytes) under another name is a duplicate: it is neither stored nor analysed twice.
  // Re-uploading under the same filename still replaces that call (below).
  const sha = createHash('sha256').update(data).digest('hex');
  const dup = await db.one<{ id: string; filename: string }>(
    'SELECT c.id, c.filename FROM calls c JOIN files f ON f.id = c.audio_file_id WHERE c.org_id = $1 AND f.sha256 = $2 AND lower(c.filename) <> lower($3) LIMIT 1',
    [orgId, sha, safeName(filename)]);
  if (dup) return { duplicateOf: dup, callRowId: null, fileId: null, filename: safeName(filename), parsed: parseFilename(safeName(filename)) };
  const f = await saveFile(db, orgId, userId, 'recording', filename, data);
  const p = parseFilename(f.filename);
  let agentName: string | null = null; let direction: string | null = null;
  if (p.ok && p.agentCode) {
    const a = await db.one<{ agent_name: string }>('SELECT agent_name FROM agents WHERE org_id = $1 AND agent_code = $2', [orgId, p.agentCode]);
    agentName = a?.agent_name ?? null;
    if (!a) {   // a code seen for the first time becomes an agent the admin can rename
      await db.q('INSERT INTO agents (org_id, agent_code, agent_name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [orgId, p.agentCode, `Agent ${p.agentCode}`]);
      agentName = `Agent ${p.agentCode}`;
    }
  }
  if (p.ok && p.campaign) {
    const c = await db.one<{ direction: string }>('SELECT direction FROM campaigns WHERE org_id = $1 AND upper(name) = $2', [orgId, p.campaign]);
    direction = c?.direction ?? null;
  }
  const customerId = await linkCustomer(db, orgId, p.ok ? p.mobile : null);
  const callId = p.ok && p.leadId ? p.leadId : f.id.slice(0, 8).toUpperCase();
  // re-uploading the same recording replaces its row (V1 deleted by filename before re-upload) and its old stored file
  const prev = await db.one<{ audio_file_id: string | null }>('SELECT audio_file_id FROM calls WHERE org_id = $1 AND lower(filename) = lower($2)', [orgId, f.filename]);
  const row = await db.one<{ id: string }>(
    `INSERT INTO calls (org_id, call_id, filename, call_date, agent_code, agent_name, mobile_number, customer_id, campaign, coaching_flag, direction, audio_file_id, upload_batch, status)
     VALUES ($1,$2,$3,COALESCE($4::date, current_date),$5,$6,$7,$8,$9,$10,$11,$12,$13,'queued')
     ON CONFLICT (org_id, lower(filename)) DO UPDATE SET audio_file_id = EXCLUDED.audio_file_id, upload_batch = EXCLUDED.upload_batch, status = 'queued',
       status_reason = NULL, agent_name = COALESCE(EXCLUDED.agent_name, calls.agent_name), updated_at = now()
     RETURNING id`,
    [orgId, callId, f.filename, p.ok ? p.date : null, p.ok ? p.agentCode || null : null, agentName, p.ok ? p.mobile || null : null, customerId,
     p.ok ? p.campaign || null : null, p.ok ? p.coachingFlag : null, direction, f.id, batch]);
  if (prev?.audio_file_id && prev.audio_file_id !== f.id) await deleteFile(db, orgId, prev.audio_file_id);
  return { duplicateOf: null, callRowId: row!.id, fileId: f.id, filename: f.filename, parsed: p };
}

export async function sendToFlow(db: Db, orgId: string, callRowId: string) {
  const c = await db.one<any>('SELECT id, call_id, filename, call_date, agent_code, agent_name, mobile_number, campaign, coaching_flag, direction, audio_file_id FROM calls WHERE id = $1 AND org_id = $2', [callRowId, orgId]);
  if (!c?.audio_file_id) return { status: 'failed' as const, detail: 'No recording stored for this call.' };
  const agents = await db.q('SELECT agent_code, agent_name FROM agents WHERE org_id = $1 AND is_active', [orgId]);
  const url = signedFileUrl(c.audio_file_id);
  // the existing V1 Studio flow reads the recording from an uploaded file (as V1 Upload sends it), so it needs no public file URL
  const multipart = (process.env.WEBHOOK_CALL_PROCESSING_BODY || '').trim().toLowerCase() === 'multipart';
  const f = multipart ? await db.one<{ filename: string; mime: string; storage_path: string }>('SELECT filename, mime, storage_path FROM files WHERE id = $1', [c.audio_file_id]) : null;
  const file = f ? { field: 'recording', name: f.filename, mime: f.mime, data: await readStored(f.storage_path) } : undefined;
  const r = await callFlow(db, orgId, 'call_processing', c.id, {
    call_row_id: c.id, filename: c.filename, recording: file ? undefined : url, audio_url: file ? undefined : url, agent_code: c.agent_code, agent_name: c.agent_name,
    mobile_number: c.mobile_number, call_id: c.call_id, call_date: c.call_date ? new Date(c.call_date).toISOString().slice(0, 10).replace(/-/g, '') : null,
    campaign: c.campaign, coaching_flag: c.coaching_flag, direction: c.direction, agents, company_context: await companyContext(db, orgId),
  }, file);
  if (r.status === 'sent') await db.q("UPDATE calls SET status = 'processing', status_reason = NULL, sent_to_flow_at = now() WHERE id = $1", [c.id]);
  else await db.q("UPDATE calls SET status = 'queued', status_reason = $2 WHERE id = $1", [c.id, r.detail]);
  return r;
}

/** A ZIP goes to the call-processing flow as ONE trigger, the way V1 Upload sends it (filename + zip_url): the flow's own ZIP
 *  branch unzips it, analyses every recording and posts each result back, matched by filename. The calls were already created
 *  from the same ZIP, so they are listed and playable while the flow works. */
export async function sendZipToFlow(db: Db, orgId: string, userId: string | null, zipName: string, data: Buffer, callRowIds: string[]) {
  const z = await saveFile(db, orgId, userId, 'zip', zipName, data);
  const url = signedFileUrl(z.id);
  const r = await callFlow(db, orgId, 'call_processing', z.id, {
    filename: z.filename, recording: url, zip_url: url, is_zip: 'true', recordings: callRowIds.length, company_context: await companyContext(db, orgId),
  });
  if (r.status === 'sent') await db.q("UPDATE calls SET status = 'processing', status_reason = NULL, sent_to_flow_at = now() WHERE id = ANY($1) AND org_id = $2", [callRowIds, orgId]);
  else await db.q("UPDATE calls SET status = 'queued', status_reason = $3 WHERE id = ANY($1) AND org_id = $2", [callRowIds, orgId, r.detail]);
  return r;
}

// ── the flow's write-back ───────────────────────────────────────────────────────────────────────────────────────────
const txt = z.union([z.string(), z.number(), z.boolean()]).nullish().transform((v) => (v == null || v === '' ? null : String(v).slice(0, 20000)));
const num = z.union([z.number(), z.string()]).nullish().transform((v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; });
const jsonish = z.any().transform((v) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v ?? null; });

export const CallResult = z.object({
  org_id: z.string().uuid(),
  call_row_id: z.string().uuid().nullish(),
  filename: z.string().max(300).nullish(),
  // the V1 formatter writes its own status words; anything that is not skipped / failed is an analysed call
  status: z.string().nullish().transform((v) => (/skip/i.test(v || '') ? 'skipped' : /fail|error/i.test(v || '') ? 'failed' : 'processed') as 'processed' | 'skipped' | 'failed'),
  status_reason: txt,
  agent_code: txt, agent_name: txt, mobile_number: txt, call_date: txt, duration: txt, duration_seconds: num,
  sop_score: num, kpi_score: num, quality_score: num, sentiment: txt, agent_sentiment: txt, call_summary: txt, cleaned_transcript: txt,
  sop_results: jsonish, kpi_results: jsonish, intelligence: jsonish,
  compliance_risk: txt, churn_risk: txt, call_classification: txt, call_intent: txt, call_topic: txt, call_sub_topic: txt, language: txt,
  improvement_areas: txt, recommendations: txt, coaching_note: txt, coaching_summary_note: txt, coaching_priority: txt, ztp_violation: txt,
  call_validity_tier: num, bfsi_false_guarantee_flag: txt, bfsi_risk_disclaimer_spoken: txt, bfsi_identity_verified: txt, bfsi_product_category: txt,
  bfsi_compliance_score: num,
}).passthrough();

const clamp = (v: number | null, lo: number, hi: number) => (v == null ? null : Math.max(lo, Math.min(hi, v)));
const secondsOf = (d: string | null) => {
  if (!d) return null;
  const mmss = d.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/); if (mmss) return mmss[3] ? +mmss[1] * 3600 + +mmss[2] * 60 + +mmss[3] : +mmss[1] * 60 + +mmss[2];
  const ms = d.match(/(\d+)\s*m(?:in)?\D+(\d+)\s*s/i); if (ms) return +ms[1] * 60 + +ms[2];
  const s = Number(d); return Number.isFinite(s) ? Math.round(s) : null;
};

export async function applyCallResult(db: Db, r: z.infer<typeof CallResult>) {
  const orgId = r.org_id;
  const existing = r.call_row_id
    ? await db.one<any>('SELECT id, agent_code, mobile_number, customer_id FROM calls WHERE id = $1 AND org_id = $2', [r.call_row_id, orgId])
    : r.filename ? await db.one<any>('SELECT id, agent_code, mobile_number, customer_id FROM calls WHERE org_id = $1 AND lower(filename) = lower($2)', [orgId, safeName(r.filename)]) : null;   // a ZIP entry may carry a folder path
  if (!existing) return { ok: false as const, code: 404, message: 'No call with that call_row_id / filename in this organisation.' };
  // a call that arrived from a dialer or Zoho: its event log shows the outcome of the analysis too
  await db.q("UPDATE ingest_events SET status = $2, detail = $3, updated_at = now() WHERE call_id = $1 AND org_id = $4 AND status IN ('queued','processing')",
    [existing.id, r.status === 'processed' ? 'processed' : r.status === 'skipped' ? 'skipped' : 'failed', r.status === 'processed' ? null : (r.status_reason || null), orgId]);
  const intel = (r.intelligence && typeof r.intelligence === 'object' && !Array.isArray(r.intelligence)) ? r.intelligence : {};
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const dur = r.duration_seconds ?? secondsOf(r.duration);
  const customerId = existing.customer_id ?? await linkCustomer(db, orgId, r.mobile_number ?? existing.mobile_number);
  // repeat-call signal is computed from history, not guessed (V1 used "mobile ends in 6")
  if (customerId) {
    const prior = await db.one<{ n: number }>("SELECT count(*)::int n FROM calls WHERE org_id = $1 AND customer_id = $2 AND id <> $3 AND created_at > now() - interval '7 days'", [orgId, customerId, existing.id]);
    intel.repeat_caller = (prior?.n ?? 0) > 0;
  }
  // the analysis says who the caller is (Investor / Partner …): that is the customer's segment unless someone set one already
  if (customerId && typeof intel.customer_type === 'string' && intel.customer_type.trim())
    await db.q('UPDATE customers SET segment = COALESCE(segment, $2), updated_at = now() WHERE id = $1 AND org_id = $3', [customerId, intel.customer_type.trim().slice(0, 60), orgId]);
  // the organisation's own agent record names the agent (the V1 formatter falls back to a built-in name map)
  await db.q(`UPDATE calls SET status = $3, status_reason = $4, agent_code = COALESCE($5, agent_code),
      agent_name = COALESCE((SELECT a.agent_name FROM agents a WHERE a.org_id = $2 AND a.agent_code = COALESCE($5, calls.agent_code)), $6, agent_name),
      mobile_number = COALESCE($7, mobile_number), customer_id = COALESCE($8, customer_id), duration = COALESCE($9, duration), duration_seconds = COALESCE($10, duration_seconds),
      sop_score = $11, kpi_score = $12, quality_score = $13, sentiment = $14, agent_sentiment = $15, call_summary = $16, cleaned_transcript = $17,
      sop_results = $18, kpi_results = $19, intelligence = $20, compliance_risk = $21, churn_risk = $22, call_classification = $23, call_intent = $24,
      call_topic = $25, call_sub_topic = $26, language = $27, improvement_areas = $28, recommendations = $29, coaching_note = $30,
      coaching_summary_note = $31, coaching_priority = $32, ztp_violation = $33, call_validity_tier = $34, bfsi_false_guarantee_flag = $35,
      bfsi_risk_disclaimer_spoken = $36, bfsi_identity_verified = $37, bfsi_product_category = $38, bfsi_compliance_score = $39,
      processed_at = now(), updated_at = now()
    WHERE id = $1 AND org_id = $2`,
    [existing.id, orgId, r.status, r.status_reason, r.agent_code, r.agent_name, r.mobile_number ? normMobile(r.mobile_number) : null, customerId, r.duration, dur,
     clamp(r.sop_score, 0, 100), clamp(r.kpi_score, 0, 100), clamp(r.quality_score, 0, 100), r.sentiment, r.agent_sentiment, r.call_summary, r.cleaned_transcript,
     JSON.stringify(arr(r.sop_results)), JSON.stringify(arr(r.kpi_results)), JSON.stringify(intel), r.compliance_risk, r.churn_risk, r.call_classification,
     r.call_intent, r.call_topic, r.call_sub_topic, r.language, r.improvement_areas, r.recommendations, r.coaching_note, r.coaching_summary_note,
     r.coaching_priority, r.ztp_violation, r.call_validity_tier, r.bfsi_false_guarantee_flag, r.bfsi_risk_disclaimer_spoken, r.bfsi_identity_verified,
     r.bfsi_product_category, r.bfsi_compliance_score]);
  await db.q("INSERT INTO flow_runs (org_id, flow, ref_id, status, detail) VALUES ($1,'call_processing',$2,'completed',$3)", [orgId, existing.id, r.status]);

  if (r.status === 'processed') {
    const code = r.agent_code || existing.agent_code;
    const org = await db.one<any>('SELECT config FROM organizations WHERE id = $1', [orgId]);
    const on = org?.config?.notify_on || {};
    const red = /red/i.test(r.coaching_priority || ''); const ztp = /^(yes|true)$/i.test(r.ztp_violation || ''); const high = /high|critical/i.test(r.compliance_risk || '');
    if (code && ((red && on.red_coaching !== false) || (ztp && on.ztp !== false) || (high && on.high_compliance !== false))) {
      const agent = await db.one<{ agent_name: string }>('SELECT agent_name FROM agents WHERE org_id = $1 AND agent_code = $2', [orgId, code]);
      const why = [ztp && 'ZTP violation', high && 'high compliance risk', red && 'red coaching priority'].filter(Boolean).join(', ');
      await notify(db, orgId, await managersOf(db, orgId, code), {
        kind: ztp ? 'ztp' : 'coaching', title: `${ztp ? 'ZTP alert' : 'Coaching flag'} — ${agent?.agent_name || `agent ${code}`}`,
        body: `A call was flagged for ${why}. ${r.call_summary ? r.call_summary.slice(0, 220) : ''}`, link: `/calls/${existing.id}`,
      });
    }
    await dispatchCrm(db, orgId, 'call.processed', {
      call_id: existing.id, mobile_number: r.mobile_number ?? existing.mobile_number, agent_code: code, summary: r.call_summary, intent: r.call_intent,
      classification: r.call_classification, sentiment: r.sentiment, quality_score: r.quality_score, compliance_risk: r.compliance_risk, churn_risk: r.churn_risk,
    });
    // v2.1: Zoho CRM — a Note (+ Call activity) on the caller's Contact / Lead; failures are logged, never fatal
    const meta = await db.one<any>('SELECT c.call_date, c.direction, c.duration_seconds, c.customer_id, c.created_at, COALESCE(a.agent_name, c.agent_name) AS agent_name FROM calls c LEFT JOIN agents a ON a.org_id = c.org_id AND a.agent_code = c.agent_code WHERE c.id = $1', [existing.id]);
    await pushCallToZoho(db, orgId, {
      call_id: existing.id, customer_id: meta?.customer_id, mobile_number: r.mobile_number ?? existing.mobile_number, agent_code: code, agent_name: meta?.agent_name,
      call_date: meta?.call_date, direction: meta?.direction, duration_seconds: meta?.duration_seconds, started_at: meta?.created_at, summary: r.call_summary,
      intent: r.call_intent, classification: r.call_classification, sentiment: r.sentiment, quality_score: r.quality_score, compliance_risk: r.compliance_risk, churn_risk: r.churn_risk,
    }).catch((e) => console.error('zoho push failed:', e?.message));
  }
  return { ok: true as const, id: existing.id };
}
