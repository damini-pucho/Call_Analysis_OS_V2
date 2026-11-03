// scripts/test-actions.mjs — the main writes, through the real UI (Server Actions), then checked in the database.
//   node scripts/test-actions.mjs [http://127.0.0.1:3200]
// Every row it creates is removed at the end.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const l of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const BASE = process.argv[2] || 'http://127.0.0.1:3200';
const db = new pg.Client({ connectionString: process.env.MIGRATE_DATABASE_URL }); await db.connect(); await db.query("SELECT set_config('app.platform','on',false)");
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const until = async (sql, p, ms = 15000) => { const end = Date.now() + ms; let r; while (Date.now() < end) { r = await one(sql, p); if (r) return r; await new Promise((x) => setTimeout(x, 400)); } return r; };
const results = []; const check = (n, ok, d = '') => { results.push({ name: n, ok: !!ok, detail: d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`); };
const stamp = Date.now().toString(36);
async function login(email) {
  const u = await one('SELECT id, org_id FROM users WHERE lower(email) = $1', [email]); const t = randomBytes(32).toString('base64url');
  await db.query("INSERT INTO sessions (id, user_id, org_id, expires_at) VALUES ($1,$2,$3, now() + interval '1 hour')", [createHash('sha256').update(t).digest('hex'), u.id, u.org_id]);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addCookies([{ name: 'cas-session', value: t, url: BASE }]);
  const page = await ctx.newPage(); page.on('dialog', (d) => d.accept()); return { page, ...u };
}
const browser = await chromium.launch();
const A = await login('admin@sahyog.demo'); const p = A.page;
const toast = async () => (await p.locator('[data-sonner-toast]').last().innerText({ timeout: 15000 }).catch(() => '')).replace(/\s+/g, ' ');

// 1. create a user (email flow not connected → temporary password shown once)
const newEmail = `qa.agent.${stamp}@sahyog.demo`;
await p.goto(`${BASE}/team`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: 'New user' }).click();
const dlg = p.getByRole('dialog');
await dlg.getByLabel('Full name').fill('QA Test Agent'); await dlg.getByLabel('Email').fill(newEmail);
await dlg.getByRole('button', { name: 'Create user' }).click();
const tempShown = await p.getByRole('dialog', { name: 'Temporary password' }).waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
const nu = await until("SELECT u.must_change_password, a.agent_code FROM users u LEFT JOIN agents a ON a.user_id = u.id WHERE lower(u.email) = $1", [newEmail]);
check('admin creates a user; temporary password shown once (email flow not connected)', tempShown && nu?.must_change_password, `agent code ${nu?.agent_code}`);
check('a new executive gets the next free 1xxx agent code', /^1\d{3}$/.test(nu?.agent_code || ''));
if (tempShown) await p.getByRole('button', { name: 'Done' }).click();

// 2. coaching note on a call
const call = await one("SELECT id FROM calls WHERE org_id = $1 AND agent_code = '1034' AND status = 'processed' LIMIT 1", [A.org_id]);
await p.goto(`${BASE}/calls/${call.id}`, { waitUntil: 'networkidle' });
const note = `QA note ${stamp}: practise the closing script.`;
await p.getByPlaceholder('Add a coaching note for this call…').fill(note); await p.getByRole('button', { name: 'Add note' }).click(); await toast();
check('manager adds a coaching note to a call', !!(await until('SELECT 1 FROM coaching_notes WHERE call_id = $1 AND note_text = $2', [call.id, note])));
// tag
await p.getByRole('button', { name: 'Add tag' }).click(); await p.getByPlaceholder('New tag').fill(`qa-${stamp}`); await p.getByRole('button', { name: 'Add', exact: true }).click(); await toast();
check('manager tags a call', !!(await until('SELECT 1 FROM calls WHERE id = $1 AND $2 = ANY(tags)', [call.id, `qa-${stamp}`])));

// 3. assign training from a knowledge gap on the agent page → the agent is notified
await p.goto(`${BASE}/agents/1018`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: 'Assign training' }).first().click();
const ad = p.getByRole('dialog', { name: 'Assign training' });
await ad.getByLabel('Title').fill(`QA training ${stamp}`); await ad.getByRole('button', { name: 'Assign' }).click(); await toast();
const asg = await until('SELECT id FROM training_assignments WHERE org_id = $1 AND title = $2', [A.org_id, `QA training ${stamp}`]);
const notif = await one("SELECT n.email_status FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = 'anurag.mehta@sahyog.demo' AND n.title = $1", [`New training: QA training ${stamp}`]);
check('training assigned to an agent', !!asg);
check('the agent gets an in-app notification (email marked not connected)', notif?.email_status === 'not_connected', notif?.email_status);

// 4. (v2.1) the agent cannot complete it; the assigning manager reviews and marks it Done → the agent is told
const E = await login('anurag.mehta@sahyog.demo');
await E.page.goto(`${BASE}/training`, { waitUntil: 'networkidle' });
await E.page.getByRole('row', { name: new RegExp(`QA training ${stamp}`) }).getByRole('button', { name: 'Update' }).click();
const agentOpts = await E.page.getByRole('dialog').getByLabel('Status').locator('option').allInnerTexts();
check('the agent cannot mark training completed themselves', !agentOpts.includes('Completed'), agentOpts.join(','));
await p.goto(`${BASE}/training`, { waitUntil: 'networkidle' }); await p.getByRole('tab', { name: /Assignments/ }).click();
await p.getByRole('row', { name: new RegExp(`QA training ${stamp}`) }).getByRole('button', { name: 'Done' }).click();
await p.getByRole('dialog').getByRole('button', { name: 'Mark Done' }).click();
check('the manager marks the training Done', (await until("SELECT status FROM training_assignments WHERE id = $1 AND status = 'Completed'", [asg?.id]))?.status === 'Completed');
check('the agent is notified it is done', !!(await until("SELECT 1 FROM notifications WHERE user_id = (SELECT id FROM users WHERE email = 'anurag.mehta@sahyog.demo') AND title = $1", [`Training done: QA training ${stamp}`])));

// 5. company profile: add a scoring rule, upload an SOP (stored; extraction flow not connected)
await p.goto(`${BASE}/company?tab=rules`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: 'Add rule' }).click();
const rd = p.getByRole('dialog'); await rd.getByLabel('Title').fill(`QA rule ${stamp}`); await rd.getByLabel('Rule — what the agent must do').fill('Confirm the callback number.');
await rd.getByRole('button', { name: 'Save rule' }).click(); await toast();
check('admin adds a scoring rule', !!(await one("SELECT 1 FROM sop_rules WHERE org_id = $1 AND title = $2 AND source = 'manual'", [A.org_id, `QA rule ${stamp}`])));
await p.goto(`${BASE}/company?tab=documents`, { waitUntil: 'networkidle' });
await p.getByPlaceholder('e.g. Inbound call handling SOP v3').fill(`QA SOP ${stamp}`);
await p.locator('input[type=file]').setInputFiles({ name: 'qa-sop.txt', mimeType: 'text/plain', buffer: Buffer.from('SOP: Always confirm the callback number before closing.') });
await p.getByRole('button', { name: 'Upload', exact: true }).click(); await toast();
const docRow = await one('SELECT status, status_reason FROM company_documents WHERE org_id = $1 AND title = $2', [A.org_id, `QA SOP ${stamp}`]);
check('SOP upload is stored and honestly marked not extracted', docRow?.status === 'uploaded' && /not connected/i.test(docRow?.status_reason || ''), docRow?.status_reason);

// 6. CRM connection: secret + token shown once, stored hashed / encrypted
await p.goto(`${BASE}/crm`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: 'New connection' }).click();
await p.getByRole('dialog').getByLabel('Name').fill(`QA CRM ${stamp}`); await p.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
const shown = await p.getByRole('dialog', { name: 'Copy these now' }).waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
const cc = await until('SELECT secret_enc, inbound_token_hash FROM crm_connections WHERE org_id = $1 AND name = $2', [A.org_id, `QA CRM ${stamp}`]);
check('CRM connection shows its secret once; stored encrypted / hashed', shown && cc?.secret_enc?.startsWith('v1:') && /^[0-9a-f]{64}$/.test(cc?.inbound_token_hash || ''));

// 7. roles: switching a permission off is enforced at the next request
const tlRole = await one("SELECT id, permissions FROM roles WHERE org_id = $1 AND key = 'team_leader'", [A.org_id]);
await p.goto(`${BASE}/team`, { waitUntil: 'networkidle' }); await p.getByRole('tab', { name: /Roles & permissions/ }).click();
await p.getByRole('switch', { name: 'Team Leader: View compliance' }).click(); await toast();
const T = await login('meera.iyer@sahyog.demo'); const r = await T.page.goto(`${BASE}/compliance`, { waitUntil: 'networkidle' });
check('removing a permission from a role takes effect immediately', T.page.url().includes('/denied'), T.page.url());
await db.query('UPDATE roles SET permissions = $2 WHERE id = $1', [tlRole.id, tlRole.permissions]);

// 8. a team leader cannot hand out a role above their own
const tlPage = T.page; await tlPage.goto(`${BASE}/team`, { waitUntil: 'networkidle' });
await tlPage.getByRole('button', { name: 'New user' }).click();
const td = tlPage.getByRole('dialog'); await td.getByLabel('Full name').fill('Escalation Try'); await td.getByLabel('Email').fill(`esc.${stamp}@sahyog.demo`);
await td.getByLabel(/^Role/).selectOption({ label: 'Admin' }); await td.getByRole('button', { name: 'Create user' }).click(); await tlPage.waitForTimeout(2500);
check('a team leader cannot create an Admin (no privilege escalation)', !(await one('SELECT 1 FROM users WHERE email = $1', [`esc.${stamp}@sahyog.demo`])));

await browser.close();
// clean up
await db.query('DELETE FROM users WHERE lower(email) = $1', [newEmail]);
await db.query("DELETE FROM agents WHERE org_id = $1 AND user_id IS NULL AND agent_name = 'QA Test Agent'", [A.org_id]);
await db.query('DELETE FROM coaching_notes WHERE note_text = $1', [note]);
await db.query('UPDATE calls SET tags = array_remove(tags, $2) WHERE id = $1', [call.id, `qa-${stamp}`]);
await db.query('DELETE FROM training_assignments WHERE title = $1', [`QA training ${stamp}`]);
await db.query("DELETE FROM notifications WHERE title LIKE $1", [`%QA training ${stamp}%`]);
await db.query('DELETE FROM sop_rules WHERE title = $1', [`QA rule ${stamp}`]);
await db.query('DELETE FROM company_documents WHERE title = $1', [`QA SOP ${stamp}`]);
await db.query('DELETE FROM crm_connections WHERE name = $1', [`QA CRM ${stamp}`]);
await db.end();
const failed = results.filter((x) => !x.ok).length;
writeFileSync(join(ROOT, '..', 'evidence', 'test-actions.json'), JSON.stringify({ when: new Date().toISOString(), passed: results.length - failed, failed, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
