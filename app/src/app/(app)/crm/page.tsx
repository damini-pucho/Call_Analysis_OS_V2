import { requireUser } from '@/lib/auth';
import { loadCrm } from '@/lib/dal';
import { publicAppUrl } from '@/lib/flows';
import CrmView from './view';

export const metadata = { title: 'CRM integration' };

export default async function Page() {
  const user = await requireUser('crm.view');
  const data = await loadCrm(user);
  return <CrmView {...data} appUrl={publicAppUrl()} />;
}
