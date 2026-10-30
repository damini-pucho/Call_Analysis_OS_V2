import { requireUser } from '@/lib/auth';
import { loadCalls } from '@/lib/dal';
import OverviewView from './view';

export const metadata = { title: 'Overview' };

export default async function OverviewPage() {
  const user = await requireUser('dashboard.view');
  const calls = await loadCalls(user);
  return <OverviewView calls={calls} />;
}
