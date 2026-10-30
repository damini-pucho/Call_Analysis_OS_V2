import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getCall, loadOrg } from '@/lib/dal';
import CallDetail from './view';

export const metadata = { title: 'Call detail' };

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser('calls.view');
  const { id } = await params;
  const [data, org] = await Promise.all([getCall(user, id), loadOrg(user)]);
  if (!data) notFound();
  return <CallDetail call={data.call} notes={data.notes} runs={data.runs} maskPii={org?.config?.pii_masking !== false} />;
}
