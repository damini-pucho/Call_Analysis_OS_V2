// GET /api/health — { ok } for everyone; database and flow wiring for an organisation admin.
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { pool } from '@/lib/db';
import { FLOWS, flowConnected } from '@/lib/flows';

export const dynamic = 'force-dynamic';

export async function GET() {
  let db = false;
  try { await pool.query('SELECT 1'); db = true; } catch { db = false; }
  const u = await currentUser().catch(() => null);
  if (!u || !u.permissions.includes('settings.manage')) return NextResponse.json({ ok: db }, { status: db ? 200 : 503 });
  return NextResponse.json({
    ok: db, database: db ? 'reachable' : 'unreachable',
    flows: Object.fromEntries(Object.entries(FLOWS).map(([k, v]) => [k, flowConnected(k as keyof typeof FLOWS) ? 'connected' : `not connected (${v.env})`])),
    inbound: (process.env.INBOUND_TOKEN || '').length >= 24 ? 'open' : 'closed (INBOUND_TOKEN missing)',
    public_url: process.env.PUBLIC_APP_URL || null,
  }, { status: db ? 200 : 503 });
}
