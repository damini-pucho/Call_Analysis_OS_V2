// src/proxy.ts — a convenience, not authorization: signed-out visitors go to /login early, https is enforced behind a proxy.
// Every page, action and route still checks the session itself.
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/signup', '/api/', '/brand', '/favicon', '/pucho-logo', '/download.webp'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const https = (process.env.APP_ORIGIN || '').startsWith('https://');
  const out = (res: NextResponse) => { if (https) res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains'); return res; };
  if (https && req.headers.get('x-forwarded-proto') === 'http') { const u = req.nextUrl.clone(); u.protocol = 'https:'; return out(NextResponse.redirect(u, 308)); }
  if (PUBLIC.some((p) => pathname.startsWith(p))) return out(NextResponse.next());
  const cookie = https ? '__Host-cas-session' : 'cas-session';
  if (!req.cookies.get(cookie)?.value) {
    const u = req.nextUrl.clone(); u.pathname = '/login'; u.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
    return out(NextResponse.redirect(u));
  }
  return out(NextResponse.next());
}
export const config = { matcher: ['/((?!_next/|favicon|.*\\.(?:png|svg|webp|ico|woff2)$).*)'] };
