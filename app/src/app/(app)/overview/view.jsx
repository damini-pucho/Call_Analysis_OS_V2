'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Flag, TrendingDown, Ban, ChevronDown, Download, ArrowRight, CheckCircle2, Hourglass, PhoneCall, ListChecks, Timer, ArrowLeftRight } from 'lucide-react';
import { Card, Kpi, ScoreRing, Progress, Callout, Empty, Button, downloadCsv, Reveal, cn } from '@/components/ui';
import { SplitBar } from '@/components/Charts';
import PeriodBar, { usePeriodCalls } from '@/components/PeriodBar';
import { useUser, useCan } from '@/components/providers';
import * as M from '@/lib/metrics';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export default function OverviewView({ calls: all }) {
  const user = useUser(); const can = useCan();
  const scoped = usePeriodCalls(all);
  const calls = useMemo(() => scoped.filter(M.isProcessed), [scoped]);
  const pending = scoped.filter((c) => c.status === 'queued' || c.status === 'processing');
  const weights = user.config?.qa_weights;
  const qa = useMemo(() => M.qaHealth(calls, weights), [calls, weights]);
  const [why, setWhy] = useState(false);
  const [showWorking, setShowWorking] = useState(false);
  const outbound = (user.config?.outbound_intents) || [];

  const n = calls.length;
  const avgSop = M.avg(calls.map(M.sopPoints));
  const secs = calls.map(M.seconds).filter((s) => s != null);
  const avgSec = secs.length ? Math.floor(secs.reduce((a, b) => a + b, 0) / secs.length) : null;
  const buckets = [[0, 60, '<1m'], [60, 180, '1–3m'], [180, 300, '3–5m'], [300, 420, '5–7m'], [420, 600, '7–10m'], [600, Infinity, '10m+']].map(([a, b, l]) => ({ l, v: secs.filter((s) => s >= a && s < b).length }));
  const maxB = Math.max(1, ...buckets.map((b) => b.v));
  const dirIn = calls.filter((c) => M.direction(c, outbound) === 'Inbound').length;
  const cls = ['Inquiry', 'Query', 'Complaint'].map((k) => ({ name: k, value: calls.filter((c) => M.classification(c) === k).length }));
  const rated = calls.filter(M.isRated);
  const pos = rated.filter(M.isCsatPositive); const neg = rated.filter((c) => !M.isCsatPositive(c) && M.isCsatNegative(c));
  const extremely = pos.filter((c) => /extremely/i.test(M.intel(c).ivr_rating || '')).length;
  const satisfaction = rated.length ? Math.round((pos.length / rated.length) * 1000) / 10 : null;
  const alerts = [
    { label: 'High compliance risk', value: calls.filter(M.isHighRisk).length, icon: AlertTriangle, href: '/compliance?tab=high' },
    { label: 'Coaching red flags', value: calls.filter((c) => M.coachingPriority(c) === 'Red').length, icon: Flag, href: '/calls?coaching=Red' },
    { label: 'High churn risk', value: calls.filter((c) => M.churnRisk(c) === 'High').length, icon: TrendingDown, href: '/calls?churn=High' },
    { label: 'ZTP violations', value: calls.filter(M.isZtp).length, icon: Ban, href: '/compliance?tab=ztp' },
  ];
  const att = useMemo(() => M.attentionItems(calls), [calls]);
  const daily = useMemo(() => M.dailySeries(calls).slice(-14), [calls]);
  const maxD = Math.max(1, ...daily.map((d) => d.calls));

  const exportCls = (name) => {
    const rows = calls.filter((c) => M.classification(c) === name);
    downloadCsv(`${name.toLowerCase()}_calls_export.csv`, M.toCsv(rows, [
      { label: 'Sr', value: (r) => rows.indexOf(r) + 1 }, { label: 'Call ID', value: 'call_id' }, { label: 'Filename', value: 'filename' }, { label: 'Date', value: 'call_date' },
      { label: 'Agent', value: 'agent_name' }, { label: 'Classification', value: () => name }, { label: 'Topic', value: (r) => M.topic(r) || 'General' }, { label: 'Summary', value: 'call_summary' },
    ]));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <h1 className="mt-1 font-display text-[30px] font-medium leading-tight text-ink">{greet()}, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-[14px] text-ink-3">{n} analysed call{n === 1 ? '' : 's'} in this period{user.scope !== 'all' ? (user.scope === 'team' ? ' · your team' : ' · your calls') : ''}.</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2"><PeriodBar /></div>
      </div>

      {pending.length > 0 && (
        <Callout tone="warn" icon={Hourglass} title={`${pending.length} recording${pending.length === 1 ? '' : 's'} waiting for analysis`}>
          {pending.some((c) => c.status === 'queued') ? 'They are stored but the call-processing flow has not analysed them yet. ' : 'The call-processing flow is working on them. '}
          <Link href="/calls?status=pending" className="font-medium underline underline-offset-2">See them</Link>
        </Callout>
      )}

      {!n ? (
        <Card><Empty icon={PhoneCall} title="No analysed calls yet" action={can('upload.analyze') ? <Link href="/upload" className="btn btn-primary">Upload recordings</Link> : null}>
          {all.length ? 'There are no analysed calls in this period. Try "All time".' : 'Upload call recordings to see QA health, classification, sentiment and coaching here.'}
        </Empty></Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* QA health */}
            <Reveal className="card p-5 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-[15px] font-semibold text-ink">QA health score</h3><p className="text-[13px] text-ink-3">Quality {weights?.quality ?? 35} · resolution {weights?.resolution ?? 25} · compliance {weights?.compliance ?? 15} · CSAT {weights?.csat ?? 25}</p></div>
                {qa && <span className={cn('badge', qa.score >= 80 ? 'badge-ok' : qa.score >= 60 ? 'badge-info' : qa.score >= 45 ? 'badge-warn' : 'badge-bad')}>{qa.status}</span>}
              </div>
              <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
                <ScoreRing value={qa?.score ?? null} label="of 100" />
                <div className="grid w-full flex-1 gap-3 sm:grid-cols-2">
                  {qa && Object.entries(qa.parts).map(([k, p]) => (
                    <div key={k} className="rounded-xl bg-surface-2 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="label">{k === 'csat' ? 'CSAT' : k}</span><span className="text-[13px] tabular-nums text-ink-2">{p.pts == null ? '—' : p.pts.toFixed(1)} / {p.max}</span></div>
                      <div className="mt-1 text-[18px] font-semibold tabular-nums text-ink">{p.label}</div>
                      <Progress className="mt-2" value={p.pts ?? 0} max={p.max} label={k} />
                    </div>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setWhy((w) => !w)} aria-expanded={why} className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
                <ChevronDown size={15} className={cn('transition-transform', why && 'rotate-180')} />Why this score?
              </button>
              {why && qa && (
                <div className="mt-3 grid gap-2 text-[13px] text-ink-2 sm:grid-cols-2">
                  <p><b className="text-ink">Quality</b> — average call quality {qa.parts.quality.label}, scaled to {qa.parts.quality.max} points.</p>
                  <p><b className="text-ink">Resolution</b> — {qa.parts.resolution.label} of calls were resolved.</p>
                  <p><b className="text-ink">Compliance</b> — {qa.parts.compliance.label} of calls had no high compliance risk.</p>
                  <p><b className="text-ink">CSAT</b> — {qa.parts.csat.pts == null ? 'no call carried a rating, so CSAT is left out and the score re-based to 100.' : `${qa.parts.csat.label} of ${qa.rated} rated calls were positive.`}</p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px] text-ink-3">
                <span>{qa?.calls} calls · {qa?.rated} rated</span>
                {can('agents.view') && <Link href="/agents" className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink">Each agent's QA score <ArrowRight size={14} /></Link>}
              </div>
            </Reveal>

            {/* needs attention */}
            <Reveal className="card p-5" delay={0.03}>
              <h3 className="text-[15px] font-semibold text-ink">What needs attention</h3>
              <ul className="mt-3 space-y-2">
                {att.attention.map((a) => (
                  <li key={a.key}><Link href={a.href} className="flex items-start gap-2.5 rounded-lg p-2 text-[13px] text-ink-2 hover:bg-surface-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />{a.text}</Link></li>
                ))}
                {!att.attention.length && <li className="text-[13px] text-ink-3">Nothing flagged in this period.</li>}
              </ul>
              {att.working.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <button type="button" onClick={() => setShowWorking((s) => !s)} aria-expanded={showWorking} className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"><ChevronDown size={15} className={cn('transition-transform', showWorking && 'rotate-180')} />What's working ({att.working.length})</button>
                  {showWorking && <ul className="mt-2 space-y-1.5">{att.working.map((a) => <li key={a.key} className="flex items-start gap-2.5 p-1 text-[13px] text-ink-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" />{a.text}</li>)}</ul>}
                </div>
              )}
            </Reveal>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card p-4">
              <div className="flex items-center justify-between"><span className="label">Total calls</span><PhoneCall size={16} className="text-ink-3" /></div>
              <div className="mt-2 text-[28px] font-semibold tabular-nums text-ink">{scoped.length}</div>
              <div className="text-[12px] text-ink-3">{[[n, 'analysed'], [scoped.filter((c) => c.status === 'skipped').length, 'skipped'], [pending.length, 'waiting'], [scoped.filter((c) => c.status === 'failed').length, 'failed']].filter(([k]) => k).map(([k, w]) => `${k} ${w}`).join(' · ')}</div>
              <div className="mt-3 flex h-8 items-end gap-[3px]" aria-label="Calls per day, last 14 days">{daily.map((d) => <span key={d.date} title={`${d.date}: ${d.calls}`} className="flex-1 rounded-sm bg-cat-1" style={{ height: `${Math.max(10, (d.calls / maxD) * 100)}%`, opacity: 0.75 }} />)}</div>
              <Link href="/calls" className="mt-2 inline-block text-[12px] text-ink-3 hover:text-ink">Open call list →</Link>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between"><span className="label">Avg SOP score</span><ListChecks size={16} className="text-ink-3" /></div>
              <div className="mt-2 text-[28px] font-semibold tabular-nums text-ink">{avgSop == null ? '—' : avgSop.toFixed(1)}<span className="text-[15px] font-normal text-ink-3"> / 7</span></div>
              <Progress className="mt-4" value={avgSop ?? 0} max={7} label="SOP achieved" />
              <Link href="/analytics?tab=sop" className="mt-2 inline-block text-[12px] text-ink-3 hover:text-ink">{avgSop == null ? '' : `${Math.round((avgSop / 7) * 100)}% achieved · `}SOP analysis →</Link>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between"><span className="label">Avg duration</span><Timer size={16} className="text-ink-3" /></div>
              <div className="mt-2 text-[28px] font-semibold tabular-nums text-ink">{M.fmtDuration(avgSec)}</div>
              <div className="mt-3 flex h-8 items-end gap-1">{buckets.map((b) => <span key={b.l} title={`${b.l}: ${b.v}`} className="flex-1 rounded-sm" style={{ height: `${Math.max(8, (b.v / maxB) * 100)}%`, background: b.v === maxB ? 'var(--ink)' : 'var(--line-strong)' }} />)}</div>
              <div className="mt-1 flex justify-between text-[12px] text-ink-3"><span>&lt;1m</span><span>10m+</span></div>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between"><span className="label">Inbound vs outbound</span><ArrowLeftRight size={16} className="text-ink-3" /></div>
              <div className="mt-2 text-[28px] font-semibold tabular-nums text-ink">{Math.round((dirIn / n) * 100)}%<span className="text-[15px] font-normal text-ink-3"> inbound</span></div>
              <div className="mt-4"><SplitBar parts={[{ name: 'Inbound', value: dirIn }, { name: 'Outbound', value: n - dirIn }]} height={8} /></div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3" title="Call classification" sub="What customers called about" action={<Link href="/classification" className="btn btn-ghost btn-sm">Deep dive <ArrowRight size={14} /></Link>}>
              <SplitBar parts={cls} />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {cls.map((c) => (
                  <div key={c.name} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between"><span className="text-[13px] font-medium text-ink">{c.name}</span>{c.name === 'Complaint' && c.value > 0 && <span className="badge badge-bad">watch</span>}</div>
                    <div className="mt-1 text-[22px] font-semibold tabular-nums text-ink">{c.value}<span className="ml-1 text-[13px] font-normal text-ink-3">{Math.round((c.value / n) * 100)}%</span></div>
                    <p className="text-[12px] text-ink-3">{c.name === 'Inquiry' ? 'Customer wants to perform an action' : c.name === 'Query' ? 'Customer asking a specific question' : 'Customer is unhappy and needs resolution'}</p>
                    <div className="mt-2 flex gap-2">
                      <Link href={`/calls?classification=${c.name}`} className="btn btn-secondary btn-sm flex-1">View</Link>
                      <button className="btn btn-ghost btn-sm" onClick={() => exportCls(c.name)} disabled={!c.value || !can('calls.export')} aria-label={`Export ${c.name} calls`}><Download size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="lg:col-span-2" title="IVR & customer feedback" sub={`${rated.length} rated call${rated.length === 1 ? '' : 's'}`}>
              {rated.length ? (
                <>
                  <div className="flex items-center gap-5"><ScoreRing value={satisfaction} size={108} stroke={9} label="satisfied %" />
                    <div className="grid flex-1 grid-cols-2 gap-2">
                      {[['Extremely satisfied', extremely, 'ok'], ['Satisfied', pos.length - extremely, 'ok'], ['Some improvement', rated.length - pos.length - neg.length, 'warn'], ['Not satisfied', neg.length, 'bad']].map(([l, v, t]) => (
                        <div key={l} className="rounded-xl bg-surface-2 p-2.5"><div className={`text-[18px] font-semibold tabular-nums text-${t}-text`}>{v}</div><div className="text-[12px] text-ink-3">{l}</div></div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] text-ink-3">"Extremely satisfied" comes from the IVR rating when the flow records one; otherwise a positive call counts as satisfied.</p>
                </>
              ) : <Empty title="No ratings yet">Calls get a rating from the CSAT indicator or customer sentiment.</Empty>}
            </Card>
          </div>

          <div>
            <h2 className="mb-3 text-ink">Risk & compliance alerts</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {alerts.map((a) => <Kpi key={a.label} label={a.label} value={a.value} icon={a.icon} tone={a.value > 0 ? (a.label.startsWith('ZTP') || a.label.startsWith('High compliance') ? 'bad' : 'warn') : undefined} sub={`${Math.round((a.value / n) * 100)}% of calls`} href={a.href} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
