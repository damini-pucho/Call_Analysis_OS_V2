'use client';
// Analytics — V1 Overview / Trends / SOP Analysis / Language tabs. SOP now reads sop_results (V1 read kpi_results and filled
// fake defaults); the 90-day heatmap is built from real call dates; campaign comparison keeps quality and resolution on their own scales.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, TrendingUp, ListChecks, Languages, Globe2, Repeat, AlertOctagon } from 'lucide-react';
import { PageHeader, Card, Kpi, Tabs, Badge, Empty, Progress } from '@/components/ui';
import { HBar, VBar, Donut, Trend } from '@/components/Charts';
import PeriodBar, { usePeriodCalls } from '@/components/PeriodBar';
import * as M from '@/lib/metrics';

export default function AnalyticsView({ calls: all, initialTab }) {
  const [tab, setTab] = useState(['overview', 'trends', 'sop', 'language'].includes(initialTab) ? initialTab : 'overview');
  const calls = usePeriodCalls(all).filter(M.isProcessed);
  return (
    <div>
      <PageHeader title="Analytics" sub="Intent, risk, quality, SOP adherence and language across your calls." actions={<PeriodBar />} />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview', icon: BarChart3 }, { key: 'trends', label: 'Trends', icon: TrendingUp }, { key: 'sop', label: 'SOP analysis', icon: ListChecks }, { key: 'language', label: 'Language', icon: Languages }]} />
      {!calls.length ? <Card><Empty title="No analysed calls in this period">Widen the period or upload recordings.</Empty></Card>
        : tab === 'overview' ? <Overview calls={calls} /> : tab === 'trends' ? <Trends calls={calls} /> : tab === 'sop' ? <Sop calls={calls} /> : <Language calls={calls} />}
    </div>
  );
}

