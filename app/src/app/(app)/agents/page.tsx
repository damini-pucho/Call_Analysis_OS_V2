import { requireUser } from '@/lib/auth';
import { loadCalls, loadAgents } from '@/lib/dal';
import AgentsView from './view';

export const metadata = { title: 'Agents' };

export default async function Page() {
  const user = await requireUser('agents.view');
  const [calls, agents] = await Promise.all([loadCalls(user), loadAgents(user)]);
  return <AgentsView calls={calls} agents={agents} />;
}
