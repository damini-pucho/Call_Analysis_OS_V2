import { requireUser } from '@/lib/auth';
import { loadFlowRuns, loadOrg } from '@/lib/dal';
import { FLOWS, flowConnected, publicAppUrl } from '@/lib/flows';
import SettingsView from './view';

export const metadata = { title: 'Settings' };

export default async function Page() {
  const user = await requireUser('settings.manage');
  const [runs, org] = await Promise.all([loadFlowRuns(user), loadOrg(user)]);
  // only facts about wiring cross to the browser — never a webhook URL or token value
  const flows = Object.entries(FLOWS).map(([key, f]) => ({ key, label: f.label, env: f.env, connected: flowConnected(key as keyof typeof FLOWS) }));
  return <SettingsView flows={flows} runs={runs} org={org} appUrl={publicAppUrl()} publicUrlSet={!!process.env.PUBLIC_APP_URL} inboundOpen={(process.env.INBOUND_TOKEN || '').length >= 24} />;
}
