import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { withPlatform } from '@/lib/db';
import PlatformView from './view';

export const metadata = { title: 'Platform' };

/** The SaaS operator's console: every organisation, its size and status. Only for PLATFORM_ADMIN_EMAILS. Counts only — no tenant data. */
export default async function Page() {
  const user = await requireUser();
  if (!user.isPlatform) redirect('/denied');
  const orgs = await withPlatform((db) => db.q(`
    SELECT o.id, o.name, o.slug, o.industry, o.status, o.created_at,
           (SELECT count(*)::int FROM users u WHERE u.org_id = o.id) AS users,
           (SELECT count(*)::int FROM calls c WHERE c.org_id = o.id) AS calls,
           (SELECT count(*)::int FROM calls c WHERE c.org_id = o.id AND c.created_at > now() - interval '30 days') AS calls_30d,
           (SELECT max(u.last_login_at) FROM users u WHERE u.org_id = o.id) AS last_active
      FROM organizations o ORDER BY o.created_at DESC`));
  return <PlatformView orgs={JSON.parse(JSON.stringify(orgs))} myOrg={user.orgId} />;
}
