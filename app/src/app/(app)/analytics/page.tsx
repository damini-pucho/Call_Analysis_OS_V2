import { requireUser } from '@/lib/auth';
import { loadCalls } from '@/lib/dal';
import AnalyticsView from './view';

export const metadata = { title: 'Analytics' };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser('analytics.view');
  const [calls, sp] = await Promise.all([loadCalls(user), searchParams]);
  return <AnalyticsView calls={calls} initialTab={sp.tab || 'overview'} />;
}