function Overview({ calls }) {
  const intents = M.countBy(calls, M.topic).slice(0, 12);
  const risk = ['High', 'Medium', 'Low', 'None'].map((k) => ({ name: k === 'None' ? 'No risk' : k, value: calls.filter((c) => (M.complianceRisk(c) || 'None') === k).length }));
  const qd = [1, 2, 3, 4, 5].map((s) => ({ name: `Score ${s}`, value: calls.filter((c) => M.qualityRounded(c) === s).length, color: s <= 2 ? 'var(--bad)' : s === 3 ? 'var(--warn)' : 'var(--ok)' }));
  const sent = ['Positive', 'Neutral', 'Negative'].map((k) => ({ name: k, value: calls.filter((c) => M.customerSentiment(c) === k).length }));
  const camp = M.countBy(calls, M.campaignOf).map(({ name }) => { const cs = calls.filter((c) => M.campaignOf(c) === name); return { name, calls: cs.length, quality: Number((M.avg(cs.map(M.quality)) ?? 0).toFixed(2)), sop: Number((M.avg(cs.map(M.sopPoints)) ?? 0).toFixed(1)), resolution: M.pct(cs.filter(M.isResolved).length, cs.length) }; });
  const resByIntent = intents.map(({ name }) => { const cs = calls.filter((c) => M.topic(c) === name); return { name, value: M.pct(cs.filter(M.isResolved).length, cs.length) }; }).sort((a, b) => b.value - a.value);
  const gaps = M.countBy(calls.filter((c) => (M.qualityRounded(c) ?? 5) < 4), M.topic).slice(0, 12);
  const repeat = calls.filter((c) => M.intel(c).repeat_caller === true).length;
  const nri = calls.filter((c) => M.intel(c).nri_caller === true || /nri/i.test(M.topic(c) || '')).length;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
        <Kpi label="Repeat callers" value={repeat} icon={Repeat} sub="Called again within 7 days (from customer history)" href="/customers" />
        <Kpi label="NRI callers" value={nri} icon={Globe2} sub="Flagged by the analysis or an NRI intent" href="/calls?topic=NRI" />
        <Kpi label="Systemic issues" value={calls.filter(M.isHighRisk).length} icon={AlertOctagon} tone={calls.some(M.isHighRisk) ? 'bad' : undefined} sub="High compliance-risk calls" href="/compliance?tab=high" />
      </div>
      <Card title="Call intent distribution" sub="Top 12 intents"><HBar data={intents} /></Card>
      <Card title="Compliance risk breakdown"><Donut data={risk} />
        <ul className="mt-4 grid gap-1.5 text-[12px] text-ink-3 sm:grid-cols-2"><li><b className="text-ink-2">No risk</b> — zero compliance issues</li><li><b className="text-ink-2">Low</b> — minor, monitor occasionally</li><li><b className="text-ink-2">Medium</b> — needs follow-up</li><li><b className="text-ink-2">High</b> — serious, act now</li></ul>
      </Card>
      <Card title="Quality score distribution" sub="Calls by rounded quality (1–5)"><VBar data={qd} /></Card>
      <Card title="Customer sentiment"><Donut data={sent} /></Card>
      <Card className="lg:col-span-2" title="Campaign performance" sub="Quality and SOP on a 0–5 / 0–7 scale; resolution in %" pad={false}>
        <div className="overflow-x-auto"><table className="table"><thead><tr><th>Campaign</th><th>Calls</th><th>Avg quality</th><th>Avg SOP</th><th>Resolution</th></tr></thead>
          <tbody>{camp.map((c) => <tr key={c.name}><td className="font-medium"><Link className="hover:underline" href={`/calls?campaign=${encodeURIComponent(c.name)}`}>{c.name}</Link></td><td className="tabular-nums">{c.calls}</td>
            <td><div className="flex items-center gap-2"><span className="w-10 tabular-nums">{c.quality}</span><Progress className="w-24" value={c.quality} max={5} /></div></td>
            <td><div className="flex items-center gap-2"><span className="w-10 tabular-nums">{c.sop}</span><Progress className="w-24" value={c.sop} max={7} /></div></td>
            <td className="tabular-nums">{c.resolution ?? '—'}%</td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Resolution rate by intent" sub="% of calls resolved"><HBar data={resByIntent} unit="%" format={(v) => `${v}%`} color="var(--ok)" /></Card>
      <Card title="Agent knowledge gaps" sub="Calls scoring under 4/5, by intent">{gaps.length ? <HBar data={gaps} color="var(--warn)" /> : <Empty title="No gaps">Every call scored 4/5 or better.</Empty>}</Card>
    </div>
  );
}

function Trends({ calls }) {
  const daily = M.dailySeries(calls);
  const heat = useMemo(() => {
    const counts = new Map(daily.map((d) => [d.date, d.calls])); const max = Math.max(1, ...daily.map((d) => d.calls));
    const days = []; const today = new Date();
    for (let k = 90; k >= 0; k--) { const d = new Date(today.getTime() - k * 86400000); const key = d.toISOString().slice(0, 10); days.push({ key, n: counts.get(key) || 0, max }); }
    return days;
  }, [daily]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2" title="Last 90 days" sub={`${heat.reduce((a, d) => a + d.n, 0)} calls`}>
        <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1" style={{ gridAutoColumns: '14px' }}>
          {heat.map((d) => <span key={d.key} title={`${d.key}: ${d.n} call(s)`} className="h-3.5 w-3.5 rounded-[4px]" style={{ background: d.n ? `color-mix(in srgb, var(--cat-1) ${20 + (d.n / d.max) * 80}%, transparent)` : 'var(--surface-2)' }} />)}
        </div>
      </Card>
      <Card title="Daily call volume"><Trend data={daily} series={[{ key: 'calls', name: 'Calls' }]} /></Card>
      <Card title="Quality score trend" sub="Average quality per day (0–5)"><Trend data={daily} series={[{ key: 'quality', name: 'Quality', color: 'var(--ok)' }]} yDomain={[0, 5]} /></Card>
      <Card title="Churn risk trend"><Trend area={false} data={daily} series={[{ key: 'highChurn', name: 'High churn', color: 'var(--bad)' }, { key: 'lowChurn', name: 'Low / medium', color: 'var(--ok)' }]} /></Card>
      <Card title="Compliance violations trend" sub="High risk or ZTP"><Trend area={false} data={daily} series={[{ key: 'violations', name: 'Violations', color: 'var(--bad)' }]} /></Card>
    </div>
  );
}

function Sop({ calls }) {
  const rows = M.sopBreakdown(calls);
  const dist = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ name: `${n}/7`, value: calls.filter((c) => Math.round(M.sopPoints(c) ?? -1) === n).length, color: n <= 3 ? 'var(--bad)' : n <= 5 ? 'var(--warn)' : 'var(--ok)' })).filter((d, i, a) => d.value || i >= 3);
  const avgS = M.avg(calls.map(M.sopPoints));
  if (!rows.length) return <Card><Empty title="No SOP results">The analysed calls carry no SOP checkpoint results.</Empty></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="SOP pass rate per checkpoint" sub="Pass ÷ (pass + fail); NA excluded"><HBar data={rows.map((r) => ({ name: r.name, value: r.passRate ?? 0, color: (r.passRate ?? 0) < 50 ? 'var(--bad)' : (r.passRate ?? 0) < 80 ? 'var(--warn)' : 'var(--ok)' }))} unit="%" format={(v) => `${v}%`} /></Card>
      <Card title="SOP score distribution" sub={`Average ${avgS == null ? '—' : avgS.toFixed(1)}/7 · target 6/7`}><VBar data={dist} target={null} />
        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-ink-3"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-bad" />Critical 0–3</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-warn" />Needs work 4–5</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-ok" />Compliant 6–7</span></div>
      </Card>
      <Card className="lg:col-span-2" title="SOP checkpoint detail" sub="Sorted by fail rate" pad={false}>
        <div className="overflow-x-auto"><table className="table"><thead><tr><th>Checkpoint</th><th>Pass</th><th>Fail</th><th>N/A</th><th>Status</th></tr></thead>
          <tbody>{[...rows].sort((a, b) => b.failPct - a.failPct).map((r) => <tr key={r.name}><td className="font-medium">{r.name}</td>
            <td><div className="flex items-center gap-2"><span className="w-10 tabular-nums">{r.passPct}%</span><Progress className="w-24" value={r.passPct} tone={r.passPct < 40 ? 'bad' : 'ok'} /></div></td>
            <td className="tabular-nums">{r.failPct}%</td><td className="tabular-nums text-ink-3">{r.naPct}%</td><td><Badge tone={(r.passRate ?? 0) >= 70 ? 'ok' : 'bad'}>{(r.passRate ?? 0) >= 70 ? 'Good' : 'Critical'}</Badge></td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}

function Language({ calls }) {
  const langs = M.countBy(calls, M.languageBucket);
  const rows = langs.map(({ name, value }) => { const cs = calls.filter((c) => M.languageBucket(c) === name); return { name, calls: value, quality: M.avg(cs.map(M.quality)), sop: M.avg(cs.map(M.sopPoints)), res: M.pct(cs.filter(M.isResolved).length, cs.length), high: cs.filter(M.isHighRisk).length }; });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Language distribution"><Donut data={langs} /></Card>
      <Card title="Quality & SOP by language" sub="Quality 0–5 · SOP scaled to 0–5"><VBar data={rows.map((r) => ({ name: r.name, quality: Number((r.quality ?? 0).toFixed(2)), sop: Number((((r.sop ?? 0) * 5) / 7).toFixed(2)) }))} bars={[{ key: 'quality', name: 'Quality' }, { key: 'sop', name: 'SOP (×5/7)' }]} yDomain={[0, 5]} /></Card>
      <Card className="lg:col-span-2" title="Quality metrics by language" pad={false}>
        <div className="overflow-x-auto"><table className="table"><thead><tr><th>Language</th><th>Calls</th><th>Avg quality</th><th>Avg SOP</th><th>Resolution</th><th>High compliance risk</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.name}><td className="font-medium">{r.name}</td><td className="tabular-nums">{r.calls}</td><td className="tabular-nums">{r.quality?.toFixed(2)}/5</td><td className="tabular-nums">{r.sop?.toFixed(1)}/7</td><td className="tabular-nums">{r.res}%</td><td><Badge tone={r.high ? 'bad' : 'ok'} dot={false}>{r.high}</Badge></td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}
