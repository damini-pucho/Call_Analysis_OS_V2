import { requireUser } from '@/lib/auth';
import { loadCrm } from '@/lib/dal';
import { withOrg } from '@/lib/db';
import { publicAppUrl } from '@/lib/flows';
import { zohoConfigured, redirectUri, ZOHO_DCS } from '@/lib/zoho';
import CrmView from './view';

export const metadata = { title: 'CRM integration' };

export default async function Page({ searchParams }: { searchParams: Promise<{ zoho?: string }> }) {
  const user = await requireUser('crm.view');
  const [data, sp] = await Promise.all([loadCrm(user), searchParams]);
  // the Zoho connection as the browser may see it: status and settings, never a token
  const zoho = await withOrg(user.orgId, (db) => db.one(
    `SELECT id, is_active, settings, external_account, accounts_server, last_sync_at, last_status, created_at,
            (SELECT count(*)::int FROM customers cu WHERE cu.org_id = $1 AND cu.zoho_id IS NOT NULL) AS linked
       FROM crm_connections WHERE org_id = $1 AND provider = 'zoho'`, [user.orgId]));
  return <CrmView {...data} connections={data.connections.filter((c: any) => c.provider !== 'zoho')} appUrl={publicAppUrl()}
    zoho={{ configured: zohoConfigured(), redirectUri: redirectUri(), dcs: Object.entries(ZOHO_DCS).map(([k, v]) => ({ value: k, label: v.label })),
      connection: zoho ? JSON.parse(JSON.stringify(zoho)) : null, status: sp.zoho || null }} />;
}
