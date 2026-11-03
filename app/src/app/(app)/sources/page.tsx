import { requireUser } from '@/lib/auth';
import { withOrg } from '@/lib/db';
import { publicAppUrl, flowConnected } from '@/lib/flows';
import { PRESETS } from '@/lib/sources';
import SourcesView from './view';

export const metadata = { title: 'Dialer integration' };

export default async function Page() {
  const user = await requireUser('upload.analyze');
  const data = await withOrg(user.orgId, async (db) => ({
    sources: await db.q(`SELECT s.id, s.provider, s.name, s.field_map, s.default_campaign, s.is_active, s.last_event_at, s.created_at, (s.download_auth_enc IS NOT NULL) AS has_auth,
        (SELECT count(*)::int FROM ingest_events e WHERE e.source_id = s.id) AS events,
        (SELECT count(*)::int FROM ingest_events e WHERE e.source_id = s.id AND e.status = 'failed') AS failed
      FROM call_sources s WHERE s.org_id = $1 ORDER BY s.created_at`, [user.orgId]),
    events: await db.q(`SELECT e.id, e.source_id, s.name AS source_name, e.external_call_id, e.status, e.detail, e.keys, e.call_id, e.created_at, e.updated_at
      FROM ingest_events e JOIN call_sources s ON s.id = e.source_id WHERE e.org_id = $1 ORDER BY e.created_at DESC LIMIT 60`, [user.orgId]),
    unmapped: await db.q(`SELECT agent_code, agent_name FROM agents WHERE org_id = $1 AND agent_name LIKE 'Agent %' AND cardinality(dialer_ids) = 0 ORDER BY created_at DESC LIMIT 20`, [user.orgId]),
  }));
  const presets = Object.entries(PRESETS).map(([key, p]) => ({ key, label: p.label, help: p.help, map: p.map }));
  return <SourcesView {...JSON.parse(JSON.stringify(data))} presets={presets} appUrl={publicAppUrl()} flowConnected={flowConnected('call_processing')} publicUrlSet={!!process.env.PUBLIC_APP_URL} />;
}
