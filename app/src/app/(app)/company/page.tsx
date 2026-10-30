import { requireUser } from '@/lib/auth';
import { loadOrg, loadRules, loadDocuments, loadCampaigns } from '@/lib/dal';
import { flowConnected } from '@/lib/flows';
import CompanyView from './view';

export const metadata = { title: 'Company profile' };

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; welcome?: string }> }) {
  const user = await requireUser('company.view');
  const [org, rules, docs, campaigns, sp] = await Promise.all([loadOrg(user), loadRules(user), loadDocuments(user), loadCampaigns(user), searchParams]);
  return <CompanyView org={org} rules={rules} docs={docs} campaigns={campaigns} extractionConnected={flowConnected('sop_extraction')} initialTab={sp.tab || 'profile'} welcome={sp.welcome === '1'} />;
}
