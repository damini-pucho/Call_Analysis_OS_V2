'use client';
// One agent — V1 AgentDetail, computed from this agent's calls only. Adds knowledge gaps with "Assign training", their coaching
// notes and their training assignments (the Agent Training module).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Pause, GraduationCap, TrendingUp, TrendingDown, Minus, Plus } from 'lucide-react';
import { PageHeader, Card, Badge, Empty, Avatar, Progress, ScoreRing, Button, Stat, cn, BarList } from '@/components/ui';
import { Trend } from '@/components/Charts';
import { useCan, usePlayer, useUser } from '@/components/providers';
import AssignTraining from '@/components/AssignTraining';
import * as M from '@/lib/metrics';

export default function AgentDetail({ code, agent, calls: all, notes, assignments, modules }) {
  const can = useCan(); const user = useUser(); const player = usePlayer(); const router = useRouter();
  const calls = all.filter(M.isProcessed);
  const [weeks, setWeeks] = useState(12); const [assign, setAssign] = useState(null);
  const s = useMemo(() => M.agentStats(calls, agent ? [agent] : [])[0], [calls, agent]);
  const qa = M.qaHealth(calls);
  const series = useMemo(() => M.weeklySeries(calls, weeks), [calls, weeks]);
  const withData = series.filter((w) => w.kpi != null);
  const trend = withData.length >= 2 ? withData[withData.length - 1].kpi - withData[0].kpi : null;
  const gaps = useMemo(() => M.knowledgeGaps(calls), [calls]);
  const themes = useMemo(() => M.improvementThemes(calls), [calls]);
  const camps = M.countBy(calls, M.campaignOf).map(({ name, value }) => { const cs = calls.filter((c) => M.campaignOf(c) === name); return { name, value, q: M.avg(cs.map(M.quality)), res: M.pct(cs.filter(M.isResolved).length, cs.length) }; });
  const name = agent?.agent_name || all[0]?.agent_name || code;
  const self = user.scope === 'own';
  const posRate = calls.length ? M.pct(calls.filter((c) => M.customerSentiment(c) === 'Positive').length, calls.length) : null;

  return (
    <div className="space-y-5">
      <PageHeader crumbs={self ? [{ label: 'Overview', href: '/overview' }, { label: 'My QA profile' }] : [{ label: 'Agents', href: '/agents' }, { label: name }]}
        title={<span className="flex items-center gap-3"><Avatar name={name} size={44} /><span>{name} <span className="text-[15px] font-normal text-ink-3">· {code}</span></span></span>}
        sub={[agent?.group_name && `Group: ${agent.group_name}`, agent?.supervisor_name && `Reports to ${agent.supervisor_name}`, `${all.length} call${all.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
        actions={can('training.assign') && <Button variant="primary" onClick={() => setAssign({ agent_codes: [code] })}><GraduationCap size={16} />Assign training</Button>} />

      {!calls.length ? <Card><Empty title="No analysed calls for this agent yet">Their calls will appear here once analysed.</Empty></Card> : (
        <>
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <div className="card flex flex-col items-center p-5 text-center">
              <div className="label mb-3">QA health</div>
              <ScoreRing value={qa?.score ?? null} label={qa?.status || ''} />
              <p className="mt-3 text-[13px] text-ink-3">{qa?.calls} calls · {qa?.rated} rated</p>
              <div className="mt-4 w-full space-y-2.5 text-left">{qa && Object.entries(qa.parts).map(([k, p]) => <div key={k}><div className="flex justify-between text-[12px]"><span className="label">{k === 'csat' ? 'CSAT' : k}</span><span className="tabular-nums text-ink-2">{p.label}</span></div><Progress value={p.pts ?? 0} max={p.max} /></div>)}</div>
            </div>
            <div className="grid content-start gap-3 sm:grid-cols-3">
              <Stat label="Avg quality" value={s?.quality == null ? '—' : `${s.quality.toFixed(2)}/5`} />
              <Stat label="Avg SOP" value={s?.sop == null ? '—' : `${s.sop.toFixed(1)}/7`} />
              <Stat label="Avg empathy" value={s?.empathy == null ? '—' : `${s.empathy.toFixed(1)}/5`} />
              <Stat label="Resolution" value={s?.resolution == null ? '—' : `${s.resolution}%`} />
              <Stat label="FCR rate" value={s?.fcr == null ? '—' : `${s.fcr}%`} />
              <Stat label="Avg duration" value={M.fmtDuration(s?.avgSeconds)} />
              <div className="card p-4 sm:col-span-3">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div><div className="label mb-2">Agent sentiment</div>{[['Professional', s.pro, 'ok'], ['Neutral', s.neu, 'warn'], ['Unprofessional', s.unpro, 'bad']].map(([l, v, t]) => <div key={l} className="mb-1.5"><div className="flex justify-between text-[12px]"><span className="text-ink-2">{l}</span><span className="tabular-nums text-ink-3">{v}</span></div><Progress value={v} max={Math.max(1, s.pro + s.neu + s.unpro)} tone={t} /></div>)}<div className="mt-1 text-[12px] text-ink-3">Health {s.sentimentScore ?? '—'}/100</div></div>
                  <div><div className="label mb-2">Customer sentiment</div>{[['Positive', s.positive, 'ok'], ['Neutral', s.neutral, 'warn'], ['Negative', s.negative, 'bad']].map(([l, v, t]) => <div key={l} className="mb-1.5"><div className="flex justify-between text-[12px]"><span className="text-ink-2">{l}</span><span className="tabular-nums text-ink-3">{v}</span></div><Progress value={v} max={Math.max(1, calls.length)} tone={t} /></div>)}<div className="mt-1 text-[12px] text-ink-3">Positive rate {posRate ?? '—'}%</div></div>
                  <div><div className="label mb-2">Risk & coaching</div><dl className="space-y-1.5 text-[13px]">{[['Red flag calls', s.red, 'bad'], ['Amber priority', s.amber, 'warn'], ['Green', s.green, 'ok'], ['High compliance risk', s.highRisk, 'bad'], ['High churn risk', s.churnHigh, 'bad']].map(([l, v, t]) => <div key={l} className="flex justify-between"><dt className="text-ink-2">{l}</dt><dd><Badge tone={v ? t : null} dot={false}>{v}</Badge></dd></div>)}</dl></div>
                </div>
              </div>
            </div>
          </div>

          <Card title="Weekly KPI score history" sub="Weekly score = average quality × 20. Weeks without calls are gaps." action={<div className="flex items-center gap-2">
            {trend != null && <Badge tone={trend > 2 ? 'ok' : trend < -2 ? 'bad' : null}>{trend > 2 ? <><TrendingUp size={13} />Trending up</> : trend < -2 ? <><TrendingDown size={13} />Trending down</> : <><Minus size={13} />Stable</>}</Badge>}
            {[12, 26, 52].map((w) => <button key={w} className="chip" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{w}W</button>)}
          </div>}>
            <Trend data={series} xKey="week" series={[{ key: 'kpi', name: 'KPI score' }]} yDomain={[0, 100]} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Knowledge gaps" sub="Failed SOPs, KPI misses and weak topics across this agent's calls">
              {gaps.length ? (
                <ul className="space-y-2">{gaps.slice(0, 8).map((g) => (
                  <li key={g.key} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium text-ink">{g.key}</div><div className="text-[12px] text-ink-3">{g.count} call{g.count === 1 ? '' : 's'} · {g.area}</div></div>
                    {can('training.assign') && <Button size="sm" onClick={() => setAssign({ agent_codes: [code], gap: `${g.key} (${g.count} calls)`, source_call_id: g.calls[0] })}><Plus size={14} />Assign</Button>}
                  </li>))}</ul>
              ) : <Empty title="No gaps found">Every SOP and KPI was met on this agent's calls.</Empty>}
            </Card>
            <Card title="Improvement areas" sub="Recurring themes from the AI's improvement notes">{themes.length ? <BarList rows={themes} max={8} tone="warn" /> : <Empty title="No improvement notes" />}</Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Training" sub="Assignments for this agent" pad={false}>
              <ul className="divide-y divide-line">{assignments.map((t) => <li key={t.id} className="flex items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium text-ink">{t.title}</div><div className="truncate text-[12px] text-ink-3">{t.gap || '—'} · due {t.due_date || '—'}</div></div><Badge>{t.status}</Badge></li>)}
                {!assignments.length && <li><Empty title="No training assigned" /></li>}</ul>
            </Card>
            <Card title="Coaching notes" pad={false}>
              <ul className="divide-y divide-line">{notes.slice(0, 8).map((n) => <li key={n.id} className="px-5 py-3 text-[13px]"><div className="mb-1 flex justify-between gap-2"><Badge dot={false} tone={n.note_type === 'Critical' ? 'bad' : null}>{n.note_type}</Badge><span className="text-[12px] text-ink-3">{n.created_by_name} · {new Date(n.created_at).toLocaleDateString('en-GB')}</span></div><p className="text-ink-2">{n.note_text}</p>{n.call_id && <Link href={`/calls/${n.call_id}`} className="text-[12px] text-ink-3 hover:text-ink">Open call →</Link>}</li>)}
                {!notes.length && <li><Empty title="No coaching notes yet" /></li>}</ul>
            </Card>
          </div>

          <Card title="Campaign breakdown" pad={false}>
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Campaign</th><th>Calls</th><th>Avg quality</th><th>Resolution</th><th>Share</th></tr></thead>
              <tbody>{camps.map((c) => <tr key={c.name}><td className="font-medium">{c.name}</td><td className="tabular-nums">{c.value}</td><td><div className="flex items-center gap-2"><span className="w-9 tabular-nums">{c.q?.toFixed(2)}</span><Progress className="w-20" value={c.q ?? 0} max={5} /></div></td><td className="tabular-nums">{c.res}%</td><td className="tabular-nums">{M.pct(c.value, calls.length)}%</td></tr>)}</tbody></table></div>
          </Card>
        </>
      )}

      <Card title="Recent calls" pad={false}>
        {all.length ? <div className="overflow-x-auto"><table className="table"><thead><tr><th /><th>Date</th><th>QA</th><th>Campaign</th><th>Intent</th><th>Duration</th><th>Quality</th><th>SOP</th><th>Agent sent.</th><th>Customer sent.</th><th>Coaching</th><th>Compliance</th></tr></thead>
          <tbody>{all.slice(0, 15).map((c) => { const q = M.quality(c); const playing = player.current?.id === c.id && player.playing; return (
            <tr key={c.id} className="row-link" onClick={() => router.push(`/calls/${c.id}`)}>
              <td onClick={(e) => e.stopPropagation()}><button className="icon-btn h-8 w-8" disabled={!c.audio_file_id} onClick={() => player.play(c, all)} aria-label="Play">{playing ? <Pause size={14} /> : <Play size={14} />}</button></td>
              <td className="whitespace-nowrap">{c.call_date}</td><td className="tabular-nums">{q == null ? '—' : Math.round(q * 20)}</td><td>{M.campaignOf(c) || '—'}</td><td className="max-w-[180px] truncate">{M.topic(c) || (c.status !== 'processed' ? <Badge>{c.status}</Badge> : '—')}</td>
              <td className="tabular-nums">{M.fmtDuration(M.seconds(c))}</td><td className={cn('tabular-nums', q != null && (q <= 2 ? 'text-bad-text' : q < 4 ? 'text-warn-text' : 'text-ok-text'))}>{q?.toFixed(1) ?? '—'}</td>
              <td className="tabular-nums">{M.sopPoints(c) ?? '—'}</td><td><Badge>{M.agentSentiment(c)}</Badge></td><td><Badge>{M.customerSentiment(c)}</Badge></td><td><Badge>{M.coachingPriority(c)}</Badge></td><td><Badge invert>{M.complianceRisk(c)}</Badge></td>
            </tr>); })}</tbody></table></div> : <Empty title="No calls" />}
      </Card>
      <AssignTraining open={!!assign} onClose={() => setAssign(null)} preset={assign} modules={modules} agents={agent ? [agent] : [{ agent_code: code, agent_name: name }]} />
    </div>
  );
}
