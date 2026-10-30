'use client';
// Company Profile — the organisation's details, industry configuration, SOP & policy documents (extracted into rules by the
// SOP-extraction flow), the rules every call is scored against, and campaigns (call lines).
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, SlidersHorizontal, FileText, ListChecks, Megaphone, UploadCloud, RefreshCw, Trash2, Pencil, Plus, Sparkles, AlertCircle, CheckCircle2, Image as ImageIcon, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card, Tabs, Badge, Empty, Button, Modal, Field, Input, Textarea, Select, Switch, Callout, cn } from '@/components/ui';
import { useCan } from '@/components/providers';
import { updateCompany, updateConfig, saveCampaign, deleteCampaign, saveRule, toggleRule, deleteRule, applyTemplate, uploadDocument, reextractDocument, deleteDocument, uploadLogo } from '@/app/actions/company';

const INDUSTRIES = [['bfsi', 'Banking, financial services & insurance'], ['healthcare', 'Healthcare & clinics'], ['ecommerce', 'E-commerce & retail'], ['telecom', 'Telecom & utilities'], ['education', 'Education & ed-tech'], ['generic', 'Other / general contact centre']];
const KINDS = [['sop', 'SOP checkpoints'], ['kpi', 'KPIs'], ['compliance', 'Compliance rules'], ['policy', 'Company policies'], ['ztp', 'Zero-tolerance (ZTP)'], ['topic', 'Intent taxonomy']];

export default function CompanyView({ org, rules, docs, campaigns, extractionConnected, initialTab, welcome }) {
  const can = useCan();
  const [tab, setTab] = useState(['profile', 'config', 'documents', 'rules', 'campaigns'].includes(initialTab) ? initialTab : 'profile');
  return (
    <div className="space-y-5">
      <PageHeader title="Company profile" sub="Your organisation's details, the SOPs and policies calls are scored against, and your call lines." />
      {welcome && <Callout tone="ok" icon={PartyPopper} title={`Welcome to ${org.name}'s workspace`}>Start here: check your details, upload your SOPs and policies, then invite your team under Team & roles and upload recordings.</Callout>}
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'profile', label: 'Profile', icon: Building2 }, { key: 'config', label: 'Industry configuration', icon: SlidersHorizontal }, { key: 'documents', label: 'SOPs & policies', icon: FileText, count: docs.length }, { key: 'rules', label: 'Scoring rules', icon: ListChecks, count: rules.filter((r) => r.is_active).length }, { key: 'campaigns', label: 'Campaigns', icon: Megaphone, count: campaigns.length }]} />
      {tab === 'profile' && <Profile org={org} canEdit={can('company.edit')} />}
      {tab === 'config' && <Config org={org} canEdit={can('company.edit')} />}
      {tab === 'documents' && <Documents docs={docs} connected={extractionConnected} canUpload={can('documents.upload')} />}
      {tab === 'rules' && <Rules rules={rules} org={org} canEdit={can('company.edit')} />}
      {tab === 'campaigns' && <Campaigns campaigns={campaigns} can={can} />}
    </div>
  );
}

function useSave(fn) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [errs, setErrs] = useState({});
  const run = async (input, after) => { setBusy(true); const r = await fn(input); setBusy(false); setErrs(r.ok ? {} : r.fields || {}); if (r.ok) { toast.success(r.message || 'Saved'); router.refresh(); after?.(r); } else toast.error(r.message); return r; };
  return { busy, errs, run };
}

