'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guard } from '@/lib/action';
import { getZoho, importPeople } from '@/lib/zoho';
import { syncZohoRecordings } from '@/lib/sources';
import { decrypt } from '@/lib/flows';

const Settings = z.object({ push_notes: z.boolean(), log_calls: z.boolean(), sync_recordings: z.boolean(), is_active: z.boolean() }).strict();
export async function saveZohoSettings(input: unknown) {
  return guard('crm.manage', Settings, input, async ({ db, user, data }) => {
    const c = await getZoho(db, user.orgId); if (!c) return { ok: false, message: 'Zoho CRM is not connected.' };
    await db.q('UPDATE crm_connections SET settings = settings || $2::jsonb, is_active = $3 WHERE id = $1', [c.id, JSON.stringify({ push_notes: data.push_notes, log_calls: data.log_calls, sync_recordings: data.sync_recordings }), data.is_active]);
    revalidatePath('/crm');
    return { ok: true, message: 'Zoho settings saved.' };
  }, 'crm.zoho_settings');
}

export async function importFromZoho(input: unknown) {
  return guard('crm.manage', z.object({ modules: z.array(z.enum(['Contacts', 'Leads'])).min(1) }).strict(), input, async ({ db, user, data }) => {
    const c = await getZoho(db, user.orgId); if (!c) return { ok: false, message: 'Zoho CRM is not connected.' };
    try {
      const r = await importPeople(db, user.orgId, c, data.modules);
      await db.q("INSERT INTO crm_sync_log (org_id, connection_id, direction, event, status, records, detail) VALUES ($1,$2,'import','zoho.import','ok',$3,$4)",
        [user.orgId, c.id, r.imported, `${data.modules.join(' + ')}: ${r.skipped} without a phone number skipped`]);
      await db.q("UPDATE crm_connections SET last_sync_at = now(), last_status = 'ok' WHERE id = $1", [c.id]);
      revalidatePath('/crm'); revalidatePath('/customers');
      return { ok: true, message: `${r.imported} record(s) imported from Zoho${r.skipped ? `, ${r.skipped} without a phone number skipped` : ''}.` };
    } catch (e: any) {
      await db.q("INSERT INTO crm_sync_log (org_id, connection_id, direction, event, status, detail) VALUES ($1,$2,'import','zoho.import','failed',$3)", [user.orgId, c.id, String(e?.message).slice(0, 400)]);
      revalidatePath('/crm');
      return { ok: false, message: `Zoho import failed: ${e?.message}` };
    }
  }, 'crm.zoho_import');
}

export async function syncZohoCallRecordings(input: unknown) {
  return guard('crm.manage', z.object({}).strict(), input, async ({ db, user }) => {
    try {
      const r = await syncZohoRecordings(db, user.orgId);
      revalidatePath('/crm'); revalidatePath('/sources'); revalidatePath('/calls');
      return { ok: r.ok, message: r.message };
    } catch (e: any) {
      return { ok: false, message: `Zoho recordings sync failed: ${e?.message}` };
    }
  }, 'crm.zoho_recordings_sync');
}

export async function disconnectZoho(input: unknown) {
  return guard('crm.manage', z.object({}).strict(), input, async ({ db, user }) => {
    const c = await getZoho(db, user.orgId); if (!c) return { ok: true, message: 'Zoho CRM was not connected.' };
    // revoke the refresh token at Zoho (best effort), then forget it
    try {
      const token = decrypt(c.refresh_token_enc, `zoho:${c.id}:refresh`);
      await fetch(`${c.accounts_server}/oauth/v2/token/revoke?token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
    } catch { /* already invalid */ }
    await db.q("DELETE FROM crm_connections WHERE id = $1", [c.id]);
    await db.q("INSERT INTO crm_sync_log (org_id, direction, event, status) VALUES ($1,'outbound','zoho.disconnected','ok')", [user.orgId]);
    revalidatePath('/crm');
    return { ok: true, message: 'Zoho CRM disconnected and its token revoked.' };
  }, 'crm.zoho_disconnect');
}
