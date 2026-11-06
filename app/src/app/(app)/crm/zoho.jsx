'use client';
// Zoho CRM card on the CRM integration page: connect (per data centre), status, write-back settings, import, disconnect.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Unplug, DownloadCloud, CheckCircle2, AlertCircle, AudioLines } from 'lucide-react';
import { toast } from 'sonner';
import { Card, Badge, Button, Select, Switch, Callout, Field } from '@/components/ui';
import { saveZohoSettings, importFromZoho, disconnectZoho, syncZohoCallRecordings } from '@/app/actions/zoho';

const STATUS = {
  connected: ['ok', 'Zoho CRM connected.'], denied: ['warn', 'Zoho access was not granted.'], invalid_state: ['bad', 'The Zoho sign-in could not be verified. Start again from this page.'],
  invalid_server: ['bad', 'Zoho answered from an unexpected server; nothing was saved.'], no_refresh_token: ['bad', 'Zoho did not return a long-lived token. Try connecting again.'],
  error: ['bad', 'Connecting to Zoho failed. Try again.'], not_configured: ['warn', 'Zoho is not configured on this deployment yet.'], forbidden: ['bad', 'Your role cannot manage CRM connections.'],
};

export default function ZohoCard({ zoho, manage }) {
  const router = useRouter(); const c = zoho.connection;
  const [dc, setDc] = useState('in'); const [busy, setBusy] = useState(null);
  const [s, setS] = useState({ push_notes: c?.settings?.push_notes !== false, log_calls: c?.settings?.log_calls !== false, sync_recordings: c?.settings?.sync_recordings !== false, is_active: c?.is_active !== false });
  useEffect(() => { const m = STATUS[zoho.status]; if (m) { (m[0] === 'ok' ? toast.success : toast.error)(m[1]); router.replace('/crm'); } }, [zoho.status, router]);
  const act = async (key, fn) => { setBusy(key); const r = await fn(); setBusy(null); r.ok ? toast.success(r.message) : toast.error(r.message); router.refresh(); };
  return (
    <Card title={<span className="flex items-center gap-2">Zoho CRM {c ? <Badge tone={c.is_active ? 'ok' : null}>{c.is_active ? 'Connected' : 'Paused'}</Badge> : <Badge dot={false}>Not connected</Badge>}</span>}
      sub="Look up each caller in Zoho, see their Deals, Calls and Notes on the customer profile, import Contacts and Leads, and write every analysed call back to Zoho.">
      {!zoho.configured ? (
        <Callout tone="warn" icon={AlertCircle} title="Zoho is not configured on this deployment">
          The platform operator creates a Server-based client in api-console.zoho.com with redirect URI <code className="kbd">{zoho.redirectUri}</code> (enable multi-DC), then sets ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET in the server environment.
        </Callout>
      ) : !c ? (
        manage ? (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Your Zoho data centre" className="w-64"><Select value={dc} onChange={(e) => setDc(e.target.value)} options={zoho.dcs} /></Field>
            <a href={`/api/crm/zoho/connect?dc=${dc}`} className="btn btn-primary"><Link2 size={15} />Connect Zoho CRM</a>
            <p className="w-full text-[12px] text-ink-3">You sign in to Zoho and approve read access to Contacts, Leads and Deals, and write access to Notes and Calls. Tokens are stored encrypted for this organisation only.</p>
          </div>
        ) : <p className="text-[13px] text-ink-3">An admin can connect your organisation's Zoho CRM here.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2 p-3"><div className="label">Zoho account</div><div className="mt-1 truncate text-[14px] font-medium text-ink">{c.external_account || '—'}</div><div className="text-[12px] text-ink-3">{(c.accounts_server || '').replace('https://accounts.', '')}</div></div>
            <div className="rounded-xl bg-surface-2 p-3"><div className="label">Customers linked</div><div className="mt-1 text-[18px] font-semibold tabular-nums text-ink">{c.linked}</div></div>
            <div className="rounded-xl bg-surface-2 p-3"><div className="label">Last sync</div><div className="mt-1 flex items-center gap-1.5 text-[14px] text-ink">{c.last_status === 'ok' ? <CheckCircle2 size={14} className="text-ok" /> : c.last_status ? <AlertCircle size={14} className="text-bad" /> : null}{c.last_sync_at ? new Date(c.last_sync_at).toLocaleString('en-GB') : 'never'}</div></div>
          </div>
          <div className="space-y-2 rounded-xl border border-line p-3">
            {[['push_notes', 'Add a Note with the analysis to the caller’s Contact / Lead after each call'], ['log_calls', 'Also log a Call activity (type, start time, duration, summary)'], ['sync_recordings', 'Analyse Zoho call recordings automatically (every few minutes, the same flow as uploads)'], ['is_active', 'Connection active']].map(([k, l]) => (
              <div key={k} className="flex items-center justify-between gap-3 text-[14px] text-ink-2"><span>{l}</span><Switch checked={s[k]} disabled={!manage} onChange={(v) => setS({ ...s, [k]: v })} label={l} /></div>
            ))}
            {manage && <div className="flex justify-end pt-1"><Button size="sm" variant="primary" loading={busy === 'save'} onClick={() => act('save', () => saveZohoSettings(s))}>Save settings</Button></div>}
          </div>
          {manage && (
            <div className="flex flex-wrap gap-2">
              <Button loading={busy === 'recordings'} onClick={() => act('recordings', () => syncZohoCallRecordings({}))}><AudioLines size={15} />Sync call recordings</Button>
              <Button loading={busy === 'contacts'} onClick={() => act('contacts', () => importFromZoho({ modules: ['Contacts'] }))}><DownloadCloud size={15} />Import Contacts</Button>
              <Button loading={busy === 'leads'} onClick={() => act('leads', () => importFromZoho({ modules: ['Leads'] }))}><DownloadCloud size={15} />Import Leads</Button>
              <Button variant="danger" className="ml-auto" loading={busy === 'off'} onClick={() => confirm('Disconnect Zoho CRM? The token is revoked; imported customers stay.') && act('off', () => disconnectZoho({}))}><Unplug size={15} />Disconnect</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
