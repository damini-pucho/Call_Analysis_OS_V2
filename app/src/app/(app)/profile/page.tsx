import { requireUser } from '@/lib/auth';
import { withOrg } from '@/lib/db';
import ProfileView from './view';

export const metadata = { title: 'Profile & security' };

export default async function Page() {
  const user = await requireUser();
  const me = await withOrg(user.orgId, (db) => db.one<any>(
    `SELECT u.phone, u.created_at, u.last_login_at, m.name AS reports_to, g.name AS group_name FROM users u LEFT JOIN users m ON m.id = u.reports_to LEFT JOIN groups g ON g.id = u.group_id WHERE u.id = $1`, [user.id]));
  return <ProfileView me={JSON.parse(JSON.stringify(me || {}))} avatar={user.avatarFileId ? `/api/files/${user.avatarFileId}` : null} />;
}
