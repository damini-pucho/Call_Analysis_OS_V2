'use client';
// Call records — V1 CallRecords + CallFilters + CallTable: 12 filters (all wired, incl. call type and topic links), column chooser,
// 25 per page, CSV export, click-a-cell-to-filter, play, rename agent. Rows open the call detail page.
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Play, Pause, Download, SlidersHorizontal, Columns3, X, Pencil, Send, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Badge, Button, Modal, Field, Input, Select, Empty, Pager, usePager, downloadCsv, cn, Avatar } from '@/components/ui';
import PeriodBar, { usePeriodCalls } from '@/components/PeriodBar';
import { useCan, usePlayer } from '@/components/providers';
import { renameAgent, resendToFlow } from '@/app/actions/calls';
import * as M from '@/lib/metrics';

const EMPTY = { q: '', agent: '', campaign: '', callId: '', date: '', mobile: '', coaching: '', compliance: '', churn: '', direction: '', classification: '', topic: '', sentiment: '', status: '' };
const COLS = [
  ['date', 'Date'], ['agent', 'Agent'], ['lead', 'Lead ID'], ['mobile', 'Mobile'], ['campaign', 'Campaign'], ['type', 'Type'], ['lang', 'Lang'], ['duration', 'Duration'],
  ['quality', 'Quality'], ['sop', 'SOP'], ['classification', 'Classification'], ['topic', 'Intent / topic'], ['csat', 'CSAT'], ['sentiment', 'Sentiment'],
  ['coaching', 'Coaching'], ['compliance', 'Compliance'], ['churn', 'Churn'], ['status', 'Status'],
];
const has = (v, f) => !f || String(v ?? '').toLowerCase().includes(f.toLowerCase());

