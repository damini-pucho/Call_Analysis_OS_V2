// scripts/test-signup.mjs — a new organisation signs up through the real form, lands in its own empty workspace with its
// industry template, sees none of the other organisations' data, signs out and back in. The test org is removed afterwards.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const l of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const BASE = process.argv[2] || 'http://127.0.0.1:3200';
const slug = `test-org-${Date.now().toString(36)}`; const email = `owner@${slug}.test`; const pw = `Signup-${Date.now()}x9`;
const results = []; const check = (n, ok, d = '') => { results.push({ name: n, ok: !!ok, detail: d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`); };

const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('#orgName', 'Test Clinic Org'); await page.fill('#slug', slug); await page.selectOption('#industry', 'healthcare');
await page.fill('#name', 'Test Owner'); await page.fill('#email', email); await page.fill('#password', pw); await page.check('input[type=checkbox]');
await page.click('button[type=submit]'); await page.waitForURL(/\/company/, { timeout: 60000 }).catch(() => {});
check('sign-up lands on the new Company Profile', page.url().includes('/company'), page.url());
check('welcome banner names the new organisation', await page.getByText('Welcome to Test Clinic Org').isVisible().catch(() => false));
await page.goto(`${BASE}/calls`, { waitUntil: 'networkidle' });
const txt = await page.innerText('main');
check('new workspace has no calls and none of the demo orgs’ agents', txt.includes('No calls yet') && !txt.includes('Kunal Joshi') && !txt.includes('Sana Pathan'));
await page.goto(`${BASE}/company?tab=rules`, { waitUntil: 'networkidle' });
check('healthcare template rules were created', (await page.innerText('main')).includes('Professional Greeting'));
// sign out, sign back in
await page.goto(`${BASE}/overview`, { waitUntil: 'networkidle' }); console.log('menu buttons', await page.locator('button[aria-haspopup=menu]').count(), page.url()); await page.locator('button[aria-haspopup=menu]').first().click(); await page.waitForTimeout(500); await page.screenshot({ path: '../evidence/signout-debug.png' }); await page.getByRole('menuitem', { name: 'Sign out' }).click(); await page.waitForURL(/\/login/);
await page.fill('#email', email); await page.fill('#password', pw); await page.click('button[type=submit]'); await page.waitForURL(/\/overview/, { timeout: 60000 }).catch(() => {});
check('the new owner can sign out and back in', page.url().includes('/overview'));
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await b.close();

const db = new pg.Client({ connectionString: process.env.MIGRATE_DATABASE_URL }); await db.connect(); await db.query("SELECT set_config('app.platform','on',false)");
const org = (await db.query('SELECT id FROM organizations WHERE slug = $1', [slug])).rows[0];
const roles = org ? (await db.query('SELECT key FROM roles WHERE org_id = $1 ORDER BY key', [org.id])).rows.map((r) => r.key).join(',') : '';
check('the org got its three default roles', roles === 'admin,executive,team_leader', roles);
const hash = org ? (await db.query('SELECT password_hash FROM users WHERE org_id = $1', [org.id])).rows[0]?.password_hash : '';
check('the owner’s password is stored as argon2id', hash?.startsWith('$argon2id$'));
if (org) await db.query('DELETE FROM organizations WHERE id = $1', [org.id]);
await db.query("DELETE FROM rate_limits WHERE key LIKE $1", [`%${slug}%`]);
await db.end();
const failed = results.filter((r) => !r.ok).length;
writeFileSync(join(ROOT, '..', 'evidence', 'test-signup.json'), JSON.stringify({ when: new Date().toISOString(), passed: results.length - failed, failed, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
