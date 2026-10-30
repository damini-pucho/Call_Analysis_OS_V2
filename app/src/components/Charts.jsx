'use client';
// Recharts on the design tokens: statuses keep their status colour, everything else takes a categorical slot.
// Values render immediately (no count-up); long category labels go horizontal so every label is whole.
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend, ReferenceLine } from 'recharts';

export const CAT = ['var(--cat-1)', 'var(--cat-4)', 'var(--cat-3)', 'var(--cat-2)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)'];
const STATUS_COLOR = {
  positive: 'var(--ok)', professional: 'var(--ok)', low: 'var(--ok)', green: 'var(--ok)', pass: 'var(--ok)', 'no risk': 'var(--ok)', resolved: 'var(--ok)', inbound: 'var(--cat-1)', outbound: 'var(--cat-2)',
  neutral: 'var(--cat-8)', medium: 'var(--warn)', amber: 'var(--warn)', na: 'var(--cat-other)',
  negative: 'var(--bad)', unprofessional: 'var(--bad)', high: 'var(--bad)', red: 'var(--bad)', fail: 'var(--bad)',
  inquiry: 'var(--cat-1)', query: 'var(--cat-3)', complaint: 'var(--bad)',
};
export const colorFor = (name, i) => STATUS_COLOR[String(name).toLowerCase()] || CAT[i % CAT.length];

const axis = { fontSize: 12, fill: 'var(--ink-3)' };
const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 13, color: 'var(--ink)', boxShadow: 'var(--float-shadow)' }, labelStyle: { color: 'var(--ink-2)', fontWeight: 500 }, cursor: { fill: 'var(--hover-wash)' } };
const trunc = (s, n = 22) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : s);

export function Empty({ height = 220, text = 'No data for this period yet.' }) {
  return <div className="flex items-center justify-center rounded-xl bg-surface-2 text-[13px] text-ink-3" style={{ height }}>{text}</div>;
}

export function HBar({ data, height, dataKey = 'value', format, color, onPick, unit }) {
  if (!data?.length) return <Empty />;
  const h = height || Math.max(160, data.length * 32 + 20);
  const width = Math.min(180, Math.max(70, Math.max(...data.map((d) => String(d.name).length)) * 7));
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--line-soft)" />
        <XAxis type="number" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} unit={unit} />
        <YAxis type="category" dataKey="name" tick={axis} width={width} axisLine={false} tickLine={false} tickFormatter={(v) => trunc(v, Math.floor(width / 7))} />
        <Tooltip {...tip} formatter={(v) => (format ? format(v) : v)} />
        <Bar dataKey={dataKey} radius={[0, 6, 6, 0]} barSize={16} onClick={onPick ? (d) => onPick(d) : undefined} cursor={onPick ? 'pointer' : undefined}>
          {data.map((d, i) => <Cell key={i} fill={d.color || color || 'var(--cat-1)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VBar({ data, bars = [{ key: 'value', name: 'Value' }], height = 240, yDomain, target, format, stacked }) {
  if (!data?.length) return <Empty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -12, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--line-soft)" />
        <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} interval={0} tickFormatter={(v) => trunc(v, 12)} />
        <YAxis tick={axis} axisLine={false} tickLine={false} domain={yDomain} allowDecimals={!!yDomain} />
        <Tooltip {...tip} formatter={(v, n) => [format ? format(v, n) : v, n]} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: 'var(--ink-3)' }} iconType="circle" iconSize={8} />}
        {target != null && <ReferenceLine y={target} stroke="var(--ink-3)" strokeDasharray="4 4" />}
        {bars.map((b, bi) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} stackId={stacked ? 's' : undefined} radius={stacked ? 0 : [6, 6, 0, 0]} maxBarSize={36} fill={b.color || CAT[bi]}>
            {bars.length === 1 && data.map((d, i) => <Cell key={i} fill={d.color || b.color || CAT[0]} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 220, center, centerSub }) {
  const total = (data || []).reduce((a, d) => a + d.value, 0);
  if (!total) return <Empty height={height} />;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="100%" paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.color || colorFor(d.name, i)} />)}
            </Pie>
            <Tooltip {...tip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[24px] font-semibold tabular-nums text-ink">{center ?? total}</span>
          <span className="label">{centerSub ?? 'calls'}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2.5 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color || colorFor(d.name, i) }} />
            <span className="min-w-0 flex-1 truncate text-ink">{d.name}</span>
            <span className="tabular-nums text-ink-2">{d.value}</span>
            <span className="w-12 text-right tabular-nums text-ink-3">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Trend({ data, series, height = 240, yDomain, area = true, xKey = 'date' }) {
  if (!data?.length) return <Empty height={height} />;
  const fmtX = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  const C = area ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <C data={data} margin={{ left: -12, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--line-soft)" />
        <XAxis dataKey={xKey} tick={axis} axisLine={false} tickLine={false} tickFormatter={xKey === 'date' ? fmtX : undefined} minTickGap={16} />
        <YAxis tick={axis} axisLine={false} tickLine={false} domain={yDomain} allowDecimals={!!yDomain} />
        <Tooltip {...tip} labelFormatter={xKey === 'date' ? fmtX : undefined} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: 'var(--ink-3)' }} iconType="circle" iconSize={8} />}
        {series.map((s, i) => area
          ? <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || CAT[i]} fill={s.color || CAT[i]} fillOpacity={0.12} strokeWidth={2} connectNulls dot={false} />
          : <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || CAT[i]} strokeWidth={2} connectNulls dot={false} />)}
      </C>
    </ResponsiveContainer>
  );
}

/** Proportional segmented bar with legend (classification split, sentiment split, priority split). */
export function SplitBar({ parts, height = 10 }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div>
      <div className="flex w-full overflow-hidden rounded-full bg-surface-2" style={{ height }}>
        {total > 0 && parts.map((p, i) => p.value > 0 && <div key={p.name} title={`${p.name}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color || colorFor(p.name, i) }} />)}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        {parts.map((p, i) => <span key={p.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: p.color || colorFor(p.name, i) }} />{p.name} <span className="tabular-nums text-ink-2">{p.value}</span>{total ? <span className="tabular-nums">({Math.round((p.value / total) * 100)}%)</span> : null}</span>)}
      </div>
    </div>
  );
}
