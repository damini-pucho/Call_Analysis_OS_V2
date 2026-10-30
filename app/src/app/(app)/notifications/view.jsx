'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Ban, Flag, GraduationCap, CheckCheck, Mail } from 'lucide-react';
import { PageHeader, Card, Empty, Button, Badge, cn } from '@/components/ui';
import { markNotifications } from '@/app/actions/misc';

const ICON = { ztp: Ban, coaching: Flag, training: GraduationCap };

export default function NotificationsView({ items }) {
  const router = useRouter();
  const unread = items.filter((n) => !n.read_at);
  const mark = async (ids) => { await markNotifications(ids ? { ids } : {}); router.refresh(); };
  return (
    <div className="space-y-5">
      <PageHeader title="Notifications" sub="Coaching flags, ZTP alerts and training updates for you." actions={unread.length > 0 && <Button size="sm" onClick={() => mark()}><CheckCheck size={14} />Mark all read</Button>} />
      <Card pad={false}>
        {!items.length ? <Empty icon={Bell} title="You're all caught up">Managers are notified here when a call gets a red coaching flag, a ZTP violation or high compliance risk; agents when training is assigned.</Empty> : (
          <ul className="divide-y divide-line">
            {items.map((n) => { const Icon = ICON[n.kind] || Bell; return (
              <li key={n.id} className={cn('flex gap-3 px-5 py-4', !n.read_at && 'bg-accent-soft/40')} style={!n.read_at ? { background: 'color-mix(in srgb, var(--accent-soft) 45%, transparent)' } : undefined}>
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', n.kind === 'ztp' ? 'bg-bad-soft text-bad-text' : n.kind === 'coaching' ? 'bg-warn-soft text-warn-text' : 'bg-info-soft text-info-text')}><Icon size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><span className={cn('text-[14px] text-ink', !n.read_at && 'font-semibold')}>{n.title}</span><span className="text-[12px] text-ink-3">{new Date(n.created_at).toLocaleString('en-GB')}</span></div>
                  {n.body && <p className="mt-0.5 text-[13px] text-ink-2">{n.body}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px]">
                    {n.link && <Link href={n.link} onClick={() => !n.read_at && mark([n.id])} className="font-medium text-ink hover:underline">Open →</Link>}
                    {!n.read_at && <button className="text-ink-3 hover:text-ink" onClick={() => mark([n.id])}>Mark read</button>}
                    <span className="flex items-center gap-1 text-ink-3"><Mail size={12} />{n.email_status === 'sent' ? 'Emailed' : n.email_status === 'not_connected' ? 'Email flow not connected' : n.email_status === 'failed' ? 'Email failed' : 'In-app only'}</span>
                  </div>
                </div>
              </li>); })}
          </ul>
        )}
      </Card>
    </div>
  );
}
