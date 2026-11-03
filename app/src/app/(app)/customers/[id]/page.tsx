import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getCustomer, loadOrg } from '@/lib/dal';
import { withOrg } from '@/lib/db';
import { getZoho, customerPanel } from '@/lib/zoho';
import CustomerDetail from './view';

export const metadata = { title: 'Customer' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('customers.view');
  const { id } = await params;
  const [data, org] = await Promise.all([getCustomer(user, id), loadOrg(user)]);
  if (!data) notFound();
  // v2.1: the caller's Zoho CRM record, read live (failures are shown, never hidden)
  let zoho: any = null;
  try {
    zoho = await withOrg(user.orgId, async (db) => {
      const c = await getZoho(db, user.orgId);
      if (!c || !c.is_active) return null;
      return { connected: true, ...(await customerPanel(db, c, data.customer as any)) };
    });
  } catch (e) { zoho = { connected: true, found: false, error: e instanceof Error ? e.message : String(e) }; }
  return <CustomerDetail customer={data.customer} calls={data.calls} maskPii={org?.config?.pii_masking !== false} zoho={zoho ? JSON.parse(JSON.stringify(zoho)) : null} />;
}
