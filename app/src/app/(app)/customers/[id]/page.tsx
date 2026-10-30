import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getCustomer, loadOrg } from '@/lib/dal';
import CustomerDetail from './view';

export const metadata = { title: 'Customer' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('customers.view');
  const { id } = await params;
  const [data, org] = await Promise.all([getCustomer(user, id), loadOrg(user)]);
  if (!data) notFound();
  return <CustomerDetail customer={data.customer} calls={data.calls} maskPii={org?.config?.pii_masking !== false} />;
}
