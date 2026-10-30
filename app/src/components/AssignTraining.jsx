'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Modal, Button, Field, Input, Select, Textarea } from './ui';
import { assignTraining } from '@/app/actions/training';

/** Assign training to one or more agents against a knowledge gap; the agent is notified (in-app + email when connected). */
export default function AssignTraining({ open, onClose, agents, modules, preset }) {
  const router = useRouter();
  const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [f, setF] = useState({ agent_codes: [], module_id: '', title: '', gap: '', due_date: inAWeek, source_call_id: '' });
  const [busy, setBusy] = useState(false); const [errs, setErrs] = useState({}); const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!open) return;
    const mod = preset?.gap ? modules.find((m) => m.topic && preset.gap.toLowerCase().includes(m.topic.toLowerCase())) : null;
    setF({ agent_codes: preset?.agent_codes || [], module_id: mod?.id || '', title: mod?.title || (preset?.gap ? `Coaching: ${preset.gap.replace(/^(SOP|Product knowledge|Compliance|Resolution|Process adherence):\s*/i, '')}` : ''), gap: preset?.gap || '', due_date: inAWeek, source_call_id: preset?.source_call_id || '' });
    setErrs({}); setMsg(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); const r = await assignTraining(f); setBusy(false);
    if (!r.ok) { setErrs(r.fields || {}); setMsg(r.message); return; }
    toast.success(r.message); onClose(); router.refresh();
  };
  return (
    <Modal open={open} onClose={onClose} title="Assign training" sub="The agent sees it under Training and is notified." width={600}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Assign</Button></>}>
      <div className="space-y-4">
        <Field label="Agents" error={errs.agent_codes}>
          <div className="grid max-h-44 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2">
            {agents.map((a) => (
              <label key={a.agent_code} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-2">
                <input type="checkbox" className="check" checked={f.agent_codes.includes(a.agent_code)} onChange={(e) => set('agent_codes', e.target.checked ? [...f.agent_codes, a.agent_code] : f.agent_codes.filter((x) => x !== a.agent_code))} />
                <span className="truncate">{a.agent_name}</span><span className="ml-auto text-ink-3">{a.agent_code}</span>
              </label>
            ))}
            {!agents.length && <p className="p-2 text-[13px] text-ink-3">No agents in your scope.</p>}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Training module" hint="Optional — or describe the coaching below">
            <Select value={f.module_id} onChange={(e) => { const m = modules.find((x) => x.id === e.target.value); setF((x) => ({ ...x, module_id: e.target.value, title: m ? m.title : x.title })); }} placeholder="No module (custom coaching)" options={modules.map((m) => ({ value: m.id, label: m.title }))} />
          </Field>
          <Field label="Due date" error={errs.due_date}><Input type="date" value={f.due_date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => set('due_date', e.target.value)} error={errs.due_date} /></Field>
        </div>
        <Field label="Title" error={errs.title}><Input value={f.title} onChange={(e) => set('title', e.target.value)} error={errs.title} maxLength={160} /></Field>
        <Field label="Knowledge gap" hint="What this training should fix"><Textarea value={f.gap} onChange={(e) => set('gap', e.target.value)} maxLength={300} className="min-h-[72px]" /></Field>
        {msg && <div className="callout callout-bad">{msg}</div>}
      </div>
    </Modal>
  );
}
