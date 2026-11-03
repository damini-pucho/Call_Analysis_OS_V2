// E2E harness step 2: take the row the V1 workflow saved (copied from its Studio run) and hand it to V2's write-back door.
import { readFileSync, writeFileSync } from 'node:fs'; import pg from 'pg';
for (const l of readFileSync('.env','utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const path = '../evidence/e2e/v1-run-create-row-input.json';
const run = JSON.parse(readFileSync(path, 'utf8')); const row = run.row_data;
if (row.audio_url) { row.audio_url = '[signed Studio file link removed]'; writeFileSync(path, JSON.stringify(run, null, 2)); }
const db = new pg.Client({ connectionString: process.env.MIGRATE_DATABASE_URL }); await db.connect(); await db.query("SELECT set_config('app.platform','on',false)");
const call = (await db.query('SELECT id, org_id FROM calls WHERE lower(filename) = lower($1)', [row.filename])).rows[0];
const { audio_url, created_at, processed_at, call_id: v1CallId, ...analysis } = row;
const res = await fetch('http://127.0.0.1:3200/api/inbound/calls', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.INBOUND_TOKEN}` },
  body: JSON.stringify({ data: { ...analysis, status: 'processed', org_id: call.org_id, call_row_id: call.id } }) });
const body = await res.text(); writeFileSync('../evidence/e2e/v2-inbound-response.json', body);
console.log('V1 run call_id:', v1CallId, '→ V2 call', call.id);
console.log('V2 /api/inbound/calls → HTTP', res.status, body);
const pick = ['quality_score','kpi_score','sop_score','sentiment','call_classification','call_intent','call_topic','compliance_risk','churn_risk','coaching_priority','ztp_violation','language'];
console.log('AI result:', Object.fromEntries(pick.map((k) => [k, row[k]])));
console.log('summary:', String(row.call_summary).slice(0, 300));
await db.end();
