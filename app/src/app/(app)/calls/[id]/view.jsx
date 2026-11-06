'use client';
// One call — V1 CallDetailView with every value read from the record (V1 showed static rings, meters and sample SOP notes).
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Pause, Clock, Languages, Hash, Megaphone, ArrowLeftRight, Sparkles, Target, ListChecks, MessageSquareText, Gauge, Tag, NotebookPen, Plus, X, Send, User, ShieldAlert, History, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Badge, Button, Card, Callout, Avatar, Field, Textarea, Select, Input, Empty, ScoreRing, cn } from '@/components/ui';
import { useCan, usePlayer } from '@/components/providers';
import { addTag, removeTag, addCoachingNote, setNoteResolved, resendToFlow, deleteCalls } from '@/app/actions/calls';
// @ts-ignore
import { KPI_DEFS } from '@/lib/catalog.mjs';
import * as M from '@/lib/metrics';

function Section({ icon: Icon, title, children, action, id }) {
  return (
    <section id={id} className="card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Icon size={16} className="text-ink-3" />{title}</h3>{action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function CallDetail({ call: c, notes, runs, maskPii }) {
  const can = useCan(); const player = usePlayer(); const router = useRouter();
  const i = M.intel(c); const q = M.quality(c); const s = M.sopPoints(c); const sops = M.sopList(c); const kpis = M.kpiList(c);
  const turns = M.transcriptTurns(c.cleaned_transcript);
  const playing = player.current?.id === c.id && player.playing;
  const pending = c.status !== 'processed';
  const [tag, setTag] = useState(''); const [addingTag, setAddingTag] = useState(false);
  const [note, setNote] = useState(''); const [noteType, setNoteType] = useState('Manager'); const [noteErr, setNoteErr] = useState(null); const [busy, setBusy] = useState(false);

  const run = async (fn, ok) => { setBusy(true); const r = await fn(); setBusy(false); if (!r.ok) { toast.error(r.message); return r; } if (ok || r.message) toast.success(ok || r.message); router.refresh(); return r; };
  const deleteCurrentCall = async () => {
    if (!confirm('Are you sure you want to permanently delete this call? This cannot be undone.')) return;
    setBusy(true);
    const r = await deleteCalls({ ids: [c.id] });
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success('Call deleted.');
    router.push('/calls');
  };
  const kv = (id, name) => { const k = M.kpi(c, name, id); return { value: k?.value ?? null, note: k?.note || i[`kpi${id}_note`] || null, k }; };
  const hasBfsi = c.bfsi_false_guarantee_flag || c.bfsi_risk_disclaimer_spoken || c.bfsi_identity_verified || c.bfsi_product_category;
  const k15 = M.kpi(c, 'Customer & Agent Sentiment', 15);

  return (
    <div className="space-y-4">
      <PageHeader crumbs={[{ label: 'Calls', href: '/calls' }, { label: c.agent_name || 'Unknown agent', href: c.agent_code && can('agents.view') ? `/agents/${encodeURIComponent(c.agent_code)}` : undefined }, { label: `Call ${c.call_id}` }]}
        title={<span className="flex items-center gap-3"><Avatar name={c.agent_name} size={40} /><span>{c.agent_name || 'Unknown agent'} <span className="text-[15px] font-normal text-ink-3">· {c.agent_code || '—'}</span></span></span>}
        actions={<>
          {(can('upload.analyze') || can('calls.edit')) && (
            <Button variant="danger" size="sm" onClick={deleteCurrentCall} loading={busy}><Trash2 size={14} />Delete</Button>
          )}
          <Button variant="primary" onClick={() => player.play(c)} disabled={!c.audio_file_id}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'Pause' : 'Play recording'}</Button>
        </>} />

      <div className="flex flex-wrap gap-2 text-[13px]">
        {[[Clock, M.fmtDuration(M.seconds(c))], [Languages, c.language], [Hash, `Lead ${c.call_id}`], [Megaphone, M.campaignOf(c)], [ArrowLeftRight, M.direction(c)], [User, c.mobile_number ? (c.customer_id ? <Link className="underline-offset-2 hover:underline" href={`/customers/${c.customer_id}`}>{c.customer_name || M.maskMobile(c.mobile_number)}</Link> : M.maskMobile(c.mobile_number)) : null]]
          .filter(([, v]) => v).map(([Icon, v], k) => <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-ink-2"><Icon size={13} className="text-ink-3" />{v}</span>)}
        <span className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-ink-3">{c.call_date}</span>
      </div>

      {pending && (
        <Callout tone={c.status === 'failed' ? 'bad' : 'warn'} title={c.status === 'processing' ? 'The call-processing flow is analysing this recording' : c.status === 'skipped' ? 'Skipped — non-contact or too short to analyse' : c.status === 'failed' ? 'Analysis failed' : 'Stored, not analysed yet'}>
          <span>{c.status_reason || (c.status === 'processing' ? 'Results appear here when the flow writes back.' : '')}</span>
          {can('upload.analyze') && ['queued', 'failed'].includes(c.status) && <Button size="sm" className="ml-0 mt-2 sm:ml-3 sm:mt-0" onClick={() => run(() => resendToFlow({ ids: [c.id] }))} loading={busy}><Send size={14} />Send for analysis</Button>}
        </Callout>
      )}

      {!pending && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="card flex flex-wrap items-center gap-5 p-5">
              <ScoreRing value={q == null ? null : Number(q.toFixed(1))} max={5} size={104} stroke={9} label="quality /5" />
              <ScoreRing value={s == null ? null : Number(Number(s).toFixed(0))} max={7} size={104} stroke={9} label="SOP /7" />
              <div className="flex min-w-[220px] flex-1 flex-wrap gap-2">
                {[['Coaching', M.coachingPriority(c)], ['Sentiment', M.customerSentiment(c)], ['Compliance risk', M.complianceRisk(c), true], ['Churn risk', M.churnRisk(c), true], ['ZTP', M.isZtp(c) ? 'Violation' : 'None', false, M.isZtp(c) ? 'bad' : 'ok']].map(([l, v, inv, tone]) => (
                  <div key={l} className="rounded-xl bg-surface-2 px-3 py-2"><div className="label mb-1">{l}</div><Badge invert={inv} tone={tone}>{v}</Badge></div>
                ))}
              </div>
            </div>

            <Section icon={Sparkles} title="AI summary"><p className="text-[14px] leading-relaxed text-ink-2">{c.call_summary || 'No summary was returned for this call.'}</p></Section>

            {(c.improvement_areas || c.recommendations) && (
              <Section icon={Target} title="Improvement areas">
                <ul className="space-y-1.5">{String(c.improvement_areas || '').split(/\n/).map((l) => l.replace(/^[-•*\s]+/, '').trim()).filter(Boolean).map((l, k) => <li key={k} className="flex gap-2 text-[14px] text-ink-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />{l}</li>)}</ul>
                {c.recommendations && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2"><b className="text-ink">Recommendation:</b> {c.recommendations}</p>}
              </Section>
            )}

            <Section icon={ListChecks} title="SOP checkpoints" action={<span className="text-[13px] tabular-nums text-ink-3">{s == null ? '' : `${Number(s).toFixed(0)}/7`}</span>}>
              {sops.length ? (
                <ul className="divide-y divide-line">
                  {sops.map((x, k) => (
                    <li key={k} className="flex items-start justify-between gap-4 py-2.5">
                      <div className="min-w-0"><div className="text-[14px] font-medium text-ink">{x.sop_id ? `${x.sop_id}. ` : ''}{x.name}</div>{x.note && <div className="text-[13px] text-ink-3">{x.note}</div>}</div>
                      <Badge>{x.result}</Badge>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-ink-3">The flow did not return SOP results for this call.</p>}
            </Section>

            <Section icon={Gauge} title="Call performance KPIs">
              {kpis.length ? (
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {KPI_DEFS.filter((d) => d.id !== 11 && d.id !== 15).map((d) => { const x = kv(d.id, d.name); return (
                    <div key={d.id} className="rounded-xl border border-line p-3">
                      <div className="flex items-start justify-between gap-2"><span className="text-[13px] font-medium text-ink">{d.id}. {d.name}</span><Badge invert={[4, 10].includes(d.id)}>{x.value ?? 'NA'}</Badge></div>
                      {x.note && <p className="mt-1 text-[12px] text-ink-3">{x.note}</p>}
                    </div>
                  ); })}
                </div>
              ) : <p className="text-[13px] text-ink-3">No KPI results were returned for this call.</p>}
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-xl bg-surface-2 p-3"><div className="label mb-1">KPI 11 · Intent & topic</div><div className="text-[14px] font-medium text-ink">{M.topic(c) || '—'}</div>
                  <div className="text-[13px] text-ink-3">{[M.classification(c), i.customer_type, M.subTopic(c)].filter(Boolean).join(' · ')}</div>{(i.kpi11_intent_detail) && <p className="mt-1 text-[12px] text-ink-3">{i.kpi11_intent_detail}</p>}</div>
                <div className="rounded-xl bg-surface-2 p-3"><div className="label mb-1">KPI 15 · Sentiment</div>
                  <div className="flex flex-wrap gap-3 text-[13px]"><span>Customer <Badge>{M.customerSentiment(c)}</Badge></span><span>Agent <Badge>{M.agentSentiment(c)}</Badge></span></div>{k15?.note && <p className="mt-1 text-[12px] text-ink-3">{k15.note}</p>}</div>
              </div>
            </Section>

            <Section icon={MessageSquareText} title="Transcript" action={maskPii ? <span className="badge badge-info nodot">PII masked</span> : null}>
              {turns.length ? (
                <ol className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                  {turns.map((t, k) => (
                    <li key={k} className={cn('flex', t.who === 'Customer' ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed', t.who === 'Customer' ? 'rounded-br-md bg-surface-2 text-ink' : 'rounded-bl-md border border-line bg-surface text-ink')}>
                        <div className="label mb-0.5">{t.who}</div>{maskPii ? M.maskPII(t.text) : t.text}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-[13px] text-ink-3">No transcript was stored for this call.</p>}
            </Section>
          </div>

          <div className="space-y-4">
            <Section icon={ShieldAlert} title="Risk & compliance">
              <dl className="space-y-2 text-[13px]">
                {[['Compliance risk', <Badge invert>{M.complianceRisk(c)}</Badge>], ['ZTP violation', <Badge tone={M.isZtp(c) ? 'bad' : 'ok'}>{M.isZtp(c) ? 'Violation' : 'None'}</Badge>], ['Coaching priority', <Badge>{M.coachingPriority(c)}</Badge>], ['Churn risk', <Badge invert>{M.churnRisk(c)}</Badge>], ['Validity tier', c.call_validity_tier ?? i.call_validity_tier ?? '—']].map(([l, v]) => <div key={l} className="flex items-center justify-between gap-2"><dt className="text-ink-3">{l}</dt><dd>{v}</dd></div>)}
              </dl>
              {hasBfsi && (
                <div className="mt-4 border-t border-line pt-3">
                  <div className="label mb-2">BFSI checks</div>
                  <dl className="space-y-2 text-[13px]">
                    <div className="flex items-center justify-between"><dt className="text-ink-3">False guarantee</dt><dd><Badge tone={/yes/i.test(c.bfsi_false_guarantee_flag) ? 'bad' : 'ok'}>{/yes/i.test(c.bfsi_false_guarantee_flag) ? 'Violation flagged' : 'Pass'}</Badge></dd></div>
                    <div className="flex items-center justify-between"><dt className="text-ink-3">Risk disclaimer spoken</dt><dd><Badge>{c.bfsi_risk_disclaimer_spoken}</Badge></dd></div>
                    <div className="flex items-center justify-between"><dt className="text-ink-3">Identity verified</dt><dd><Badge>{c.bfsi_identity_verified}</Badge></dd></div>
                    <div className="flex items-center justify-between"><dt className="text-ink-3">Product</dt><dd className="text-ink">{c.bfsi_product_category || c.call_topic || '—'}</dd></div>
                  </dl>
                </div>
              )}
            </Section>

            {can('tags.view') && (
              <Section icon={Tag} title="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {(c.bfsi_product_category || c.call_topic) && <span className="badge badge-info nodot" title="Automatic tag">{c.bfsi_product_category || c.call_topic}</span>}
                  {(c.tags || []).map((t) => (
                    <span key={t} className="badge nodot gap-1">{t}{can('tags.create') && <button onClick={() => run(() => removeTag({ id: c.id, tag: t }))} aria-label={`Remove tag ${t}`} className="-mr-1 rounded hover:text-bad-text"><X size={12} /></button>}</span>
                  ))}
                  {!c.tags?.length && !(c.bfsi_product_category || c.call_topic) && <span className="text-[13px] text-ink-3">No tags.</span>}
                </div>
                {can('tags.create') && (addingTag ? (
                  <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => addTag({ id: c.id, tag })); if (r.ok) { setTag(''); setAddingTag(false); } }}>
                    <Input className="field-sm" autoFocus value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAddingTag(false)} placeholder="New tag" maxLength={40} />
                    <Button size="sm" variant="primary" type="submit" loading={busy}>Add</Button>
                  </form>
                ) : <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAddingTag(true)}><Plus size={14} />Add tag</Button>)}
              </Section>
            )}

            {can('coaching.view') && (
              <Section icon={NotebookPen} title="Coaching notes">
                {(c.coaching_summary_note || c.coaching_note) && (
                  <div className="mb-3 rounded-xl border border-info-edge bg-info-soft p-3 text-[13px] text-ink-2">
                    <div className="mb-1 flex items-center justify-between"><span className="label !text-info-text">AI coaching</span><Badge>{M.coachingPriority(c)}</Badge></div>
                    {c.coaching_summary_note || c.coaching_note}
                  </div>
                )}
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className={cn('rounded-xl border border-line p-3 text-[13px]', n.is_resolved && 'opacity-60')}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><Badge tone={n.note_type === 'Critical' ? 'bad' : n.note_type === 'Feedback' ? 'info' : null} dot={false}>{n.note_type}</Badge><span className="text-[12px] text-ink-3">{n.created_by_name} · {new Date(n.created_at).toLocaleDateString('en-GB')}</span></div>
                      <p className="text-ink-2">{n.note_text}</p>
                      {can('coaching.create') && <button className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink" onClick={() => run(() => setNoteResolved({ id: n.id, callId: c.id, resolved: !n.is_resolved }))}><Check size={12} />{n.is_resolved ? 'Reopen' : 'Mark resolved'}</button>}
                    </li>
                  ))}
                  {!notes.length && <li className="text-[13px] text-ink-3">No manager notes yet.</li>}
                </ul>
                {can('coaching.create') && (
                  <form className="mt-3 space-y-2 border-t border-line pt-3" onSubmit={async (e) => { e.preventDefault(); setNoteErr(null); const r = await run(() => addCoachingNote({ id: c.id, text: note, type: noteType })); if (r.ok) setNote(''); else setNoteErr(r.fields?.text); }}>
                    <Field error={noteErr}><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a coaching note for this call…" error={noteErr} maxLength={4000} /></Field>
                    <div className="flex gap-2"><Select className="field-sm" value={noteType} onChange={(e) => setNoteType(e.target.value)} options={['Manager', 'Advice', 'Feedback', 'Critical']} /><Button size="sm" variant="primary" type="submit" loading={busy} disabled={note.trim().length < 3}>Add note</Button></div>
                  </form>
                )}
              </Section>
            )}

            <Section icon={History} title="Processing history">
              <ul className="space-y-2 text-[13px]">
                {runs.map((r, k) => <li key={k} className="flex items-start justify-between gap-2"><span className="text-ink-2">{r.flow.replace('_', ' ')}<span className="block text-[12px] text-ink-3">{new Date(r.created_at).toLocaleString('en-GB')}</span>{r.detail && <span className="block text-[12px] text-ink-3">{r.detail}</span>}</span><Badge>{r.status.replace('_', ' ')}</Badge></li>)}
                {!runs.length && <li className="text-ink-3">No flow runs recorded (seeded or imported call).</li>}
              </ul>
            </Section>
          </div>
        </div>
      )}
      {pending && (c.status === 'skipped') && <Card><Empty title="Nothing to analyse">The flow found this recording to be a non-contact attempt (voicemail, IVR, switched off) or under five words.</Empty></Card>}
    </div>
  );
}
