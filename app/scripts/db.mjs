// scripts/db.mjs — create · migrate · seed · reset for the V2 database. Never touches the V1 project or its Supabase.
//   node scripts/db.mjs create    create the database named in MIGRATE_DATABASE_URL (local)
//   node scripts/db.mjs migrate   schema.sql + rls.sql + the cas_app role and its grants (safe to run twice)
//   node scripts/db.mjs seed      invented demo organisations — refuses a database whose name does not end in _dev / _demo
//   node scripts/db.mjs reset     drop + create + migrate + seed (dev only)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { hash } from '@node-rs/argon2';
import { DEFAULT_ROLES, templateRules, defaultConfig, INDUSTRIES, KPI_DEFS, SOP_DEFS } from '../src/lib/catalog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// load app/.env without a dependency (KEY=value lines)
if (existsSync(join(ROOT, '.env'))) {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const ownerUrl = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!ownerUrl) { console.error('Set MIGRATE_DATABASE_URL (or DATABASE_URL) in app/.env'); process.exit(1); }
const dbName = decodeURIComponent(new URL(ownerUrl).pathname.slice(1));
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const pepper = () => (process.env.AUTH_PEPPER ? Buffer.from(process.env.AUTH_PEPPER) : undefined);
const hashPw = (pw) => hash(pw, { ...ARGON, secret: pepper() });

async function withClient(url, fn) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
const adminUrl = () => { const u = new URL(ownerUrl); u.pathname = '/postgres'; return u.toString(); };

async function create() {
  await withClient(adminUrl(), async (c) => {
    const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (r.rowCount) { console.log(`database ${dbName} already exists`); return; }
    await c.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
    console.log(`created database ${dbName}`);
  });
}

