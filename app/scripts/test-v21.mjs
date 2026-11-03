// scripts/test-v21.mjs — the three v2.1 changes, end to end, against the running dev server.
//   node scripts/test-v21.mjs [http://127.0.0.1:3200]
// Needs the dev server started with (dev only — test-only switches, ignored in production):
//   ZOHO_TEST_BASE=http://127.0.0.1:4789  ZOHO_CLIENT_ID=test-client  ZOHO_CLIENT_SECRET=test-secret  INGEST_ALLOW_PRIVATE=true
// A local mock plays Zoho (OAuth + CRM v8) and a dialer's recording host. Everything it creates is removed at the end.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const l of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const BASE = process.argv[2] || 'http://127.0.0.1:3200'; const MOCK = 'http://127.0.0.1:4789';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const results = []; const check = (n, ok, d = '') => { results.push({ name: n, ok: !!ok, detail: d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`); };
const db = new pg.Client({ connectionString: process.env.MIGRATE_DATABASE_URL }); await db.connect(); await db.query("SELECT set_config('app.platform','on',false)");
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; let r; while (Date.now() < end) { r = await fn(); if (r) return r; await new Promise((x) => setTimeout(x, 500)); } return r; };
const org = (await one("SELECT id FROM organizations WHERE slug = 'sahyog-wealth'")).id;

// ── mock Zoho + recording host ──
const recDir = join(ROOT, '..', '..', 'Call Analysis', 'Calls_recording'); const mp3 = readFileSync(join(recDir, readdirSync(recDir).find((f) => f.endsWith('.mp3'))));
const seen = []; const CONTACT = { id: '5550001', Full_Name: 'Rakesh Parmar (Zoho)', Email: 'rakesh@example.com', Phone: '+919812300000', Owner: { name: 'Zoho Owner' }, Account_Name: { name: 'Parmar Traders' }, Lead_Source: 'Web' };
let custMobile = '';
const mock = createServer((req, res) => {
  const u = new URL(req.url, MOCK); let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    seen.push({ method: req.method, path: u.pathname, query: u.search, auth: req.headers.authorization || '', body });
    const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/oauth/v2/token') {
      const p = new URLSearchParams(body);
      if (p.get('client_secret') !== 'test-secret') return json(400, { error: 'invalid_client' });
      if (p.get('grant_type') === 'authorization_code') return p.get('code') === 'good-code' ? json(200, { access_token: 'acc-1', refresh_token: 'ref-1', api_domain: MOCK, expires_in: 3600 }) : json(400, { error: 'invalid_code' });
      if (p.get('grant_type') === 'refresh_token') return json(200, { access_token: 'acc-2', expires_in: 3600 });
    }
    if (u.pathname === '/oauth/v2/token/revoke') return json(200, { status: 'success' });
    if (u.pathname === '/rec/call.mp3') { res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': mp3.length }); return res.end(mp3); }
    if (u.pathname === '/rec/private.mp3') { if (req.headers.authorization !== `Basic ${Buffer.from('apikey:secret').toString('base64')}`) { res.writeHead(401); return res.end(); } res.writeHead(200, { 'content-type': 'audio/mpeg' }); return res.end(mp3); }
    if (!req.headers.authorization?.startsWith('Zoho-oauthtoken ')) return json(401, { code: 'INVALID_TOKEN' });
    if (u.pathname === '/crm/v8/users') return json(200, { users: [{ email: 'owner@zoho-test.example' }] });
    if (u.pathname === '/crm/v8/org') return json(200, { org: [{ id: 6000001 }] });
    if (u.pathname === '/crm/v8/Contacts/search') { const ph = u.searchParams.get('phone') || ''; return ph.endsWith(custMobile) && custMobile ? json(200, { data: [CONTACT] }) : (res.writeHead(204), res.end()); }
    if (u.pathname === '/crm/v8/Leads/search') { res.writeHead(204); return res.end(); }
    if (u.pathname === `/crm/v8/Contacts/${CONTACT.id}`) return json(200, { data: [CONTACT] });
    if (u.pathname === `/crm/v8/Contacts/${CONTACT.id}/Deals`) return json(200, { data: [{ id: 'd1', Deal_Name: 'SIP top-up FY27', Stage: 'Negotiation', Amount: 250000 }] });
    if (u.pathname === `/crm/v8/Contacts/${CONTACT.id}/Calls`) return json(200, { data: [{ id: 'c1', Subject: 'Earlier follow-up', Call_Type: 'Outbound', Call_Start_Time: '2026-10-20T10:00:00+05:30', Call_Duration: '04:10' }] });
    if (u.pathname === `/crm/v8/Contacts/${CONTACT.id}/Notes` && req.method === 'GET') return json(200, { data: [{ id: 'n1', Note_Title: 'KYC pending', Note_Content: 'Asked for PAN copy', Created_Time: '2026-10-21T09:00:00+05:30' }] });
    if (u.pathname === `/crm/v8/Contacts/${CONTACT.id}/Notes` && req.method === 'POST') return json(201, { data: [{ code: 'SUCCESS', details: { id: 'n2' } }] });
    if (u.pathname === '/crm/v8/Calls' && req.method === 'POST') return json(201, { data: [{ code: 'SUCCESS', details: { id: 'c2' } }] });
    if (u.pathname === '/crm/v8/Contacts' && req.method === 'GET') return json(200, { data: [{ id: '7001', Full_Name: 'Zoho Import One', Mobile: '+91 90111 22333', Email: 'one@example.com' }, { id: '7002', Full_Name: 'No Phone' }], info: { more_records: false } });
    json(404, { code: 'NOT_FOUND', path: u.pathname });
  });
});
await new Promise((r) => mock.listen(4789, '127.0.0.1', r));

