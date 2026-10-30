'use client';
// Customer profiles — every caller, built from the mobile number on each recording (and enriched by CRM pushes / CSV imports).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Contact, Search, Download, Repeat, TrendingDown, Frown } from 'lucide-react';
import { PageHeader, Kpi, Badge, Empty, Avatar, Input, Button, ChipRow, usePager, Pager, downloadCsv } from '@/components/ui';
import { useCan } from '@/components/providers';
import * as M from '@/lib/metrics';

export default function CustomersView({ customers }) {
  const router = useRouter(); const can = useCan();
  const [q, setQ] = useState(''); const [seg, setSeg] = useState('all');
  const rows = useMemo(() => customers.filter((c) => {
    if (q && ![c.name, c.mobile_number, c.email, c.city, c.external_id].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))) return false;
    if (seg === 'repeat') return c.calls > 1;
    if (seg === 'negative') return c.negative > 0;
    if (seg === 'churn') return !!c.churn_high;
    if (seg === 'crm') return !!c.crm_source;
    return true;
  }), [customers, q, seg]);
  const pager = usePager(rows, 25, q + seg);
  const exportCsv = () => downloadCsv('customers.csv', M.toCsv(rows, [
    { label: 'Mobile', value: 'mobile_number' }, { label: 'Name', value: 'name' }, { label: 'Email', value: 'email' }, { label: 'City', value: 'city' }, { label: 'Segment', value: 'segment' },
    { label: 'Calls', value: 'calls' }, { label: 'Avg quality', value: (r) => r.avg_quality?.toFixed(2) }, { label: 'Negative calls', value: 'negative' }, { label: 'Last call', value: 'last_call_at' }, { label: 'Source', value: 'crm_source' },
  ]));
  return (
    <div className="space-y-5">
      <PageHeader title="Customer profiles" sub="Every caller with their call history, recordings, transcripts and analysis." actions={can('calls.export') && <Button size="sm" onClick={exportCsv} disabled={!rows.length}><Download size={14} />Export CSV</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Customers" value={customers.length} icon={Contact} onClick={() => setSeg('all')} selected={seg === 'all'} />
        <Kpi label="Repeat callers" value={customers.filter((c) => c.calls > 1).length} icon={Repeat} onClick={() => setSeg('repeat')} selected={seg === 'repeat'} />
        <Kpi label="With a negative call" value={customers.filter((c) => c.negative > 0).length} icon={Frown} tone={customers.some((c) => c.negative) ? 'warn' : undefined} onClick={() => setSeg('negative')} selected={seg === 'negative'} />
        <Kpi label="High churn risk" value={customers.filter((c) => c.churn_high).length} icon={TrendingDown} tone={customers.some((c) => c.churn_high) ? 'bad' : undefined} onClick={() => setSeg('churn')} selected={seg === 'churn'} />
      </div>
      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <ChipRow value={seg} onChange={setSeg} label="Segment" options={[{ key: 'all', label: 'All', count: customers.length }, { key: 'repeat', label: 'Repeat' }, { key: 'negative', label: 'Negative' }, { key: 'churn', label: 'Churn risk' }, { key: 'crm', label: 'From CRM' }]} />
          <label className="relative ml-auto w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" /><Input className="field-sm pl-9" placeholder="Name, mobile, email, city, CRM ID" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </div>
        {!rows.length ? <Empty icon={Contact} title={customers.length ? 'No customers match' : 'No customers yet'}>{customers.length ? 'Clear the search or segment.' : 'Customers are created from the mobile number in each uploaded recording, or imported under CRM integration.'}</Empty> : (
          <>
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Customer</th><th>Mobile</th><th>City</th><th>Segment</th><th>Calls</th><th>Avg quality</th><th>Sentiment</th><th>Churn</th><th>Last call</th></tr></thead>
              <tbody>{pager.slice.map((c) => (
                <tr key={c.id} className="row-link" onClick={() => router.push(`/customers/${c.id}`)}>
                  <td><div className="flex items-center gap-2"><Avatar name={c.name || c.mobile_number} size={28} /><div><div className="font-medium text-ink">{c.name || 'Unnamed caller'}</div>{c.email && <div className="text-[12px] text-ink-3">{c.email}</div>}</div></div></td>
                  <td className="tabular-nums">{M.maskMobile(c.mobile_number)}</td><td>{c.city || '—'}</td><td>{c.segment ? <Badge dot={false}>{c.segment}</Badge> : '—'}</td>
                  <td className="tabular-nums">{c.calls}</td><td className="tabular-nums">{c.avg_quality == null ? '—' : `${c.avg_quality.toFixed(2)}/5`}</td>
                  <td className="whitespace-nowrap text-[12px]"><span className="text-ok-text">{c.positive} pos</span> · <span className="text-bad-text">{c.negative} neg</span></td>
                  <td>{c.churn_high ? <Badge tone="bad">High</Badge> : <span className="text-ink-3">—</span>}</td>
                  <td className="whitespace-nowrap text-ink-3">{c.last_call_at ? new Date(c.last_call_at).toLocaleDateString('en-GB') : '—'}</td>
                </tr>))}</tbody></table></div>
            <Pager pager={pager} />
          </>
        )}
      </div>
    </div>
  );
}
