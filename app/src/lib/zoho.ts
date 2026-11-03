// src/lib/zoho.ts — Zoho CRM for one organisation: OAuth (data-centre aware), token refresh, contact / lead lookup by phone,
// related Deals · Calls · Notes, contact import, and writing each analysed call back as a Note (+ optional Call activity).
// Platform-level app credentials (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET, a "Server-based" client in api-console.zoho.com with
// redirect URI <PUBLIC_APP_URL>/api/crm/zoho/callback); each organisation authorises its own Zoho account.
import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from './db';
import { encrypt, decrypt, publicAppUrl } from './flows';
import { normMobile } from './crm';

const VER = process.env.ZOHO_API_VERSION || 'v8';
export const ZOHO_DCS: Record<string, { label: string; accounts: string }> = {
  in: { label: 'India (zoho.in)', accounts: 'https://accounts.zoho.in' },
  com: { label: 'United States (zoho.com)', accounts: 'https://accounts.zoho.com' },
  eu: { label: 'Europe (zoho.eu)', accounts: 'https://accounts.zoho.eu' },
  au: { label: 'Australia (zoho.com.au)', accounts: 'https://accounts.zoho.com.au' },
  jp: { label: 'Japan (zoho.jp)', accounts: 'https://accounts.zoho.jp' },
  uk: { label: 'United Kingdom (zoho.uk)', accounts: 'https://accounts.zoho.uk' },
  sa: { label: 'Saudi Arabia (zoho.sa)', accounts: 'https://accounts.zoho.sa' },
  ca: { label: 'Canada (zohocloud.ca)', accounts: 'https://accounts.zohocloud.ca' },
};
export const ZOHO_SCOPES = ['ZohoCRM.modules.contacts.READ', 'ZohoCRM.modules.leads.READ', 'ZohoCRM.modules.deals.READ',
  'ZohoCRM.modules.notes.ALL', 'ZohoCRM.modules.calls.ALL', 'ZohoCRM.users.READ', 'ZohoCRM.org.READ'].join(',');

// Test-only override (never honoured in production): point both the accounts and the API host at a local mock.
const testBase = () => (process.env.NODE_ENV !== 'production' && process.env.ZOHO_TEST_BASE ? process.env.ZOHO_TEST_BASE.replace(/\/$/, '') : '');
const ACCOUNTS_OK = /^https:\/\/accounts\.(zoho\.(com|in|eu|com\.au|jp|uk|sa|com\.cn)|zohocloud\.ca)$/;
const API_OK = /^https:\/\/(www\.)?zohoapis\.(com|in|eu|com\.au|jp|uk|sa|com\.cn|ca)$/;
export const accountsAllowed = (u: string) => ACCOUNTS_OK.test(u) || (!!testBase() && u === testBase());
const apiAllowed = (u: string) => API_OK.test(u) || (!!testBase() && u === testBase());

export const zohoConfigured = () => !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
export const redirectUri = () => `${publicAppUrl()}/api/crm/zoho/callback`;
/** Web link to a record: accounts.zoho.in → crm.zoho.in. */
export const recordLink = (accounts: string | null, module: string, id: string) =>
  accounts && !testBase() ? `${accounts.replace('https://accounts.', 'https://crm.')}/crm/tab/${module}/${id}` : null;

// ── OAuth state: HMAC over org, user, nonce, expiry; also held in an HttpOnly cookie and compared on the callback ──────
const stateKey = () => process.env.AUTH_PEPPER || process.env.FILE_LINK_SECRET || '';
export function makeState(orgId: string, userId: string, dc: string) {
  const payload = `${orgId}.${userId}.${dc}.${randomBytes(9).toString('base64url')}.${Math.floor(Date.now() / 1000) + 600}`;
  return `${payload}.${createHmac('sha256', stateKey()).update(payload).digest('base64url')}`;
}
export function readState(state: string) {
  const parts = state.split('.');
  if (parts.length !== 6) return null;
  const payload = parts.slice(0, 5).join('.'); const sig = Buffer.from(parts[5]);
  const want = Buffer.from(createHmac('sha256', stateKey()).update(payload).digest('base64url'));
  if (sig.length !== want.length || !timingSafeEqual(sig, want) || Number(parts[4]) < Date.now() / 1000) return null;
  return { orgId: parts[0], userId: parts[1], dc: parts[2] };
}
export function authorizeUrl(dc: string, state: string) {
  const accounts = testBase() || ZOHO_DCS[dc]?.accounts || ZOHO_DCS.in.accounts;
  const q = new URLSearchParams({ scope: ZOHO_SCOPES, client_id: process.env.ZOHO_CLIENT_ID || '', response_type: 'code', access_type: 'offline', prompt: 'consent', redirect_uri: redirectUri(), state });
  return `${accounts}/oauth/v2/auth?${q}`;
}

