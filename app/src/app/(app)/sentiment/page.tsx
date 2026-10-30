import { requireUser } from '@/lib/auth';
import { loadCalls, loadAgents } from '@/lib/dal';
import SentimentView from './view';

export const metadata = { title: 'Sentiment analysis' };

export default async function Page() {
  const user = await requireUser('customer_analysis.view');
  const [calls, agents] = await Promise.all([loadCalls(user), loadAgents(user)]);
  return <SentimentView calls={calls} agents={agents} />;
}
