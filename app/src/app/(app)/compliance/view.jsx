'use client';
// Compliance & risk — V1 Compliance. The tabs now change the rows (agents / ZTP calls / high-risk calls) and the health badge is computed.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Ban, AlertTriangle, Users, Download, Search } from 'lucide-react';
import { PageHeader, Card, Kpi, Tabs, Badge, Empty, Avatar, Input, Button, ScoreRing, downloadCsv, usePager, Pager } from '@/components/ui';
import { SplitBar } from '@/components/Charts';
import PeriodBar, { usePeriodCalls } from '@/components/PeriodBar';
import { useCan } from '@/components/providers';
import * as M from '@/lib/metrics';

export default function ComplianceView({ calls: all, agents, initialTab }) {
  const can = useCan(); const router = useRouter();
  const calls = usePeriodCalls(all).filter(M.isProcessed);
  const [tab, setTab] = useState(['agents', 'ztp', 'high'].includes(initialTab) ? initialTab : 'agents');
  const [q, setQ] = useState('');
  const ztp = calls.filter(M.isZtp); const high = calls.filter(M.isHighRisk);
  const red = calls.filter((c) => M.coachingPriority(c) === 'Red').length; const amber = calls.filter((c) => M.coachingPriority(c) === 'Amber').length;
  const n = calls.length;
  const health = n ? Math.round(((n - high.length - ztp.filter((c) => !M.isHighRisk(c)).length) / n) * 100) : null;
  const stats = M.agentStats(calls, agents).filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || a.code.toLowerCase().includes(q.toLowerCase()));
  const callRows = (tab === 'ztp' ? ztp : high).filter((c) => !q || (c.agent_name || '').toLowerCase().includes(q.toLowerCase()) || (c.agent_code || '').includes(q));
  const pager = usePager(tab === 'agents' ? stats : callRows, 25, tab + q);
  const exportCsv = () => downloadCsv('high_risk_compliance_report.csv', M.toCsv(stats.filter((a) => a.monitor), [
    { label: 'Agent', value: 'name' }, { label: 'Code', value: 'code' }, { label: 'Status', value: (a) => (a.monitor ? 'Monitor' : 'Good standing') }, { label: 'Calls', value: 'calls' },
    { label: 'High risk', value: 'highRisk' }, { label: 'ZTP', value: 'ztp' }, { label: 'Clean %', value: 'clean' },
  ]));
  return (
    <div className="space-y-5">
      <PageHeader title="Compliance & risk" sub="ZTP violations, high-risk calls and the agents who need coaching." actions={<><PeriodBar />{can('calls.export') && <Button size="sm" onClick={exportCsv} disabled={!stats.some((a) => a.monitor)}><Download size={14} />Export high risk</Button>}</>} />
      {!n ? <Card><Empty icon={ShieldCheck} title="No analysed calls in this period" /></Card> : (
        <>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="card flex flex-col items-center p-5 text-center">
              <div className="label mb-3">Compliance health</div>
              <ScoreRing value={health} label="% clean calls" />
              <Badge className="mt-3" tone={health >= 90 ? 'ok' : health >= 75 ? 'warn' : 'bad'}>{health >= 90 ? 'Healthy' : health >= 75 ? 'Monitor' : 'At risk'}</Badge>
            </div>
            <Card title="Calls by coaching priority" sub="Red = urgent review · Amber = monitor · Green = good standing">
              <SplitBar parts={[{ name: 'Red', value: red }, { name: 'Amber', value: amber }, { name: 'Green', value: n - red - amber }]} height={12} />
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <Kpi label="ZTP violations" value={ztp.length} icon={Ban} tone={ztp.length ? 'bad' : undefined} sub={`${M.pct(ztp.length, n)}% of calls`} onClick={() => setTab('ztp')} selected={tab === 'ztp'} />
                <Kpi label="High-risk calls" value={high.length} icon={AlertTriangle} tone={high.length ? 'bad' : undefined} sub={`${M.pct(high.length, n)}% of calls`} onClick={() => setTab('high')} selected={tab === 'high'} />
                <Kpi label="Calls to coach" value={red + amber} icon={Users} tone={red ? 'warn' : undefined} sub={`across ${M.agentStats(calls, agents).filter((a) => a.red + a.amber > 0).length} agents`} href="/training" />
              </div>
            </Card>
          </div>
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2">
              <Tabs value={tab} onChange={setTab} tabs={[{ key: 'agents', label: 'Agents', count: M.agentStats(calls, agents).length }, { key: 'ztp', label: 'ZTP violations', count: ztp.length }, { key: 'high', label: 'High risk', count: high.length }]} />
              <label className="relative w-full sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" /><Input className="field-sm pl-9" placeholder="Search agent name or code" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            </div>
            <div className="mt-2 overflow-x-auto">
              {tab === 'agents' ? (
                <table className="table"><thead><tr><th>Agent</th><th>Calls</th><th>Risk mix</th><th>ZTP</th><th>High risk</th><th>Clean</th><th>Status</th></tr></thead>
                  <tbody>{pager.slice.map((a) => (
                    <tr key={a.code} className="row-link" onClick={() => router.push(`/agents/${encodeURIComponent(a.code)}`)}>
                      <td><div className="flex items-center gap-2"><Avatar name={a.name} size={28} /><div><div className="font-medium text-ink">{a.name}</div><div className="text-[12px] text-ink-3">{a.code}</div></div></div></td>
                      <td className="tabular-nums">{a.calls}</td>
                      <td className="w-40"><div className="flex h-2 overflow-hidden rounded-full bg-surface-2"><span style={{ width: `${100 - (a.clean ?? 100)}%`, background: 'var(--warn)' }} /><span style={{ width: `${a.clean ?? 0}%`, background: 'var(--ok)' }} /></div></td>
                      <td><Badge tone={a.ztp ? 'bad' : 'ok'} dot={false}>{a.ztp}</Badge></td><td className="tabular-nums">{a.highRisk}</td><td className="tabular-nums">{a.clean}%</td>
                      <td><Badge tone={a.monitor ? 'warn' : 'ok'}>{a.monitor ? 'Monitor' : 'Good standing'}</Badge></td>
                    </tr>))}</tbody></table>
              ) : callRows.length ? (
                <table className="table"><thead><tr><th>Date</th><th>Agent</th><th>Topic</th><th>Compliance</th><th>ZTP</th><th>Summary</th></tr></thead>
                  <tbody>{pager.slice.map((c) => (
                    <tr key={c.id} className="row-link" onClick={() => router.push(`/calls/${c.id}`)}>
                      <td className="whitespace-nowrap">{c.call_date}</td><td><div className="font-medium">{c.agent_name}</div><div className="text-[12px] text-ink-3">{c.agent_code}</div></td>
                      <td>{M.topic(c)}</td><td><Badge invert>{M.complianceRisk(c)}</Badge></td><td><Badge tone={M.isZtp(c) ? 'bad' : 'ok'}>{M.isZtp(c) ? 'Violation' : 'None'}</Badge></td>
                      <td className="max-w-[360px] truncate text-ink-3">{c.call_summary}</td>
                    </tr>))}</tbody></table>
              ) : <Empty icon={ShieldCheck} title={tab === 'ztp' ? 'No ZTP violations' : 'No high-risk calls'}>Nothing to review in this period.</Empty>}
            </div>
            <Pager pager={pager} />
          </div>
        </>
      )}
    </div>
  );
}
