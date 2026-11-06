// src/lib/sources.ts — recordings straight from the calling platform, no manual upload (v2.1).
// A dialer / cloud telephony account posts a "call ended" webhook to /api/ingest/<sourceId>?token=…; the app maps the
// provider's field names, downloads the recording (SSRF-guarded), names it in the organisation's filename pattern and
// hands it to the same queue → call-processing flow as an upload. Presets are starting points: every provider account can
// rename fields, so the mapping is editable and the event log shows which field names actually arrived.
import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Db } from './db';
import { decrypt } from './flows';
import { queueRecording, sendToFlow } from './ingest';
import { normMobile } from './crm';
import { getZoho, recordedCalls, callPhone, zohoDownloadAuth } from './zoho';
import { createHash, randomBytes } from 'node:crypto';

export type FieldMap = { call_id: string; recording_url: string; agent: string; customer_number: string; direction?: string; started_at?: string; duration?: string; campaign?: string };
// "A|B" = first non-empty of A, then B. Dotted paths reach into nested JSON.
export const PRESETS: Record<string, { label: string; help: string; map: FieldMap }> = {
  generic: { label: 'Generic webhook (any dialer / automation)', help: 'POST JSON with these field names, or remap them below.',
    map: { call_id: 'call_id', recording_url: 'recording_url', agent: 'agent', customer_number: 'customer_number', direction: 'direction', started_at: 'started_at', duration: 'duration_seconds', campaign: 'campaign' } },
  exotel: { label: 'Exotel', help: 'Use as the Passthru / StatusCallback URL of your call flow or campaign. Recording URLs need your API key: add it under "Recording download".',
    map: { call_id: 'CallSid', recording_url: 'RecordingUrl', agent: 'DialWhomNumber|To', customer_number: 'CallFrom|From', direction: 'Direction', started_at: 'StartTime|DateCreated', duration: 'DialCallDuration|Duration' } },
  ozonetel: { label: 'Ozonetel (CloudAgent)', help: 'Set as the call-details callback (URL to push) for the campaign.',
    map: { call_id: 'monitorUCID|UCID', recording_url: 'AudioFile', agent: 'AgentID|AgentPhoneNumber', customer_number: 'CallerID', direction: 'Type|CallType', started_at: 'StartTime', duration: 'Duration' } },
  smartflo: { label: 'Tata Tele Smartflo', help: 'Add as a "call hangup" webhook in Smartflo.',
    map: { call_id: 'call_id|uuid', recording_url: 'recording_url', agent: 'answered_agent_number|answered_agent.number|agent_number', customer_number: 'caller_id_number|customer_no', direction: 'direction', started_at: 'start_stamp', duration: 'billsec|duration' } },
  knowlarity: { label: 'Knowlarity', help: 'Configure as the call-log webhook (post-call).',
    map: { call_id: 'uuid|callid', recording_url: 'resource_url|call_recording', agent: 'agent_number', customer_number: 'caller_id|customer_number', direction: 'call_type|Call_Type', started_at: 'start_time', duration: 'call_duration|duration' } },
  myoperator: { label: 'MyOperator', help: 'Add as the after-call webhook.',
    map: { call_id: 'uid|call_id|_ai', recording_url: 'filename|recording_url|_fu', agent: 'agent_number|_an', customer_number: 'caller_number|_cr', direction: 'type|_ty', started_at: 'start_time|_st', duration: 'duration|_dr' } },
};

const get = (o: any, path: string) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
const pick = (o: any, spec?: string) => { for (const p of (spec || '').split('|').map((s) => s.trim()).filter(Boolean)) { const v = get(o, p); if (v != null && String(v).trim() !== '') return String(v).trim(); } return null; };
const secs = (v: string | null) => { if (!v) return null; const m = v.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/); if (m) return m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2]; const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };
const dir = (v: string | null) => (!v ? null : /out/i.test(v) ? 'Outbound' : /in/i.test(v) ? 'Inbound' : null);

