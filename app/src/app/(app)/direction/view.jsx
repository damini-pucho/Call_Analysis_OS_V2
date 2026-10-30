'use client';
// Inbound / outbound — V1 InboundOutbound. Direction comes from the call (set from its campaign's direction on upload), so the
// Admin campaign mapping now actually drives this page.
import { useState } from 'react';
import { PhoneIncoming, PhoneOutgoing, Phone, MessageCircleHeart, ChevronDown } from 'lucide-react';
import { PageHeader, Card, Kpi, Tabs, BarList, Empty, cn } from '@/components/ui';
import { Donut } from '@/components/Charts';
import PeriodBar, { usePeriodCalls } from '@/components/PeriodBar';
import * as M from '@/lib/metrics';

export default function DirectionView({ calls: all }) {
  const calls = usePeriodCalls(all).filter(M.isProcessed);
  const inbound = calls.filter((c) => M.direction(c) === 'Inbound'); const outbound = calls.filter((c) => M.direction(c) === 'Outbound');
  const [tab, setTab] = useState('Inbound'); const [how, setHow] = useState(false);
  const ivr = inbound.filter((c) => /^yes$/i.test(M.kpiValue(c, 'IVR Transfer', 8) || ''));
  const ivrPos = ivr.filter((c) => M.customerSentiment(c) === 'Positive').length; const ivrNeg = ivr.filter((c) => M.customerSentiment(c) === 'Negative').length;
  const rows = tab === 'Inbound' ? inbound : outbound;
  const q = (cs) => { const v = M.avg(cs.map(M.quality)); return v == null ? '—' : `${v.toFixed(2)}/5`; };
  return (
    <div className="space-y-5">
      <PageHeader title="Inbound / outbound" sub="Calls customers made to you versus calls your agents made, with IVR feedback." actions={<PeriodBar />} />
      {!calls.length ? <Card><Empty title="No analysed calls in this period" /></Card> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Total calls" value={calls.length} icon={Phone} href="/calls" />
            <Kpi label="Inbound" value={inbound.length} icon={PhoneIncoming} sub={`${M.pct(inbound.length, calls.length)}% of calls`} href="/calls?direction=Inbound" />
            <Kpi label="Outbound" value={outbound.length} icon={PhoneOutgoing} sub={`${M.pct(outbound.length, calls.length)}% of calls`} href="/calls?direction=Outbound" />
            <Kpi label="Feedback collected" value={inbound.length ? `${M.pct(ivr.length, inbound.length)}%` : '—'} icon={MessageCircleHeart} sub="Inbound calls transferred to the IVR" />
            <Kpi label="Avg quality in / out" value={`${q(inbound)} · ${q(outbound)}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <Card title="Call type split"><Donut data={[{ name: 'Inbound', value: inbound.length }, { name: 'Outbound', value: outbound.length }]} /></Card>
            <Card>
              <Tabs value={tab} onChange={setTab} tabs={[{ key: 'Inbound', label: 'Inbound', count: inbound.length }, { key: 'Outbound', label: 'Outbound', count: outbound.length }]} />
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[['Calls', rows.length], ['Avg SOP', rows.length ? `${(M.avg(rows.map(M.sopPoints)) ?? 0).toFixed(1)}/7` : '—'], ['Avg quality', q(rows)], ['Resolution', rows.length ? `${M.pct(rows.filter(M.isResolved).length, rows.length)}%` : '—']].map(([l, v]) => <div key={l} className="rounded-xl bg-surface-2 p-3"><div className="label">{l}</div><div className="mt-1 text-[18px] font-semibold tabular-nums text-ink">{v}</div></div>)}
              </div>
              <div className="label mb-2 mt-5">Top topics</div>
              {rows.length ? <BarList rows={M.countBy(rows, M.topic)} total={rows.length} hrefOf={(r) => `/calls?direction=${tab}&topic=${encodeURIComponent(r.name)}`} /> : <p className="text-[13px] text-ink-3">No {tab.toLowerCase()} calls.</p>}
            </Card>
          </div>
          <Card title="IVR feedback deep dive" sub={`${ivr.length} inbound call${ivr.length === 1 ? '' : 's'} transferred to the feedback IVR`}>
            <button type="button" onClick={() => setHow((h) => !h)} aria-expanded={how} className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"><ChevronDown size={15} className={cn('transition-transform', how && 'rotate-180')} />How IVR feedback works</button>
            {how && <p className="mb-4 rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2">After the call the customer rates it 1–4 on the IVR: 1–2 is positive, 3 neutral and 4 negative. Until IVR ratings are recorded by the flow, the call's customer sentiment stands in for the rating.</p>}
            {ivr.length ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {[['Positive', ivrPos, 'ok'], ['Neutral', ivr.length - ivrPos - ivrNeg, 'warn'], ['Negative', ivrNeg, 'bad']].map(([l, v, t]) => <div key={l} className="rounded-xl border border-line p-4"><div className="label">{l}</div><div className={`mt-1 text-[24px] font-semibold tabular-nums text-${t}-text`}>{v}</div><div className="text-[13px] text-ink-3">{M.pct(v, ivr.length)}%</div></div>)}
              </div>
            ) : <Empty title="No IVR transfers yet">The KPI "IVR Transfer" was not Yes on any inbound call in this period.</Empty>}
          </Card>
        </>
      )}
    </div>
  );
}
