import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { loadCalls, loadAgents, loadCoachingNotes, loadTraining } from '@/lib/dal';
import AgentDetail from './view';

export const metadata = { title: 'Agent' };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireUser('agents.view');
  const code = decodeURIComponent((await params).code);
  const [calls, agents, notes, training] = await Promise.all([loadCalls(user), loadAgents(user), loadCoachingNotes(user, code), loadTraining(user)]);
  const agent = agents.find((a: any) => a.agent_code === code);
  const mine = calls.filter((c: any) => c.agent_code === code);
  if (!agent && !mine.length) notFound();   // outside the person's scope, or no such agent — never "anyone's first 12 calls" (V1)
  return <AgentDetail code={code} agent={agent || null} calls={mine} notes={notes} assignments={training.assignments.filter((t: any) => t.agent_code === code)} modules={training.modules} />;
}