export function mapPayload(payload: any, map: FieldMap) {
  return {
    call_id: pick(payload, map.call_id), recording_url: pick(payload, map.recording_url), agent: pick(payload, map.agent),
    customer_number: pick(payload, map.customer_number), direction: dir(pick(payload, map.direction)), started_at: pick(payload, map.started_at),
    duration_seconds: secs(pick(payload, map.duration)), campaign: pick(payload, map.campaign),
  };
}
export type Mapped = ReturnType<typeof mapPayload>;
/** Field names only (never values) — shown in the event log so an admin can correct a mapping. */
export const payloadKeys = (o: any, prefix = ''): string[] => (o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) && prefix.split('.').length < 3 ? payloadKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`])) : []).slice(0, 80);

// ── SSRF-guarded download ───────────────────────────────────────────────────────────────────────────────────────────
const allowPrivate = () => process.env.NODE_ENV !== 'production' && process.env.INGEST_ALLOW_PRIVATE === 'true';   // local tests only
function privateIp(ip: string) {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) { const [a, b] = v4.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  const x = ip.toLowerCase(); return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80');
}
const MAX = 150 * 1024 * 1024;
export async function safeDownload(url: string, auth: string | null, hops = 3): Promise<{ data: Buffer; type: string }> {
  let u: URL; try { u = new URL(url); } catch { throw new Error('The recording URL is not a valid URL'); }
  if (u.protocol !== 'https:' && !(allowPrivate() && u.protocol === 'http:')) throw new Error('Recording URLs must be https');
  const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`Cannot resolve ${u.hostname}`);
  if (!allowPrivate() && addrs.some((a) => privateIp(a.address))) throw new Error('Recording URL points to a private network address');
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth.startsWith('Bearer ') || auth.startsWith('Zoho-oauthtoken ') ? auth : `Basic ${Buffer.from(auth).toString('base64')}`;
  const res = await fetch(u, { headers, redirect: 'manual', signal: AbortSignal.timeout(120000) });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    if (hops <= 0) throw new Error('Too many redirects fetching the recording');
    const next = new URL(res.headers.get('location')!, u);
    return safeDownload(next.toString(), next.host === u.host ? auth : null, hops - 1);   // credentials never follow to another host
  }
  if (!res.ok) throw new Error(`The dialer's recording URL answered HTTP ${res.status}`);
  if (Number(res.headers.get('content-length') || 0) > MAX) throw new Error('Recording is larger than 150 MB');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of res.body as any) { size += chunk.length; if (size > MAX) throw new Error('Recording is larger than 150 MB'); chunks.push(Buffer.from(chunk)); }
  return { data: Buffer.concat(chunks), type: res.headers.get('content-type') || '' };
}
const extFor = (type: string, url: string) => {
  const fromUrl = (url.match(/\.(mp3|wav|ogg|flac|m4a|webm|aac)(?:$|\?)/i) || [])[1];
  if (fromUrl) return fromUrl.toLowerCase();
  return /wav/.test(type) ? 'wav' : /ogg/.test(type) ? 'ogg' : /mp4|m4a|aac/.test(type) ? 'm4a' : /webm/.test(type) ? 'webm' : 'mp3';
};
const clean = (s: string | null, max: number) => (s || '').replace(/[^A-Za-z0-9]/g, '').slice(0, max);

/** Download (or take the posted file), resolve the agent, store, queue and send to the call-processing flow. */
export async function processEvent(db: Db, orgId: string, eventId: string, file?: { name: string; data: Buffer } | null) {
  const ev = await db.one<any>('SELECT e.id, e.external_call_id, e.mapped, s.id AS source_id, s.provider, s.default_campaign, s.download_auth_enc FROM ingest_events e JOIN call_sources s ON s.id = e.source_id WHERE e.id = $1 AND e.org_id = $2', [eventId, orgId]);
  if (!ev) return;
  const m: Mapped = ev.mapped || {};
  const set = (status: string, detail: string | null, callId: string | null = null) => db.q('UPDATE ingest_events SET status = $2, detail = $3, call_id = COALESCE($4, call_id), updated_at = now() WHERE id = $1', [ev.id, status, detail?.slice(0, 500) ?? null, callId]);
  try {
    if (!file && !m.recording_url) { await set('skipped', 'No recording in this event (unanswered or recording off).'); return; }
    await set('downloading', null);
    const zc = ev.provider === 'zoho' && !file ? await getZoho(db, orgId) : null;
    const auth = zc ? await zohoDownloadAuth(db, zc, m.recording_url!) : ev.download_auth_enc ? decrypt(ev.download_auth_enc, `source:${ev.source_id}`) : null;
    const rec = file ? { data: file.data, type: '' } : await safeDownload(m.recording_url!, auth);
    if (rec.data.length < 1024) throw new Error('The downloaded recording is empty or too small');
    // agent: their code, one of their dialer IDs, or their email; otherwise the dialer's own identifier becomes the code
    const ident = (m.agent || '').trim();
    const agent = ident ? await db.one<{ agent_code: string }>(
      'SELECT agent_code FROM agents WHERE org_id = $1 AND (agent_code = $2 OR $2 = ANY(dialer_ids) OR lower(email) = lower($2) OR ($3 <> \'\' AND $3 = ANY(dialer_ids))) LIMIT 1', [orgId, ident, normMobile(ident)]) : null;
    const code = agent?.agent_code || clean(ident.includes('@') ? ident.split('@')[0] : normMobile(ident) || ident, 32) || 'UNMAPPED';
    const started = m.started_at && !Number.isNaN(new Date(m.started_at.replace(' ', 'T')).getTime()) ? new Date(m.started_at.replace(' ', 'T')) : new Date();
    const ymd = started.toISOString().slice(0, 10).replace(/-/g, '');
    const campaign = clean(m.campaign || ev.default_campaign || ev.provider, 30).toUpperCase() || 'DIALER';
    const ext = file ? (file.name.split('.').pop() || 'mp3').toLowerCase() : extFor(rec.type, m.recording_url!);
    // the organisation's filename pattern, so the existing parser fills date, lead ID, mobile, agent and campaign
    const filename = `${ymd}-${clean(ev.external_call_id, 24) || ev.id.slice(0, 8)}_${normMobile(m.customer_number || '') || '0000000000'}_${code}_${campaign}-auto.${ext}`;
    const q = await queueRecording(db, orgId, null, filename, rec.data, null);
    if (q.duplicateOf) { await set('skipped', `Duplicate of ${q.duplicateOf.filename} — the same recording was already received.`, q.duplicateOf.id); return; }
    await db.q('UPDATE calls SET direction = COALESCE($2, direction), duration_seconds = COALESCE($3, duration_seconds) WHERE id = $1', [q.callRowId, m.direction, m.duration_seconds]);
    const r = await sendToFlow(db, orgId, q.callRowId);
    await set(r.status === 'sent' ? 'processing' : 'queued', r.status === 'sent' ? null : r.detail || null, q.callRowId);
  } catch (e) {
    await set('failed', e instanceof Error ? e.message : String(e));
  }
  await db.q('UPDATE call_sources SET last_event_at = now() WHERE id = $1', [ev.source_id]);
}