async function session(email) {
  const u = await one('SELECT id, org_id FROM users WHERE lower(email) = $1', [email]); const t = randomBytes(32).toString('base64url');
  await db.query("INSERT INTO sessions (id, user_id, org_id, expires_at) VALUES ($1,$2,$3, now() + interval '1 hour')", [sha(t), u.id, u.org_id]);
  return { cookie: `cas-session=${t}`, token: t, ...u };
}
const get = (path, s, extra = {}) => fetch(`${BASE}${path}`, { redirect: 'manual', headers: { ...(s ? { cookie: s.cookie } : {}), ...extra } });
const admin = await session('admin@sahyog.demo'); const tl = await session('meera.iyer@sahyog.demo'); const dipti = await session('dipti.shah@sahyog.demo');
const browser = await chromium.launch();
async function page(s) { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addCookies([{ name: 'cas-session', value: s.token, url: BASE }]); const p = await ctx.newPage(); p.on('dialog', (d) => d.accept()); return p; }
const stamp = Date.now().toString(36);

// ════════ 1. Training lock + team leader Done ════════
const asg = await one("INSERT INTO training_assignments (org_id, agent_code, title, gap, assigned_by, due_date) VALUES ($1,'1011',$2,'Closing script',(SELECT id FROM users WHERE email='meera.iyer@sahyog.demo'), current_date + 3) RETURNING id", [org, `Lock test ${stamp}`]);
let r = await get('/overview', dipti); check('assigned agent: dashboard redirects to Training', [307, 308].includes(r.status) && (r.headers.get('location') || '').includes('/training?locked=1'), r.headers.get('location'));
r = await get('/calls', dipti); check('assigned agent: call pages are locked too', (r.headers.get('location') || '').includes('/training'));
r = await get('/training', dipti); const tHtml = await r.text(); check('assigned agent: Training page opens with the lock notice', r.status === 200 && tHtml.includes('Your dashboard is locked'));
r = await get('/profile', dipti); check('assigned agent: Profile still opens', r.status === 200);
const rec = await one("SELECT audio_file_id FROM calls WHERE org_id = $1 AND audio_file_id IS NOT NULL LIMIT 1", [org]);
if (rec) { r = await get(`/api/files/${rec.audio_file_id}`, dipti); check('assigned agent: recordings API refuses (423)', r.status === 423); }
const dp = await page(dipti); await dp.goto(`${BASE}/training`, { waitUntil: 'networkidle' });
const navItems = await dp.locator('nav[aria-label=Main] a').allInnerTexts();
check('assigned agent: sidebar shows only Training', navItems.length === 1 && /Training/.test(navItems[0]), navItems.join(','));
await dp.getByRole('row', { name: new RegExp(`Lock test ${stamp}`) }).getByRole('button', { name: 'Update' }).click();
const opts = await dp.getByRole('dialog').getByLabel('Status').locator('option').allInnerTexts();
check('agent cannot complete their own training (no Completed option)', !opts.includes('Completed'), opts.join(','));
await dp.getByRole('dialog').getByLabel('Status').selectOption('In Progress'); await dp.getByRole('dialog').getByLabel(/Notes for your team leader/).fill('Practised the closing script'); await dp.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
check('agent records progress and notes', !!(await until(() => one("SELECT 1 FROM training_assignments WHERE id = $1 AND status = 'In Progress' AND agent_notes LIKE 'Practised%'", [asg.id]))));
check('dashboard stays locked while In Progress', ((await get('/overview', dipti)).headers.get('location') || '').includes('/training'));
const tp = await page(tl); await tp.goto(`${BASE}/training`, { waitUntil: 'networkidle' }); await tp.getByRole('tab', { name: /Assignments/ }).click();
await tp.getByRole('row', { name: new RegExp(`Lock test ${stamp}`) }).getByRole('button', { name: 'Done' }).click();
await tp.getByRole('dialog').getByLabel(/Review note/).fill('Reviewed together — good.'); await tp.getByRole('dialog').getByRole('button', { name: 'Mark Done' }).click();
const doneRow = await until(() => one("SELECT t.status, u.email FROM training_assignments t JOIN users u ON u.id = t.completed_by WHERE t.id = $1 AND t.status = 'Completed'", [asg.id]));
check('team leader marks it Done (recorded as completed by them)', doneRow?.email === 'meera.iyer@sahyog.demo');
r = await get('/overview', dipti); check('agent dashboard unlocked after Done', r.status === 200);
check('agent is told their dashboard is unlocked', !!(await one("SELECT 1 FROM notifications WHERE user_id = (SELECT id FROM users WHERE email='dipti.shah@sahyog.demo') AND title = $1 AND body LIKE '%unlocked%'", [`Training done: Lock test ${stamp}`])));

