import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { loadUsers, loadRoles, loadGroups, loadAgents } from '@/lib/dal';
import TeamView from './view';

export const metadata = { title: 'Team & roles' };

export default async function Page() {
  const user = await requireUser();
  if (!['users.view', 'groups.view', 'roles.view', 'permissions.assign'].some((p) => user.permissions.includes(p))) redirect('/denied');
  const [users, roles, groups, agents] = await Promise.all([loadUsers(user), loadRoles(user), loadGroups(user), loadAgents(user)]);
  return <TeamView users={users} roles={roles} groups={groups} agents={agents} me={user.id} />;
}
