'use client';
// Settings — the organisation's identifiers and the state of the Pucho Studio wiring (flows, inbound door, public URL),
// with the run history. Secrets live in the server environment; this page shows whether they are set, never their values.
import { Workflow, Globe, KeyRound, Building2, Copy, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card, Badge, Empty, Callout, MetaRow, Button } from '@/components/ui';

export default function SettingsView({ flows, runs, org, appUrl, publicUrlSet, inboundOpen }) {
  const copy = (v) => { navigator.clipboard.writeText(v); toast.success('Copied'); };
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" sub="Your workspace identifiers and the Pucho Studio flows that transcribe, analyse and email." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Workspace">
          <MetaRow icon={Building2} label="Organisation">{org.name}</MetaRow>
          <MetaRow icon={Globe} label="Workspace address">{org.slug}</MetaRow>
          <MetaRow icon={KeyRound} label="Organisation ID"><span className="flex items-center gap-2"><code className="truncate font-mono text-[12px]">{org.id}</code><button className="icon-btn h-7 w-7" onClick={() => copy(org.id)} aria-label="Copy organisation ID"><Copy size={13} /></button></span></MetaRow>
          <p className="mt-2 text-[12px] text-ink-3">The flows receive this ID with every recording and send it back with the result, so results always land in this workspace.</p>
        </Card>
        <Card title="Connection health">
          <ul className="space-y-2.5 text-[14px]">
            <li className="flex items-center justify-between gap-2"><span className="text-ink-2">Public app URL</span>{publicUrlSet ? <Badge tone="ok">{appUrl}</Badge> : <Badge tone="warn">Not set</Badge>}</li>
            <li className="flex items-center justify-between gap-2"><span className="text-ink-2">Inbound door (flow write-back)</span><Badge tone={inboundOpen ? 'ok' : 'bad'}>{inboundOpen ? 'Open' : 'Closed'}</Badge></li>
            {flows.map((f) => <li key={f.key} className="flex items-center justify-between gap-2"><span className="text-ink-2">{f.label}</span><Badge tone={f.connected ? 'ok' : 'warn'}>{f.connected ? 'Connected' : 'Not connected'}</Badge></li>)}
          </ul>
          {!publicUrlSet && <Callout className="mt-4" tone="warn" icon={AlertCircle}>Studio downloads recordings and posts results over the internet, so PUBLIC_APP_URL must be the app's public https address.</Callout>}
        </Card>
      </div>
      <Card title="Pucho Studio flows" sub="Set by the platform operator in the server environment (one set for every organisation)">
        <div className="grid gap-3 md:grid-cols-3">
          {flows.map((f) => (
            <div key={f.key} className="rounded-2xl border border-line p-4">
              <div className="flex items-center gap-2">{f.connected ? <CheckCircle2 size={17} className="text-ok" /> : <Workflow size={17} className="text-ink-3" />}<span className="font-medium text-ink">{f.label}</span></div>
              <p className="mt-2 text-[13px] text-ink-3">{f.connected ? 'Webhook configured.' : <>Set <code className="kbd">{f.env}</code> to the flow's webhook URL. Until then {f.key === 'email' ? 'emails are not sent and temporary passwords are shown to the admin once.' : 'records stay queued and are labelled “not connected” — nothing is simulated.'}</>}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] text-ink-3">Flow JSON for import is in <code className="kbd">workflows/</code> of the V2 repository, with a CHECKLIST per flow.</p>
      </Card>
      <Card title="Recent flow runs" pad={false}>
        {!runs.length ? <Empty icon={Workflow} title="No flow runs yet" /> : (
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>When</th><th>Flow</th><th>Result</th><th>HTTP</th><th>Detail</th></tr></thead>
            <tbody>{runs.map((r, i) => <tr key={i}><td className="whitespace-nowrap text-ink-2">{new Date(r.created_at).toLocaleString('en-GB')}</td><td>{r.flow.replace('_', ' ')}</td><td><Badge>{r.status.replace('_', ' ')}</Badge></td><td className="tabular-nums">{r.http_status || '—'}</td><td className="max-w-[360px] truncate text-ink-3">{r.detail || '—'}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