// ════════ 2. Zoho CRM ════════
const cust = await one("SELECT cu.id, cu.mobile_number FROM customers cu JOIN calls c ON c.customer_id = cu.id WHERE cu.org_id = $1 AND c.status = 'queued' LIMIT 1", [org])
  || await one("SELECT id, mobile_number FROM customers WHERE org_id = $1 LIMIT 1", [org]);
custMobile = cust.mobile_number;
r = await get('/api/crm/zoho/connect?dc=in', admin);
const loc = r.headers.get('location') || ''; const cookie = (r.headers.get('set-cookie') || '').match(/zoho_oauth_state=([^;]+)/)?.[1];
check('Connect redirects to Zoho with offline access and the CRM scopes', loc.startsWith(`${MOCK}/oauth/v2/auth`) && loc.includes('access_type=offline') && loc.includes('ZohoCRM.modules.notes.ALL') && !!cookie);
const state = new URL(loc).searchParams.get('state');
r = await get(`/api/crm/zoho/callback?code=good-code&state=${state}x&accounts-server=${encodeURIComponent(MOCK)}`, admin, { cookie: `${admin.cookie}; zoho_oauth_state=${cookie}` });
check('a tampered OAuth state is refused', (r.headers.get('location') || '').includes('zoho=invalid_state'));
r = await get(`/api/crm/zoho/callback?code=good-code&state=${state}&accounts-server=${encodeURIComponent('https://evil.example')}`, admin, { cookie: `${admin.cookie}; zoho_oauth_state=${cookie}` });
check('a non-Zoho accounts server is refused', (r.headers.get('location') || '').includes('zoho=invalid_server'));
r = await get(`/api/crm/zoho/callback?code=good-code&state=${state}&accounts-server=${encodeURIComponent(MOCK)}&location=in`, tl, { cookie: `${tl.cookie}; zoho_oauth_state=${cookie}` });
check('the callback only completes for the admin who started it', (r.headers.get('location') || '').includes('zoho=invalid_state'));
r = await get(`/api/crm/zoho/callback?code=good-code&state=${state}&accounts-server=${encodeURIComponent(MOCK)}&location=in`, admin, { cookie: `${admin.cookie}; zoho_oauth_state=${cookie}` });
const zc = await one("SELECT refresh_token_enc, access_token_enc, external_account, external_org_id FROM crm_connections WHERE org_id = $1 AND provider = 'zoho'", [org]);
check('Zoho connected; tokens stored encrypted, account recorded', (r.headers.get('location') || '').includes('zoho=connected') && zc?.refresh_token_enc?.startsWith('v1:') && !zc.refresh_token_enc.includes('ref-1') && zc.external_account === 'owner@zoho-test.example');
r = await get(`/customers/${cust.id}`, admin); const cHtml = await r.text();
check('customer profile shows the Zoho contact, deals, calls and notes', cHtml.includes('Rakesh Parmar (Zoho)') && cHtml.includes('SIP top-up FY27') && cHtml.includes('Earlier follow-up') && cHtml.includes('KYC pending'));
check('the customer is linked to the Zoho record', (await one('SELECT zoho_id FROM customers WHERE id = $1', [cust.id]))?.zoho_id === CONTACT.id);
const ap = await page(admin); await ap.goto(`${BASE}/crm`, { waitUntil: 'networkidle' });
await ap.getByRole('button', { name: 'Import Contacts' }).click();
check('Import Contacts creates customer profiles from Zoho (no-phone records skipped)', !!(await until(() => one("SELECT 1 FROM customers WHERE org_id = $1 AND mobile_number = '9011122333' AND zoho_id = '7001' AND crm_source = 'zoho'", [org]))));
// write-back after analysis
const call = await one("SELECT id FROM calls WHERE org_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT 1", [org, cust.id]);
seen.length = 0;
r = await fetch(`${BASE}/api/inbound/calls`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.INBOUND_TOKEN}` },
  body: JSON.stringify({ org_id: org, call_row_id: call.id, status: 'processed', call_summary: 'Customer asked about SIP top-up.', quality_score: 4, sentiment: 'Positive', call_intent: 'SIP Modify', call_classification: 'intent', compliance_risk: 'Low', duration: '03:10' }) });
const note = seen.find((x) => x.method === 'POST' && x.path === `/crm/v8/Contacts/${CONTACT.id}/Notes`); const zcall = seen.find((x) => x.method === 'POST' && x.path === '/crm/v8/Calls');
check('an analysed call is written to Zoho as a Note on the contact', r.status === 200 && !!note && note.body.includes('Customer asked about SIP top-up') && note.body.includes(`/calls/${call.id}`));
check('…and logged as a Call activity linked to the contact', !!zcall && JSON.parse(zcall.body).data[0].Who_Id?.id === CONTACT.id && JSON.parse(zcall.body).data[0].Call_Duration === '03:10');
check('the Zoho write-back is in the sync log', !!(await one("SELECT 1 FROM crm_sync_log WHERE org_id = $1 AND event = 'zoho.call_note' AND status = 'ok' AND created_at > now() - interval '1 minute'", [org])));
check('Zoho calls carry the OAuth token header', seen.every((x) => x.path.startsWith('/oauth') || x.auth.startsWith('Zoho-oauthtoken ')));

// ════════ 3. Dialer recording ingestion ════════
await db.query("UPDATE agents SET dialer_ids = '{201}' WHERE org_id = $1 AND agent_code = '1034'", [org]);
const token = randomBytes(24).toString('base64url');
const src = await one("INSERT INTO call_sources (org_id, provider, name, token_hash, field_map, default_campaign) VALUES ($1,'exotel',$2,$3,'{}','SUPPORT') RETURNING id", [org, `Exotel test ${stamp}`, sha(token)]);
const ingest = (body, q = '', type = 'application/x-www-form-urlencoded') => fetch(`${BASE}/api/ingest/${src.id}?token=${token}${q}`, { method: 'POST', headers: { 'content-type': type }, body });
r = await fetch(`${BASE}/api/ingest/${src.id}?token=wrongwrongwrongwrongwrong`, { method: 'POST', body: 'x=1' }); check('dialer webhook with a wrong token → 401', r.status === 401);
const sid = `CA${stamp}`;
r = await ingest(new URLSearchParams({ CallSid: sid, CallFrom: '09812345678', DialWhomNumber: '201', Direction: 'incoming', RecordingUrl: `${MOCK}/rec/call.mp3`, DialCallDuration: '187', StartTime: '2026-11-02 10:15:00' }).toString());
check('Exotel-style form webhook accepted (202)', r.status === 202);
const ev = await until(() => one("SELECT e.status, e.call_id, e.keys, c.filename, c.agent_code, c.direction, c.duration_seconds, c.mobile_number, c.campaign, c.status AS call_status FROM ingest_events e LEFT JOIN calls c ON c.id = e.call_id WHERE e.source_id = $1 AND e.external_call_id = $2 AND e.call_id IS NOT NULL", [src.id, sid]));
check('recording downloaded and stored as a call — no manual upload', !!ev?.call_id && ['queued', 'processing'].includes(ev.call_status), ev?.filename);
check('dialer ID 201 mapped to agent 1034; customer, direction, duration, campaign filled', ev?.agent_code === '1034' && ev.mobile_number === '9812345678' && ev.direction === 'Inbound' && ev.duration_seconds === 187 && ev.campaign === 'SUPPORT');
check('event log keeps field names only, not values', ev?.keys?.includes('RecordingUrl') && !JSON.stringify(ev.keys).includes('rec/call.mp3'));
r = await ingest(new URLSearchParams({ CallSid: sid, RecordingUrl: `${MOCK}/rec/call.mp3` }).toString()); const dup = await r.json();
check('the dialer retrying the same call is ignored', dup.duplicate === true);
r = await fetch(`${BASE}/api/ingest/${src.id}?token=${token}&CallSid=GET${stamp}&CallFrom=09876500000&DialWhomNumber=999&RecordingUrl=${encodeURIComponent(`${MOCK}/rec/call.mp3`)}`);
const evGet = await until(() => one("SELECT e.call_id, c.agent_code FROM ingest_events e JOIN calls c ON c.id = e.call_id WHERE e.source_id = $1 AND e.external_call_id = $2", [src.id, `GET${stamp}`]));
check('GET passthru works; an unknown dialer ID becomes a new agent to map', r.status === 202 && evGet?.agent_code === '999' && !!(await one("SELECT 1 FROM agents WHERE org_id = $1 AND agent_code = '999'", [org])));
r = await ingest(new URLSearchParams({ CallSid: `NR${stamp}`, CallFrom: '09800000000', DialWhomNumber: '201' }).toString());
check('an unanswered call (no recording) is skipped, not faked', r.status === 202 && (await until(() => one("SELECT status FROM ingest_events WHERE source_id = $1 AND external_call_id = $2 AND status = 'skipped'", [src.id, `NR${stamp}`]))));
r = await ingest(new URLSearchParams({ CallSid: `BAD${stamp}`, RecordingUrl: 'file:///etc/passwd' }).toString());
check('a non-http recording URL is refused (SSRF guard)', !!(await until(() => one("SELECT 1 FROM ingest_events WHERE source_id = $1 AND external_call_id = $2 AND status = 'failed' AND detail LIKE '%https%'", [src.id, `BAD${stamp}`]))));
r = await ingest(new URLSearchParams({ CallSid: `AUTH${stamp}`, RecordingUrl: `${MOCK}/rec/private.mp3`, DialWhomNumber: '201', CallFrom: '09811111111' }).toString());
check('a recording host needing credentials fails clearly without them', !!(await until(() => one("SELECT 1 FROM ingest_events WHERE source_id = $1 AND external_call_id = $2 AND status = 'failed' AND detail LIKE '%401%'", [src.id, `AUTH${stamp}`]))));
const fd = new FormData(); fd.append('call_id', `MP${stamp}`); fd.append('agent', '201'); fd.append('customer_number', '9822222222'); fd.append('recording', new Blob([mp3], { type: 'audio/mpeg' }), 'rec.mp3');
const gen = await one("INSERT INTO call_sources (org_id, provider, name, token_hash, field_map) VALUES ($1,'generic',$2,$3,'{}') RETURNING id", [org, `Generic test ${stamp}`, sha(token + 'g')]);
r = await fetch(`${BASE}/api/ingest/${gen.id}`, { method: 'POST', headers: { authorization: `Bearer ${token}g` }, body: fd });
check('generic source: multipart with the recording file (Bearer token) is ingested', r.status === 202 && !!(await until(() => one("SELECT call_id FROM ingest_events WHERE source_id = $1 AND external_call_id = $2 AND call_id IS NOT NULL", [gen.id, `MP${stamp}`]))));
r = await get('/sources', admin); check('Dialer integration page opens for an admin', r.status === 200);
r = await get('/sources', dipti); check('…and is denied to an agent', (r.headers.get('location') || '').includes('/denied'));

// ── clean up ──
await browser.close(); mock.close();
await db.query('DELETE FROM training_assignments WHERE id = $1', [asg.id]);
await db.query("DELETE FROM notifications WHERE title LIKE $1", [`%Lock test ${stamp}%`]);
for (const s of [src.id, gen.id]) { const ids = (await db.query('SELECT call_id FROM ingest_events WHERE source_id = $1 AND call_id IS NOT NULL', [s])).rows.map((x) => x.call_id); await db.query('DELETE FROM call_sources WHERE id = $1', [s]); if (ids.length) await db.query('DELETE FROM calls WHERE id = ANY($1::uuid[])', [ids]); }
await db.query("DELETE FROM agents WHERE org_id = $1 AND agent_code = '999'", [org]);
await db.query("UPDATE agents SET dialer_ids = '{}' WHERE org_id = $1 AND agent_code = '1034'", [org]);
await db.query("DELETE FROM crm_connections WHERE org_id = $1 AND provider = 'zoho'", [org]);
await db.query("UPDATE customers SET zoho_id = NULL, zoho_module = NULL WHERE org_id = $1", [org]);
await db.query("DELETE FROM customers WHERE org_id = $1 AND crm_source = 'zoho' AND mobile_number = '9011122333'", [org]);
await db.end();
const failed = results.filter((x) => !x.ok).length;
writeFileSync(join(ROOT, '..', 'evidence', 'test-v21.json'), JSON.stringify({ when: new Date().toISOString(), passed: results.length - failed, failed, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
