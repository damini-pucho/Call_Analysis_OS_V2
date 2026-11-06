// src/lib/files.ts — recordings and documents on the app's own disk (STORAGE_DIR), never a third-party bucket with a key in
// the browser (V1 shipped a Supabase service-role key in Upload.jsx). Studio fetches a recording through a short-lived
// HMAC-signed link; people fetch it through their session.
import 'server-only';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, readFile, stat, unlink } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import type { Db } from './db';

export const STORAGE_ROOT = resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || './storage');
export const AUDIO_EXT = /\.(mp3|wav|ogg|flac|m4a|webm|aac)$/i;
export const DOC_EXT = /\.(pdf|docx?|txt|md|rtf)$/i;
const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.webm': 'audio/webm', '.aac': 'audio/aac',
  '.zip': 'application/zip', '.pdf': 'application/pdf', '.doc': 'application/msword', '.txt': 'text/plain', '.md': 'text/markdown', '.rtf': 'application/rtf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.csv': 'text/csv',
};
export const mimeOf = (name: string) => MIME[extname(name).toLowerCase()] || 'application/octet-stream';
export const safeName = (name: string) => name.split(/[\\/]/).pop()!.replace(/[^A-Za-z0-9._\- ]/g, '_').slice(0, 180) || 'file';

export async function saveFile(db: Db, orgId: string, userId: string | null, kind: string, filename: string, data: Buffer) {
  const id = randomUUID();
  const clean = safeName(filename);
  const rel = join(orgId, kind, `${id}${extname(clean).toLowerCase()}`);
  await mkdir(join(STORAGE_ROOT, orgId, kind), { recursive: true });
  await writeFile(join(STORAGE_ROOT, rel), data);
  const sha = createHash('sha256').update(data).digest('hex');
  await db.q('INSERT INTO files (id, org_id, kind, filename, mime, size_bytes, sha256, storage_path, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, orgId, kind, clean, mimeOf(clean), data.length, sha, rel, userId]);
  return { id, filename: clean, size: data.length };
}

export async function deleteFile(db: Db, orgId: string, fileId: string) {
  const f = await db.one<{ id: string; storage_path: string }>(
    'SELECT id, storage_path FROM files WHERE id = $1 AND org_id = $2', [fileId, orgId]);
  if (!f) return false;
  await db.q('DELETE FROM files WHERE id = $1 AND org_id = $2', [fileId, orgId]);
  try {
    await unlink(filePath(f.storage_path));
  } catch (err) {
    console.warn('Could not remove file on disk:', err);
  }
  return true;
}

export function filePath(storagePath: string) {
  const p = resolve(/*turbopackIgnore: true*/ STORAGE_ROOT, storagePath);
  if (!p.startsWith(STORAGE_ROOT)) throw new Error('path outside storage');
  return p;
}
export const readStored = (storagePath: string) => readFile(filePath(storagePath));
export const statStored = (storagePath: string) => stat(filePath(storagePath));

// ── signed links for Studio (24 hours by default: a ZIP batch can sit in Studio's queue) ─────────────────────────────────────────────────────────────────
const linkKey = () => process.env.FILE_LINK_SECRET || '';
const sign = (id: string, exp: number) => createHmac('sha256', linkKey()).update(`${id}.${exp}`).digest('base64url');
export function signedFileUrl(id: string, minutes = 60 * 24) {
  const base = (process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || '').replace(/\/$/, '');
  const exp = Math.floor(Date.now() / 1000) + minutes * 60;
  return `${base}/api/files/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}
export function verifySignature(id: string, exp: string | null, sig: string | null) {
  if (!linkKey() || !exp || !sig) return false;
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
  const a = Buffer.from(sign(id, e)); const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
