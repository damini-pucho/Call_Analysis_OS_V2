// scripts/e2e-v1-webhook.mjs — E2E test harness (test data only).
// Sends the synthetic recording to the EXISTING V1 Studio workflow webhook exactly as V1's Upload page does (multipart to
// /sync), saves the raw reply, then hands the reply to V2 through V2's normal flow write-back door (/api/inbound/calls),
// which updates the V2 call and syncs the result to Zoho. Note: the V1 workflow also writes its own row to V1 Supabase.
//   node scripts/e2e-v1-webhook.mjs <path to recording>
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const l of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const V1_WEBHOOK = 'https://studio.pucho.ai/api/v1/webhooks/GTHrKkSY3nJKz1lCywbN5/sync';
const EVID = join(ROOT, '..', 'evidence', 'e2e');
const file = process.argv[2]; const name = basename(file);
const [datePart, mobile, agentCode, campFlag] = name.replace(/\.[^.]+$/, '').split('_');
const [ymd, leadId] = datePart.split('-'); const [campaign, ...flag] = campFlag.split('-');

const db = new pg.Client({ connectionString: process.env.MIGRATE_DATABASE_URL }); await db.connect(); await db.query("SELECT set_config('app.platform','on',false)");
const call = (await db.query('SELECT id, org_id FROM calls WHERE lower(filename) = lower($1)', [name])).rows[0];
if (!call) { console.error('No V2 call row for', name); process.exit(1); }
await db.query("UPDATE calls SET status = 'processing', status_reason = NULL, sent_to_flow_at = now() WHERE id = $1", [call.id]);
await db.query("INSERT INTO flow_runs (org_id, flow, ref_id, status, detail) VALUES ($1,'call_processing',$2,'sent',$3)", [call.org_id, call.id, 'E2E test: V1 workflow webhook GTHrKkSY3nJKz1lCywbN5/sync (multipart, as V1 Upload)']);

// 1. the same request V1 Upload.jsx makes
const fd = new FormData();
fd.append('recording', new Blob([readFileSync(file)], { type: name.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg' }), name);
fd.append('filename', name); fd.append('agent_code', agentCode); fd.append('mobile_number', mobile); fd.append('call_id', leadId);
fd.append('call_date', ymd); fd.append('campaign', campaign); fd.append('coaching_flag', flag.join('-') || 'all');
const t0 = Date.now();
console.log(`→ POST ${V1_WEBHOOK}  (${name}, ${(readFileSync(file).length / 1048576).toFixed(1)} MB)`);
let res, text;
try { res = await fetch(V1_WEBHOOK, { method: 'POST', body: fd, signal: AbortSignal.timeout(10 * 60 * 1000) }); text = await res.text(); }
catch (e) { console.error('V1 webhook request failed:', e.message); await db.query("UPDATE calls SET status = 'failed', status_reason = $2 WHERE id = $1", [call.id, `V1 webhook: ${e.message}`]); process.exit(1); }
const secs = Math.round((Date.now() - t0) / 1000);
writeFileSync(join(EVID, 'v1-sync-response.json'), text);
console.log(`← HTTP ${res.status} after ${secs}s · ${text.length} bytes (saved evidence/e2e/v1-sync-response.json)`);
let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
const row = Array.isArray(json) ? json[0] : json?.body ?? json?.data?.[0] ?? json?.data ?? json;
if (!res.ok || !row || typeof row !== 'object' || !(row.call_summary || row.kpi_results || row.sop_results)) {
  console.error('The workflow reply carries no analysis — keys:', row && typeof row === 'object' ? Object.keys(row).join(', ') : typeof row);
  await db.query("UPDATE calls SET status = 'failed', status_reason = $2 WHERE id = $1", [call.id, `V1 workflow replied HTTP ${res.status} without analysis fields`]);
  process.exit(2);
}
console.log('analysis keys returned:', Object.keys(row).filter((k) => !['id', 'created_at'].includes(k)).join(', '));

// 2. hand it to V2 through the same door the V2 workflow uses
const { id: _v1RowId, created_at: _c, audio_url: _a, processed_at: _p, ...analysis } = row;
const wb = await fetch('http://127.0.0.1:3200/api/inbound/calls', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.INBOUND_TOKEN}` },
  body: JSON.stringify({ data: { ...analysis, status: 'processed', org_id: call.org_id, call_row_id: call.id, filename: name } }),
});
const wbBody = await wb.text();
writeFileSync(join(EVID, 'v2-inbound-response.json'), wbBody);
console.log(`V2 /api/inbound/calls → HTTP ${wb.status} ${wbBody}`);
await db.end();
process.exit(wb.ok ? 0 : 3);
