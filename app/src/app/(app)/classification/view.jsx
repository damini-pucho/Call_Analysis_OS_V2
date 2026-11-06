'use client';
// Classification → topic → sub-topic (V1 CallClassification). Exports now export only that classification; topic links open
// the filtered call list (V1 links were ignored).
import { useState } from 'react';
import Link from 'next/link';
import { Download, ArrowRight, X } from 'lucide-react';
import { PageHeader, Card, Button, BarList, Empty, downloadCsv, cn } from '@/components/ui';
import PeriodBar, { usePeriodCalls } from '@/components/PeriodBar';
import { useCan } from '@/components/providers';
import * as M from '@/lib/metrics';

const TYPES = [
  { key: 'Inquiry', desc: 'The customer wants to perform an action', tone: 'var(--cat-1)' },
  { key: 'Query', desc: 'The customer is asking a specific question', tone: 'var(--cat-3)' },
  { key: 'Complaint', desc: 'The customer is unhappy and needs resolution', tone: 'var(--bad)' },
];

export default function ClassificationView({ calls: all }) {
  const can = useCan();
  const calls = usePeriodCalls(all).filter(M.isProcessed);
  const total = calls.length;
  const top = M.countBy(calls, M.topic)[0];
  const exp = (rows, name) => downloadCsv(`${name.toLowerCase()}_classification_export.csv`, M.toCsv(rows, [
    { label: 'Sr', value: (r) => rows.indexOf(r) + 1 }, { label: 'Call ID', value: 'call_id' }, { label: 'Date', value: 'call_date' }, { label: 'Agent', value: 'agent_name' },
    { label: 'Classification', value: M.classification }, { label: 'Topic', value: M.topic }, { label: 'Sub-topic', value: M.subTopic }, { label: 'Summary', value: 'call_summary' },
  ]));
  return (
    <div className="space-y-5">
      <PageHeader title="Call classification" sub="Every analysed call sorted into inquiry, query or complaint, then by topic and sub-topic." actions={<><PeriodBar />{can('calls.export') && <Button size="sm" onClick={() => exp(calls, 'all')} disabled={!total}><Download size={14} />Export all</Button>}</>} />
      {!total ? <Card><Empty title="No analysed calls in this period" /></Card> : (
        <>
          {top && (
            <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div><div className="label">Most common topic</div><div className="mt-1 font-display text-[26px] text-ink">{top.name}</div><div className="text-[13px] text-ink-3">{top.value} calls · {Math.round((top.value / total) * 100)}% of all calls</div></div>
              <Link href={`/calls?topic=${encodeURIComponent(top.name)}`} className="btn btn-secondary">View calls <ArrowRight size={15} /></Link>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-3">{TYPES.map((t) => <TypeCard key={t.key} t={t} calls={calls} total={total} onExport={can('calls.export') ? exp : null} />)}</div>
        </>
      )}
    </div>
  );
}

function TypeCard({ t, calls, total, onExport }) {
  const rows = calls.filter((c) => M.classification(c) === t.key);
  const topics = M.countBy(rows, M.topic);
  const [topic, setTopic] = useState(null); const [all, setAll] = useState(false);
  const subs = M.countBy(topic ? rows.filter((c) => M.topic(c) === topic) : rows, (c) => M.subTopic(c));
  return (
    <Card title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t.tone }} />{t.key}</span>} sub={t.desc}
      action={onExport && <Button size="sm" variant="ghost" onClick={() => onExport(rows, t.key)} disabled={!rows.length} aria-label={`Export ${t.key}`}><Download size={14} /></Button>}>
      <div className="flex items-baseline gap-2"><span className="text-[28px] font-semibold tabular-nums text-ink">{rows.length}</span><span className="text-[13px] text-ink-3">{total ? Math.round((rows.length / total) * 100) : 0}% of calls</span>
        <Link href={`/calls?classification=${t.key}`} className="ml-auto text-[13px] text-ink-3 hover:text-ink">Open list →</Link></div>
      <div className="mt-4"><div className="mb-2 flex items-baseline justify-between gap-2"><span className="label">Top topics</span>{topics.length > 0 && <span className="text-[12px] text-ink-3">Click a topic to see its sub-topics</span>}</div>
        {topics.length ? <BarList rows={topics} selected={topic} onPick={(r) => { setTopic((x) => (x === r.name ? null : r.name)); setAll(false); }} tone={null} /> : <p className="text-[13px] text-ink-3">None.</p>}
      </div>
      <div className="mt-5"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="label">{topic ? `Sub-topics of ${topic}` : 'Common sub-topics'}</span>
        {topic && <button className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-ink-2 hover:text-ink" onClick={() => setTopic(null)} aria-label="Show all sub-topics">{topic}<X size={12} /></button>}</div>
        <ul className="space-y-1">
          {(all ? subs : subs.slice(0, 8)).map((s) => (
            <li key={s.name}><Link href={`/calls?classification=${t.key}&topic=${encodeURIComponent(s.name)}`} className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2"><span className="min-w-0 truncate text-ink-2">{s.name}</span><span className="shrink-0 tabular-nums text-ink-3">{s.value} · {Math.round((s.value / total) * 100)}%</span></Link></li>
          ))}
          {!subs.length && <li className="text-[13px] text-ink-3">None.</li>}
        </ul>
        {subs.length > 8 && <button className={cn('mt-1 text-[12px] font-medium text-ink-3 hover:text-ink')} onClick={() => setAll((a) => !a)}>{all ? 'Show top 8' : `Show all ${subs.length}`}</button>}
      </div>
    </Card>
  );
}
