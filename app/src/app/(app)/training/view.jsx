'use client';
// Agent Training — knowledge gaps per agent, improvement areas, scores, training assignments (with manager notifications)
// and the organisation's training module library.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap, Plus, BookOpen, Target, ClipboardList, CheckCircle2, Clock, Trash2, Pencil, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card, Kpi, Tabs, Badge, Empty, Avatar, Button, Modal, Field, Input, Textarea, Select, BarList, Progress, cn } from '@/components/ui';
import { useCan, useUser } from '@/components/providers';
import AssignTraining from '@/components/AssignTraining';
import { updateAssignment, deleteAssignment, saveModule, deleteModule } from '@/app/actions/training';
import * as M from '@/lib/metrics';

export default function TrainingView({ calls: all, agents, modules, assignments }) {
  const can = useCan(); const user = useUser(); const router = useRouter();
  const calls = all.filter(M.isProcessed);
  const self = user.scope === 'own';
  const [tab, setTab] = useState(self ? 'mine' : 'gaps');
  const [assign, setAssign] = useState(null); const [mod, setMod] = useState(null); const [upd, setUpd] = useState(null);
  const stats = useMemo(() => M.agentStats(calls, agents), [calls, agents]);
  const gapsByAgent = useMemo(() => stats.map((a) => ({ ...a, gaps: M.knowledgeGaps(calls.filter((c) => c.agent_code === a.code)) })).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)), [stats, calls]);
  const orgGaps = useMemo(() => M.knowledgeGaps(calls), [calls]);
  const themes = useMemo(() => M.improvementThemes(calls), [calls]);
  const open = assignments.filter((t) => t.status !== 'Completed');
  const overdue = open.filter((t) => t.due_date && t.due_date < new Date().toISOString().slice(0, 10));
  const done = assignments.filter((t) => t.status === 'Completed');
  const run = async (fn) => { const r = await fn(); r.ok ? toast.success(r.message || 'Saved') : toast.error(r.message); if (r.ok) router.refresh(); return r; };

  const tabs = [
    ...(self ? [{ key: 'mine', label: 'My training', icon: ClipboardList, count: assignments.length }] : [{ key: 'gaps', label: 'Knowledge gaps', icon: Target }, { key: 'assignments', label: 'Assignments', icon: ClipboardList, count: open.length }]),
    { key: 'modules', label: 'Module library', icon: BookOpen, count: modules.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={self ? 'My training' : 'Agent training'} sub={self ? 'Training your team leader assigned to you, and the module library.' : 'Find what each agent is missing, assign training against it, and track it to completion.'}
        actions={<>{can('training.manage') && <Button onClick={() => setMod({})}><BookOpen size={15} />New module</Button>}{can('training.assign') && <Button variant="primary" onClick={() => setAssign({})}><GraduationCap size={15} />Assign training</Button>}</>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Open assignments" value={open.length} icon={ClipboardList} onClick={() => setTab(self ? 'mine' : 'assignments')} />
        <Kpi label="Overdue" value={overdue.length} icon={AlertTriangle} tone={overdue.length ? 'bad' : undefined} onClick={() => setTab(self ? 'mine' : 'assignments')} />
        <Kpi label="Completed" value={done.length} icon={CheckCircle2} sub={assignments.length ? `${M.pct(done.length, assignments.length)}% completion` : undefined} />
        <Kpi label={self ? 'My open gaps' : 'Agents needing coaching'} value={self ? orgGaps.length : gapsByAgent.filter((a) => a.red + a.amber > 0).length} icon={Target} tone={undefined} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />

      {tab === 'gaps' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card title="Gaps by agent" sub="Lowest QA score first" pad={false}>
            {!gapsByAgent.length ? <Empty title="No analysed calls yet" /> : (
              <ul className="divide-y divide-line">
                {gapsByAgent.map((a) => (
                  <li key={a.code} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Avatar name={a.name} size={34} />
                      <div className="min-w-0 flex-1"><Link href={`/agents/${encodeURIComponent(a.code)}`} className="font-medium text-ink hover:underline">{a.name}</Link><div className="text-[12px] text-ink-3">{a.code} · {a.calls} calls · quality {a.quality?.toFixed(2)}/5 · SOP {a.sop?.toFixed(1)}/7</div></div>
                      <div className="w-28"><div className="flex justify-between text-[12px]"><span className="text-ink-3">QA</span><span className="tabular-nums text-ink-2">{a.score}</span></div><Progress value={a.score ?? 0} /></div>
                      {a.red > 0 && <Badge tone="bad">{a.red} red</Badge>}
                    </div>
                    {a.gaps.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {a.gaps.slice(0, 5).map((g) => (
                          <button key={g.key} disabled={!can('training.assign')} onClick={() => setAssign({ agent_codes: [a.code], gap: `${g.key} (${g.count} calls)`, source_call_id: g.calls[0] })}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 enabled:hover:border-line-strong enabled:hover:bg-surface-2" title={can('training.assign') ? 'Assign training for this gap' : undefined}>
                            {g.key}<span className="tabular-nums text-ink-3">×{g.count}</span>{can('training.assign') && <Plus size={12} />}
                          </button>
                        ))}
                      </div>
                    ) : <p className="mt-2 text-[12px] text-ok-text">No gaps found.</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="space-y-4">
            <Card title="Top gaps across the team">{orgGaps.length ? <BarList rows={orgGaps.map((g) => ({ name: g.key, value: g.count }))} max={8} tone="warn" /> : <Empty title="No gaps" />}</Card>
            <Card title="Improvement areas" sub="From the AI's notes">{themes.length ? <BarList rows={themes} max={6} /> : <Empty title="No notes" />}</Card>
          </div>
        </div>
      )}

      {(tab === 'assignments' || tab === 'mine') && (
        <Card pad={false}>
          {!assignments.length ? <Empty icon={ClipboardList} title="No training assigned yet" action={can('training.assign') ? <Button variant="primary" onClick={() => setAssign({})}>Assign training</Button> : null}>Assignments made from a knowledge gap or an agent's page appear here.</Empty> : (
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Agent</th><th>Training</th><th>Gap</th><th>Due</th><th>Status</th><th>Assigned by</th><th /></tr></thead>
              <tbody>{assignments.map((t) => { const late = t.status !== 'Completed' && t.due_date && t.due_date < new Date().toISOString().slice(0, 10); return (
                <tr key={t.id}>
                  <td><div className="font-medium text-ink">{t.agent_name || t.agent_code}</div><div className="text-[12px] text-ink-3">{t.agent_code}</div></td>
                  <td className="max-w-[240px]"><div className="truncate font-medium">{t.title}</div>{t.agent_notes && <div className="truncate text-[12px] text-ink-3">“{t.agent_notes}”</div>}</td>
                  <td className="max-w-[220px] truncate text-ink-3">{t.gap || '—'}{t.source_call_id && <Link href={`/calls/${t.source_call_id}`} className="ml-1 text-ink-2 hover:underline">call</Link>}</td>
                  <td className={cn('whitespace-nowrap tabular-nums', late && 'text-bad-text')}>{t.due_date || '—'}{late && ' · overdue'}</td>
                  <td><Badge>{t.status}</Badge></td><td className="text-ink-3">{t.assigned_by_name || '—'}</td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setUpd(t)}>Update</Button>
                    {can('training.assign') && <button className="icon-btn" aria-label="Remove assignment" onClick={() => confirm('Remove this assignment?') && run(() => deleteAssignment({ id: t.id }))}><Trash2 size={15} /></button>}
                  </td>
                </tr>); })}</tbody></table></div>
          )}
        </Card>
      )}

      {tab === 'modules' && (
        modules.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((m) => (
              <div key={m.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-ink-2"><BookOpen size={17} /></span>{m.topic && <Badge dot={false}>{m.topic}</Badge>}</div>
                <h3 className="mt-3 text-[15px] font-semibold text-ink">{m.title}</h3>
                <p className="mt-1 flex-1 text-[13px] text-ink-3">{m.description || 'No description.'}</p>
                {m.content && <details className="mt-2 text-[13px] text-ink-2"><summary className="cursor-pointer text-ink-3">Read module</summary><p className="mt-2 whitespace-pre-wrap">{m.content}</p></details>}
                <div className="mt-3 flex items-center gap-3 text-[12px] text-ink-3">{m.duration_min && <span className="flex items-center gap-1"><Clock size={13} />{m.duration_min} min</span>}<span>{m.assigned} assigned</span>
                  {m.resource_url && <a href={m.resource_url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 hover:text-ink">Resource <ExternalLink size={12} /></a>}</div>
                {can('training.manage') && <div className="mt-3 flex gap-2 border-t border-line pt-3"><Button size="sm" variant="ghost" onClick={() => setMod(m)}><Pencil size={14} />Edit</Button><Button size="sm" variant="ghost" onClick={() => confirm('Delete this module? Assignments keep their title.') && run(() => deleteModule({ id: m.id }))}><Trash2 size={14} />Delete</Button></div>}
              </div>
            ))}
          </div>
        ) : <Card><Empty icon={BookOpen} title="No training modules yet" action={can('training.manage') ? <Button variant="primary" onClick={() => setMod({})}>Create a module</Button> : null}>Modules are reusable lessons — greeting standard, hold etiquette, compliance language — that you assign against gaps.</Empty></Card>
      )}

      <AssignTraining open={!!assign} onClose={() => setAssign(null)} preset={assign} modules={modules} agents={agents} />
      <ModuleModal mod={mod} onClose={() => setMod(null)} />
      <UpdateModal t={upd} onClose={() => setUpd(null)} />
    </div>
  );
}

function ModuleModal({ mod, onClose }) {
  const router = useRouter();
  const [f, setF] = useState({}); const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false);
  const isOpen = !!mod;
  if (isOpen && f.__for !== (mod.id || 'new')) setF({ __for: mod.id || 'new', title: mod.title || '', topic: mod.topic || '', description: mod.description || '', content: mod.content || '', resource_url: mod.resource_url || '', duration_min: mod.duration_min || '' });
  const save = async () => {
    setBusy(true);
    const { __for, ...rest } = f;
    const r = await saveModule({ ...(mod.id ? { id: mod.id } : {}), ...rest, duration_min: rest.duration_min === '' ? null : Number(rest.duration_min) });
    setBusy(false);
    if (!r.ok) { setErrs(r.fields || {}); toast.error(r.message); return; }
    toast.success(r.message); setF({}); onClose(); router.refresh();
  };
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal open={isOpen} onClose={() => { setF({}); onClose(); }} title={mod?.id ? 'Edit module' : 'New training module'} width={620} footer={<><Button onClick={() => { setF({}); onClose(); }}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Save module</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" error={errs.title} className="sm:col-span-2"><Input value={f.title || ''} onChange={(e) => set('title', e.target.value)} error={errs.title} /></Field>
        <Field label="Topic / gap it addresses" hint="e.g. Greeting, Hold Permission, Compliance"><Input value={f.topic || ''} onChange={(e) => set('topic', e.target.value)} /></Field>
        <Field label="Duration (minutes)" error={errs.duration_min}><Input type="number" min={1} max={600} value={f.duration_min ?? ''} onChange={(e) => set('duration_min', e.target.value)} /></Field>
        <Field label="Short description" className="sm:col-span-2"><Input value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Content" className="sm:col-span-2" hint="The lesson itself — script, do's and don'ts, examples"><Textarea value={f.content || ''} onChange={(e) => set('content', e.target.value)} className="min-h-[140px]" /></Field>
        <Field label="Resource link" error={errs.resource_url} className="sm:col-span-2"><Input value={f.resource_url || ''} onChange={(e) => set('resource_url', e.target.value)} placeholder="https://" error={errs.resource_url} /></Field>
      </div>
    </Modal>
  );
}

function UpdateModal({ t, onClose }) {
  const router = useRouter();
  const [status, setStatus] = useState('Assigned'); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [forId, setForId] = useState(null);
  if (t && forId !== t.id) { setForId(t.id); setStatus(t.status); setNotes(t.agent_notes || ''); }
  const save = async () => { setBusy(true); const r = await updateAssignment({ id: t.id, status, agent_notes: notes }); setBusy(false); if (!r.ok) { toast.error(r.message); return; } toast.success(r.message); setForId(null); onClose(); router.refresh(); };
  return (
    <Modal open={!!t} onClose={() => { setForId(null); onClose(); }} title="Update training" sub={t?.title} footer={<><Button onClick={() => { setForId(null); onClose(); }}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={['Assigned', 'In Progress', 'Completed']} /></Field>
        <Field label="Notes" hint="What was practised, what's left"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></Field>
      </div>
    </Modal>
  );
}
