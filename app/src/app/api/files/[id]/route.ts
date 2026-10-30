// GET /api/files/:id — a stored file. Signed-in people get files of their own organisation (recordings only within their
// agent scope); Studio gets a recording / document through an HMAC-signed, expiring link. Supports Range for audio seeking.
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { withOrg, withPlatform, isUuid } from '@/lib/db';
import { readStored, statStored, verifySignature } from '@/lib/files';
import { agentScope } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const sp = req.nextUrl.searchParams;
  let file: any = null;
  if (sp.get('sig')) {
    if (!verifySignature(id, sp.get('exp'), sp.get('sig'))) return new NextResponse('Link expired or invalid', { status: 403 });
    file = await withPlatform((db) => db.one('SELECT * FROM files WHERE id = $1', [id]));
  } else {
    const u = await currentUser();
    if (!u) return new NextResponse('Sign in required', { status: 401 });
    file = await withOrg(u.orgId, async (db) => {
      const f = await db.one<any>('SELECT * FROM files WHERE id = $1 AND org_id = $2', [id, u.orgId]);
      if (!f) return null;
      if (f.kind === 'recording') {
        const scope = await agentScope(db, u);
        const ok = await db.one('SELECT 1 FROM calls WHERE org_id = $1 AND audio_file_id = $2 AND ($3::text[] IS NULL OR agent_code = ANY($3::text[]))', [u.orgId, id, scope]);
        if (!ok) return null;
      }
      return f;
    });
  }
  if (!file) return new NextResponse('Not found', { status: 404 });
  let size: number;
  try { size = (await statStored(file.storage_path)).size; } catch { return new NextResponse('File missing from storage', { status: 410 }); }
  const headers: Record<string, string> = {
    'Content-Type': file.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${file.mime.startsWith('audio/') || file.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.filename)}"`,
  };
  const data = await readStored(file.storage_path);
  const range = req.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0; const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new NextResponse(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new NextResponse(new Uint8Array(data), { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}
