'use client';
// Sentiment analysis — V1 CustomerAnalysis: customer mood, distribution, top intents behind negative calls, trend, agent
// negative-view table and the negative-calls table (rows now open the call; V1's drill-down modal could never open).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Smile, Meh, Frown, Download, ArrowDown } from 'lucide-react';
import { PageHeader, Card, Badge, Empty, Avatar, Button, BarList, usePager, Pager, downloadCsv } from '@/components/ui';
import { SplitBar, Trend } from '@/components/Charts';
import PeriodBar, { usePeriodCalls } from '@/components/PeriodBar';
import { useCan } from '@/components/providers';
import * as M from '@/lib/metrics';

export default function SentimentView({ calls: all, agents }) {
  const can = useCan(); const router = useRouter();
  const calls = usePeriodCalls(all).filter(M.isProcessed);
  const [more, setMore] = useState(false);
  const pos = calls.filter((c) => M.customerSentiment(c) === 'Positive');
  const neg = calls.filter((c) => M.customerSentiment(c) === 'Negative');
  const neu = calls.filter((c) => M.customerSentiment(c) === 'Neutral');
  const n = calls.length;
  const mood = !n ? null : pos.length >= neu.length && pos.length >= neg.length ? 'Mostly positive' : neu.length >= neg.length ? 'Mostly neutral' : 'Needs improvement';
  const negIntents = M.countBy(neg.length ? neg : calls, M.topic);
  const daily = M.dailySeries(calls);
  const agentRows = useMemo(() => M.agentStats(calls, agents).map((a) => ({ ...a, negRate: M.pct(a.negative, a.calls), redNeg: neg.filter((c) => c.agent_code === a.code && M.coachingPriority(c) === 'Red').length })).sort((a, b) => b.negative - a.negative), [calls, agents, neg]);
  const pager = usePager(neg, 15);
  const exportNeg = () => downloadCsv('negative_sentiment_calls_export.csv', M.toCsv(neg, [
    { label: 'Sr', value: (r) => neg.indexOf(r) + 1 }, { label: 'Date', value: 'call_date' }, { label: 'Lead ID', value: 'call_id' }, { label: 'Mobile', value: 'mobile_number' },
    { label: 'Agent', value: (r) => `${r.agent_name} (${r.agent_code})` }, { label: 'Campaign', value: M.campaignOf }, { label: 'Duration', value: (r) => M.fmtDuration(M.seconds(r)) },
    { label: 'Intent', value: M.topic }, { label: 'Agent sentiment', value: M.agentSentiment }, { label: 'Coaching', value: M.coachingPriority }, { label: 'Compliance', value: M.complianceRisk }, { label: 'Summary', value: 'call_summary' },
  ]));
  return (
    <div className="space-y-5">
      <PageHeader title="Sentiment analysis" sub="How customers felt on their calls, and what is behind the negative ones." actions={<><PeriodBar />{can('calls.export') && <Button size="sm" onClick={exportNeg} disabled={!neg.length}><Download size={14} />Export negative</Button>}</>} />
      {!n ? <Card><Empty icon={Smile} title="No analysed calls in this period" /></Card> : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="card p-5">
              <div className="label">Customer mood</div>
              <div className="mt-1 font-display text-[30px] text-ink">{mood}</div>
              <p className="text-[13px] text-ink-3">{M.pct(pos.length, n)}% positive · {M.pct(neg.length, n)}% negative · {M.pct(neu.length, n)}% neutral</p>
              <div className="mt-4"><SplitBar parts={[{ name: 'Positive', value: pos.length }, { name: 'Neutral', value: neu.length }, { name: 'Negative', value: neg.length }]} height={12} /></div>
              {neg.length > 0 && negIntents[0] && (
                <button onClick={() => document.getElementById('negative-calls')?.scrollIntoView({ behavior: 'smooth' })} className="mt-4 flex w-full items-center justify-between rounded-xl border border-warn-edge bg-warn-soft p-3 text-left text-[13px] text-warn-text">
                  <span><b>Worth a look:</b> top reason for negative calls is {negIntents[0].name} — {negIntents[0].value} call{negIntents[0].value === 1 ? '' : 's'}</span><ArrowDown size={15} />
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[['Positive', pos.length, Smile, 'ok'], ['Neutral', neu.length, Meh, 'warn'], ['Negative', neg.length, Frown, 'bad']].map(([l, v, Icon, t]) => (
                <div key={l} className="card flex items-center gap-3 p-4"><span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-${t}-soft text-${t}-text`}><Icon size={18} /></span><div><div className="text-[22px] font-semibold tabular-nums text-ink">{v}</div><div className="text-[13px] text-ink-3">{l} · {M.pct(v, n)}%</div></div></div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={neg.length ? 'Top intents — negative calls' : 'Top intents — all calls'}>
              <BarList rows={negIntents} total={neg.length || n} max={more ? 50 : 8} tone={neg.length ? 'bad' : null} hrefOf={(r) => `/calls?topic=${encodeURIComponent(r.name)}${neg.length ? '&sentiment=Negative' : ''}`} />
              {negIntents.length > 8 && <button className="mt-3 text-[13px] font-medium text-ink-3 hover:text-ink" onClick={() => setMore((m) => !m)}>{more ? 'Show top 8' : 'View more'}</button>}
            </Card>
            <Card title="Customer sentiment over time"><Trend area={false} data={daily} series={[{ key: 'pos', name: 'Positive', color: 'var(--ok)' }, { key: 'neu', name: 'Neutral', color: 'var(--cat-8)' }, { key: 'neg', name: 'Negative', color: 'var(--bad)' }]} /></Card>
          </div>
          <Card title="Agent breakdown — negative view" pad={false}>
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Agent</th><th>Total</th><th>Negative</th><th>Positive</th><th>Neutral</th><th>Negative rate</th><th>Red coaching</th></tr></thead>
              <tbody>{agentRows.map((a) => (
                <tr key={a.code} className="row-link" onClick={() => router.push(`/agents/${encodeURIComponent(a.code)}`)}>
                  <td><div className="flex items-center gap-2"><Avatar name={a.name} size={26} /><div><div className="font-medium">{a.name}</div><div className="text-[12px] text-ink-3">{a.code}</div></div></div></td>
                  <td className="tabular-nums">{a.calls}</td><td className="tabular-nums text-bad-text">{a.negative}</td><td className="tabular-nums text-ok-text">{a.positive}</td><td className="tabular-nums">{a.neutral}</td>
                  <td className="tabular-nums">{a.negRate}%</td><td><Badge tone={a.redNeg ? 'bad' : null} dot={false}>{a.redNeg}</Badge></td>
                </tr>))}</tbody></table></div>
          </Card>
          <Card id="negative-calls" title="Negative calls" sub={`${neg.length} call${neg.length === 1 ? '' : 's'}`} pad={false}>
            {!neg.length ? <Empty icon={Smile} title="No negative calls">Nothing to review in this period.</Empty> : (
              <>
                <div className="overflow-x-auto"><table className="table"><thead><tr><th>Date</th><th>Lead ID</th><th>Mobile</th><th>Agent</th><th>Campaign</th><th>Duration</th><th>Intent</th><th>Agent sent.</th><th>Coaching</th><th>Compliance</th></tr></thead>
                  <tbody>{pager.slice.map((c) => (
                    <tr key={c.id} className="row-link" onClick={() => router.push(`/calls/${c.id}`)}>
                      <td className="whitespace-nowrap">{c.call_date}</td><td className="tabular-nums">{c.call_id}</td><td className="tabular-nums">{M.maskMobile(c.mobile_number)}</td>
                      <td>{c.agent_name}</td><td>{M.campaignOf(c) || '—'}</td><td className="tabular-nums">{M.fmtDuration(M.seconds(c))}</td>
                      <td className="max-w-[220px]"><div className="truncate">{M.topic(c)}</div><div className="truncate text-[12px] text-ink-3">{M.subTopic(c)}</div></td>
                      <td><Badge>{M.agentSentiment(c)}</Badge></td><td><Badge>{M.coachingPriority(c)}</Badge></td><td><Badge invert>{M.complianceRisk(c)}</Badge></td>
                    </tr>))}</tbody></table></div>
                <Pager pager={pager} />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
