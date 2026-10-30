import { requireUser } from '@/lib/auth';
import { loadNotifications } from '@/lib/dal';
import NotificationsView from './view';

export const metadata = { title: 'Notifications' };

export default async function Page() {
  const user = await requireUser();
  return <NotificationsView items={await loadNotifications(user)} />;
}
