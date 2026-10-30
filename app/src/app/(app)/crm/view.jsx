'use client';
// CRM Integration — vendor-neutral: signed outbound webhooks (call processed, customer updated, training assigned), an
// inbound endpoint a CRM pushes customers to, CSV import, and a sync log. Vendor connectors are listed as not available yet.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plug, Plus, Send, RefreshCw, Trash2, Pencil, UploadCloud, Copy, KeyRound, ArrowUpRight, ArrowDownLeft, FileSpreadsheet, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card, Badge, Empty, Button, Modal, Field, Input, Switch, Callout, Kpi } from '@/components/ui';
import { useCan } from '@/components/providers';
import { saveConnection, rotateConnection, deleteConnection, testConnection, importCustomers } from '@/app/actions/misc';

const EVENTS = [['call.processed', 'Call analysed'], ['customer.updated', 'Customer updated'], ['training.assigned', 'Training assigned']];
const VENDORS = ['HubSpot', 'Zoho CRM', 'Salesforce', 'LeadSquared', 'Freshsales'];

export default function CrmView({ connections, log, customers, appUrl }) {
  const can = useCan(); const router = useRouter(); const csv = useRef(null);
  const [edit, setEdit] = useState(null); const [secret, setSecret] = useState(null); const [busy, setBusy] = useState(null);
  const manage = can('crm.manage');
  const act = async (key, fn) => { setBusy(key); const r = await fn(); setBusy(null); if (r.ok) { toast.success(r.message); if (r.data?.secret) setSecret(r.data); } else toast.error(r.message); router.refresh(); };
  const onCsv = async (file) => { if (!file) return; const fd = new FormData(); fd.append('file', file); await act('csv', () => importCustomers(fd)); if (csv.current) csv.current.value = ''; };
  return (
    <div className="space-y-5">
      <PageHeader title="CRM integration" sub="Send call results to your CRM and bring customer records in." actions={manage && <Button variant="primary" onClick={() => setEdit({})}><Plus size={15} />New connection</Button>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Connections" value={connections.length} icon={Plug} sub={`${connections.filter((c) => c.is_active).length} active`} />
        <Kpi label="Customers on file" value={customers} icon={FileSpreadsheet} href="/customers" />
        <Kpi label="Failed syncs (last 100)" value={log.filter((l) => l.status === 'failed').length} icon={RefreshCw} tone={log.some((l) => l.status === 'failed') ? 'bad' : undefined} />
      </div>

      <Card title="Connections" pad={false}>
        {!connections.length ? <Empty icon={Plug} title="No CRM connected" action={manage ? <Button variant="primary" onClick={() => setEdit({})}>Create a webhook connection</Button> : null}>A webhook connection works with any CRM or automation tool that can receive HTTPS posts, and can push customers back in.</Empty> : (
          <ul className="divide-y divide-line">
            {connections.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2"><Plug size={18} /></span>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-medium text-ink">{c.name}</span><Badge tone={c.is_active ? 'ok' : null}>{c.is_active ? 'Active' : 'Paused'}</Badge></div>
                    <div className="truncate text-[12px] text-ink-3">{c.outbound_url || 'No outbound URL — inbound only'} · last sync {c.last_sync_at ? `${new Date(c.last_sync_at).toLocaleString('en-GB')} (${c.last_status})` : 'never'}</div></div>
                  {manage && <div className="flex flex-wrap gap-1">
                    <Button size="sm" onClick={() => act(`t${c.id}`, () => testConnection({ id: c.id }))} loading={busy === `t${c.id}`} disabled={!c.outbound_url}><Send size={14} />Test</Button>
                    <button className="icon-btn" onClick={() => setEdit(c)} aria-label="Edit connection"><Pencil size={15} /></button>
                    <button className="icon-btn" onClick={() => confirm('Issue a new secret and inbound token? The old ones stop working immediately.') && act(`r${c.id}`, () => rotateConnection({ id: c.id }))} aria-label="Rotate secret and token"><KeyRound size={15} /></button>
                    <button className="icon-btn" onClick={() => confirm('Remove this connection?') && act(`d${c.id}`, () => deleteConnection({ id: c.id }))} aria-label="Delete connection"><Trash2 size={15} /></button>
                  </div>}
                </div>
                <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
                  <div className="min-w-0 rounded-xl bg-surface-2 p-3"><div className="label mb-1 flex items-center gap-1.5"><ArrowUpRight size={13} />Outbound events</div>{c.events.length ? c.events.map((e) => <Badge key={e} dot={false} className="mr-1">{e}</Badge>) : 'None'}<p className="mt-1.5 text-ink-3">Signed with HMAC-SHA256 — header <code className="kbd">X-CAS-Signature: sha256=…</code></p></div>
                  <div className="min-w-0 rounded-xl bg-surface-2 p-3"><div className="label mb-1 flex items-center gap-1.5"><ArrowDownLeft size={13} />Inbound customers</div><code className="block break-all text-ink-2">POST {appUrl}/api/crm/{c.id}/customers</code><p className="mt-1.5 text-ink-3">Header <code className="kbd">Authorization: Bearer &lt;token&gt;</code> · body {'{ customers: [{ mobile_number, name, email, … }] }'}</p></div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Import customers from CSV" sub="Columns: mobile_number (required), name, email, city, segment, external_id, tags (separated by ; )">
          {manage ? <><Button onClick={() => csv.current?.click()} loading={busy === 'csv'}><UploadCloud size={15} />Choose CSV</Button><input ref={csv} type="file" accept=".csv" className="hidden" onChange={(e) => onCsv(e.target.files?.[0])} /><p className="mt-2 text-[12px] text-ink-3">Existing customers are matched on mobile number and updated; nothing is deleted.</p></> : <p className="text-[13px] text-ink-3">Your role can view the integration but not import.</p>}
        </Card>
        <Card title="Native CRM connectors" sub="Not available in this version — use a webhook connection or your CRM's automation in the meantime">
          <div className="flex flex-wrap gap-2">{VENDORS.map((v) => <span key={v} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[13px] text-ink-3"><Lock size={12} />{v}</span>)}</div>
        </Card>
      </div>

      <Card title="Sync log" sub="Last 100 deliveries and imports" pad={false}>
        {!log.length ? <Empty title="Nothing synced yet" /> : (
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>When</th><th>Direction</th><th>Event</th><th>Connection</th><th>Records</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>{log.map((l) => <tr key={l.id}><td className="whitespace-nowrap text-ink-2">{new Date(l.created_at).toLocaleString('en-GB')}</td><td>{l.direction}</td><td className="font-mono text-[12px]">{l.event}</td><td>{l.connection_name || '—'}</td><td className="tabular-nums">{l.records}</td><td><Badge tone={l.status === 'ok' ? 'ok' : 'bad'}>{l.status === 'ok' ? `OK${l.http_status ? ` ${l.http_status}` : ''}` : `Failed${l.http_status ? ` ${l.http_status}` : ''}`}</Badge></td><td className="max-w-[280px] truncate text-ink-3">{l.detail || '—'}</td></tr>)}</tbody></table></div>
        )}
      </Card>

      <ConnModal c={edit} onClose={() => setEdit(null)} onCreated={setSecret} />
      <Modal open={!!secret} onClose={() => setSecret(null)} title="Copy these now" sub="They are shown once and stored only as a hash / ciphertext." footer={<Button variant="primary" onClick={() => setSecret(null)}>I've saved them</Button>}>
        {secret && <div className="space-y-3">{[['Signing secret (verify X-CAS-Signature)', secret.secret], ['Inbound token (Authorization: Bearer …)', secret.token]].map(([l, v]) => (
          <Field key={l} label={l}><div className="flex gap-2"><Input readOnly value={v} className="font-mono text-[13px]" /><Button onClick={() => { navigator.clipboard.writeText(v); toast.success('Copied'); }} aria-label="Copy"><Copy size={15} /></Button></div></Field>))}</div>}
      </Modal>
    </div>
  );
}

function ConnModal({ c, onClose, onCreated }) {
  const router = useRouter();
  const [f, setF] = useState(null); const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false);
  const key = c ? c.id || 'new' : null;
  if (c && f?.__k !== key) setF({ __k: key, name: c.name || '', outbound_url: c.outbound_url || '', events: c.events || ['call.processed'], is_active: c.is_active ?? true });
  if (!c || !f) return null;
  const close = () => { setF(null); setErrs({}); onClose(); };
  const save = async () => {
    setBusy(true); const { __k, ...d } = f; const r = await saveConnection({ ...(c.id ? { id: c.id } : {}), ...d }); setBusy(false);
    if (!r.ok) { setErrs(r.fields || {}); toast.error(r.message); return; }
    toast.success(r.message); if (r.data?.secret) onCreated(r.data); close(); router.refresh();
  };
  return (
    <Modal open onClose={close} title={c.id ? 'Edit connection' : 'New webhook connection'} footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{c.id ? 'Save' : 'Create'}</Button></>}>
      <div className="space-y-4">
        <Field label="Name" error={errs.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Sales CRM via Zapier" error={errs.name} /></Field>
        <Field label="Outbound URL" hint="Optional — leave empty for an inbound-only connection" error={errs.outbound_url}><Input value={f.outbound_url} onChange={(e) => setF({ ...f, outbound_url: e.target.value })} placeholder="https://" error={errs.outbound_url} /></Field>
        <fieldset><legend className="mb-2 text-[13px] font-medium text-ink-2">Send these events</legend>
          <div className="space-y-2">{EVENTS.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-[14px]"><input type="checkbox" className="check" checked={f.events.includes(k)} onChange={(e) => setF({ ...f, events: e.target.checked ? [...f.events, k] : f.events.filter((x) => x !== k) })} />{l} <code className="kbd">{k}</code></label>)}</div>
        </fieldset>
        <div className="flex items-center justify-between rounded-xl border border-line p-3 text-[14px]"><span>Active</span><Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Active" /></div>
        {!c.id && <Callout tone="info">A signing secret and an inbound token are generated when you create the connection.</Callout>}
      </div>
    </Modal>
  );
}
