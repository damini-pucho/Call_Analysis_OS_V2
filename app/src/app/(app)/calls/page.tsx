import { requireUser } from '@/lib/auth';
import { loadCalls, loadCampaigns } from '@/lib/dal';
import CallsView from './view';

export const metadata = { title: 'Calls' };

export default async function CallsPage() {
  const user = await requireUser('calls.view');
  const [calls, campaigns] = await Promise.all([loadCalls(user), loadCampaigns(user)]);
  return <CallsView calls={calls} campaigns={campaigns.map((c: any) => c.name)} />;
}
