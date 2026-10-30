'use client';
// The global period filter (V1: All Time / Today / Last 7 / Last 30 / Custom range), shared by every analytics page.
import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { usePeriod } from './providers';
import { inPeriod } from '@/lib/metrics';

const PRESETS = [{ key: 'all', label: 'All time' }, { key: 'today', label: 'Today' }, { key: '7d', label: '7 days' }, { key: '30d', label: '30 days' }, { key: 'month', label: 'This month' }];

export function usePeriodCalls(calls) {
  const { period } = usePeriod();
  return useMemo(() => calls.filter((c) => inPeriod(c, period.key, period.from, period.to)), [calls, period]);
}

export default function PeriodBar() {
  const { period, setPeriod } = usePeriod();
  const [open, setOpen] = useState(period.key === 'custom');
  const [from, setFrom] = useState(period.from || ''); const [to, setTo] = useState(period.to || '');
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <div className="scroll-x flex min-w-0 max-w-full gap-1.5" role="group" aria-label="Period">
        {PRESETS.map((p) => <button key={p.key} type="button" className="chip" aria-pressed={period.key === p.key} onClick={() => { setOpen(false); setPeriod({ key: p.key, from: '', to: '' }); }}>{p.label}</button>)}
        <button type="button" className="chip" aria-pressed={period.key === 'custom'} onClick={() => setOpen((o) => !o)}><CalendarRange size={14} aria-hidden />Custom</button>
      </div>
      {open && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setPeriod(from || to ? { key: 'custom', from, to } : { key: 'all', from: '', to: '' }); }}>
          <input type="date" aria-label="From" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="field field-sm w-auto" />
          <span className="text-ink-3">–</span>
          <input type="date" aria-label="To" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="field field-sm w-auto" />
          <button className="btn btn-primary btn-sm">Apply</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFrom(''); setTo(''); setOpen(false); setPeriod({ key: 'all', from: '', to: '' }); }}>Clear</button>
        </form>
      )}
    </div>
  );
}
