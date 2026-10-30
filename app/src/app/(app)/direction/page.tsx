import { requireUser } from '@/lib/auth';
import { loadCalls } from '@/lib/dal';
import DirectionView from './view';

export const metadata = { title: 'Inbound / outbound' };

export default async function Page() {
  const user = await requireUser('inbound_outbound.view');
  return <DirectionView calls={await loadCalls(user)} />;
}
