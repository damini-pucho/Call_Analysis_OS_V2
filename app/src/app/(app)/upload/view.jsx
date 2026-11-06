'use client';
// Upload & analyse — V1 Upload: one recording or a ZIP; the app stores and queues each file, the flow transcribes and scores
// it, and this page polls the real status every 3 s (no timed fake progress steps).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UploadCloud, FileAudio, FileArchive, CheckCircle2, Loader2, AlertCircle, Hourglass, Mic, Brain, Gauge, Send } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Button, Card, Callout, Badge, Empty, cn } from '@/components/ui';
import { resendToFlow } from '@/app/actions/calls';
import * as M from '@/lib/metrics';

const ACCEPT = '.mp3,.wav,.ogg,.flac,.m4a,.webm,.aac,.zip';

export default function UploadView({ connected, pattern, waiting }) {
  const router = useRouter();
  const [file, setFile] = useState(null); const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); const [statuses, setStatuses] = useState({});
  const input = useRef(null);
  const isZip = file && /\.zip$/i.test(file.name);

  const pick = (f) => { if (!f) return; if (!/\.(mp3|wav|ogg|flac|m4a|webm|aac|zip)$/i.test(f.name)) { toast.error('Choose an audio file or a .zip of recordings.'); return; } if (f.size > 200 * 1024 * 1024) { toast.error('Files are limited to 200 MB.'); return; } setFile(f); setResult(null); setStatuses({}); };

  const upload = () => {
    if (!file || busy) return;
    setBusy(true); setProgress(0);
    const fd = new FormData(); fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setBusy(false);
      let r = null; try { r = JSON.parse(xhr.responseText); } catch {}
      if (!r?.ok) { toast.error(r?.message || `Upload failed (HTTP ${xhr.status}).`); return; }
      setResult(r);
      toast.success(`${r.calls.length} recording${r.calls.length === 1 ? '' : 's'} stored${r.connected ? ' and sent for analysis' : ''}.`);
      router.refresh();
    };
    xhr.onerror = () => { setBusy(false); toast.error('The upload was interrupted. Check your connection and try again.'); };
    xhr.send(fd);
  };

  // poll real status while anything is processing (stops after 15 minutes)
  useEffect(() => {
    if (!result) return;
    const ids = result.calls.filter((c) => c.status === 'processing').map((c) => c.id);
    if (!ids.length) return;
    const started = Date.now();
    const t = setInterval(async () => {
      const res = await fetch(`/api/calls/status?ids=${ids.join(',')}`).then((x) => x.json()).catch(() => null);
      if (!res?.ok) return;
      const map = Object.fromEntries(res.calls.map((c) => [c.id, c]));
      setStatuses(map);
      if (res.calls.every((c) => c.status !== 'processing') || Date.now() - started > 15 * 60 * 1000) { clearInterval(t); router.refresh(); }
    }, 3000);
    return () => clearInterval(t);
  }, [result, router]);

  const rows = result?.calls.map((c) => ({ ...c, ...(statuses[c.id] || {}) })) || [];
  const single = rows.length === 1 && rows[0].status === 'processed' ? rows[0] : null;

  return (
    <div className="space-y-5">
      <PageHeader title="Upload & analyse" sub="Upload one recording or a ZIP of recordings. Each one is transcribed and scored against your company's SOPs, KPIs and policies." />

      {!connected && (
        <Callout tone="warn" icon={AlertCircle} title="The call-processing flow is not connected">
          Recordings are stored and queued, but nothing is transcribed or scored until an admin sets WEBHOOK_CALL_PROCESSING (Settings → Flows). Queued calls can be sent for analysis afterwards.
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
            onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            className={cn('flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors', drag ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-2')}>
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-2"><UploadCloud size={22} /></span>
            <p className="font-medium text-ink">Drop a recording or ZIP here, or click to browse</p>
            <p className="mt-1 text-[13px] text-ink-3">MP3, WAV, OGG, FLAC, M4A, WEBM, AAC or ZIP · up to 200 MB</p>
            <p className="mt-1 text-[12px] text-ink-3">Analysis takes about 2 minutes per call. A ZIP takes longer — its recordings are analysed one after another (about 2 minutes each).</p>
            <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          {file && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">{isZip ? <FileArchive size={18} /> : <FileAudio size={18} />}</span>
              <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink">{file.name}</div><div className="text-[13px] text-ink-3">{(file.size / 1024 / 1024).toFixed(1)} MB · {isZip ? 'bulk ZIP — every recording inside becomes a call · takes longer, about 2 minutes per recording' : 'single recording — about 2 minutes to analyse'}</div></div>
              <Button variant="primary" onClick={upload} loading={busy}>{busy ? `Uploading ${progress}%` : 'Upload & analyse'}</Button>
            </div>
          )}
          {busy && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${progress}%` }} /></div>}
        </Card>

        <Card title="How it works">
          <ol className="space-y-4">
            {[[Mic, 'Transcribe', 'Sarvam speech-to-text, then a transcript repair pass in the original language and script.'], [Brain, 'Analyse', 'The AI reads the full call against your SOPs, KPIs, compliance rules and intents.'], [Gauge, 'Score', 'Quality, SOP, sentiment, risk and coaching land on the call, the agent and the customer.']].map(([Icon, t, d], k) => (
              <li key={t} className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2"><Icon size={16} /></span><div><div className="text-[14px] font-medium text-ink">{k + 1}. {t}</div><p className="text-[13px] text-ink-3">{d}</p></div></li>
            ))}
          </ol>
        </Card>
      </div>

      {single && (
        <Card title="Analysis complete" sub={single.filename} action={<Link href={`/calls/${single.id}`} className="btn btn-primary btn-sm">View full analysis</Link>}>
          <div className="grid gap-3 sm:grid-cols-4">
            {[['Agent', single.agent_name || single.agent_code], ['Campaign', single.campaign], ['Duration', M.fmtDuration(M.seconds(single))], ['Intent', single.call_intent], ['Quality', M.quality(single) == null ? '—' : `${M.quality(single).toFixed(1)}/5`], ['SOP', M.sopPoints(single) == null ? '—' : `${M.sopPoints(single)}/7`], ['Coaching', single.coaching_priority], ['Sentiment', single.sentiment]].map(([l, v]) => <div key={l} className="rounded-xl bg-surface-2 p-3"><div className="label">{l}</div><div className="mt-1 font-medium text-ink">{v || '—'}</div></div>)}
          </div>
          {single.call_summary && <p className="mt-4 text-[14px] text-ink-2">{single.call_summary}</p>}
        </Card>
      )}

      {rows.length > 0 && !single && (
        <Card title="This upload" sub={`${rows.length} recording${rows.length === 1 ? '' : 's'}`} pad={false}>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                {r.status === 'processed' ? <CheckCircle2 size={17} className="text-ok" /> : r.status === 'processing' ? <Loader2 size={17} className="animate-spin text-info" /> : r.status === 'failed' ? <AlertCircle size={17} className="text-bad" /> : <Hourglass size={17} className="text-warn" />}
                <div className="min-w-0 flex-1"><Link href={`/calls/${r.id}`} className="block truncate text-[14px] font-medium text-ink hover:underline">{r.filename}</Link>{(r.detail || r.status_reason) && <div className="truncate text-[12px] text-ink-3">{r.detail || r.status_reason}</div>}{!r.parsed && <div className="text-[12px] text-warn-text">Filename did not match the pattern — agent and customer are not filled in.</div>}</div>
                <Badge>{r.status === 'processed' ? 'Analysed' : r.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* the files of this upload are already listed above with live status — not again here */}
      <WaitingList waiting={waiting.filter((w) => !rows.some((r) => r.id === w.id))} connected={connected} />
    </div>
  );
}

function WaitingList({ waiting, connected }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  const queued = waiting.filter((w) => w.status === 'queued' || w.status === 'failed');
  if (!waiting.length) return null;
  return (
    <Card title="Waiting for analysis" sub="Recordings stored but not analysed yet" pad={false} action={queued.length > 0 && <Button size="sm" disabled={!connected} loading={busy} onClick={async () => { setBusy(true); const r = await resendToFlow({ ids: queued.map((q) => q.id) }); setBusy(false); r.ok ? toast.success(r.message) : toast.error(r.message); router.refresh(); }}><Send size={14} />Send {queued.length} for analysis</Button>}>
      <ul className="divide-y divide-line">
        {waiting.map((w) => (
          <li key={w.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1"><Link href={`/calls/${w.id}`} className="block truncate text-[14px] text-ink hover:underline">{w.filename}</Link><div className="truncate text-[12px] text-ink-3">{w.status_reason || (w.status === 'processing' ? 'Sent to the flow — waiting for its result.' : '')}</div></div>
            <Badge>{w.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
