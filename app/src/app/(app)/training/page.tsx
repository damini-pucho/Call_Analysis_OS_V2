import { requireUser } from '@/lib/auth';
import { loadCalls, loadAgents, loadTraining } from '@/lib/dal';
import TrainingView from './view';

export const metadata = { title: 'Agent training' };

export default async function Page() {
  const user = await requireUser('training.view');
  const [calls, agents, training] = await Promise.all([loadCalls(user), loadAgents(user), loadTraining(user)]);
  return <TrainingView calls={calls} agents={agents} modules={training.modules} assignments={training.assignments} />;
}