type TokenSet = { access_token?: string; refresh_token?: string; api_domain?: string; expires_in?: number; error?: string };
async function tokenCall(accounts: string, params: Record<string, string>): Promise<TokenSet> {
  if (!accountsAllowed(accounts)) throw new Error('Unexpected Zoho accounts server');
  const res = await fetch(`${accounts}/oauth/v2/token`, { method: 'POST', body: new URLSearchParams({ client_id: process.env.ZOHO_CLIENT_ID || '', client_secret: process.env.ZOHO_CLIENT_SECRET || '', ...params }), signal: AbortSignal.timeout(15000) });
  const j = (await res.json().catch(() => ({}))) as TokenSet;
  if (!res.ok || j.error) throw new Error(`Zoho token error: ${j.error || res.status}`);
  return j;
}
export const exchangeCode = (accounts: string, code: string) => tokenCall(accounts, { grant_type: 'authorization_code', code, redirect_uri: redirectUri() });

export type ZohoConn = { id: string; org_id: string; accounts_server: string; api_domain: string; refresh_token_enc: string; access_token_enc: string | null; access_expires_at: string | null; settings: any; is_active: boolean; external_org_id: string | null };
export async function getZoho(db: Db, orgId: string): Promise<ZohoConn | null> {
  return db.one<ZohoConn>("SELECT id, org_id, accounts_server, api_domain, refresh_token_enc, access_token_enc, access_expires_at, settings, is_active, external_org_id FROM crm_connections WHERE org_id = $1 AND provider = 'zoho'", [orgId]);
}

async function accessToken(db: Db, c: ZohoConn, force = false): Promise<string> {
  if (!force && c.access_token_enc && c.access_expires_at && new Date(c.access_expires_at).getTime() > Date.now() + 60_000) return decrypt(c.access_token_enc, `zoho:${c.id}:access`);
  const t = await tokenCall(c.accounts_server, { grant_type: 'refresh_token', refresh_token: decrypt(c.refresh_token_enc, `zoho:${c.id}:refresh`) });
  if (!t.access_token) throw new Error('Zoho did not return an access token');
  const enc = encrypt(t.access_token, `zoho:${c.id}:access`);
  await db.q("UPDATE crm_connections SET access_token_enc = $2, access_expires_at = now() + ($3 || ' seconds')::interval WHERE id = $1", [c.id, enc, String(t.expires_in || 3600)]);
  c.access_token_enc = enc; c.access_expires_at = new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString();
  return t.access_token;
}

