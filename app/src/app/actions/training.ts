'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guard, zId, zText, zReq } from '@/lib/action';
import { agentScope } from '@/lib/tenant';
import { notify } from '@/lib/notify';
import { dispatchCrm } from '@/lib/crm';

const opt = (max = 200) => zText(max).optional().transform((v) => (v ? v : null));

const Module = z.object({ id: zId.optional(), title: zReq('Title', 160), topic: opt(80), description: opt(1000), content: opt(10000),
  resource_url: opt(400).refine((v) => !v || /^https?:\/\//.test(v), 'Start with https://'), duration_min: z.coerce.number().int().min(1).max(600).nullable().optional() }).strict();
export async function saveModule(input: unknown) {
  return guard('training.manage', Module, input, async ({ db, user, data }) => {
    if (data.id) await db.q('UPDATE training_modules SET title=$3, topic=$4, description=$5, content=$6, resource_url=$7, duration_min=$8 WHERE id=$1 AND org_id=$2',
      [data.id, user.orgId, data.title, data.topic, data.description, data.content, data.resource_url, data.duration_min ?? null]);
    else await db.q('INSERT INTO training_modules (org_id, title, topic, description, content, resource_url, duration_min, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [user.orgId, data.title, data.topic, data.description, data.content, data.resource_url, data.duration_min ?? null, user.id]);
    revalidatePath('/training');
    return { ok: true, message: 'Training module saved.' };
  }, 'training.module_save');
}
export async function deleteModule(input: unknown) {
  return guard('training.manage', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    await db.q('DELETE FROM training_modules WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    revalidatePath('/training');
    return { ok: true, message: 'Module deleted.' };
  }, 'training.module_delete');
}

const Assign = z.object({ agent_codes: z.array(z.string().max(32)).min(1, 'Choose at least one agent').max(100), module_id: zId.optional().or(z.literal('')).transform((v) => v || null),
  title: zReq('Title', 160), gap: opt(300), source_call_id: zId.optional().or(z.literal('')).transform((v) => v || null),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a due date').refine((d) => d >= new Date().toISOString().slice(0, 10), 'Due date cannot be in the past') }).strict();
/** Assign training against a knowledge gap; the agent (when they have an account) is notified. */
export async function assignTraining(input: unknown) {
  return guard('training.assign', Assign, input, async ({ db, user, data }) => {
    const scope = await agentScope(db, user);
    const codes = data.agent_codes.filter((c) => scope === null || scope.includes(c));
    if (!codes.length) return { ok: false, message: 'Those agents are outside your team.' };
    const org = await db.one<any>('SELECT config FROM organizations WHERE id = $1', [user.orgId]);
    for (const code of codes) {
      const row = await db.one<{ id: string }>('INSERT INTO training_assignments (org_id, agent_code, module_id, title, gap, source_call_id, assigned_by, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [user.orgId, code, data.module_id, data.title, data.gap, data.source_call_id, user.id, data.due_date]);
      const agent = await db.one<{ user_id: string | null; agent_name: string }>('SELECT user_id, agent_name FROM agents WHERE org_id = $1 AND agent_code = $2', [user.orgId, code]);
      if (agent?.user_id && org?.config?.notify_on?.training_assigned !== false) {
        await notify(db, user.orgId, [agent.user_id], { kind: 'training', title: `New training: ${data.title}`, body: `${user.name} assigned you "${data.title}"${data.gap ? ` for: ${data.gap}` : ''}. Due ${data.due_date}.`, link: '/training' });
      }
      await dispatchCrm(db, user.orgId, 'training.assigned', { assignment_id: row!.id, agent_code: code, title: data.title, due_date: data.due_date });
    }
    revalidatePath('/training'); revalidatePath('/agents');
    return { ok: true, message: `Training assigned to ${codes.length} agent(s).` };
  }, 'training.assign');
}

const Status = z.object({ id: zId, status: z.enum(['Assigned', 'In Progress', 'Completed']), agent_notes: opt(1000) }).strict();
/** An agent updates their own assignment; a manager may update any in their scope. */
export async function updateAssignment(input: unknown) {
  return guard('training.view', Status, input, async ({ db, user, data }) => {
    const scope = await agentScope(db, user);
    const a = await db.one<{ agent_code: string; assigned_by: string; title: string }>('SELECT agent_code, assigned_by, title FROM training_assignments WHERE id = $1 AND org_id = $2 AND ($3::text[] IS NULL OR agent_code = ANY($3::text[]))', [data.id, user.orgId, scope]);
    if (!a) return { ok: false, message: 'Assignment not found.' };
    await db.q("UPDATE training_assignments SET status = $2, agent_notes = COALESCE($3, agent_notes), completed_at = CASE WHEN $2 = 'Completed' THEN now() ELSE NULL END, updated_at = now() WHERE id = $1",
      [data.id, data.status, data.agent_notes]);
    if (data.status === 'Completed' && a.assigned_by && a.assigned_by !== user.id) {
      await notify(db, user.orgId, [a.assigned_by], { kind: 'training', title: `Training completed: ${a.title}`, body: `${user.name} marked "${a.title}" as completed.`, link: '/training' });
    }
    revalidatePath('/training');
    return { ok: true, message: 'Progress saved.' };
  }, 'training.update');
}
export async function deleteAssignment(input: unknown) {
  return guard('training.assign', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    const scope = await agentScope(db, user);
    await db.q('DELETE FROM training_assignments WHERE id = $1 AND org_id = $2 AND ($3::text[] IS NULL OR agent_code = ANY($3::text[]))', [data.id, user.orgId, scope]);
    revalidatePath('/training');
    return { ok: true, message: 'Assignment removed.' };
  }, 'training.delete');
}
