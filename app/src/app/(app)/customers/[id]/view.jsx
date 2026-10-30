'use client';
// One customer — details (editable), call history with recordings, summaries and analysis, sentiment over time.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Phone, Mail, MapPin, Tag, Pencil, Play, Pause, Building2, Hash, CalendarClock, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card, Badge, Empty, Avatar, Button, Modal, Field, Input, Textarea, MetaRow, Stat, cn } from '@/components/ui';
import { Trend } from '@/components/Charts';
import { useCan, usePlayer } from '@/components/providers';
import { updateCustomer } from '@/app/actions/misc';
import * as M from '@/lib/metrics';

export default function CustomerDetail({ customer: c, calls, maskPii }) {
  const can = useCan(); const player = usePlayer();
  const [edit, setEdit] = useState(false); const [openId, setOpenId] = useState(null);
  const done = calls.filter(M.isProcessed);
  const daily = M.dailySeries(done);
  const lastSent = done[0] ? M.customerSentiment(done[0]) : null;
  const topics = M.countBy(done, M.topic);
  const name = c.name || 'Unnamed caller';
  return (
    <div className="space-y-5">
      <PageHeader crumbs={[{ label: 'Customer profiles', href: '/customers' }, { label: name }]}
        title={<span className="flex items-center gap-3"><Avatar name={c.name || c.mobile_number} size={44} />{name}</span>}
        sub={`${calls.length} call${calls.length === 1 ? '' : 's'} · first ${c.first_call_at ? new Date(c.first_call_at).toLocaleDateString('en-GB') : '—'} · last ${c.last_call_at ? new Date(c.last_call_at).toLocaleDateString('en-GB') : '—'}`}
        actions={can('customers.edit') && <Button onClick={() => setEdit(true)}><Pencil size={15} />Edit details</Button>} />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card title="Details">
            <MetaRow icon={Phone} label="Mobile">{maskPii ? M.maskMobile(c.mobile_number) : c.mobile_number}</MetaRow>
            <MetaRow icon={Mail} label="Email">{c.email}</MetaRow>
            <MetaRow icon={MapPin} label="City">{c.city}</MetaRow>
            <MetaRow icon={Building2} label="Segment">{c.segment}</MetaRow>
            <MetaRow icon={Hash} label="CRM ID">{c.external_id ? `${c.external_id}${c.crm_source ? ` (${c.crm_source})` : ''}` : null}</MetaRow>
            <MetaRow icon={Tag} label="Tags">{c.tags?.length ? <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} dot={false}>{t}</Badge>)}</span> : null}</MetaRow>
            {c.notes && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2">{c.notes}</p>}
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Avg quality" value={done.length ? `${(M.avg(done.map(M.quality)) ?? 0).toFixed(2)}/5` : '—'} />
            <Stat label="Last sentiment" value={lastSent || '—'} />
            <Stat label="Resolved" value={done.length ? `${M.pct(done.filter(M.isResolved).length, done.length)}%` : '—'} />
            <Stat label="Churn risk" value={done.some((x) => M.churnRisk(x) === 'High') ? 'High' : done.length ? 'Low' : '—'} />
          </div>
          {topics.length > 0 && <Card title="What they call about"><ul className="space-y-1.5">{topics.slice(0, 6).map((t) => <li key={t.name} className="flex justify-between text-[13px]"><span className="text-ink-2">{t.name}</span><span className="tabular-nums text-ink-3">{t.value}</span></li>)}</ul></Card>}
        </div>
        <div className="space-y-4">
          {done.length > 1 && <Card title="Sentiment over time"><Trend area={false} data={daily} series={[{ key: 'pos', name: 'Positive', color: 'var(--ok)' }, { key: 'neu', name: 'Neutral', color: 'var(--cat-8)' }, { key: 'neg', name: 'Negative', color: 'var(--bad)' }]} height={200} /></Card>}
          <Card title="Call history" sub="Recordings, transcripts and analysis results" pad={false}>
            {!calls.length ? <Empty title="No calls in your scope" /> : (
              <ul className="divide-y divide-line">
                {calls.map((x) => { const playing = player.current?.id === x.id && player.playing; const open = openId === x.id; const q = M.quality(x); return (
                  <li key={x.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button className="icon-btn h-9 w-9 border border-line" disabled={!x.audio_file_id} onClick={() => player.play(x, calls)} aria-label={playing ? 'Pause' : 'Play recording'}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[14px]"><span className="font-medium text-ink">{M.topic(x) || (x.status === 'processed' ? 'Call' : 'Waiting for analysis')}</span><span className="text-ink-3">· {x.agent_name || x.agent_code}</span></div>
                        <div className="flex items-center gap-1.5 text-[12px] text-ink-3"><CalendarClock size={12} />{x.call_date} · {M.fmtDuration(M.seconds(x))} · {M.campaignOf(x) || '—'}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">{x.status !== 'processed' ? <Badge>{x.status}</Badge> : <><Badge tone={q >= 4 ? 'ok' : q >= 3 ? 'warn' : 'bad'} dot={false}>{q?.toFixed(1)}/5</Badge><Badge>{M.customerSentiment(x)}</Badge><Badge>{M.classification(x)}</Badge></>}</div>
                      <button className="icon-btn" onClick={() => setOpenId(open ? null : x.id)} aria-expanded={open} aria-label="Show summary"><ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} /></button>
                    </div>
                    {open && (
                      <div className="mt-3 space-y-2 rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2">
                        {x.call_summary ? <p>{x.call_summary}</p> : <p className="text-ink-3">No summary yet.</p>}
                        <div className="flex flex-wrap gap-2"><span>Coaching <Badge>{M.coachingPriority(x)}</Badge></span><span>Compliance <Badge invert>{M.complianceRisk(x)}</Badge></span><span>Churn <Badge invert>{M.churnRisk(x)}</Badge></span></div>
                        <Link href={`/calls/${x.id}`} className="inline-block font-medium text-ink hover:underline">Full analysis & transcript →</Link>
                      </div>
                    )}
                  </li>); })}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <EditCustomer open={edit} onClose={() => setEdit(false)} c={c} />
    </div>
  );
}

function EditCustomer({ open, onClose, c }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({ name: c.name || '', email: c.email || '', city: c.city || '', segment: c.segment || '', external_id: c.external_id || '', tags: (c.tags || []).join(', '), notes: c.notes || '' }));
  const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); const r = await updateCustomer({ id: c.id, ...f, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) }); setBusy(false);
    if (!r.ok) { setErrs(r.fields || {}); toast.error(r.message); return; }
    toast.success(r.message); onClose(); router.refresh();
  };
  return (
    <Modal open={open} onClose={onClose} title="Edit customer" sub={c.mobile_number} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Email" error={errs.email}><Input value={f.email} onChange={(e) => set('email', e.target.value)} error={errs.email} /></Field>
        <Field label="City"><Input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field label="Segment"><Input value={f.segment} onChange={(e) => set('segment', e.target.value)} placeholder="Retail, HNI, Partner…" /></Field>
        <Field label="CRM ID"><Input value={f.external_id} onChange={(e) => set('external_id', e.target.value)} /></Field>
        <Field label="Tags" hint="Comma-separated"><Input value={f.tags} onChange={(e) => set('tags', e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
