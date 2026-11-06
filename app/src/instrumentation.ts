// src/instrumentation.ts — background jobs, each a call to one of the app's own routes (the work runs there, inside the app):
// · every ZOHO_RECORDINGS_SYNC_MINUTES (default 5; 0 = off): /api/crm/zoho/recordings-sync picks up new Zoho call recordings
// · every 10 minutes: /api/calls/expire-stale marks calls that never got a result from the flow as failed
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const g = globalThis as unknown as { __casJobs?: boolean };
  if (!process.env.INBOUND_TOKEN || !process.env.APP_ORIGIN || g.__casJobs) return;
  g.__casJobs = true;
  const call = (path: string) => fetch(`${process.env.APP_ORIGIN}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.INBOUND_TOKEN}` }, signal: AbortSignal.timeout(10 * 60 * 1000) })
    .catch((e) => console.warn(`${path}:`, e instanceof Error ? e.message : e));
  const minutes = Number(process.env.ZOHO_RECORDINGS_SYNC_MINUTES ?? 5);
  if (minutes) setInterval(() => call('/api/crm/zoho/recordings-sync'), minutes * 60 * 1000);
  setInterval(() => call('/api/calls/expire-stale'), 10 * 60 * 1000);
}
