// scripts/test-api.mjs — end-to-end checks against a running V2 server (npm run dev / start) and the dev database.
//   node scripts/test-api.mjs [http://127.0.0.1:3200]
// Sessions are minted directly in the database for the seeded demo users (a test fixture — no password is used).
// Proves: tenant isolation (pages, files, inbound), role scope, RBAC on pages, upload → queue, flow write-back, SOP
// extraction write-back, CRM inbound auth, signed file links, security headers. Writes evidence/test-api.json.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const BASE = process.argv[2] || 'http://127.0.0.1:3200';
const db = new pg.Client({ connectionString: process.env.MIGRATE_DATABASE_URL }); await db.connect();
await db.query("SELECT set_config('app.platform','on',false)");
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const sha = (s) => createHash('sha256').update(s).digest('hex');

async function sessionFor(email) {
  const u = (await db.query('SELECT id, org_id FROM users WHERE lower(email) = $1', [email])).rows[0];
  if (!u) throw new Error(`no seeded user ${email}`);
  const token = randomBytes(32).toString('base64url');
  await db.query("INSERT INTO sessions (id, user_id, org_id, expires_at) VALUES ($1,$2,$3, now() + interval '1 hour')", [sha(token), u.id, u.org_id]);
  return { cookie: `cas-session=${token}`, ...u };
}
const get = (path, s, extra = {}) => fetch(`${BASE}${path}`, { redirect: 'manual', headers: { ...(s ? { cookie: s.cookie } : {}), ...extra } });
const post = (path, body, headers = {}) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const orgs = Object.fromEntries((await db.query('SELECT slug, id FROM organizations')).rows.map((r) => [r.slug, r.id]));
const A = orgs['sahyog-wealth']; const B = orgs['nirmal-care'];
const adminA = await sessionFor('admin@sahyog.demo'); const adminB = await sessionFor('admin@nirmal.demo');
const tl = await sessionFor('meera.iyer@sahyog.demo'); const exec = await sessionFor('dipti.shah@sahyog.demo');

// ── health & headers ──
let r = await get('/api/health'); check('health answers { ok } to the public', r.status === 200 && (await r.json()).ok === true);
r = await get('/api/health', adminA); const h = await r.json(); check('health shows wiring to an org admin', h.database === 'reachable' && !!h.flows, JSON.stringify(h.flows));
r = await get('/login');
check('security headers on pages', !!r.headers.get('content-security-policy') && r.headers.get('x-frame-options') === 'DENY' && r.headers.get('x-content-type-options') === 'nosniff' && !r.headers.get('x-powered-by'));

// ── auth gate ──
r = await get('/overview'); check('signed-out visitor is sent to /login', [307, 308].includes(r.status) && (r.headers.get('location') || '').includes('/login'));
r = await get('/overview', adminA); check('org A admin opens overview', r.status === 200);

// ── tenant isolation on pages ──
const callA = (await db.query("SELECT id, agent_code FROM calls WHERE org_id = $1 AND status = 'processed' AND agent_code = '1034' LIMIT 1", [A])).rows[0];
const callB = (await db.query('SELECT id FROM calls WHERE org_id = $1 LIMIT 1', [B])).rows[0];
r = await get(`/calls/${callA.id}`, adminA); check('org A admin opens an org A call', r.status === 200);
r = await get(`/calls/${callA.id}`, adminB); check('org B admin gets 404 for an org A call', r.status === 404);
r = await get(`/calls/${callB.id}`, adminA); check('org A admin gets 404 for an org B call', r.status === 404);
const bodyA = await (await get('/calls', adminA)).text(); const bodyB = await (await get('/calls', adminB)).text();
check('org B call list contains no org A agent', !bodyB.includes('Kunal Joshi') && bodyA.includes('Kunal Joshi'));

// ── role scope ──
r = await get(`/calls/${callA.id}`, exec); check('executive (agent 1011) gets 404 for another agent’s call', r.status === 404);
const own = (await db.query("SELECT id FROM calls WHERE org_id = $1 AND agent_code = '1011' LIMIT 1", [A])).rows[0];
r = await get(`/calls/${own.id}`, exec); check('executive opens their own call', r.status === 200);
r = await get(`/calls/${callA.id}`, tl); check('team leader of Support West gets 404 for an Outreach agent’s call', r.status === 404);
r = await get(`/calls/${own.id}`, tl); check('team leader opens a call of their own team', r.status === 200);

// ── RBAC on pages ──
for (const [path, s, ok] of [['/team', exec, false], ['/settings', exec, false], ['/upload', exec, false], ['/team', adminA, true], ['/settings', tl, false], ['/platform', adminA, false]]) {
  r = await get(path, s);
  const denied = [307, 308].includes(r.status) && (r.headers.get('location') || '').includes('/denied');
  check(`${path} for ${s === exec ? 'executive' : s === tl ? 'team leader' : 'org admin'} is ${ok ? 'allowed' : 'denied'}`, ok ? r.status === 200 : denied, `HTTP ${r.status}`);
}

