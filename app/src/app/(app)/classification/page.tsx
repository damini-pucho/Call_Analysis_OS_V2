import { requireUser } from '@/lib/auth';
import { loadCalls } from '@/lib/dal';
import ClassificationView from './view';

export const metadata = { title: 'Call classification' };

export default async function Page() {
  const user = await requireUser('classification.view');
  return <ClassificationView calls={await loadCalls(user)} />;
}
