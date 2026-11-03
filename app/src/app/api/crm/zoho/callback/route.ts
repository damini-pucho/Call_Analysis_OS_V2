// GET /api/crm/zoho/callback — Zoho returns here with ?code&state&accounts-server&location.
// The state must match the HttpOnly cookie, carry a valid HMAC, and name the signed-in admin and their organisation.
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { withOrg } from '@/lib/db';
import { encrypt, publicAppUrl } from '@/lib/flows';
import { readState, accountsAllowed, exchangeCode, ZOHO_DCS, zapi, type ZohoConn } from '@/lib/zoho';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // back to the app's configured address (the same host as the redirect URI), not the "localhost" Next reports in dev
  const back = (q: string) => { const r = NextResponse.redirect(new URL(`/crm?zoho=${q}`, publicAppUrl() || req.url)); r.cookies.delete({ name: 'zoho_oauth_state', path: '/api/crm/zoho' }); return r; };
  if (sp.get('error')) return back('denied');
  const state = sp.get('state') || ''; const cookie = req.cookies.get('zoho_oauth_state')?.value || '';
  const st = readState(state);
  const u = await currentUser();
  if (!st || state !== cookie || !u || u.orgId !== st.orgId || u.id !== st.userId || !u.permissions.includes('crm.manage')) return back('invalid_state');
  const accounts = (sp.get('accounts-server') || ZOHO_DCS[st.dc]?.accounts || '').replace(/\/$/, '');
  if (!accountsAllowed(accounts)) return back('invalid_server');
  const code = sp.get('code'); if (!code) return back('error');
  try {
    const t = await exchangeCode(accounts, code);
    if (!t.refresh_token || !t.access_token || !t.api_domain) return back('no_refresh_token');
    await withOrg(u.orgId, async (db) => {
      const row = await db.one<{ id: string }>(`INSERT INTO crm_connections (org_id, provider, name, accounts_server, api_domain, refresh_token_enc, events, is_active, created_by, settings)
          VALUES ($1,'zoho','Zoho CRM',$2,$3,'pending','{}',true,$4,'{"push_notes":true,"log_calls":true}')
          ON CONFLICT (org_id) WHERE provider = 'zoho' DO UPDATE SET accounts_server = EXCLUDED.accounts_server, api_domain = EXCLUDED.api_domain, is_active = true
          RETURNING id`, [u.orgId, accounts, t.api_domain, u.id]);
      const id = row!.id;
      await db.q("UPDATE crm_connections SET refresh_token_enc = $2, access_token_enc = $3, access_expires_at = now() + ($4 || ' seconds')::interval, last_status = 'ok' WHERE id = $1",
        [id, encrypt(t.refresh_token!, `zoho:${id}:refresh`), encrypt(t.access_token!, `zoho:${id}:access`), String(t.expires_in || 3600)]);
      // who authorised, and the Zoho org id for record links — best effort
      const conn = await db.one<ZohoConn>("SELECT id, org_id, accounts_server, api_domain, refresh_token_enc, access_token_enc, access_expires_at, settings, is_active, external_org_id FROM crm_connections WHERE id = $1", [id]);
      const me = await zapi(db, conn!, 'GET', '/users?type=CurrentUser').catch(() => null);
      const org = await zapi(db, conn!, 'GET', '/org').catch(() => null);
      await db.q('UPDATE crm_connections SET external_account = $2, external_org_id = $3 WHERE id = $1', [id, me?.users?.[0]?.email || null, org?.org?.[0]?.id ? String(org.org[0].id) : null]);
      await db.q("INSERT INTO crm_sync_log (org_id, connection_id, direction, event, status, detail) VALUES ($1,$2,'inbound','zoho.connected','ok',$3)", [u.orgId, id, me?.users?.[0]?.email || null]);
      await db.q("INSERT INTO audit_log (org_id, user_id, action, entity, entity_id) VALUES ($1,$2,'crm.zoho_connect','crm_connection',$3)", [u.orgId, u.id, id]);
    });
    return back('connected');
  } catch (e) {
    console.error('zoho callback:', e instanceof Error ? e.message : e);
    return back('error');
  }
}
