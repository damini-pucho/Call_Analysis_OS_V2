// GET /api/crm/zoho/connect?dc=in — starts Zoho OAuth for the signed-in admin's organisation.
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser, secureOrigin } from '@/lib/auth';
import { zohoConfigured, makeState, authorizeUrl, ZOHO_DCS } from '@/lib/zoho';
import { publicAppUrl } from '@/lib/flows';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // redirects use the app's configured address: in dev Next reports the host as "localhost", where the 127.0.0.1 session cookie is not sent
  const base = publicAppUrl() || req.url;
  const back = (q: string) => NextResponse.redirect(new URL(`/crm?zoho=${q}`, base));
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL('/login', base));
  if (!u.permissions.includes('crm.manage')) return back('forbidden');
  if (!zohoConfigured()) return back('not_configured');
  const dc = ZOHO_DCS[req.nextUrl.searchParams.get('dc') || ''] ? req.nextUrl.searchParams.get('dc')! : 'in';
  const state = makeState(u.orgId, u.id, dc);
  const res = NextResponse.redirect(authorizeUrl(dc, state));
  res.cookies.set('zoho_oauth_state', state, { httpOnly: true, secure: secureOrigin(), sameSite: 'lax', path: '/api/crm/zoho', maxAge: 600 });
  return res;
}
