'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Building2, Users, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card, Kpi, Badge, Button, Empty, Input } from '@/components/ui';
import { setOrgStatus } from '@/app/actions/misc';

export default function PlatformView({ orgs, myOrg }) {
  const router = useRouter(); const [q, setQ] = useState('');
  const rows = orgs.filter((o) => !q || `${o.name} ${o.slug}`.toLowerCase().includes(q.toLowerCase()));
  const act = async (o, status) => { if (!confirm(`${status === 'suspended' ? 'Suspend' : 'Reactivate'} ${o.name}?`)) return; const r = await setOrgStatus({ id: o.id, status }); r.ok ? toast.success(r.message) : toast.error(r.message); router.refresh(); };
  return (
    <div className="space-y-5">
      <PageHeader title="Platform" sub="Every organisation on this deployment. Counts only — tenant records stay inside each workspace." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Organisations" value={orgs.length} icon={Building2} sub={`${orgs.filter((o) => o.status === 'active').length} active`} />
        <Kpi label="Users" value={orgs.reduce((a, o) => a + o.users, 0)} icon={Users} />
        <Kpi label="Calls (30 days)" value={orgs.reduce((a, o) => a + o.calls_30d, 0)} icon={PhoneCall} />
      </div>
      <Card pad={false} title="Organisations" action={<Input className="field-sm w-56" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />}>
        {!rows.length ? <Empty icon={Globe} title="No organisations" /> : (
          <div className="mt-3 overflow-x-auto"><table className="table"><thead><tr><th>Organisation</th><th>Industry</th><th>Users</th><th>Calls</th><th>30 days</th><th>Last active</th><th>Created</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((o) => <tr key={o.id}><td><div className="font-medium">{o.name}</div><div className="text-[12px] text-ink-3">{o.slug}</div></td><td>{o.industry}</td><td className="tabular-nums">{o.users}</td><td className="tabular-nums">{o.calls}</td><td className="tabular-nums">{o.calls_30d}</td>
              <td className="whitespace-nowrap text-ink-3">{o.last_active ? new Date(o.last_active).toLocaleDateString('en-GB') : '—'}</td><td className="whitespace-nowrap text-ink-3">{new Date(o.created_at).toLocaleDateString('en-GB')}</td>
              <td><Badge tone={o.status === 'active' ? 'ok' : 'bad'}>{o.status}</Badge></td>
              <td className="text-right">{o.id !== myOrg && <Button size="sm" variant={o.status === 'active' ? 'danger' : 'secondary'} onClick={() => act(o, o.status === 'active' ? 'suspended' : 'active')}>{o.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