function Profile({ org, canEdit }) {
  const [f, setF] = useState({ name: org.name || '', legal_name: org.legal_name || '', industry: org.industry, website: org.website || '', email: org.email || '', phone: org.phone || '', address: org.address || '', city: org.city || '', country: org.country || '', timezone: org.timezone || 'Asia/Kolkata', employees: org.employees || '', description: org.description || '' });
  const { busy, errs, run } = useSave(updateCompany); const logo = useRef(null); const router = useRouter();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const fld = (k, l, p = {}) => <Field label={l} error={errs[k]} className={p.span ? 'sm:col-span-2' : ''}>{p.area ? <Textarea value={f[k]} onChange={(e) => set(k, e.target.value)} disabled={!canEdit} /> : <Input value={f[k]} onChange={(e) => set(k, e.target.value)} disabled={!canEdit} error={errs[k]} placeholder={p.ph} />}</Field>;
  const onLogo = async (file) => { if (!file) return; const fd = new FormData(); fd.append('file', file); const r = await uploadLogo(fd); r.ok ? toast.success(r.message) : toast.error(r.message); router.refresh(); };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card title="Company details">
        <div className="grid gap-4 sm:grid-cols-2">
          {fld('name', 'Company name')}{fld('legal_name', 'Legal name')}
          <Field label="Industry" hint="Sets the starting SOPs, KPIs, intents and compliance rules"><Select value={f.industry} onChange={(e) => set('industry', e.target.value)} disabled={!canEdit} options={INDUSTRIES.map(([v, l]) => ({ value: v, label: l }))} /></Field>
          {fld('employees', 'Team size', { ph: 'e.g. 50–200' })}{fld('website', 'Website', { ph: 'https://' })}{fld('email', 'Support email')}{fld('phone', 'Phone')}{fld('city', 'City')}{fld('country', 'Country')}{fld('timezone', 'Time zone')}
          {fld('address', 'Address', { span: true })}
          {fld('description', 'What the company does', { span: true, area: true })}
        </div>
        {canEdit && <div className="mt-5 flex justify-end"><Button variant="primary" loading={busy} onClick={() => run(f)}>Save details</Button></div>}
      </Card>
      <Card title="Logo" sub="Shown in the sidebar for everyone in the organisation">
        <div className="flex flex-col items-center gap-3">
          {org.logo_file_id ? <img src={`/api/files/${org.logo_file_id}`} alt="Company logo" className="h-24 w-24 rounded-2xl border border-line object-cover" /> : <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-surface-2 text-ink-3"><ImageIcon size={28} /></span>}
          {canEdit && <><Button size="sm" onClick={() => logo.current?.click()}><UploadCloud size={14} />Upload logo</Button><input ref={logo} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} /><p className="text-[12px] text-ink-3">PNG, JPG or WebP under 2 MB</p></>}
        </div>
      </Card>
    </div>
  );
}

