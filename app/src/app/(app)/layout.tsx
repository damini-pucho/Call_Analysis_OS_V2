import { requireUser } from '@/lib/auth';
import { unreadCount, loadOrg } from '@/lib/dal';
import { AppProviders } from '@/components/providers';
import AppShell from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unread, org] = await Promise.all([unreadCount(user), loadOrg(user)]);
  // what the browser learns about the person: display fields and permission codes (the server re-checks every one)
  const dto = { id: user.id, name: user.name, email: user.email, orgName: user.orgName, orgSlug: user.orgSlug, industry: user.industry,
    roleKey: user.roleKey, roleName: user.roleName, scope: user.scope, permissions: user.permissions, isPlatform: user.isPlatform, agentCode: user.agentCode,
    trainingLocked: user.trainingLocked,
    config: org?.config || {} };
  return (
    <AppProviders user={dto}>
      <AppShell unread={unread} logoSrc={org?.logo_file_id ? `/api/files/${org.logo_file_id}` : null} avatarSrc={user.avatarFileId ? `/api/files/${user.avatarFileId}` : null}>
        {children}
      </AppShell>
    </AppProviders>
  );
}