export default function CallsView({ calls: all, campaigns }) {
  const sp = useSearchParams(); const router = useRouter(); const can = useCan(); const player = usePlayer();
  const [f, setF] = useState(() => ({ ...EMPTY, ...Object.fromEntries([...sp.entries()].filter(([k]) => k in EMPTY)) }));
  useEffect(() => { setF((x) => ({ ...x, ...Object.fromEntries([...sp.entries()].filter(([k]) => k in EMPTY)) })); }, [sp]);
  const [showFilters, setShowFilters] = useState(() => [...sp.keys()].some((k) => k in EMPTY && k !== 'q'));
  const [cols, setCols] = useState(() => new Set(COLS.map((c) => c[0])));
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem('cas-call-cols') || 'null'); if (Array.isArray(s)) setCols(new Set(s)); } catch {} }, []);
  const [colMenu, setColMenu] = useState(false);
  const [rename, setRename] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const period = usePeriodCalls(all);

  const set = (k, v) => setF((x) => ({ ...x, [k]: x[k] === v ? '' : v }));
  const rows = useMemo(() => period.filter((c) => {
    const i = M.intel(c);
    if (f.q && !(has(c.call_id, f.q) || has(c.mobile_number, f.q) || has(c.agent_name, f.q) || has(c.agent_code, f.q) || has(c.filename, f.q) || has(c.call_summary, f.q))) return false;
    if (!(has(c.agent_code, f.agent) || has(c.agent_name, f.agent))) return false;
    if (!has(M.campaignOf(c), f.campaign) || !has(c.call_id, f.callId) || !has(c.mobile_number, f.mobile)) return false;
    if (f.date && !has(String(c.call_date || '').replace(/-/g, '') + ' ' + (c.call_date || ''), f.date)) return false;
    if (f.coaching && M.coachingPriority(c) !== f.coaching) return false;
    if (f.compliance && M.complianceRisk(c) !== f.compliance) return false;
    if (f.churn && M.churnRisk(c) !== f.churn) return false;
    if (f.direction && M.direction(c) !== f.direction) return false;
    if (f.classification && M.classification(c) !== f.classification) return false;
    if (f.topic && !(has(M.topic(c), f.topic) || has(c.call_topic, f.topic) || has(M.subTopic(c), f.topic))) return false;
    if (f.sentiment && M.customerSentiment(c) !== f.sentiment) return false;
    if (f.status === 'pending' ? !['queued', 'processing'].includes(c.status) : f.status && c.status !== f.status) return false;
    return !!i || true;
  }), [period, f]);
  const pager = usePager(rows, 25, JSON.stringify(f));
  const active = Object.entries(f).filter(([, v]) => v).length;
  const toggleCol = (k) => setCols((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); try { localStorage.setItem('cas-call-cols', JSON.stringify([...n])); } catch {} return n; });
  const show = (k) => cols.has(k);

  const exportCsv = () => downloadCsv('call_records.csv', M.toCsv(rows, [
    { label: 'Date', value: 'call_date' }, { label: 'Agent', value: 'agent_name' }, { label: 'Agent code', value: 'agent_code' }, { label: 'Lead ID', value: 'call_id' },
    { label: 'Mobile', value: 'mobile_number' }, { label: 'Campaign', value: M.campaignOf }, { label: 'Type', value: (r) => M.direction(r) }, { label: 'Language', value: 'language' },
    { label: 'Duration', value: (r) => M.fmtDuration(M.seconds(r)) }, { label: 'Quality /5', value: (r) => M.quality(r)?.toFixed(2) }, { label: 'SOP /7', value: (r) => M.sopPoints(r) },
    { label: 'Classification', value: M.classification }, { label: 'Topic', value: M.topic }, { label: 'Sub-topic', value: M.subTopic }, { label: 'CSAT', value: M.csat },
    { label: 'Sentiment', value: M.customerSentiment }, { label: 'Coaching', value: M.coachingPriority }, { label: 'Compliance', value: M.complianceRisk }, { label: 'Churn', value: M.churnRisk },
    { label: 'Status', value: 'status' }, { label: 'Summary', value: 'call_summary' },
  ]));

  const resend = async () => {
    const ids = [...selected];
    const r = await resendToFlow({ ids });
    r.ok ? toast.success(r.message) : toast.error(r.message);
    setSelected(new Set()); router.refresh();
  };
  const cell = (k, v, label) => <button type="button" className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); set(k, v); setShowFilters(true); }} title={`Filter by ${label || v}`}>{label ?? v}</button>;
  const pendingRows = rows.filter((c) => c.status !== 'processed' && c.status !== 'skipped');

  return (
    <div>
      <PageHeader title="Calls" sub="Every recording with its transcript, scores and coaching. Click a value to filter by it." actions={<>
        {can('upload.analyze') && selected.size > 0 && <Button size="sm" variant="secondary" onClick={resend}><Send size={14} />Send {selected.size} for analysis</Button>}
        {can('calls.export') && <Button size="sm" onClick={exportCsv} disabled={!rows.length}><Download size={14} />Export CSV</Button>}
      </>} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PeriodBar />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant={showFilters ? 'primary' : 'secondary'} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}><SlidersHorizontal size={14} />Filters{active ? ` · ${active}` : ''}</Button>
          <div className="relative">
            <Button size="sm" variant="secondary" onClick={() => setColMenu((m) => !m)} aria-expanded={colMenu}><Columns3 size={14} />Columns</Button>
            {colMenu && (<>
              <div className="fixed inset-0 z-30" onClick={() => setColMenu(false)} aria-hidden />
              <div className="absolute right-0 top-full z-40 mt-2 grid w-64 grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-3 shadow-float">
                {COLS.map(([k, l]) => <label key={k} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-ink-2 hover:bg-surface-2"><input type="checkbox" className="check" checked={cols.has(k)} onChange={() => toggleCol(k)} />{l}</label>)}
              </div>
            </>)}
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="card mb-3 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          {[['agent', 'Agent code / name'], ['campaign', 'Campaign'], ['callId', 'Lead ID'], ['date', 'Date (2026 or 20260317)'], ['mobile', 'Mobile'], ['topic', 'Topic (KYC, SIP…)']].map(([k, l]) => (
            <Field key={k} label={l}><Input className="field-sm" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} list={k === 'campaign' ? 'camps' : undefined} /></Field>
          ))}
          <datalist id="camps">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
          {[['coaching', 'Coaching', ['Red', 'Amber', 'Green']], ['compliance', 'Compliance', ['High', 'Medium', 'Low', 'None']], ['churn', 'Churn', ['High', 'Medium', 'Low']],
            ['direction', 'Call type', ['Inbound', 'Outbound']], ['classification', 'Classification', ['Inquiry', 'Query', 'Complaint', 'Non-contact', 'Invalid']], ['sentiment', 'Sentiment', ['Positive', 'Neutral', 'Negative']]].map(([k, l, o]) => (
            <Field key={k} label={l}><Select className="field-sm" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} options={o} placeholder="All" /></Field>
          ))}
          <Field label="Status"><Select className="field-sm" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))} placeholder="All" options={[{ value: 'processed', label: 'Analysed' }, { value: 'pending', label: 'Waiting (queued / processing)' }, { value: 'skipped', label: 'Skipped (non-contact)' }, { value: 'failed', label: 'Failed' }]} /></Field>
          <Field label="Search"><Input className="field-sm" value={f.q} onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))} placeholder="Any text" /></Field>
          {active > 0 && <div className="flex items-end"><Button size="sm" variant="ghost" onClick={() => { setF(EMPTY); router.replace('/calls'); }}><X size={14} />Clear all</Button></div>}
        </div>
      )}

      <div className="card overflow-hidden">
        {!rows.length ? <Empty icon={PhoneCall} title={all.length ? 'No calls match these filters' : 'No calls yet'}>{all.length ? 'Clear a filter or widen the period.' : 'Uploaded recordings appear here.'}</Empty> : (
          <>
            {/* phone: cards */}
            <ul className="divide-y divide-line sm:hidden">
              {pager.slice.map((c) => (
                <li key={c.id} className="flex items-start gap-3 p-4" onClick={() => router.push(`/calls/${c.id}`)}>
                  <Avatar name={c.agent_name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2"><span className="truncate font-medium text-ink">{c.agent_name || 'Unknown'}</span><span className="shrink-0 text-[12px] text-ink-3">{c.call_date}</span></div>
                    <div className="truncate text-[13px] text-ink-3">{M.topic(c) || c.filename}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">{c.status !== 'processed' ? <Badge>{c.status}</Badge> : <><Badge tone={M.quality(c) >= 4 ? 'ok' : M.quality(c) >= 3 ? 'warn' : 'bad'} dot={false}>Q {M.quality(c)?.toFixed(1)}/5</Badge><Badge>{M.coachingPriority(c)}</Badge><Badge>{M.customerSentiment(c)}</Badge></>}</div>
                  </div>
                </li>
              ))}
            </ul>
            {/* desktop: table */}
            <div className="hidden max-h-[70vh] overflow-auto sm:block">
              <table className="table">
                <thead><tr>
                  {can('upload.analyze') && <th className="w-8"><input type="checkbox" className="check" aria-label="Select waiting calls on this page" checked={pendingRows.length > 0 && pendingRows.every((c) => selected.has(c.id))} onChange={(e) => setSelected(e.target.checked ? new Set(pendingRows.map((c) => c.id)) : new Set())} /></th>}
                  <th className="w-10">#</th><th className="w-10"><span className="sr-only">Play</span></th>
                  {COLS.filter(([k]) => show(k)).map(([k, l]) => <th key={k}>{l}</th>)}
                </tr></thead>
                <tbody>
                  {pager.slice.map((c, i) => {
                    const q = M.quality(c); const s = M.sopPoints(c); const playing = player.current?.id === c.id && player.playing;
                    return (
                      <tr key={c.id} className="row-link" onClick={() => router.push(`/calls/${c.id}`)}>
                        {can('upload.analyze') && <td onClick={(e) => e.stopPropagation()}>{c.status !== 'processed' && c.status !== 'skipped' && <input type="checkbox" className="check" aria-label="Select for re-send" checked={selected.has(c.id)} onChange={(e) => setSelected((x) => { const n = new Set(x); e.target.checked ? n.add(c.id) : n.delete(c.id); return n; })} />}</td>}
                        <td className="tabular-nums text-ink-3">{pager.from + i}</td>
                        <td onClick={(e) => e.stopPropagation()}><button className="icon-btn h-8 w-8" disabled={!c.audio_file_id} onClick={() => player.play(c, pager.slice)} aria-label={playing ? 'Pause recording' : 'Play recording'}>{playing ? <Pause size={15} /> : <Play size={15} />}</button></td>
                        {show('date') && <td className="whitespace-nowrap text-ink-2">{c.call_date ? new Date(`${c.call_date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>}
                        {show('agent') && <td><div className="group flex items-center gap-2"><Avatar name={c.agent_name} size={26} /><div className="min-w-0"><div className="truncate font-medium text-ink">{cell('agent', c.agent_code, c.agent_name || 'Unknown')}</div><div className="text-[12px] text-ink-3">{c.agent_code}</div></div>
                          {(can('calls.edit') || can('agents.edit')) && <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={(e) => { e.stopPropagation(); setRename(c); }} aria-label="Edit agent name"><Pencil size={13} /></button>}</div></td>}
                        {show('lead') && <td className="tabular-nums">{c.call_id}</td>}
                        {show('mobile') && <td className="tabular-nums">{c.mobile_number ? cell('mobile', c.mobile_number) : '—'}</td>}
                        {show('campaign') && <td>{M.campaignOf(c) ? cell('campaign', M.campaignOf(c)) : '—'}</td>}
                        {show('type') && <td>{cell('direction', M.direction(c), M.direction(c) === 'Inbound' ? 'IN' : 'OUT')}</td>}
                        {show('lang') && <td className="text-ink-2">{c.language || '—'}</td>}
                        {show('duration') && <td className="tabular-nums text-ink-2">{M.fmtDuration(M.seconds(c))}</td>}
                        {show('quality') && <td>{q == null ? '—' : <span className={cn('font-medium tabular-nums', q <= 2 ? 'text-bad-text' : q < 4 ? 'text-warn-text' : 'text-ok-text')}>{q.toFixed(1)}/5</span>}</td>}
                        {show('sop') && <td>{s == null ? '—' : <span className={cn('tabular-nums', s <= 4 ? 'text-warn-text' : 'text-ok-text')}>{Number(s).toFixed(0)}/7</span>}</td>}
                        {show('classification') && <td>{M.classification(c) ? cell('classification', M.classification(c)) : '—'}</td>}
                        {show('topic') && <td className="max-w-[220px]"><div className="truncate">{M.topic(c) ? cell('topic', M.topic(c)) : '—'}</div><div className="truncate text-[12px] text-ink-3">{M.subTopic(c)}</div></td>}
                        {show('csat') && <td><Badge>{M.csat(c)}</Badge></td>}
                        {show('sentiment') && <td onClick={(e) => { e.stopPropagation(); M.customerSentiment(c) && set('sentiment', M.customerSentiment(c)); }}><Badge>{M.customerSentiment(c)}</Badge></td>}
                        {show('coaching') && <td onClick={(e) => { e.stopPropagation(); M.coachingPriority(c) && set('coaching', M.coachingPriority(c)); }}><Badge>{M.coachingPriority(c)}</Badge></td>}
                        {show('compliance') && <td onClick={(e) => { e.stopPropagation(); M.complianceRisk(c) && set('compliance', M.complianceRisk(c)); }}><Badge invert>{M.complianceRisk(c)}</Badge></td>}
                        {show('churn') && <td onClick={(e) => { e.stopPropagation(); M.churnRisk(c) && set('churn', M.churnRisk(c)); }}><Badge invert>{M.churnRisk(c)}</Badge></td>}
                        {show('status') && <td><Badge title={c.status_reason || undefined}>{c.status === 'processed' ? 'Analysed' : c.status}</Badge></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager pager={pager} />
          </>
        )}
      </div>
      <RenameModal call={rename} onClose={() => setRename(null)} canAgent={can('agents.edit')} />
    </div>
  );
}

function RenameModal({ call, onClose, canAgent }) {
  const router = useRouter();
  const [name, setName] = useState(''); const [scope, setScope] = useState('call'); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  useEffect(() => { if (call) { setName(call.agent_name || ''); setScope('call'); setErr(null); } }, [call]);
  const save = async () => {
    setBusy(true); const r = await renameAgent({ id: call.id, name, scope }); setBusy(false);
    if (!r.ok) { setErr(r.fields?.name || r.message); return; }
    toast.success(r.message); onClose(); router.refresh();
  };
  return (
    <Modal open={!!call} onClose={onClose} title="Edit agent name" sub={call ? `Agent code ${call.agent_code || '—'}` : ''} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Agent name" error={err}><Input value={name} onChange={(e) => setName(e.target.value)} error={err} /></Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-[13px] font-medium text-ink-2">Apply to</legend>
          <label className="flex items-center gap-2 text-[14px]"><input type="radio" className="check" checked={scope === 'call'} onChange={() => setScope('call')} />This call only</label>
          <label className={cn('flex items-center gap-2 text-[14px]', !canAgent && 'opacity-50')}><input type="radio" className="check" disabled={!canAgent} checked={scope === 'agent'} onChange={() => setScope('agent')} />Every call of agent {call?.agent_code} (and the agent record)</label>
        </fieldset>
      </div>
    </Modal>
  );
}
