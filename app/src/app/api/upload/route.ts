// POST /api/upload — Upload & Analyse. One audio file or a ZIP of recordings. The app stores every recording itself (a ZIP is
// unpacked here — no third-party bucket, no service key in the browser), creates one call row each and sends each to the
// call-processing flow. When the flow is not connected the rows stay "queued" and the answer says so.
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { currentUser } from '@/lib/auth';
import { withOrg } from '@/lib/db';
import { AUDIO_EXT } from '@/lib/files';
import { queueRecording, sendToFlow, sendZipToFlow } from '@/lib/ingest';
import { flowConnected } from '@/lib/flows';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const MAX = 200 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ ok: false, message: 'Sign in again.' }, { status: 401 });
  if (!u.permissions.includes('upload.analyze')) return NextResponse.json({ ok: false, message: 'Your role cannot upload calls.' }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, message: 'Send the file as multipart form data.' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, message: 'Choose a recording or a ZIP.' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, message: 'Files are limited to 200 MB.' }, { status: 413 });
  const isZip = /\.zip$/i.test(file.name);
  if (!isZip && !AUDIO_EXT.test(file.name)) return NextResponse.json({ ok: false, message: 'Upload an audio file (mp3, wav, ogg, flac, m4a, webm, aac) or a .zip of them.' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const items: { name: string; data: Buffer }[] = [];
  if (isZip) {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(buf); } catch { return NextResponse.json({ ok: false, message: 'That ZIP could not be opened.' }, { status: 400 }); }
    let total = 0;
    for (const entry of Object.values(zip.files)) {
      const name = entry.name.split('/').pop() || '';
      if (entry.dir || !AUDIO_EXT.test(name) || name.startsWith('._')) continue;
      const data = Buffer.from(await entry.async('uint8array'));
      total += data.length;
      if (total > MAX * 3) return NextResponse.json({ ok: false, message: 'The ZIP expands to more than 600 MB.' }, { status: 413 });
      items.push({ name, data });
      if (items.length > 500) return NextResponse.json({ ok: false, message: 'A ZIP may hold at most 500 recordings.' }, { status: 413 });
    }
    if (!items.length) return NextResponse.json({ ok: false, message: 'The ZIP has no audio recordings in it.' }, { status: 400 });
  } else items.push({ name: file.name, data: buf });

  const batch = randomUUID();
  const results = await withOrg(u.orgId, async (db) => {
    const out: any[] = []; const zipIds: string[] = [];
    for (const it of items) {
      const q = await queueRecording(db, u.orgId, u.id, it.name, it.data, batch);
      if (q.duplicateOf) { out.push({ id: q.duplicateOf.id, filename: q.filename, parsed: true, status: 'duplicate', detail: `Same recording as ${q.duplicateOf.filename} — not stored or analysed again.` }); continue; }
      if (isZip) { zipIds.push(q.callRowId); out.push({ id: q.callRowId, filename: q.filename, parsed: q.parsed.ok, status: 'queued', detail: null }); continue; }
      const r = await sendToFlow(db, u.orgId, q.callRowId);
      out.push({ id: q.callRowId, filename: q.filename, parsed: q.parsed.ok, status: r.status === 'sent' ? 'processing' : 'queued', detail: r.status === 'sent' ? null : r.detail });
    }
    if (zipIds.length) {   // one trigger for the whole ZIP — the flow's ZIP branch handles every recording in it
      const r = await sendZipToFlow(db, u.orgId, u.id, file.name, buf, zipIds);
      for (const o of out) if (zipIds.includes(o.id)) { o.status = r.status === 'sent' ? 'processing' : 'queued'; o.detail = r.status === 'sent' ? null : r.detail; }
    }
    await db.q("INSERT INTO audit_log (org_id, user_id, action, detail) VALUES ($1,$2,'calls.upload',$3)", [u.orgId, u.id, JSON.stringify({ batch, files: items.length, zip: isZip })]);
    return out;
  });
  return NextResponse.json({ ok: true, batch, connected: flowConnected('call_processing'), calls: results });
}