// ── upload → stored + queued (flow not connected locally) ──
const recDir = join(ROOT, '..', '..', 'Call Analysis', 'Calls_recording');
const recs = existsSync(recDir) ? readdirSync(recDir).filter((f) => f.endsWith('.mp3')).slice(0, 3) : [];
let uploadedId = null;
if (recs.length) {
  const fd = new FormData(); fd.append('file', new Blob([readFileSync(join(recDir, recs[0]))], { type: 'audio/mpeg' }), recs[0]);
  r = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { cookie: adminA.cookie }, body: fd }); const up = await r.json();
  uploadedId = up.calls?.[0]?.id;
  check('single recording upload stores and queues the call', r.status === 200 && up.calls?.length === 1 && up.calls[0].status === (up.connected ? 'processing' : 'queued'), up.calls?.[0]?.detail || '');
  const row = (await db.query('SELECT agent_code, mobile_number, campaign, call_date, audio_file_id, customer_id FROM calls WHERE id = $1', [uploadedId])).rows[0];
  check('filename parsed into agent, mobile, campaign, date, customer', row && row.agent_code && row.mobile_number && row.campaign && row.call_date && row.customer_id, JSON.stringify({ agent: row?.agent_code, campaign: row?.campaign }));
  const zip = new JSZip(); for (const f of recs.slice(1)) zip.file(`batch/${f}`, readFileSync(join(recDir, f))); zip.file('readme.txt', 'not audio');
  const zfd = new FormData(); zfd.append('file', new Blob([await zip.generateAsync({ type: 'uint8array' })], { type: 'application/zip' }), 'batch.zip');
  r = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { cookie: adminA.cookie }, body: zfd }); const zu = await r.json();
  check('ZIP upload unpacks only the audio files', r.status === 200 && zu.calls?.length === recs.length - 1, `${zu.calls?.length} calls`);
  r = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { cookie: exec.cookie }, body: fd }); check('executive cannot upload', r.status === 403);
  // the same recording again replaces its row (no duplicate)
  r = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { cookie: adminA.cookie }, body: fd });
  const dup = (await db.query('SELECT count(*)::int n FROM calls WHERE org_id = $1 AND lower(filename) = lower($2)', [A, recs[0]])).rows[0].n;
  check('re-uploading a recording does not duplicate it', dup === 1);
  row.audio_file_id = (await db.query('SELECT audio_file_id FROM calls WHERE id = $1', [uploadedId])).rows[0].audio_file_id;   // the re-upload replaced the recording
  // files: session access, range, cross-tenant, signed link
  r = await get(`/api/files/${row.audio_file_id}`, adminA, { range: 'bytes=0-99' }); check('recording streams with Range (206)', r.status === 206 && r.headers.get('content-range')?.startsWith('bytes 0-99/'));
  r = await get(`/api/files/${row.audio_file_id}`, adminB); check('org B cannot fetch an org A recording', r.status === 404);
  r = await get(`/api/files/${row.audio_file_id}?exp=9999999999&sig=forged`); check('a forged signed link is refused', r.status === 403);
} else check('V1 sample recordings available for upload tests', false, recDir);

// ── flow write-back (/api/inbound/calls) ──
const token = process.env.INBOUND_TOKEN;
r = await post('/api/inbound/calls', { org_id: A, call_row_id: uploadedId }); check('inbound without token → 401', r.status === 401);
r = await post('/api/inbound/calls', { org_id: A, call_row_id: uploadedId }, { authorization: 'Bearer wrong-token-wrong-token-wrong' }); check('inbound with a wrong token → 401', r.status === 401);
if (uploadedId) {
  r = await post('/api/inbound/calls', { org_id: B, call_row_id: uploadedId, status: 'processed' }, { authorization: `Bearer ${token}` });
  check('a flow cannot write org A’s call under org B', r.status === 404);
  const sample = { org_id: A, call_row_id: uploadedId, status: 'processed', agent_code: '1018', agent_name: 'Wrong Name From Flow', mobile_number: '8779709849', duration: '03:35', kpi_score: '80', quality_score: '4', sop_score: '6', sentiment: 'Positive',
    call_summary: 'Customer asked about SIP status; agent verified and resolved.', cleaned_transcript: 'Speaker 1: Good morning…\nSpeaker 2: Hi…', call_intent: 'SIP Modify', call_classification: 'intent', compliance_risk: 'High', ztp_violation: 'No',
    coaching_priority: 'Red', churn_risk: 'Low', language: 'Hindi', sop_results: JSON.stringify([{ sop_id: 1, name: 'Professional Greeting', result: 'Pass' }]), kpi_results: '[{"kpi_id":1,"name":"Call Resolution","value":"Yes"}]', intelligence: '{"campaign":"SUPPORT"}' };
  r = await post('/api/inbound/calls', { data: sample }, { authorization: `Bearer ${token}` }); const wb = await r.json();
  const after = (await db.query('SELECT status, quality_score, agent_name, duration_seconds, jsonb_array_length(sop_results) n FROM calls WHERE id = $1', [uploadedId])).rows[0];
  check('flow write-back (Studio body.data shape) marks the call analysed', r.status === 200 && wb.ok && after.status === 'processed' && Number(after.quality_score) === 4 && after.n === 1 && after.duration_seconds === 215);
  check('agent name comes from the org’s own agent record', after.agent_name === 'Anurag Mehta', after.agent_name);
  const notes = (await db.query("SELECT count(*)::int n FROM notifications WHERE org_id = $1 AND link = $2", [A, `/calls/${uploadedId}`])).rows[0].n;
  check('a red / high-risk result notifies the agent’s managers', notes > 0, `${notes} notification(s)`);
  r = await post('/api/inbound/calls', '{not json', { authorization: `Bearer ${token}` }); check('malformed JSON → 400', r.status === 400);
}

