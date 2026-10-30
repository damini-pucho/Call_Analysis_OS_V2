import { requireUser } from '@/lib/auth';
import { flowConnected } from '@/lib/flows';
import { loadOrg, loadCalls } from '@/lib/dal';
import UploadView from './view';

export const metadata = { title: 'Upload & analyse' };

export default async function UploadPage() {
  const user = await requireUser('upload.analyze');
  const [org, calls] = await Promise.all([loadOrg(user), loadCalls(user)]);
  const recent = calls.filter((c: any) => c.status !== 'processed').slice(0, 30);
  return <UploadView connected={flowConnected('call_processing')} pattern={org?.config?.filename_pattern || 'YYYYMMDD-LEADID_MOBILE_AGENTCODE_CAMPAIGN-FLAG'} waiting={recent} />;
}