async function migrate() {
  await withClient(ownerUrl, async (c) => {
    await c.query(readFileSync(join(ROOT, 'db', 'schema.sql'), 'utf8'));
    await c.query(readFileSync(join(ROOT, 'db', 'rls.sql'), 'utf8'));
    console.log('schema.sql + rls.sql applied');
    const role = process.env.APP_DB_ROLE;
    if (!role) { console.log('APP_DB_ROLE unset — the app connects as the owner (RLS still applies: FORCE).'); return; }
    if (!/^[a-z_][a-z0-9_]{1,40}$/.test(role)) throw new Error('APP_DB_ROLE is not a valid identifier');
    try {
      const exists = (await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount;
      const pw = (process.env.APP_DB_PASSWORD || '').replace(/'/g, "''");
      if (!exists) await c.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${pw}'`);
      else await c.query(`ALTER ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${pw}'`);
      await c.query(`GRANT CONNECT ON DATABASE "${dbName.replace(/"/g, '')}" TO ${role}`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
      await c.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
      await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
      console.log(`role ${role}: login, no superuser, no BYPASSRLS — DML grants applied`);
    } catch (e) {
      console.warn(`could not create/grant role ${role} (${e.message}). Known-broken: the app must then connect as the owner.`);
    }
  });
}

// ── seed ────────────────────────────────────────────────────────────────────────────────────────────────────────────
let seed = 20261030;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

const TRANSCRIPTS = {
  good: (agent, brand, topic) => [
    `Speaker 1: Good morning, this is ${agent} from ${brand}. How may I assist you today?`,
    `Speaker 2: Hi, I wanted to check about my ${topic}. My registered number is 9876543210.`,
    `Speaker 1: Sure, may I have your PAN to verify? `,
    `Speaker 2: Yes, it is ABCDE1234F.`,
    `Speaker 1: Thank you. I can see your account. Your ${topic} request is processed and will reflect in two working days.`,
    `Speaker 2: Okay, that is helpful, thank you.`,
    `Speaker 1: Is there anything else I can help you with?`,
    `Speaker 2: No, that's all.`,
    `Speaker 1: Thank you for calling ${brand}. I will transfer you to a short feedback IVR. Have a great day.`,
  ].join('\n'),
  weak: (agent, brand, topic) => [
    `Speaker 1: Hello.`,
    `Speaker 2: Hello, I have an issue with ${topic}, it is not working since last week.`,
    `Speaker 1: Haan, what is the account number?`,
    `Speaker 2: Account number 445566778899. Why is this taking so long?`,
    `Speaker 1: Please hold.`,
    `Speaker 2: Hello? Are you there?`,
    `Speaker 1: Yes, the system is slow. You will have to call again tomorrow.`,
    `Speaker 2: This is the third time I am calling. I am not happy with this service.`,
    `Speaker 1: Okay.`,
  ].join('\n'),
};

function kpiResults(q, resolved, fcr, csat, sentiment, agentSent, intent, cls, ivr) {
  const v = {
    1: resolved, 2: fcr, 3: q >= 4 ? 'Efficient' : q === 3 ? 'Acceptable' : 'Inefficient', 4: 'No', 5: csat, 6: String(q),
    7: chance(0.8) ? 'Compliant' : 'NA', 8: ivr, 9: q >= 4 ? 'Full' : q === 3 ? 'Partial' : 'None', 10: q <= 2 && chance(0.4) ? 'Yes' : 'No',
    11: intent, 12: 'Requires Telephony Data', 13: 'Requires CRM Data', 14: chance(0.3) ? 'Yes' : 'No', 15: sentiment,
  };
  return KPI_DEFS.map((k) => {
    const row = { kpi_id: k.id, name: k.name, value: v[k.id], note: `${k.name}: ${v[k.id]}` };
    if (k.id === 11) row.call_classification = cls;
    if (k.id === 15) { row.customer_sentiment = sentiment; row.agent_sentiment = agentSent; }
    return row;
  });
}
function sopResults(q, hadHold) {
  return SOP_DEFS.map((s, i) => {
    const id = i + 1;
    let result = 'Pass';
    if ((id === 3 || id === 4) && !hadHold) result = 'NA';
    else if (q <= 2 && [1, 5, 6].includes(id)) result = 'Fail';
    else if (q === 3 && [5, 6].includes(id) && chance(0.6)) result = 'Fail';
    else if (q >= 4 && id === 6 && chance(0.2)) result = 'Fail';
    return { sop_id: id, name: s.title, result, note: result === 'Fail' ? `${s.title} was missed.` : result === 'NA' ? s.na_rule : `${s.title} followed.` };
  });
}

async function seedDemo() {
  if (!/_(dev|demo)$/.test(dbName) && !process.argv.includes('--demo-db')) {
    console.error(`Refusing to seed "${dbName}": demo data goes only into a database named *_dev or *_demo.`); process.exit(1);
  }
  const password = process.env.SEED_PASSWORD || `Demo-${randomBytes(6).toString('base64url')}`;
  const pwHash = await hashPw(password);
  const logins = [];

  await withClient(ownerUrl, async (c) => {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.platform', 'on', true)");
    await c.query("DELETE FROM organizations WHERE slug IN ('sahyog-wealth', 'nirmal-care', 'pucho-platform')");

    async function makeOrg({ name, slug, industry, city, email, phone, website, description }) {
      const org = (await c.query(
        `INSERT INTO organizations (name, slug, industry, city, email, phone, website, description, config)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [name, slug, industry, city, email, phone, website, description, defaultConfig(industry)])).rows[0].id;
      const roles = {};
      for (const r of DEFAULT_ROLES) {
        roles[r.key] = (await c.query('INSERT INTO roles (org_id, key, name, description, scope, is_system, permissions) VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id',
          [org, r.key, r.name, r.description, r.scope, r.permissions])).rows[0].id;
      }
      for (const r of templateRules(industry)) {
        await c.query(`INSERT INTO sop_rules (org_id, kind, code, title, description, na_rule, pass_criteria, severity, weight, sort_order, source)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'template')`, [org, r.kind, r.code, r.title, r.description, r.na_rule || null, r.pass_criteria || null, r.severity, r.weight, r.sort_order]);
      }
      for (const cp of INDUSTRIES[industry].campaigns) {
        await c.query('INSERT INTO campaigns (org_id, name, full_name, direction, core_topics, greeting_standard) VALUES ($1,$2,$3,$4,$5,$6)',
          [org, cp.name, cp.full_name, cp.direction, cp.core_topics, `"Good morning/afternoon, this is [Name] from ${name}. How may I assist you?"`]);
      }
      return { org, roles };
    }
    async function makeUser(org, roles, roleKey, name, email, extra = {}) {
      const id = (await c.query('INSERT INTO users (org_id, email, name, password_hash, role_id, reports_to, group_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [org, email, name, pwHash, roles[roleKey], extra.reportsTo || null, extra.groupId || null])).rows[0].id;
      logins.push({ org: extra.orgName, role: roleKey, email });
      return id;
    }

    // ── org A: an invented wealth-advisory firm (BFSI) with a full month of analysed calls ──
    const A = await makeOrg({ name: 'Sahyog Wealth Advisors', slug: 'sahyog-wealth', industry: 'bfsi', city: 'Ahmedabad', email: 'support@sahyog.demo',
      phone: '+91 79 4000 1200', website: 'https://sahyog.demo', description: 'Mutual fund distribution and advisory for retail investors across Gujarat.' });
    const aAdmin = await makeUser(A.org, A.roles, 'admin', 'Nikhil Desai', 'admin@sahyog.demo', { orgName: 'Sahyog Wealth Advisors' });
    const gWest = (await c.query("INSERT INTO groups (org_id, name, description) VALUES ($1,'Support West','Inbound support, Ahmedabad') RETURNING id", [A.org])).rows[0].id;
    const gOut = (await c.query("INSERT INTO groups (org_id, name, description) VALUES ($1,'Outreach','Renewals and advisory calling') RETURNING id", [A.org])).rows[0].id;
    const tl1 = await makeUser(A.org, A.roles, 'team_leader', 'Meera Iyer', 'meera.iyer@sahyog.demo', { reportsTo: aAdmin, groupId: gWest, orgName: 'Sahyog Wealth Advisors' });
    const tl2 = await makeUser(A.org, A.roles, 'team_leader', 'Rohit Bansal', 'rohit.bansal@sahyog.demo', { reportsTo: aAdmin, groupId: gOut, orgName: 'Sahyog Wealth Advisors' });
    await c.query('UPDATE groups SET lead_ids = $2 WHERE id = $1', [gWest, [tl1]]);
    await c.query('UPDATE groups SET lead_ids = $2 WHERE id = $1', [gOut, [tl2]]);
    const agentsA = [
      { code: '1011', name: 'Dipti Shah', group: gWest, sup: tl1, user: true, email: 'dipti.shah@sahyog.demo' },
      { code: '1018', name: 'Anurag Mehta', group: gWest, sup: tl1, user: true, email: 'anurag.mehta@sahyog.demo' },
      { code: '1028', name: 'Darshana Patel', group: gWest, sup: tl1 },
      { code: '1034', name: 'Kunal Joshi', group: gOut, sup: tl2 },
      { code: '1050', name: 'Hiral Trivedi', group: gOut, sup: tl2 },
      { code: '1006', name: 'Sameer Khan', group: gOut, sup: tl2 },
    ];
    for (const a of agentsA) {
      const uid = a.user ? await makeUser(A.org, A.roles, 'executive', a.name, a.email, { reportsTo: a.sup, groupId: a.group, orgName: 'Sahyog Wealth Advisors' }) : null;
      await c.query('INSERT INTO agents (org_id, agent_code, agent_name, email, user_id, group_id, supervisor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [A.org, a.code, a.name, a.email || null, uid, a.group, a.sup]);
    }
    // a skill gap per agent so the training module has something real to show
    const quality = { '1011': [4, 5, 4, 4, 5], '1018': [3, 4, 3, 2, 4], '1028': [4, 4, 5, 3, 4], '1034': [2, 3, 2, 3, 3], '1050': [5, 4, 4, 5, 4], '1006': [3, 3, 4, 2, 3] };
    const camps = INDUSTRIES.bfsi.campaigns;
    const mobiles = Array.from({ length: 26 }, (_, i) => `9${String(812300000 + i * 7919).padStart(9, '0')}`);
    const custNames = ['Rakesh Parmar', 'Jignesh Modi', 'Pooja Rana', 'Farhan Shaikh', 'Komal Vyas', 'Bhavesh Thakkar', 'Neha Agarwal', 'Vikram Solanki', 'Ayesha Mirza', 'Hardik Panchal', 'Sneha Kulkarni', 'Manish Chauhan', 'Ritu Saxena'];
    const custIds = {};
    for (let i = 0; i < mobiles.length; i++) {
      custIds[mobiles[i]] = (await c.query('INSERT INTO customers (org_id, mobile_number, name, city, segment) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [A.org, mobiles[i], custNames[i] || null, pick(['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Mumbai']), pick(['Retail', 'HNI', 'Partner', 'Retail'])])).rows[0].id;
    }
    const today = new Date(); today.setHours(10, 0, 0, 0);
    let n = 0; const callRows = [];
    for (let day = 34; day >= 0; day--) {
      const perDay = day % 7 === 0 ? 0 : 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < perDay; k++) {
        n++;
        const a = pick(agentsA); const camp = a.group === gOut ? pick(camps.slice(3)) : pick(camps.slice(0, 3));
        const q = quality[a.code][n % 5];
        const dt = new Date(today.getTime() - day * 86400000 + (9 + Math.floor(rnd() * 8)) * 3600000 + Math.floor(rnd() * 59) * 60000);
        const ymd = dt.toISOString().slice(0, 10).replace(/-/g, '');
        const hms = dt.toISOString().slice(11, 19).replace(/:/g, '');
        const mobile = pick(mobiles);
        const filename = `${ymd}-${hms}_${mobile}_${a.code}_${camp.name}-all.mp3`;
        const intents = camp.direction === 'Outbound' ? INDUSTRIES.bfsi.outbound_intents : INDUSTRIES.bfsi.inbound_intents;
        const intent = q <= 2 && chance(0.5) ? 'Complaint' : pick(intents.slice(0, 16));
        const cls = intent === 'Complaint' ? 'complaint' : chance(0.55) ? 'intent' : 'query';
        const resolved = q >= 4 ? 'Yes' : q === 3 ? pick(['Partial', 'Yes']) : 'No';
        const fcr = resolved === 'Yes' && chance(0.85) ? 'Yes' : 'No';
        const sentiment = q >= 4 ? pick(['Positive', 'Positive', 'Neutral']) : q === 3 ? pick(['Neutral', 'Positive', 'Negative']) : pick(['Negative', 'Negative', 'Neutral']);
        const agentSent = q <= 2 && chance(0.4) ? 'Unprofessional' : q === 3 ? pick(['Professional', 'Neutral']) : 'Professional';
        const csat = sentiment === 'Positive' ? 'High' : sentiment === 'Negative' ? 'Low' : 'Medium';
        const ivr = q >= 4 ? pick(['Yes', 'Yes', 'No']) : pick(['No', 'NA', 'Customer Refused']);
        const ztp = q === 2 && chance(0.25) ? 'Yes' : 'No';
        const compliance = ztp === 'Yes' ? 'High' : q <= 2 ? pick(['High', 'Medium']) : q === 3 ? pick(['Low', 'Medium']) : 'Low';
        const churn = sentiment === 'Negative' ? pick(['High', 'Medium']) : 'Low';
        const priority = ztp === 'Yes' || q <= 2 ? 'Red' : q === 3 ? 'Amber' : 'Green';
        const hadHold = chance(0.35);
        const sops = sopResults(q, hadHold);
        const sopScore = sops.filter((s) => s.result !== 'Fail').length;
        const secs = 90 + Math.floor(rnd() * 420);
        const lang = pick(['Hindi/English', 'Gujarati', 'English', 'Hindi', 'Gujarati/English']);
        const transcript = (q >= 4 ? TRANSCRIPTS.good : TRANSCRIPTS.weak)(a.name.split(' ')[0], 'Sahyog Wealth', intent.toLowerCase());
        const improvement = q >= 4 ? '- Offer the feedback IVR on every resolved call' : '- Use the full greeting with name and company\n- Ask permission before placing the customer on hold\n- Confirm resolution and close with "anything else?"';
        callRows.push([A.org, filename.split('_')[0].split('-')[1] + String(n), filename, dt.toISOString().slice(0, 10), a.code, a.name, mobile, custIds[mobile], camp.name, 'all',
          camp.direction, `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, secs, 'processed',
          sopScore, q * 20, q, sentiment, agentSent,
          q >= 4 ? `Customer called about ${intent}. ${a.name.split(' ')[0]} verified identity, resolved the request and offered feedback.` : `Customer raised ${intent}. The agent did not follow the greeting and closing script and the issue was left ${resolved === 'No' ? 'unresolved' : 'partly resolved'}.`,
          transcript, JSON.stringify(sops), JSON.stringify(kpiResults(q, resolved, fcr, csat, sentiment, agentSent, intent, cls, ivr)),
          JSON.stringify({ campaign: camp.name, coaching_flag: 'all', status: resolved === 'Yes' ? 'Resolved' : resolved === 'No' ? 'Escalated' : 'Open', fcr: fcr === 'Yes', empathy_score: Math.max(1, Math.min(5, q + (chance(0.3) ? -1 : 0))), customer_type: camp.name === 'PARTNER' ? 'Partner' : 'Retail', kpi11_intent_detail: `${intent} request regarding the customer's account`, call_validity_tier: 5, ivr_rating: ivr === 'Yes' ? (sentiment === 'Positive' ? 'Extremely Satisfied' : 'Satisfied') : null }),
          compliance, churn, cls, intent, camp.core_topics[0], `${intent} — ${pick(['status check', 'process query', 'document request', 'timeline query'])}`, lang,
          improvement, q >= 4 ? 'Keep the closing script consistent.' : 'Role-play the greeting and hold etiquette; review the closing checklist.',
          q >= 4 ? 'Well-handled call.' : 'Coach on greeting, hold permission and closing.', priority, ztp, 5,
          ztp === 'Yes' ? 'Yes' : 'No', q >= 3 ? 'Yes' : 'No', q >= 3 ? 'Yes' : 'No', 'Mutual Funds', dt.toISOString()]);
      }
    }
    for (const r of callRows) {
      await c.query(`INSERT INTO calls (org_id, call_id, filename, call_date, agent_code, agent_name, mobile_number, customer_id, campaign, coaching_flag,
          direction, duration, duration_seconds, status, sop_score, kpi_score, quality_score, sentiment, agent_sentiment, call_summary,
          cleaned_transcript, sop_results, kpi_results, intelligence, compliance_risk, churn_risk, call_classification, call_intent, call_topic, call_sub_topic,
          language, improvement_areas, recommendations, coaching_summary_note, coaching_priority, ztp_violation, call_validity_tier,
          bfsi_false_guarantee_flag, bfsi_risk_disclaimer_spoken, bfsi_identity_verified, bfsi_product_category, processed_at, created_at)
        VALUES (${r.map((_, i) => `$${i + 1}`).join(',')}, $${r.length})`, r);
    }
    await c.query(`UPDATE customers cu SET first_call_at = x.f, last_call_at = x.l FROM (SELECT customer_id, min(created_at) f, max(created_at) l FROM calls GROUP BY customer_id) x WHERE x.customer_id = cu.id`);
    // one recording waiting for the flow, as a fresh upload would be
    await c.query(`INSERT INTO calls (org_id, call_id, filename, call_date, agent_code, agent_name, mobile_number, campaign, direction, status, status_reason)
                   VALUES ($1, '093300', $2, current_date, '1018', 'Anurag Mehta', '9987660170', 'SUPPORT', 'Inbound', 'queued', 'Call-processing flow is not connected (WEBHOOK_CALL_PROCESSING is empty).')`,
      [A.org, `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-093300_9987660170_1018_SUPPORT-all.mp3`]);

    const someCalls = (await c.query("SELECT id, agent_code FROM calls WHERE org_id = $1 AND coaching_priority = 'Red' ORDER BY created_at DESC LIMIT 3", [A.org])).rows;
    for (const sc of someCalls) {
      await c.query("INSERT INTO coaching_notes (org_id, call_id, agent_code, note_text, note_type, created_by, created_by_name) VALUES ($1,$2,$3,$4,'Manager',$5,'Meera Iyer')",
        [A.org, sc.id, sc.agent_code, 'Discussed the greeting and hold etiquette in a 1:1. Re-check next week.', tl1]);
    }
    const mods = [
      ['Opening & greeting standard', 'Greeting', 'Structured greeting: salutation, name, company, offer of help.', 15],
      ['Hold etiquette', 'Hold Permission', 'Ask before a hold, refresh every minute, thank the customer.', 10],
      ['Closing & feedback IVR', 'Closing Script', '"Anything else?" and the IVR transfer on every resolved call.', 10],
      ['SEBI-compliant language', 'Compliance', 'No guaranteed returns; the market-risk disclaimer; PII handling.', 20],
    ];
    const modIds = [];
    for (const m of mods) modIds.push((await c.query('INSERT INTO training_modules (org_id, title, topic, description, duration_min, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [A.org, m[0], m[1], m[2], m[3], aAdmin])).rows[0].id);
    await c.query("INSERT INTO training_assignments (org_id, agent_code, module_id, title, gap, assigned_by, due_date, status) VALUES ($1,'1034',$2,'Opening & greeting standard','Professional Greeting failed on 4 calls',$3, current_date + 7, 'Assigned')", [A.org, modIds[0], tl2]);
    await c.query("INSERT INTO training_assignments (org_id, agent_code, module_id, title, gap, assigned_by, due_date, status) VALUES ($1,'1018',$2,'Closing & feedback IVR','Closing Script failed on 3 calls',$3, current_date + 5, 'In Progress')", [A.org, modIds[2], tl1]);
    await c.query("INSERT INTO notifications (org_id, user_id, kind, title, body, link) VALUES ($1,$2,'coaching','Red coaching flag — Kunal Joshi','A call scored 2/5 with a missed greeting and closing.','/agents/1034')", [A.org, tl2]);

    // ── org B: an invented clinic chain (healthcare) — exists to prove isolation ──
    const B = await makeOrg({ name: 'Nirmal Care Clinics', slug: 'nirmal-care', industry: 'healthcare', city: 'Pune', email: 'desk@nirmal.demo',
      phone: '+91 20 6600 3300', website: 'https://nirmal.demo', description: 'Multi-speciality outpatient clinics.' });
    await makeUser(B.org, B.roles, 'admin', 'Aditi Kulkarni', 'admin@nirmal.demo', { orgName: 'Nirmal Care Clinics' });
    await c.query("INSERT INTO agents (org_id, agent_code, agent_name) VALUES ($1,'2001','Sana Pathan'), ($1,'2002','Tejas More')", [B.org]);
    for (let i = 0; i < 8; i++) {
      const code = i % 2 ? '2001' : '2002'; const q = 3 + (i % 3 === 0 ? 1 : 0);
      const d = new Date(today.getTime() - i * 86400000);
      await c.query(`INSERT INTO calls (org_id, call_id, filename, call_date, agent_code, agent_name, mobile_number, campaign, direction, status, quality_score, kpi_score, sop_score, sentiment,
                       call_classification, call_intent, call_topic, compliance_risk, churn_risk, coaching_priority, ztp_violation, call_summary, kpi_results, sop_results, intelligence, processed_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,'APPOINTMENTS','Inbound','processed',$8,$9,6,'Neutral','query','Appointment Booking','Appointment Booking','Low','Low',$10,'No',
                       'Patient booked a follow-up appointment.', $11, $12, '{"campaign":"APPOINTMENTS","status":"Resolved"}', now())`,
        [B.org, `NC${i}`, `${d.toISOString().slice(0, 10).replace(/-/g, '')}-1000${i}_90000000${i}0_${code}_APPOINTMENTS-all.mp3`, d.toISOString().slice(0, 10), code,
         code === '2001' ? 'Sana Pathan' : 'Tejas More', `90000000${i}0`, q, q * 20, q >= 4 ? 'Green' : 'Amber',
         JSON.stringify(kpiResults(q, 'Yes', 'Yes', 'Medium', 'Neutral', 'Professional', 'Appointment Booking', 'query', 'No')), JSON.stringify(sopResults(q, false))]);
    }

    // ── the platform console's own organisation ──
    const P = await makeOrg({ name: 'Pucho Platform', slug: 'pucho-platform', industry: 'generic', city: 'Ahmedabad', email: 'platform@pucho.ai' });
    await makeUser(P.org, P.roles, 'admin', 'Pucho Platform Admin', 'platform@pucho.ai', { orgName: 'Pucho Platform' });

    await c.query('COMMIT');
    console.log(`seeded: Sahyog Wealth Advisors (${callRows.length + 1} calls), Nirmal Care Clinics (8 calls), Pucho Platform`);
  });

  const file = join(ROOT, 'db', 'seed-logins.local.md');
  writeFileSync(file, `# Demo sign-ins (local dev database only — never commit, never use on a client database)\n\nPassword for every demo account: \`${password}\`\n\n${logins.map((l) => `- ${l.org} · ${l.role} · ${l.email}`).join('\n')}\n`);
  console.log(`demo sign-ins written to db/seed-logins.local.md (gitignored)`);
}

async function reset() {
  if (!/_(dev|demo)$/.test(dbName)) { console.error('reset is for *_dev / *_demo databases only'); process.exit(1); }
  await withClient(adminUrl(), async (c) => {
    await c.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [dbName]);
    await c.query(`DROP DATABASE IF EXISTS "${dbName.replace(/"/g, '')}"`);
  });
  await create(); await migrate(); await seedDemo();
}

const cmd = process.argv[2];
const run = { create, migrate, seed: seedDemo, reset }[cmd];
if (!run) { console.error('usage: node scripts/db.mjs create|migrate|seed|reset'); process.exit(1); }
run().catch((e) => { console.error(e); process.exit(1); });