// ── SOP extraction write-back ──
const doc = (await db.query("INSERT INTO company_documents (org_id, kind, title, status) VALUES ($1,'sop','Test SOP','extracting') RETURNING id", [A])).rows[0].id;
r = await post('/api/inbound/sop-extraction', { data: { org_id: A, document_id: doc, summary: 'Two rules.', rules: JSON.stringify([{ kind: 'SOP', title: 'Confirm callback number', description: 'Read back the number', severity: 'normal' }, { kind: 'ztp', title: 'Never share OTP', severity: 'critical' }, { kind: 'bogus', title: 'dropped' }]) } }, { authorization: `Bearer ${token}` });
const ex = await r.json(); const drows = (await db.query("SELECT kind FROM sop_rules WHERE document_id = $1 ORDER BY kind", [doc])).rows.map((x) => x.kind).join(',');
check('SOP extraction writes only valid rules and marks the document extracted', r.status === 200 && ex.rules === 2 && drows === 'sop,ztp');
r = await post('/api/inbound/sop-extraction', { org_id: B, document_id: doc, rules: [] }, { authorization: `Bearer ${token}` }); check('SOP extraction cannot write another org’s document', r.status === 404);
await db.query('DELETE FROM company_documents WHERE id = $1', [doc]);

// ── CRM inbound ──
const conn = (await db.query("INSERT INTO crm_connections (org_id, name, inbound_token_hash, events) VALUES ($1,'test',$2,'{}') RETURNING id", [A, sha('cas_test_token_123456789')])).rows[0].id;
r = await post(`/api/crm/${conn}/customers`, { customers: [{ mobile_number: '+91 98765 43210', name: 'CRM Person' }] }); check('CRM inbound without token → 401', r.status === 401);
r = await post(`/api/crm/${conn}/customers`, { customers: [{ mobile_number: '+91 98765 43210', name: 'CRM Person', external_id: 'HS-1' }, { mobile_number: '12' }] }, { authorization: 'Bearer cas_test_token_123456789' });
const cj = await r.json(); const cu = (await db.query("SELECT name, crm_source FROM customers WHERE org_id = $1 AND mobile_number = '9876543210'", [A])).rows[0];
check('CRM inbound upserts customers into the connection’s org only', r.status === 200 && cj.upserted === 1 && cj.skipped === 1 && cu?.crm_source === 'crm');
await db.query('DELETE FROM crm_connections WHERE id = $1', [conn]);

// ── row-level security as the app role ──
const app = new pg.Client({ connectionString: process.env.DATABASE_URL }); await app.connect();
const none = (await app.query('SELECT count(*)::int n FROM calls')).rows[0].n;
await app.query("SELECT set_config('app.org_id', $1, false)", [B]);
const onlyB = (await app.query('SELECT count(DISTINCT org_id)::int n FROM calls')).rows[0].n;
let blocked = false; try { await app.query("INSERT INTO agents (org_id, agent_code, agent_name) VALUES ($1, 'X1', 'x')", [A]); } catch { blocked = true; }
check('RLS: app role sees nothing without an org, one org with it, and cannot write across', none === 0 && onlyB === 1 && blocked);
const role = (await app.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
check('the app connects as a role that is not superuser and cannot bypass RLS', role && !role.rolsuper && !role.rolbypassrls);
await app.end();

// ── passwords ──
const hashes = (await db.query('SELECT password_hash FROM users')).rows;
check('every stored password is argon2id', hashes.every((x) => x.password_hash.startsWith('$argon2id$')));

await db.query("DELETE FROM sessions WHERE expires_at < now() + interval '2 hours' AND created_at > now() - interval '10 minutes' AND user_agent IS NULL");
await db.end();
mkdirSync(join(ROOT, '..', 'evidence'), { recursive: true });
writeFileSync(join(ROOT, '..', 'evidence', 'test-api.json'), JSON.stringify({ when: new Date().toISOString(), base: BASE, passed: results.length - failed, failed, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
