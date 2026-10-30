import { requireUser } from '@/lib/auth';
import { loadCalls, loadAgents } from '@/lib/dal';
import ComplianceView from './view';

export const metadata = { title: 'Compliance & risk' };

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser('compliance.view');
  const [calls, agents, sp] = await Promise.all([loadCalls(user), loadAgents(user), searchParams]);
  return <ComplianceView calls={calls} agents={agents} initialTab={sp.tab || 'agents'} />;
}