/** One CRM API call; refreshes the token once on 401. 204 → null. */
export async function zapi(db: Db, c: ZohoConn, method: string, path: string, body?: unknown): Promise<any> {
  if (!apiAllowed(c.api_domain)) throw new Error('Unexpected Zoho API domain');
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(db, c, attempt === 1);
    const res = await fetch(`${c.api_domain}/crm/${VER}${path}`, { method, headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    if (res.status === 401 && attempt === 0) continue;
    if (res.status === 204) return null;
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Zoho ${method} ${path.split('?')[0]} → HTTP ${res.status}${j?.code ? ` ${j.code}` : ''}${j?.message ? `: ${j.message}` : ''}`);
    return j;
  }
}

/** Link a customer to its Zoho record; fill the customer's name and email from Zoho only where they are empty. */
async function linkCustomer(db: Db, customerId: string, module: string, r: any) {
  const name = r.Full_Name || [r.First_Name, r.Last_Name].filter(Boolean).join(' ') || null;
  await db.q('UPDATE customers SET zoho_id = $2, zoho_module = $3, name = COALESCE(name, $4), email = COALESCE(email, $5), updated_at = now() WHERE id = $1',
    [customerId, String(r.id), module, name, r.Email || null]);
}

const PERSON_FIELDS = 'Full_Name,First_Name,Last_Name,Email,Phone,Mobile,Owner,Lead_Source,Created_Time,Modified_Time';
export async function findByPhone(db: Db, c: ZohoConn, phone: string) {
  const ten = normMobile(phone); if (ten.length < 8) return null;
  for (const module of ['Contacts', 'Leads']) {
    for (const p of [ten, `+91${ten}`]) {
      const fields = module === 'Contacts' ? `${PERSON_FIELDS},Account_Name,Mailing_City` : `${PERSON_FIELDS},Company,Lead_Status,City`;
      const j = await zapi(db, c, 'GET', `/${module}/search?phone=${encodeURIComponent(p)}&fields=${fields}`);
      if (j?.data?.length) return { module, record: j.data[0] };
    }
  }
  return null;
}
export async function getRecord(db: Db, c: ZohoConn, module: string, id: string) {
  const j = await zapi(db, c, 'GET', `/${module}/${encodeURIComponent(id)}`);
  return j?.data?.[0] || null;
}
async function related(db: Db, c: ZohoConn, module: string, id: string, list: string, fields: string) {
  try { const j = await zapi(db, c, 'GET', `/${module}/${encodeURIComponent(id)}/${list}?fields=${fields}&per_page=10`); return { rows: j?.data || [], error: null }; }
  catch (e) { return { rows: [], error: e instanceof Error ? e.message : String(e) }; }
}
/** A contact's calls: Zoho keeps open / scheduled calls in "Calls" and completed ones in "Calls_History" — read both, newest first. */
async function contactCalls(db: Db, c: ZohoConn, module: string, id: string) {
  const fields = 'Subject,Call_Type,Call_Start_Time,Call_Duration,Call_Result';
  const [open, done] = await Promise.all([related(db, c, module, id, 'Calls', fields), related(db, c, module, id, 'Calls_History', fields)]);
  const seen = new Set(); const rows = [...done.rows, ...open.rows].filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a: any, b: any) => String(b.Call_Start_Time || '').localeCompare(String(a.Call_Start_Time || '')));
  return { rows, error: open.error && done.error ? open.error : null };
}
/** Everything the customer profile shows from Zoho. */
export async function customerPanel(db: Db, c: ZohoConn, cust: { id: string; mobile_number: string; zoho_id: string | null; zoho_module: string | null; name?: string | null }) {
  let module = cust.zoho_module; let record: any = null;
  if (cust.zoho_id && module) record = await getRecord(db, c, module, cust.zoho_id).catch(() => null);
  if (!record) {
    const hit = await findByPhone(db, c, cust.mobile_number);
    if (hit) { module = hit.module; record = hit.record; }
  }
  if (!record || !module) return { found: false as const };
  if (record.id !== cust.zoho_id || !cust.name) await linkCustomer(db, cust.id, module, record);
  const [deals, calls, notes] = await Promise.all([
    module === 'Contacts' ? related(db, c, module, record.id, 'Deals', 'Deal_Name,Stage,Amount,Closing_Date') : Promise.resolve({ rows: [], error: null }),
    contactCalls(db, c, module, record.id),
    related(db, c, module, record.id, 'Notes', 'Note_Title,Note_Content,Created_Time'),
  ]);
  return { found: true as const, module, record, deals, calls, notes, link: recordLink(c.accounts_server, module, record.id) };
}

/** Import Zoho Contacts / Leads as customer profiles (matched on mobile number; nothing is deleted). */
export async function importPeople(db: Db, orgId: string, c: ZohoConn, modules: string[], maxPages = 25) {
  let imported = 0; let skipped = 0;
  for (const module of modules) {
    const fields = module === 'Contacts' ? 'First_Name,Last_Name,Full_Name,Email,Phone,Mobile,Mailing_City' : 'First_Name,Last_Name,Full_Name,Email,Phone,Mobile,City,Company';
    for (let page = 1; page <= maxPages; page++) {
      const j = await zapi(db, c, 'GET', `/${module}?fields=${fields}&per_page=200&page=${page}`);
      for (const r of j?.data || []) {
        const mobile = normMobile(r.Mobile || r.Phone || '');
        if (mobile.length < 8) { skipped++; continue; }
        const name = r.Full_Name || [r.First_Name, r.Last_Name].filter(Boolean).join(' ') || null;
        await db.q(`INSERT INTO customers (org_id, mobile_number, name, email, city, crm_source, external_id, zoho_id, zoho_module)
                    VALUES ($1,$2,$3,$4,$5,'zoho',$6,$6,$7)
                    ON CONFLICT (org_id, mobile_number) DO UPDATE SET name = COALESCE(customers.name, EXCLUDED.name), email = COALESCE(customers.email, EXCLUDED.email),
                      city = COALESCE(customers.city, EXCLUDED.city), crm_source = 'zoho', external_id = EXCLUDED.external_id, zoho_id = EXCLUDED.zoho_id, zoho_module = EXCLUDED.zoho_module, updated_at = now()`,
          [orgId, mobile, name, r.Email || null, r.Mailing_City || r.City || null, String(r.id), module]);
        imported++;
      }
      if (!j?.info?.more_records) break;
    }
  }
  return { imported, skipped };
}

const mmss = (s: number | null | undefined) => (s == null ? '00:00' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`);
/** After a call is analysed: a Note (and, when enabled, a Call activity) on the caller's Zoho Contact / Lead. Logged either way. */
export async function pushCallToZoho(db: Db, orgId: string, d: Record<string, any>) {
  const c = await getZoho(db, orgId);
  if (!c || !c.is_active || c.settings?.push_notes === false || d.test) return;
  let status = 'failed'; let detail: string | null = null;
  try {
    const cust = d.customer_id ? await db.one<any>('SELECT id, mobile_number, zoho_id, zoho_module FROM customers WHERE id = $1 AND org_id = $2', [d.customer_id, orgId]) : null;
    let module = cust?.zoho_module || null; let id = cust?.zoho_id || null;
    if (!id) { const hit = await findByPhone(db, c, d.mobile_number || cust?.mobile_number || ''); if (hit) { module = hit.module; id = hit.record.id; if (cust) await linkCustomer(db, cust.id, module!, hit.record); } }
    if (!id || !module) { status = 'ok'; detail = `No Zoho Contact or Lead with phone ${d.mobile_number || '—'}; nothing written.`; }
    else {
      const link = `${publicAppUrl()}/calls/${d.call_id}`;
      const lines = [d.summary, '', `Agent: ${d.agent_name || d.agent_code || '—'} · ${d.direction || ''} · ${d.call_date || ''}`,
        `Quality: ${d.quality_score ?? '—'}/5 · Sentiment: ${d.sentiment || '—'} · Classification: ${d.classification || '—'} · Intent: ${d.intent || '—'}`,
        `Compliance risk: ${d.compliance_risk || '—'} · Churn risk: ${d.churn_risk || '—'}`, `Full analysis & recording: ${link}`].filter((x) => x !== undefined);
      await zapi(db, c, 'POST', `/${module}/${id}/Notes`, { data: [{ Note_Title: `Call analysis — ${d.call_date || ''} — ${d.intent || 'Call'}`.slice(0, 120), Note_Content: lines.join('\n').slice(0, 30000) }] });
      if (c.settings?.log_calls !== false) {
        const start = d.started_at ? new Date(d.started_at) : new Date();
        const call: Record<string, unknown> = { Subject: `${d.direction || 'Call'} call — ${d.intent || 'analysed'}`.slice(0, 120), Call_Type: d.direction === 'Outbound' ? 'Outbound' : 'Inbound',
          Call_Start_Time: start.toISOString().replace(/\.\d{3}Z$/, '+00:00'), Call_Duration: mmss(d.duration_seconds), Description: (d.summary || '').slice(0, 2000) };
        if (module === 'Contacts') call.Who_Id = { id }; else { call.What_Id = { id }; call.$se_module = 'Leads'; }
        await zapi(db, c, 'POST', '/Calls', { data: [call] });
      }
      status = 'ok'; detail = `Note${c.settings?.log_calls !== false ? ' + call activity' : ''} added to ${module.slice(0, -1)} ${id}`;
    }
  } catch (e) { detail = e instanceof Error ? e.message : String(e); }
  await db.q("INSERT INTO crm_sync_log (org_id, connection_id, direction, event, status, records, detail) VALUES ($1,$2,'outbound','zoho.call_note',$3,1,$4)", [orgId, c.id, status, detail?.slice(0, 500)]);
  await db.q('UPDATE crm_connections SET last_sync_at = now(), last_status = $2 WHERE id = $1', [c.id, status]);
}