// ── Zoho CRM call recordings (v2.2) ─────────────────────────────────────────────────────────────────────────────────
/** Every Zoho call with a recording link that this organisation has not received yet goes through processEvent — the same
 *  download → queue → call-processing flow (the V1 Studio workflow) as a dialer or an upload. One event per Zoho call id,
 *  so a sync never imports a call twice; the recording's hash check stops the same audio arriving under another name. */
export async function syncZohoRecordings(db: Db, orgId: string) {
  const c = await getZoho(db, orgId);
  if (!c || !c.is_active) return { ok: false as const, message: 'Zoho CRM is not connected.' };
  let src = await db.one<{ id: string }>("SELECT id FROM call_sources WHERE org_id = $1 AND provider = 'zoho'", [orgId]);
  if (!src) src = await db.one<{ id: string }>("INSERT INTO call_sources (org_id, provider, name, token_hash, field_map, default_campaign) VALUES ($1,'zoho','Zoho CRM call recordings',$2,'{}','ZOHO') RETURNING id",
    [orgId, createHash('sha256').update(randomBytes(32)).digest('hex')]);   // no webhook: this token is never issued
  const calls = await recordedCalls(db, c);
  let added = 0, seen = 0;
  for (const r of calls) {
    const known = await db.one('SELECT 1 AS x FROM ingest_events WHERE source_id = $1 AND external_call_id = $2', [src!.id, String(r.id)]);
    if (known) { seen++; continue; }
    const mapped: Mapped = {
      call_id: String(r.id), recording_url: r.recording_url, agent: r.Owner?.email || null,
      customer_number: await callPhone(db, c, r), direction: dir(r.Call_Type || null), started_at: r.Call_Start_Time || null,
      duration_seconds: r.Call_Duration_in_seconds != null && Number.isFinite(+r.Call_Duration_in_seconds) ? Math.round(+r.Call_Duration_in_seconds) : secs(r.Call_Duration || null), campaign: null,
    };
    const ev = await db.one<{ id: string }>(`INSERT INTO ingest_events (org_id, source_id, external_call_id, keys, mapped) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (source_id, external_call_id) DO NOTHING RETURNING id`, [orgId, src!.id, String(r.id), Object.keys(r).slice(0, 80), JSON.stringify(mapped)]);
    if (!ev) { seen++; continue; }
    await processEvent(db, orgId, ev.id);
    added++;
  }
  await db.q("INSERT INTO crm_sync_log (org_id, connection_id, direction, event, status, records, detail) VALUES ($1,$2,'import','zoho.recordings','ok',$3,$4)",
    [orgId, c.id, added, `${calls.length} recorded call(s) in Zoho · ${added} new · ${seen} already received`]);
  return { ok: true as const, found: calls.length, added, seen, message: added ? `${added} new Zoho recording(s) sent for analysis.` : calls.length ? 'No new Zoho recordings — all were already received.' : 'No Zoho calls with a recording yet.' };
}
