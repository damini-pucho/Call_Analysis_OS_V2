'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guard, zId } from '@/lib/action';
import { agentScope } from '@/lib/tenant';
import { sendToFlow } from '@/lib/ingest';
import type { Db } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';

/** The call, only if it is inside the user's scope (else null → "not found"). */
async function scopedCall(db: Db, user: SessionUser, id: string) {
  const scope = await agentScope(db, user);
  return db.one<{ id: string; agent_code: string | null; tags: string[] }>(
    'SELECT id, agent_code, tags FROM calls WHERE id = $1 AND org_id = $2 AND ($3::text[] IS NULL OR agent_code = ANY($3::text[]))', [id, user.orgId, scope]);
}

const Tag = z.object({ id: zId, tag: z.string().trim().min(1, 'Enter a tag').max(40) }).strict();
export async function addTag(input: unknown) {
  return guard('tags.create', Tag, input, async ({ db, user, data }) => {
    const c = await scopedCall(db, user, data.id); if (!c) return { ok: false, message: 'Call not found.' };
    if ((c.tags || []).some((t) => t.toLowerCase() === data.tag.toLowerCase())) return { ok: false, message: 'That tag is already on this call.' };
    await db.q('UPDATE calls SET tags = array_append(tags, $2), updated_at = now() WHERE id = $1', [data.id, data.tag]);
    revalidatePath(`/calls/${data.id}`);
    return { ok: true };
  }, 'call.tag_add');
}
export async function removeTag(input: unknown) {
  return guard('tags.create', Tag, input, async ({ db, user, data }) => {
    const c = await scopedCall(db, user, data.id); if (!c) return { ok: false, message: 'Call not found.' };
    await db.q('UPDATE calls SET tags = array_remove(tags, $2), updated_at = now() WHERE id = $1', [data.id, data.tag]);
    revalidatePath(`/calls/${data.id}`);
    return { ok: true };
  }, 'call.tag_remove');
}

const Note = z.object({ id: zId, text: z.string().trim().min(3, 'Write at least a few words').max(4000), type: z.enum(['Manager', 'Advice', 'Feedback', 'Critical']) }).strict();
export async function addCoachingNote(input: unknown) {
  return guard('coaching.create', Note, input, async ({ db, user, data }) => {
    const c = await scopedCall(db, user, data.id); if (!c) return { ok: false, message: 'Call not found.' };
    await db.q('INSERT INTO coaching_notes (org_id, call_id, agent_code, note_text, note_type, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user.orgId, data.id, c.agent_code, data.text, data.type, user.id, user.name]);
    revalidatePath(`/calls/${data.id}`);
    return { ok: true, message: 'Note added.' };
  }, 'coaching.note_add');
}

const Resolve = z.object({ id: zId, callId: zId, resolved: z.boolean() }).strict();
export async function setNoteResolved(input: unknown) {
  return guard('coaching.create', Resolve, input, async ({ db, user, data }) => {
    const c = await scopedCall(db, user, data.callId); if (!c) return { ok: false, message: 'Call not found.' };
    await db.q('UPDATE coaching_notes SET is_resolved = $3 WHERE id = $1 AND call_id = $2', [data.id, data.callId, data.resolved]);
    revalidatePath(`/calls/${data.callId}`);
    return { ok: true };
  }, 'coaching.note_resolve');
}

const Rename = z.object({ id: zId, name: z.string().trim().min(2, 'Enter a name').max(120), scope: z.enum(['call', 'agent']) }).strict();
/** V1 CallTable "Edit agent name": this call only, or every call of the agent code (and the agent record). */
export async function renameAgent(input: unknown) {
  return guard(['calls.edit', 'agents.edit'], Rename, input, async ({ db, user, data }) => {
    const c = await scopedCall(db, user, data.id); if (!c) return { ok: false, message: 'Call not found.' };
    if (data.scope === 'agent' && c.agent_code) {
      if (!user.permissions.includes('agents.edit')) return { ok: false, message: 'Renaming an agent everywhere needs the "Rename / edit agents" permission.' };
      await db.q('UPDATE agents SET agent_name = $3, updated_at = now() WHERE org_id = $1 AND agent_code = $2', [user.orgId, c.agent_code, data.name]);
      await db.q('UPDATE calls SET agent_name = $3, updated_at = now() WHERE org_id = $1 AND agent_code = $2', [user.orgId, c.agent_code, data.name]);
    } else {
      await db.q('UPDATE calls SET agent_name = $2, updated_at = now() WHERE id = $1', [data.id, data.name]);
    }
    revalidatePath('/calls');
    return { ok: true, message: 'Agent name updated.' };
  }, 'call.rename_agent');
}

const Retry = z.object({ ids: z.array(zId).min(1).max(200) }).strict();
/** Send queued / failed recordings to the call-processing flow again (e.g. after WEBHOOK_CALL_PROCESSING is set). */
export async function resendToFlow(input: unknown) {
  return guard('upload.analyze', Retry, input, async ({ db, user, data }) => {
    let sent = 0; let last = '';
    for (const id of data.ids) {
      const c = await scopedCall(db, user, id); if (!c) continue;
      const r = await sendToFlow(db, user.orgId, id);
      if (r.status === 'sent') sent++; else last = r.detail || '';
    }
    revalidatePath('/calls'); revalidatePath('/upload');
    return sent ? { ok: true, message: `${sent} recording(s) sent for analysis.` } : { ok: false, message: last || 'Nothing was sent.' };
  }, 'call.resend');
}