function Config({ org, canEdit }) {
  const c = org.config || {};
  const [f, setF] = useState({
    filename_pattern: c.filename_pattern || 'YYYYMMDD-LEADID_MOBILE_AGENTCODE_CAMPAIGN-FLAG', aht_target_min: c.aht_target_min ?? 5, languages: (c.languages || []).join(', '), pii_masking: c.pii_masking !== false,
    qa_weights: { quality: 35, resolution: 25, compliance: 15, csat: 25, ...(c.qa_weights || {}) }, notify_on: { red_coaching: true, ztp: true, high_compliance: true, training_assigned: true, ...(c.notify_on || {}) },
  });
  const { busy, errs, run } = useSave(updateConfig);
  const sum = Object.values(f.qa_weights).reduce((a, b) => a + Number(b || 0), 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Call handling">
        <div className="space-y-4">
          <Field label="Recording filename pattern" hint="Fields are read from each filename on upload" error={errs.filename_pattern}><Input value={f.filename_pattern} onChange={(e) => setF({ ...f, filename_pattern: e.target.value })} disabled={!canEdit} className="font-mono" /></Field>
          <Field label="AHT target (minutes)" hint="KPI 3 — Efficient within this target" error={errs.aht_target_min}><Input type="number" min={1} max={60} value={f.aht_target_min} onChange={(e) => setF({ ...f, aht_target_min: e.target.value })} disabled={!canEdit} /></Field>
          <Field label="Call languages" hint="Comma-separated"><Input value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} disabled={!canEdit} /></Field>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line p-3"><div><div className="text-[14px] font-medium text-ink">Mask personal data in transcripts</div><div className="text-[12px] text-ink-3">PAN, Aadhaar, card, account and mobile numbers are masked on screen; the database keeps the original.</div></div><Switch checked={f.pii_masking} onChange={(v) => setF({ ...f, pii_masking: v })} disabled={!canEdit} label="PII masking" /></div>
        </div>
      </Card>
      <Card title="QA health weights" sub="How the 100-point QA health score is built">
        <div className="grid grid-cols-2 gap-3">
          {[['quality', 'Call quality'], ['resolution', 'Resolution'], ['compliance', 'Compliance'], ['csat', 'CSAT']].map(([k, l]) => <Field key={k} label={l}><Input type="number" min={0} max={100} value={f.qa_weights[k]} onChange={(e) => setF({ ...f, qa_weights: { ...f.qa_weights, [k]: Number(e.target.value) } })} disabled={!canEdit} /></Field>)}
        </div>
        <p className={cn('mt-2 text-[13px]', sum === 100 ? 'text-ink-3' : 'text-bad-text')}>Total {sum} / 100{errs.qa_weights ? ` — ${errs.qa_weights}` : ''}</p>
        <div className="label mb-2 mt-5">Manager notifications</div>
        <div className="space-y-2">
          {[['red_coaching', 'A call gets a red coaching priority'], ['ztp', 'A ZTP violation is found'], ['high_compliance', 'A call has high compliance risk'], ['training_assigned', 'Training is assigned (notify the agent)']].map(([k, l]) => (
            <div key={k} className="flex items-center justify-between gap-3 text-[14px] text-ink-2"><span>{l}</span><Switch checked={f.notify_on[k]} onChange={(v) => setF({ ...f, notify_on: { ...f.notify_on, [k]: v } })} disabled={!canEdit} label={l} /></div>
          ))}
        </div>
      </Card>
      {canEdit && <div className="flex justify-end lg:col-span-2"><Button variant="primary" loading={busy} disabled={sum !== 100} onClick={() => run({ ...f, aht_target_min: Number(f.aht_target_min), languages: f.languages.split(',').map((s) => s.trim()).filter(Boolean) })}>Save configuration</Button></div>}
    </div>
  );
}

