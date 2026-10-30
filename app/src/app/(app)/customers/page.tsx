import { requireUser } from '@/lib/auth';
import { loadCustomers } from '@/lib/dal';
import CustomersView from './view';

export const metadata = { title: 'Customer profiles' };

export default async function Page() {
  const user = await requireUser('customers.view');
  return <CustomersView customers={await loadCustomers(user)} />;
}
