'use client';
// Dialer integration — recordings arrive from the calling platform by webhook and are analysed without manual upload.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Radio, Plus, Pencil, Trash2, KeyRound, Copy, RefreshCw, AlertCircle, ArrowRight, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card, Badge, Empty, Button, Modal, Field, Input, Select, Switch, Callout, Kpi } from '@/components/ui';
import { saveSource, rotateSourceToken, deleteSource, retryEvent } from '@/app/actions/sources';

const MAP_FIELDS = [['call_id', 'Call ID', true], ['recording_url', 'Recording URL', true], ['agent', 'Agent (extension / number / login)', true], ['customer_number', 'Customer number', true],
  ['direction', 'Direction', false], ['started_at', 'Start time', false], ['duration', 'Duration', false], ['campaign', 'Campaign', false]];
const STATUS_LABEL = { received: 'Received', downloading: 'Downloading', queued: 'Queued', processing: 'Analysing', skipped: 'Skipped', failed: 'Failed' };

export default function SourcesView({ sources, events, unmapped, presets, appUrl, flowConnected, publicUrlSet }) {
  const router = useRouter();
  const [edit, setEdit] = useState(null); const [shown, setShown] = useState(null);
  const act = async (fn) => { const r = await fn(); if (r.ok) { toast.success(r.message); if (r.data?.token) setShown(r.data); } else toast.error(r.message); router.refresh(); };
  const url = (id, token) => `${appUrl}/api/ingest/${id}?token=${token}`;
  const pname = (k) => presets.find((p) => p.key === k)?.label || k;
  return (
    <div className="space-y-5">
      <PageHeader title="Dialer integration" sub="Connect your calling platform so every recorded call lands here and is analysed automatically — no manual upload."
        actions={<Button variant="primary" onClick={() => setEdit({})}><Plus size={15} />Connect a dialer</Button>} />
      {!publicUrlSet && <Callout tone="warn" icon={AlertCircle} title="Set PUBLIC_APP_URL before connecting a dialer">Your dialer posts to this app over the internet, so the webhook address must be the app's public https URL.</Callout>}
      {!flowConnected && <Callout tone="warn" icon={AlertCircle}>Recordings will arrive and be stored, but they wait as “queued” until the call-processing flow is connected (Settings).</Callout>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Connected dialers" value={sources.filter((s) => s.is_active).length} icon={Radio} sub={`${sources.length} configured`} />
        <Kpi label="Calls received (latest 60)" value={events.filter((e) => e.call_id).length} href="/calls" />
        <Kpi label="Failed downloads" value={events.filter((e) => e.status === 'failed').length} tone={events.some((e) => e.status === 'failed') ? 'bad' : undefined} />
      </div>

      <Card title="How it works">
        <ol className="grid gap-3 text-[13px] text-ink-2 md:grid-cols-4">
          {[['1', 'Connect a dialer', 'Pick your provider; you get a private webhook URL.'], ['2', 'Paste it in the dialer', 'As its "call ended" / passthru / call-log webhook.'], ['3', 'Calls arrive', 'Each recorded call is downloaded and named by date, call ID, customer and agent.'], ['4', 'Analysed as usual', 'The same transcription and AI analysis as uploads, then coaching and CRM.']].map(([n, t, d]) => (
            <li key={n} className="rounded-xl bg-surface-2 p-3"><div className="label mb-1">Step {n}</div><div className="font-medium text-ink">{t}</div><p className="mt-0.5 text-ink-3">{d}</p></li>
          ))}
        </ol>
      </Card>

      <Card title="Dialers" pad={false}>
        {!sources.length ? <Empty icon={Radio} title="No dialer connected" action={<Button variant="primary" onClick={() => setEdit({})}>Connect a dialer</Button>}>Supports Exotel, Ozonetel, Tata Smartflo, Knowlarity, MyOperator and any platform that can send a webhook.</Empty> : (
          <ul className="divide-y divide-line">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2"><Radio size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{s.name}</span><Badge dot={false}>{pname(s.provider)}</Badge><Badge tone={s.is_active ? 'ok' : null}>{s.is_active ? 'Active' : 'Paused'}</Badge>{s.has_auth && <Badge dot={false} tone="info">Download auth set</Badge>}</div>
                  <div className="text-[12px] text-ink-3">{s.events} event(s){s.failed ? ` · ${s.failed} failed` : ''} · last {s.last_event_at ? new Date(s.last_event_at).toLocaleString('en-GB') : 'never'}{s.default_campaign ? ` · campaign ${s.default_campaign}` : ''}</div>
                  <code className="mt-1 block break-all text-[12px] text-ink-3">{appUrl}/api/ingest/{s.id}?token=••••••</code>
                </div>
                <div className="flex gap-1">
                  <button className="icon-btn" onClick={() => setEdit(s)} aria-label="Edit source"><Pencil size={15} /></button>
                  <button className="icon-btn" onClick={() => confirm('Issue a new webhook URL? The current one stops working immediately.') && act(() => rotateSourceToken({ id: s.id }))} aria-label="New webhook URL"><KeyRound size={15} /></button>
                  <button className="icon-btn" onClick={() => confirm(`Remove ${s.name}? Calls already received stay.`) && act(() => deleteSource({ id: s.id }))} aria-label="Delete source"><Trash2 size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {unmapped.length > 0 && (
        <Callout tone="info" icon={UserCog} title="Map dialer IDs to your agents">
          These agents were created from dialer identifiers that matched nobody: {unmapped.map((a) => a.agent_code).join(', ')}. Rename them, or add the identifier as a “Dialer ID” on the right agent under <Link href="/team" className="font-medium underline underline-offset-2">Team &amp; roles → Agents</Link>.
        </Callout>
      )}

      <Card title="Recent events" sub="What each dialer sent and what happened. Field names (never values) are listed to help fix a mapping." pad={false}>
        {!events.length ? <Empty title="No events yet">Events appear here as soon as a dialer posts its first call.</Empty> : (
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Received</th><th>Dialer</th><th>Call ID</th><th>Status</th><th>Detail / fields received</th><th /></tr></thead>
            <tbody>{events.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-ink-2">{new Date(e.created_at).toLocaleString('en-GB')}</td><td>{e.source_name}</td><td className="font-mono text-[12px]">{e.external_call_id}</td>
                <td><Badge tone={e.status === 'failed' ? 'bad' : e.status === 'skipped' ? 'warn' : e.call_id ? 'ok' : null}>{STATUS_LABEL[e.status] || e.status}</Badge></td>
                <td className="max-w-[420px] text-[12px] text-ink-3"><div className="truncate">{e.detail || '—'}</div>{e.keys?.length > 0 && <div className="truncate font-mono">{e.keys.join(', ')}</div>}</td>
                <td className="whitespace-nowrap text-right">{e.call_id && <Link href={`/calls/${e.call_id}`} className="btn btn-ghost btn-sm">Call <ArrowRight size={13} /></Link>}{['failed', 'skipped'].includes(e.status) && <Button size="sm" variant="ghost" onClick={() => act(() => retryEvent({ id: e.id }))}><RefreshCw size={13} />Retry</Button>}</td>
              </tr>))}</tbody></table></div>
        )}
      </Card>

      <SourceModal s={edit} presets={presets} onClose={() => setEdit(null)} onCreated={setShown} />
      <Modal open={!!shown} onClose={() => setShown(null)} title="Webhook URL for your dialer" sub="Shown once. Paste it into the dialer as its call-ended / passthru / call-log webhook." footer={<Button variant="primary" onClick={() => setShown(null)}>I've saved it</Button>}>
        {shown && <div className="flex gap-2"><Input readOnly value={url(shown.id, shown.token)} className="font-mono text-[12px]" /><Button onClick={() => { navigator.clipboard.writeText(url(shown.id, shown.token)); toast.success('Copied'); }} aria-label="Copy URL"><Copy size={15} /></Button></div>}
        <p className="mt-3 text-[12px] text-ink-3">Accepts POST (JSON, form or multipart with the recording file) and GET. Retries of the same call are ignored.</p>
      </Modal>
    </div>
  );
}

function SourceModal({ s, presets, onClose, onCreated }) {
  const router = useRouter();
  const [f, setF] = useState(null); const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false);
  const key = s ? s.id || 'new' : null;
  if (s && f?.__k !== key) { const p = s.provider || 'generic'; setF({ __k: key, provider: p, name: s.name || '', default_campaign: s.default_campaign || '', download_auth: '', is_active: s.is_active ?? true, map: { ...presets.find((x) => x.key === p).map, ...(s.field_map || {}) } }); }
  if (!s || !f) return null;
  const preset = presets.find((x) => x.key === f.provider);
  const close = () => { setF(null); setErrs({}); onClose(); };
  const save = async () => {
    setBusy(true);
    const r = await saveSource({ ...(s.id ? { id: s.id } : {}), provider: f.provider, name: f.name, default_campaign: f.default_campaign, download_auth: f.download_auth, is_active: f.is_active, field_map: f.map });
    setBusy(false);
    if (!r.ok) { setErrs(r.fields || {}); toast.error(r.message); return; }
    toast.success(r.message); if (r.data?.token) onCreated(r.data); close(); router.refresh();
  };
  return (
    <Modal open onClose={close} title={s.id ? `Edit ${s.name}` : 'Connect a dialer'} width={680} footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{s.id ? 'Save' : 'Create webhook'}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider"><Select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value, map: { ...presets.find((x) => x.key === e.target.value).map } })} options={presets.map((p) => ({ value: p.key, label: p.label }))} /></Field>
          <Field label="Name" error={errs.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Exotel — support line" error={errs.name} /></Field>
          <Field label="Campaign for these calls" hint="A campaign code from Company profile (sets direction & greeting standard)" error={errs.default_campaign}><Input value={f.default_campaign} onChange={(e) => setF({ ...f, default_campaign: e.target.value.toUpperCase() })} className="font-mono" error={errs.default_campaign} /></Field>
          <Field label="Recording download" hint={s.has_auth ? 'Saved — leave empty to keep, "-" to clear' : 'Only if the recording URL needs it: "user:password" or "Bearer <token>"'}><Input type="password" autoComplete="off" value={f.download_auth} onChange={(e) => setF({ ...f, download_auth: e.target.value })} /></Field>
        </div>
        {preset?.help && <Callout tone="info">{preset.help}</Callout>}
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-[13px] font-medium text-ink-2">Field mapping</legend>
          <p className="mb-3 text-[12px] text-ink-3">The preset is a starting point — check it against a sample from your account. Use <code className="kbd">A|B</code> for “A, or else B”, and dots for nested fields.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MAP_FIELDS.map(([k, l, req]) => <Field key={k} label={`${l}${req ? '' : ' (optional)'}`} error={errs.field_map && req && !f.map[k] ? 'Required' : null}><Input className="field-sm font-mono" value={f.map[k] || ''} onChange={(e) => setF({ ...f, map: { ...f.map, [k]: e.target.value } })} /></Field>)}
          </div>
        </fieldset>
        <div className="flex items-center justify-between rounded-xl border border-line p-3 text-[14px]"><span>Active</span><Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Active" /></div>
      </div>
    </Modal>
  );
}
