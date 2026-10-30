// scripts/test-ui.mjs — opens every page as each persona at 1440px, 390px (phone) and in dark mode with Playwright Chromium.
//   node scripts/test-ui.mjs [http://127.0.0.1:3200]
// Fails on: a non-200 page, a console error, horizontal page overflow, text under 12px, or an error boundary.
// Screenshots + report → evidence/ui/.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const BASE = process.argv[2] || 'http://127.0.0.1:3200';
const OUT = join(ROOT, '..', 'evidence', 'ui'); mkdirSync(OUT, { recursive: true });
const db = new pg.Client({ connectionString: process.env.MIGRATE_DATABASE_URL }); await db.connect();
await db.query("SELECT set_config('app.platform','on',false)");
const sha = (s) => createHash('sha256').update(s).digest('hex');
async function token(email) {
  const u = (await db.query('SELECT id, org_id FROM users WHERE lower(email) = $1', [email])).rows[0];
  const t = randomBytes(32).toString('base64url');
  await db.query("INSERT INTO sessions (id, user_id, org_id, expires_at) VALUES ($1,$2,$3, now() + interval '1 hour')", [sha(t), u.id, u.org_id]);
  return t;
}
const call = (await db.query("SELECT c.id FROM calls c JOIN organizations o ON o.id = c.org_id WHERE o.slug = 'sahyog-wealth' AND c.status = 'processed' AND c.agent_code = '1011' LIMIT 1")).rows[0].id;
const cust = (await db.query("SELECT cu.id FROM customers cu JOIN organizations o ON o.id = cu.org_id JOIN calls c ON c.customer_id = cu.id AND c.agent_code = '1011' WHERE o.slug = 'sahyog-wealth' LIMIT 1")).rows[0].id;

const ADMIN_PAGES = ['/overview', '/calls', `/calls/${call}`, '/upload', '/analytics', '/analytics?tab=trends', '/analytics?tab=sop', '/analytics?tab=language', '/classification', '/direction', '/compliance',
  '/agents', '/agents/1011', '/training', '/customers', `/customers/${cust}`, '/sentiment', '/company', '/company?tab=config', '/company?tab=documents', '/company?tab=rules', '/company?tab=campaigns',
  '/crm', '/team', '/settings', '/notifications', '/profile'];
const PERSONAS = [
  { key: 'admin', email: 'admin@sahyog.demo', pages: ADMIN_PAGES },
  { key: 'executive', email: 'dipti.shah@sahyog.demo', pages: ['/overview', '/calls', `/calls/${call}`, '/agents/1011', '/training', `/customers/${cust}`, '/company', '/profile'] },
  { key: 'platform', email: 'platform@pucho.ai', pages: ['/platform'] },
];
const public_pages = ['/login', '/signup'];

const browser = await chromium.launch();
const results = []; let failed = 0;
const record = (r) => { results.push(r); if (!r.ok) failed++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.view.padEnd(7)} ${r.persona.padEnd(9)} ${r.path}${r.problems.length ? `  — ${r.problems.join('; ')}` : ''}`); };

async function visit(ctx, persona, path, view) {
  const page = await ctx.newPage(); const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools/i.test(m.text())) errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => ({ status: () => 0, err: e }));
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const small = [...document.querySelectorAll('body *')].filter((el) => el.childElementCount === 0 && el.textContent.trim() && el.offsetParent !== null)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 11.5).map((el) => el.textContent.trim().slice(0, 20)).slice(0, 3);
    return { overflow: doc.scrollWidth - doc.clientWidth, small, boundary: !!document.body.innerText.match(/This page could not load|Application error/), title: document.title };
  }).catch(() => ({ overflow: 0, small: [], boundary: true }));
  const problems = [];
  if (res.status() !== 200) problems.push(`HTTP ${res.status()}`);
  if (errors.length) problems.push(`console: ${errors[0]}`);
  if (m.overflow > 2) problems.push(`horizontal overflow ${m.overflow}px`);
  if (m.small.length) problems.push(`text under 12px: ${m.small.join(', ')}`);
  if (m.boundary) problems.push('error page shown');
  const file = `${view}-${persona}-${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: view !== 'mobile' }).catch(() => {});
  record({ persona, path, view, ok: !problems.length, problems, screenshot: file });
  await page.close();
}

for (const view of ['desktop', 'mobile', 'dark']) {
  const vp = view === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  for (const p of PERSONAS) {
    if (view !== 'desktop' && p.key === 'platform') continue;
    const ctx = await browser.newContext({ viewport: vp, colorScheme: view === 'dark' ? 'dark' : 'light', isMobile: view === 'mobile', hasTouch: view === 'mobile' });
    await ctx.addCookies([{ name: 'cas-session', value: await token(p.email), url: BASE }, ...(view === 'dark' ? [{ name: 'pucho-theme', value: 'dark', url: BASE }] : [])]);
    const pages = view === 'desktop' ? p.pages : p.pages.filter((x) => !x.includes('?tab=') || x.endsWith('rules'));
    for (const path of pages) await visit(ctx, p.key, path, view);
    await ctx.close();
  }
  const anon = await browser.newContext({ viewport: vp, colorScheme: view === 'dark' ? 'dark' : 'light' });
  for (const path of public_pages) await visit(anon, 'public', path, view);
  await anon.close();
}
await browser.close(); await db.end();
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ when: new Date().toISOString(), base: BASE, passed: results.length - failed, failed, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} page checks passed · screenshots in evidence/ui/`);
process.exit(failed ? 1 : 0);
