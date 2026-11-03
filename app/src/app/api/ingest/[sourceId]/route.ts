// POST (or GET) /api/ingest/:sourceId?token=… — a dialer's "call ended" webhook. Accepts JSON, form-encoded or multipart
// (with the recording as a file), or query parameters (Exotel passthru is a GET). Answers 202 at once; the recording is
// downloaded, stored, queued and sent to the call-processing flow after the response. Retries of the same call are no-ops.
import { NextResponse, after, type NextRequest } from 'next/server';
import { withPlatform, withOrg, isUuid } from '@/lib/db';
import { sha256 } from '@/lib/auth';
import { AUDIO_EXT } from '@/lib/files';
import { PRESETS, mapPayload, payloadKeys, processEvent, type FieldMap } from '@/lib/sources';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(req: NextRequest, ctx: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await ctx.params;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim() || req.nextUrl.searchParams.get('token') || '';
  if (!isUuid(sourceId) || token.length < 20) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const src = await withPlatform((db) => db.one<any>(
    "SELECT s.id, s.org_id, s.provider, s.field_map FROM call_sources s JOIN organizations o ON o.id = s.org_id WHERE s.id = $1 AND s.token_hash = $2 AND s.is_active AND o.status = 'active'", [sourceId, sha256(token)]));
  if (!src) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  // collect the event from wherever this dialer puts it
  let payload: Record<string, any> = Object.fromEntries([...req.nextUrl.searchParams.entries()].filter(([k]) => k !== 'token'));
  let file: { name: string; data: Buffer } | null = null;
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') || '';
    if (Number(req.headers.get('content-length') || 0) > 160 * 1024 * 1024) return NextResponse.json({ ok: false, message: 'Body too large' }, { status: 413 });
    try {
      if (type.includes('application/json')) payload = { ...payload, ...(await req.json()) };
      else if (type.includes('multipart/form-data')) {
        const fd = await req.formData();
        for (const [k, v] of fd.entries()) {
          if (typeof v === 'string') payload[k] = v;
          else if (v.size > 0 && AUDIO_EXT.test(v.name)) file = { name: v.name, data: Buffer.from(await v.arrayBuffer()) };
        }
      } else if (type.includes('application/x-www-form-urlencoded')) payload = { ...payload, ...Object.fromEntries(new URLSearchParams(await req.text())) };
      else if (type) { const t = await req.text(); try { payload = { ...payload, ...JSON.parse(t) }; } catch { payload = { ...payload, ...Object.fromEntries(new URLSearchParams(t)) }; } }
    } catch { return NextResponse.json({ ok: false, message: 'Body could not be read' }, { status: 400 }); }
  }
  const map: FieldMap = { ...PRESETS[src.provider]?.map, ...(src.field_map || {}) };
  const m = mapPayload(payload, map);
  const externalId = (m.call_id || (m.recording_url ? sha256(m.recording_url).slice(0, 24) : '') || (file ? sha256(file.data.subarray(0, 65536).toString('base64')).slice(0, 24) : '')).slice(0, 120);
  if (!externalId) return NextResponse.json({ ok: false, message: 'No call id or recording in this event', received_fields: payloadKeys(payload) }, { status: 422 });

  const ev = await withOrg(src.org_id, (db) => db.one<{ id: string }>(
    `INSERT INTO ingest_events (org_id, source_id, external_call_id, keys, mapped) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (source_id, external_call_id) DO NOTHING RETURNING id`, [src.org_id, src.id, externalId, payloadKeys(payload), JSON.stringify(m)]));
  if (!ev) return NextResponse.json({ ok: true, duplicate: true });   // the dialer retried a call we already have
  after(() => withOrg(src.org_id, (db) => processEvent(db, src.org_id, ev.id, file)).catch((e) => console.error('ingest failed:', e?.message)));
  return NextResponse.json({ ok: true, event_id: ev.id }, { status: 202 });
}

export const POST = handle;
export const GET = handle;