function Documents({ docs, connected, canUpload }) {
  const router = useRouter(); const input = useRef(null);
  const [kind, setKind] = useState('sop'); const [title, setTitle] = useState(''); const [eff, setEff] = useState(''); const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false); const [errs, setErrs] = useState({});
  const upload = async () => {
    const fd = new FormData(); fd.append('kind', kind); fd.append('title', title || (file?.name || '').replace(/\.[^.]+$/, '')); if (eff) fd.append('effective_from', eff); if (file) fd.append('file', file);
    setBusy(true); const r = await uploadDocument(fd); setBusy(false);
    if (!r.ok) { setErrs(r.fields || {}); toast.error(r.message); return; }
    toast.success(r.message); setFile(null); setTitle(''); setEff(''); setErrs({}); router.refresh();
  };
  const act = async (fn) => { const r = await fn(); r.ok ? toast.success(r.message) : toast.error(r.message); router.refresh(); };
  return (
    <div className="space-y-4">
      {!connected && <Callout tone="warn" icon={AlertCircle} title="The SOP & policy extraction flow is not connected">Documents are stored now; rules are extracted once an admin sets WEBHOOK_SOP_EXTRACTION. Until then, add rules by hand under Scoring rules.</Callout>}
      {canUpload && (
        <Card title="Upload an SOP or policy" sub="PDF, Word, text or Markdown, up to 25 MB. The extraction flow turns it into scoring rules.">
          <div className="grid gap-4 sm:grid-cols-[160px_1fr_180px]">
            <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: 'sop', label: 'SOP' }, { value: 'policy', label: 'Company policy' }]} /></Field>
            <Field label="Title" error={errs.title}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Inbound call handling SOP v3" error={errs.title} /></Field>
            <Field label="Effective from"><Input type="date" value={eff} onChange={(e) => setEff(e.target.value)} /></Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => input.current?.click()}><UploadCloud size={15} />{file ? 'Change file' : 'Choose file'}</Button>
            <input ref={input} type="file" accept=".pdf,.doc,.docx,.txt,.md,.rtf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-3">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'No file chosen'}</span>
            {errs.file && <span className="field-error">{errs.file}</span>}
            <Button variant="primary" disabled={!file} loading={busy} onClick={upload}>Upload</Button>
          </div>
        </Card>
      )}
      <Card title="Documents" pad={false}>
        {!docs.length ? <Empty icon={FileText} title="No documents uploaded yet">Upload your call-handling SOPs and policies so every call is scored against your own rules.</Empty> : (
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2"><FileText size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><a href={`/api/files/${d.file_id}`} className="truncate font-medium text-ink hover:underline">{d.title}</a><Badge dot={false}>{d.kind === 'sop' ? 'SOP' : 'Policy'}</Badge></div>
                  <div className="text-[12px] text-ink-3">{d.filename} · {d.uploaded_by_name || '—'} · {new Date(d.created_at).toLocaleDateString('en-GB')}{d.effective_from ? ` · effective ${d.effective_from}` : ''} · {d.rule_count} rule{d.rule_count === 1 ? '' : 's'}</div>
                  {d.status_reason && <div className="text-[12px] text-warn-text">{d.status_reason}</div>}
                  {d.summary && <p className="mt-1 text-[13px] text-ink-2">{d.summary}</p>}
                </div>
                <Badge>{d.status}</Badge>
                {canUpload && <div className="flex gap-1">
                  <button className="icon-btn" onClick={() => act(() => reextractDocument({ id: d.id }))} aria-label="Extract again" title="Extract again"><RefreshCw size={15} /></button>
                  <button className="icon-btn" onClick={() => confirm('Delete this document and the rules extracted from it?') && act(() => deleteDocument({ id: d.id, keepRules: false }))} aria-label="Delete document"><Trash2 size={15} /></button>
                </div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Rules({ rules, org, canEdit }) {
  const router = useRouter();
  const [kind, setKind] = useState('sop'); const [edit, setEdit] = useState(null);
  const shown = rules.filter((r) => r.kind === kind);
  const counts = useMemo(() => Object.fromEntries(KINDS.map(([k]) => [k, rules.filter((r) => r.kind === k && r.is_active).length])), [rules]);
  const act = async (fn) => { const r = await fn(); r.ok ? (r.message && toast.success(r.message)) : toast.error(r.message); router.refresh(); };
  return (
    <div className="space-y-4">
      <Callout tone="info" icon={Sparkles}>Active rules are sent with every recording to the call-processing flow, so each call is scored against your organisation's SOPs, KPIs, policies and intents. Extracted rules come from your documents; template rules from your industry.</Callout>
      <div className="flex flex-wrap items-center gap-2">
        <div className="scroll-x flex gap-1.5">{KINDS.map(([k, l]) => <button key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}<span className="count">{counts[k]}</span></button>)}</div>
        {canEdit && <div className="ml-auto flex gap-2"><Button size="sm" onClick={() => act(() => applyTemplate({ industry: org.industry }))}><Sparkles size={14} />Add missing template rules</Button><Button size="sm" variant="primary" onClick={() => setEdit({ kind })}><Plus size={14} />Add rule</Button></div>}
      </div>
      <Card pad={false}>
        {!shown.length ? <Empty icon={ListChecks} title="No rules of this kind">{canEdit ? 'Add one, or upload a document to extract them.' : ''}</Empty> : (
          <ul className="divide-y divide-line">
            {shown.map((r) => (
              <li key={r.id} className={cn('flex items-start gap-3 px-5 py-3.5', !r.is_active && 'opacity-55')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{r.code && kind !== 'topic' ? `${r.code} · ` : ''}{r.title}</span>
                    {kind === 'topic' && <Badge dot={false}>{r.code === 'OUT' ? 'Outbound' : 'Inbound'}</Badge>}
                    {r.severity !== 'normal' && <Badge tone={r.severity === 'critical' ? 'bad' : r.severity === 'high' ? 'warn' : null}>{r.severity}</Badge>}
                    <Badge dot={false} tone={r.source === 'extracted' ? 'info' : null}>{r.source === 'extracted' ? `from ${r.document_title || 'document'}` : r.source}</Badge></div>
                  {r.description && <p className="mt-0.5 text-[13px] text-ink-2">{r.description}</p>}
                  {(r.na_rule || r.pass_criteria) && <p className="mt-0.5 text-[12px] text-ink-3">{[r.pass_criteria && `Scale: ${r.pass_criteria}`, r.na_rule && `NA: ${r.na_rule}`].filter(Boolean).join(' · ')}</p>}
                </div>
                {canEdit && <div className="flex shrink-0 items-center gap-1">
                  <Switch checked={r.is_active} onChange={(v) => act(() => toggleRule({ id: r.id, is_active: v }))} label={`Rule ${r.title} active`} />
                  <button className="icon-btn" onClick={() => setEdit(r)} aria-label="Edit rule"><Pencil size={15} /></button>
                  <button className="icon-btn" onClick={() => confirm('Delete this rule?') && act(() => deleteRule({ id: r.id }))} aria-label="Delete rule"><Trash2 size={15} /></button>
                </div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <RuleModal rule={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function RuleModal({ rule, onClose }) {
  const [f, setF] = useState(null); const { busy, errs, run } = useSave(saveRule);
  const key = rule ? rule.id || `new-${rule.kind}` : null;
  if (rule && f?.__k !== key) setF({ __k: key, kind: rule.kind, code: rule.code || '', title: rule.title || '', description: rule.description || '', na_rule: rule.na_rule || '', pass_criteria: rule.pass_criteria || '', severity: rule.severity || 'normal', weight: rule.weight ?? 1, sort_order: rule.sort_order ?? 0, is_active: rule.is_active ?? true });
  if (!rule || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const close = () => { setF(null); onClose(); };
  const save = () => { const { __k, ...d } = f; run({ ...(rule.id ? { id: rule.id } : {}), ...d, weight: Number(d.weight), sort_order: Number(d.sort_order) }, close); };
  return (
    <Modal open onClose={close} title={rule.id ? 'Edit rule' : 'Add rule'} width={620} footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save rule</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind"><Select value={f.kind} onChange={(e) => set('kind', e.target.value)} options={KINDS.map(([v, l]) => ({ value: v, label: l }))} /></Field>
        <Field label={f.kind === 'topic' ? 'Direction' : 'Code'} hint={f.kind === 'topic' ? 'IN or OUT' : 'e.g. SOP8'}>{f.kind === 'topic' ? <Select value={f.code} onChange={(e) => set('code', e.target.value)} options={[{ value: 'IN', label: 'Inbound' }, { value: 'OUT', label: 'Outbound' }]} /> : <Input value={f.code} onChange={(e) => set('code', e.target.value)} />}</Field>
        <Field label="Title" error={errs.title} className="sm:col-span-2"><Input value={f.title} onChange={(e) => set('title', e.target.value)} error={errs.title} /></Field>
        <Field label="Rule — what the agent must do" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Not applicable when"><Input value={f.na_rule} onChange={(e) => set('na_rule', e.target.value)} placeholder="e.g. No hold during the call" /></Field>
        <Field label="Values / scale"><Input value={f.pass_criteria} onChange={(e) => set('pass_criteria', e.target.value)} placeholder="e.g. Yes | No | NA" /></Field>
        <Field label="Severity"><Select value={f.severity} onChange={(e) => set('severity', e.target.value)} options={['low', 'normal', 'high', 'critical']} /></Field>
        <Field label="Order"><Input type="number" min={0} max={1000} value={f.sort_order} onChange={(e) => set('sort_order', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function Campaigns({ campaigns, can }) {
  const router = useRouter(); const [edit, setEdit] = useState(null);
  const act = async (fn) => { const r = await fn(); r.ok ? toast.success(r.message) : toast.error(r.message); router.refresh(); };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[['Total', campaigns.length], ['Inbound', campaigns.filter((c) => c.direction === 'Inbound').length], ['Outbound', campaigns.filter((c) => c.direction === 'Outbound').length]].map(([l, v]) => <div key={l} className="card p-4"><div className="label">{l}</div><div className="mt-1 text-[26px] font-semibold tabular-nums text-ink">{v}</div></div>)}
      </div>
      <Card title="Campaigns" sub="The campaign code in each filename maps a call to a line, its direction and its greeting standard" pad={false} action={can('campaigns.create') && <Button size="sm" variant="primary" onClick={() => setEdit({})}><Plus size={14} />Add campaign</Button>}>
        {!campaigns.length ? <Empty icon={Megaphone} title="No campaigns yet" /> : (
          <div className="mt-3 overflow-x-auto"><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Direction</th><th>Core topics</th><th /></tr></thead>
            <tbody>{campaigns.map((c) => (
              <tr key={c.id}><td className="font-mono font-medium">{c.name}</td><td>{c.full_name || '—'}{c.greeting_standard && <div className="max-w-[320px] truncate text-[12px] text-ink-3">{c.greeting_standard}</div>}</td>
                <td><Badge tone={c.direction === 'Inbound' ? 'info' : null} dot={false}>{c.direction}</Badge></td>
                <td className="max-w-[300px]"><div className="flex flex-wrap gap-1">{(c.core_topics || []).slice(0, 5).map((t) => <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[12px] text-ink-2">{t}</span>)}</div></td>
                <td className="whitespace-nowrap text-right">{can('campaigns.edit') && <button className="icon-btn" onClick={() => setEdit(c)} aria-label="Edit campaign"><Pencil size={15} /></button>}{can('campaigns.delete') && <button className="icon-btn" onClick={() => confirm(`Delete campaign ${c.name}?`) && act(() => deleteCampaign({ id: c.id }))} aria-label="Delete campaign"><Trash2 size={15} /></button>}</td></tr>))}</tbody></table></div>
        )}
      </Card>
      <CampaignModal c={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function CampaignModal({ c, onClose }) {
  const [f, setF] = useState(null); const { busy, errs, run } = useSave(saveCampaign);
  const key = c ? c.id || 'new' : null;
  if (c && f?.__k !== key) setF({ __k: key, name: c.name || '', full_name: c.full_name || '', direction: c.direction || 'Inbound', greeting_standard: c.greeting_standard || '', core_topics: (c.core_topics || []).join(', ') });
  if (!c || !f) return null;
  const close = () => { setF(null); onClose(); };
  const save = () => run({ ...(c.id ? { id: c.id } : {}), name: f.name, full_name: f.full_name, direction: f.direction, greeting_standard: f.greeting_standard, core_topics: f.core_topics.split(',').map((s) => s.trim()).filter(Boolean) }, close);
  return (
    <Modal open onClose={close} title={c.id ? 'Edit campaign' : 'Add campaign'} footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code (as in the filename)" error={errs.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toUpperCase() })} error={errs.name} className="font-mono" /></Field>
        <Field label="Direction"><Select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })} options={['Inbound', 'Outbound']} /></Field>
        <Field label="Full name" className="sm:col-span-2"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Greeting standard" className="sm:col-span-2" hint="SOP 1 checks the opening against this"><Textarea value={f.greeting_standard} onChange={(e) => setF({ ...f, greeting_standard: e.target.value })} className="min-h-[72px]" /></Field>
        <Field label="Core topics" className="sm:col-span-2" hint="Comma-separated"><Input value={f.core_topics} onChange={(e) => setF({ ...f, core_topics: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
