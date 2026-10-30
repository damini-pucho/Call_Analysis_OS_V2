'use client';
// Agents — V1 Agents + AgentSentiment: team QA hero, agent QA cards, KPI 15 sentiment lens, leaderboard; CSV and PDF export.
// Every number is computed (V1 had static Resolution/Compliance/CSAT bars and a refresh button that did nothing).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, Star, Flag, AlertCircle, Download, Printer, ArrowRight, Search } from 'lucide-react';
import { PageHeader, Card, Kpi, Badge, Empty, Avatar, Progress, ScoreRing, Input, Button, downloadCsv, cn } from '@/components/ui';
import PeriodBar, { usePeriodCalls } from '@/components/PeriodBar';
import { useCan } from '@/components/providers';
import * as M from '@/lib/metrics';

const ringTone = (s) => (s == null ? 'var(--line)' : s >= 80 ? 'var(--ok)' : s >= 60 ? 'var(--info)' : s >= 50 ? 'var(--warn)' : 'var(--bad)');

export default function AgentsView({ calls: all, agents }) {
  const can = useCan(); const router = useRouter();
  const calls = usePeriodCalls(all).filter(M.isProcessed);
  const [q, setQ] = useState('');
  const stats = useMemo(() => M.agentStats(calls, agents), [calls, agents]);
  const shown = stats.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || a.code.toLowerCase().includes(q.toLowerCase()));
  const qa = M.qaHealth(calls);
  const teamQ = M.avg(stats.map((a) => a.quality));
  const pro = stats.reduce((s, a) => s + a.pro, 0), neu = stats.reduce((s, a) => s + a.neu, 0), un = stats.reduce((s, a) => s + a.unpro, 0); const sn = pro + neu + un;
  const health = sn ? Math.round((pro * 100 + neu * 50) / sn) : null;

  const exportCsv = () => downloadCsv(`Agent_Performance_Report_${new Date().toISOString().slice(0, 10)}.csv`, M.toCsv(stats, [
    { label: 'Rank', value: 'rank' }, { label: 'Agent', value: 'name' }, { label: 'Code', value: 'code' }, { label: 'Calls', value: 'calls' },
    { label: 'Quality /5', value: (a) => a.quality?.toFixed(2) }, { label: 'SOP /7', value: (a) => a.sop?.toFixed(1) }, { label: 'Empathy /5', value: (a) => a.empathy?.toFixed(1) },
    { label: 'Resolution %', value: 'resolution' }, { label: 'Red flags', value: 'red' }, { label: 'Sentiment score', value: 'sentimentScore' },
  ]));
  const printPdf = () => {
    const w = window.open('', '_blank', 'noopener=no,width=900,height=700'); if (!w) return;
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    w.document.write(`<html><head><title>Agent performance</title><style>body{font-family:system-ui;padding:24px;color:#141413}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}th{text-transform:uppercase;font-size:11px;color:#676F77}</style></head><body><h2>Agent performance report</h2><p>${new Date().toLocaleString('en-GB')}</p><table><tr><th>Rank</th><th>Agent</th><th>Code</th><th>Calls</th><th>Quality</th><th>SOP</th><th>Resolution</th></tr>${stats.map((a) => `<tr><td>${a.rank}</td><td>${esc(a.name)}</td><td>${esc(a.code)}</td><td>${a.calls}</td><td>${a.quality?.toFixed(2) ?? '—'}</td><td>${a.sop?.toFixed(1) ?? '—'}</td><td>${a.resolution ?? '—'}%</td></tr>`).join('')}</table></body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Agents" sub="QA health, sentiment and performance for every agent in your scope." actions={<>
        <PeriodBar />
        {can('calls.export') && <><Button size="sm" onClick={exportCsv} disabled={!stats.length}><Download size={14} />CSV</Button><Button size="sm" onClick={printPdf} disabled={!stats.length}><Printer size={14} />PDF</Button></>}
      </>} />
      {!stats.length ? <Card><Empty icon={Users} title="No analysed calls for your agents in this period" /></Card> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Active agents" value={stats.length} icon={Users} href="#leaderboard" />
            <Kpi label="Team quality" value={teamQ == null ? '—' : `${teamQ.toFixed(2)}/5`} icon={Star} sub="Average of agent averages" />
            <Kpi label="Agents with red flags" value={stats.filter((a) => a.red > 0).length} icon={Flag} tone={stats.some((a) => a.red) ? 'bad' : undefined} href="/calls?coaching=Red" />
            <Kpi label="Agents with amber" value={stats.filter((a) => a.amber > 0).length} icon={AlertCircle} tone={stats.some((a) => a.amber) ? 'warn' : undefined} href="/calls?coaching=Amber" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <div className="card flex flex-col items-center p-5 text-center">
              <div className="label mb-3">Team QA health</div>
              <ScoreRing value={qa?.score ?? null} label={qa?.status || ''} />
              <p className="mt-3 text-[13px] text-ink-3">{calls.length} calls · {qa?.rated ?? 0} rated · {stats.length} agents</p>
              <div className="mt-4 w-full space-y-2.5 text-left">
                {qa && Object.entries(qa.parts).map(([k, p]) => <div key={k}><div className="flex justify-between text-[12px]"><span className="label">{k === 'csat' ? 'CSAT' : k}</span><span className="tabular-nums text-ink-2">{p.label}</span></div><Progress value={p.pts ?? 0} max={p.max} /></div>)}
              </div>
            </div>
            <Card title="Agent QA health" sub="Score = average quality ÷ 5 × 100 · Excellent ≥ 80 · Good ≥ 60">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {stats.map((a) => (
                  <Link key={a.code} href={`/agents/${encodeURIComponent(a.code)}`} className="flex items-center gap-3 rounded-2xl border border-line p-3 transition-colors hover:bg-surface-2">
                    <div className="relative h-12 w-12 shrink-0"><svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={ringTone(a.score)} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${((a.score ?? 0) / 100) * 97.4} 97.4`} /></svg><span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums">{a.score ?? '—'}</span></div>
                    <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink">{a.name}</div><div className="text-[12px] text-ink-3">{a.code} · {a.calls} calls</div></div>
                    <Badge>{a.status}</Badge>
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Sentiment lens · KPI 15" sub={`Agent tone across ${sn} calls · team health = (professional × 100 + neutral × 50) ÷ calls`}>
            <div className="flex flex-wrap items-center gap-6">
              <div><div className="text-[32px] font-semibold tabular-nums text-ink">{health ?? '—'}</div><Badge tone={health >= 80 ? 'ok' : health >= 50 ? 'warn' : 'bad'}>{health >= 80 ? 'Excellent' : health >= 50 ? 'Good' : 'Critical'}</Badge></div>
              <div className="grid flex-1 grid-cols-3 gap-3">{[['Professional', pro, 'ok'], ['Neutral', neu, 'warn'], ['Unprofessional', un, 'bad']].map(([l, v, t]) => <div key={l} className="rounded-xl bg-surface-2 p-3"><div className={`text-[20px] font-semibold tabular-nums text-${t}-text`}>{sn ? Math.round((v / sn) * 100) : 0}%</div><div className="text-[12px] text-ink-3">{l} · {v}</div></div>)}</div>
            </div>
          </Card>

          <Card id="leaderboard" title="Performance leaderboard" pad={false} action={<label className="relative w-56"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" /><Input className="field-sm pl-9" placeholder="Search agents" value={q} onChange={(e) => setQ(e.target.value)} /></label>}>
            <div className="mt-3 overflow-x-auto">
              <table className="table"><thead><tr><th>#</th><th>Agent</th><th>Calls</th><th>Quality</th><th>SOP</th><th>Empathy</th><th>Resolution</th><th>Sentiment</th><th>Red flags</th><th /></tr></thead>
                <tbody>{shown.map((a) => (
                  <tr key={a.code} className="row-link" onClick={() => router.push(`/agents/${encodeURIComponent(a.code)}`)}>
                    <td className="tabular-nums text-ink-3">{a.rank}</td>
                    <td><div className="flex items-center gap-2"><Avatar name={a.name} size={28} /><div><div className="font-medium text-ink">{a.name}</div><div className="text-[12px] text-ink-3">{a.code}</div></div></div></td>
                    <td className="tabular-nums">{a.calls}</td>
                    <td><div className="flex items-center gap-2"><span className="w-9 tabular-nums">{a.quality?.toFixed(2)}</span><Progress className="w-16" value={a.quality ?? 0} max={5} /></div></td>
                    <td><div className="flex items-center gap-2"><span className="w-7 tabular-nums">{a.sop?.toFixed(1)}</span><Progress className="w-16" value={a.sop ?? 0} max={7} /></div></td>
                    <td className="tabular-nums">{a.empathy?.toFixed(1) ?? '—'}</td>
                    <td className="tabular-nums">{a.resolution ?? '—'}%</td>
                    <td className="tabular-nums">{a.sentimentScore ?? '—'}</td>
                    <td><Badge tone={a.red ? 'bad' : 'ok'} dot={false}>{a.red}</Badge></td>
                    <td><ArrowRight size={15} className="text-ink-3" /></td>
                  </tr>))}</tbody></table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
