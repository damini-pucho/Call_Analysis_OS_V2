'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guard, zId, zText, zReq, zEmail } from '@/lib/action';
import { hashPassword, tempPassword, revokeSessions } from '@/lib/auth';
import { withPlatform, type Db } from '@/lib/db';
import { sendCredentials } from '@/lib/notify';
import type { SessionUser } from '@/lib/auth';
// @ts-ignore
import { ALL_PERMISSIONS } from '@/lib/catalog.mjs';

/** No privilege escalation: you may only hand out a role whose permissions you hold yourself. */
async function assignable(db: Db, user: SessionUser, roleId: string) {
  const r = await db.one<{ permissions: string[]; name: string; scope: string }>('SELECT permissions, name, scope FROM roles WHERE id = $1 AND org_id = $2', [roleId, user.orgId]);
  if (!r) return { ok: false as const, message: 'Choose a role.' };
  const extra = r.permissions.filter((p) => !user.permissions.includes(p));
  if (extra.length || (r.scope === 'all' && user.scope !== 'all')) return { ok: false as const, message: `You cannot assign "${r.name}" — it has access you do not have.` };
  return { ok: true as const, role: r };
}
async function activeAdmins(db: Db, orgId: string, exceptUser?: string) {
  const r = await db.one<{ n: number }>("SELECT count(*)::int n FROM users u JOIN roles r ON r.id = u.role_id WHERE u.org_id = $1 AND u.is_active AND 'permissions.assign' = ANY(r.permissions) AND ($2::uuid IS NULL OR u.id <> $2)", [orgId, exceptUser ?? null]);
  return r?.n ?? 0;
}
const opt = (max = 200) => zText(max).optional().transform((v) => (v ? v : null));
const optId = zId.optional().or(z.literal('')).transform((v) => (v ? v : null));

const NewUser = z.object({
  name: zReq('Full name', 120), email: zEmail, role_id: zId, reports_to: optId, group_id: optId,
  agent_codes: z.array(z.string().trim().regex(/^[A-Za-z0-9_\-]{1,32}$/, 'Codes use letters and numbers')).max(10),
}).strict();
/** V1 AdminPanel "New user": the person, an optional agent code, and the credentials email (temporary password, changed at first sign-in). */
export async function createUser(input: unknown) {
  return guard('users.create', NewUser, input, async ({ db, user, data }) => {
    const ok = await assignable(db, user, data.role_id); if (!ok.ok) return { ok: false, message: ok.message, fields: { role_id: ok.message } };
    const taken = await withPlatform((p) => p.one('SELECT 1 FROM users WHERE lower(email) = $1', [data.email]));
    if (taken) return { ok: false, message: 'An account with this email already exists.', fields: { email: 'Already registered' } };
    const pw = tempPassword();
    const u = await db.one<{ id: string }>('INSERT INTO users (org_id, email, name, password_hash, role_id, reports_to, group_id, must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id',
      [user.orgId, data.email, data.name, await hashPassword(pw), data.role_id, data.reports_to, data.group_id]);
    // auto agent code when an executive gets none (V1: next 1xxx)
    let codes = data.agent_codes;
    if (!codes.length && ok.role.scope === 'own') {
      const m = await db.one<{ n: number }>("SELECT COALESCE(max(agent_code::int), 1000)::int + 1 AS n FROM agents WHERE org_id = $1 AND agent_code ~ '^1[0-9]{3}$'", [user.orgId]);
      codes = [String(m?.n ?? 1001)];
    }
    for (const code of codes) {
      await db.q(`INSERT INTO agents (org_id, agent_code, agent_name, email, user_id, group_id, supervisor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
                  ON CONFLICT (org_id, agent_code) DO UPDATE SET user_id = EXCLUDED.user_id, agent_name = EXCLUDED.agent_name, email = EXCLUDED.email,
                    group_id = COALESCE(EXCLUDED.group_id, agents.group_id), supervisor_id = COALESCE(EXCLUDED.supervisor_id, agents.supervisor_id), updated_at = now()`,
        [user.orgId, code, data.name, data.email, u!.id, data.group_id, data.reports_to]);
    }
    const mgr = data.reports_to ? await db.one<{ name: string }>('SELECT name FROM users WHERE id = $1 AND org_id = $2', [data.reports_to, user.orgId]) : null;
    const r = await sendCredentials(db, user.orgId, { id: u!.id, name: data.name, email: data.email, role: ok.role.name, agentCode: codes[0] || null, reportsTo: mgr?.name, orgName: user.orgName, password: pw });
    revalidatePath('/team');
    // the temporary password is shown once to the admin only when no email could carry it
    return r.status === 'sent'
      ? { ok: true, message: `User created. Sign-in details were emailed to ${data.email}.` }
      : { ok: true, message: 'User created. The email flow is not connected, so share this temporary password securely.', data: { tempPassword: pw } };
  }, 'user.create');
}

const EditUser = z.object({ id: zId, name: zReq('Full name', 120), role_id: zId, reports_to: optId, group_id: optId }).strict();
export async function updateUser(input: unknown) {
  return guard('users.edit', EditUser, input, async ({ db, user, data }) => {
    const ok = await assignable(db, user, data.role_id); if (!ok.ok) return { ok: false, message: ok.message, fields: { role_id: ok.message } };
    const cur = await db.one<{ role_id: string }>('SELECT role_id FROM users WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    if (!cur) return { ok: false, message: 'User not found.' };
    if (data.reports_to === data.id) return { ok: false, message: 'A person cannot report to themselves.', fields: { reports_to: 'Choose someone else' } };
    if (cur.role_id !== data.role_id && data.id === user.id) return { ok: false, message: 'You cannot change your own role.' };
    if (cur.role_id !== data.role_id && (await activeAdmins(db, user.orgId, data.id)) === 0) {
      const newRole = await db.one<{ permissions: string[] }>('SELECT permissions FROM roles WHERE id = $1', [data.role_id]);
      if (!newRole?.permissions.includes('permissions.assign')) return { ok: false, message: 'This is the last administrator. Make someone else an admin first.' };
    }
    await db.q('UPDATE users SET name=$3, role_id=$4, reports_to=$5, group_id=$6, updated_at=now() WHERE id=$1 AND org_id=$2', [data.id, user.orgId, data.name, data.role_id, data.reports_to, data.group_id]);
    await db.q('UPDATE agents SET supervisor_id = $3, group_id = COALESCE($4, group_id), agent_name = $5 WHERE org_id = $1 AND user_id = $2', [user.orgId, data.id, data.reports_to, data.group_id, data.name]);
    if (cur.role_id !== data.role_id) await revokeSessions(user.orgId, data.id);
    revalidatePath('/team');
    return { ok: true, message: 'User updated.' };
  }, 'user.update');
}

export async function setUserActive(input: unknown) {
  return guard('users.delete', z.object({ id: zId, active: z.boolean() }).strict(), input, async ({ db, user, data }) => {
    if (data.id === user.id) return { ok: false, message: 'You cannot deactivate yourself.' };
    if (!data.active && (await activeAdmins(db, user.orgId, data.id)) === 0) return { ok: false, message: 'This is the last administrator.' };
    const r = await db.one('UPDATE users SET is_active = $3, updated_at = now() WHERE id = $1 AND org_id = $2 RETURNING id', [data.id, user.orgId, data.active]);
    if (!r) return { ok: false, message: 'User not found.' };
    if (!data.active) await revokeSessions(user.orgId, data.id);
    revalidatePath('/team');
    return { ok: true, message: data.active ? 'User reactivated.' : 'User deactivated and signed out everywhere.' };
  }, 'user.active');
}

export async function resetUserPassword(input: unknown) {
  return guard('users.edit', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    const target = await db.one<any>('SELECT u.id, u.name, u.email, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.org_id = $2', [data.id, user.orgId]);
    if (!target) return { ok: false, message: 'User not found.' };
    const pw = tempPassword();
    await db.q('UPDATE users SET password_hash = $2, must_change_password = true, updated_at = now() WHERE id = $1', [data.id, await hashPassword(pw)]);
    await revokeSessions(user.orgId, data.id);
    const r = await sendCredentials(db, user.orgId, { id: target.id, name: target.name, email: target.email, role: target.role, orgName: user.orgName, password: pw });
    return r.status === 'sent' ? { ok: true, message: `A new temporary password was emailed to ${target.email}.` }
      : { ok: true, message: 'Password reset. The email flow is not connected — share this temporary password securely.', data: { tempPassword: pw } };
  }, 'user.reset_password');
}

// ── agents ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const Agent = z.object({ id: zId.optional(), agent_code: z.string().trim().regex(/^[A-Za-z0-9_\-]{1,32}$/, 'Letters and numbers only'), agent_name: zReq('Name', 120),
  email: opt(160), user_id: optId, group_id: optId, supervisor_id: optId, is_active: z.boolean() }).strict();
export async function saveAgent(input: unknown) {
  return guard('agents.edit', Agent, input, async ({ db, user, data }) => {
    if (data.id) {
      const old = await db.one<{ agent_code: string }>('SELECT agent_code FROM agents WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
      if (!old) return { ok: false, message: 'Agent not found.' };
      await db.q('UPDATE agents SET agent_code=$3, agent_name=$4, email=$5, user_id=$6, group_id=$7, supervisor_id=$8, is_active=$9, updated_at=now() WHERE id=$1 AND org_id=$2',
        [data.id, user.orgId, data.agent_code, data.agent_name, data.email, data.user_id, data.group_id, data.supervisor_id, data.is_active]);
      if (old.agent_code !== data.agent_code) await db.q('UPDATE calls SET agent_code = $3 WHERE org_id = $1 AND agent_code = $2', [user.orgId, old.agent_code, data.agent_code]);
      await db.q('UPDATE calls SET agent_name = $3 WHERE org_id = $1 AND agent_code = $2', [user.orgId, data.agent_code, data.agent_name]);
    } else {
      await db.q('INSERT INTO agents (org_id, agent_code, agent_name, email, user_id, group_id, supervisor_id, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [user.orgId, data.agent_code, data.agent_name, data.email, data.user_id, data.group_id, data.supervisor_id, data.is_active]);
    }
    revalidatePath('/team'); revalidatePath('/agents');
    return { ok: true, message: 'Agent saved.' };
  }, 'agent.save');
}

// ── groups (V1 kept them in browser memory only) ────────────────────────────────────────────────────────────────────
const Group = z.object({ id: zId.optional(), name: zReq('Group name', 80), description: opt(300), lead_ids: z.array(zId).max(20) }).strict();
export async function saveGroup(input: unknown) {
  return guard(['groups.create', 'groups.edit'], Group, input, async ({ db, user, data }) => {
    if (data.id) {
      if (!user.permissions.includes('groups.edit')) return { ok: false, message: 'Your role cannot edit groups.' };
      await db.q('UPDATE groups SET name=$3, description=$4, lead_ids=$5 WHERE id=$1 AND org_id=$2', [data.id, user.orgId, data.name, data.description, data.lead_ids]);
    } else {
      if (!user.permissions.includes('groups.create')) return { ok: false, message: 'Your role cannot create groups.' };
      await db.q('INSERT INTO groups (org_id, name, description, lead_ids) VALUES ($1,$2,$3,$4)', [user.orgId, data.name, data.description, data.lead_ids]);
    }
    revalidatePath('/team');
    return { ok: true, message: 'Group saved.' };
  }, 'group.save');
}
export async function deleteGroup(input: unknown) {
  return guard('groups.delete', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    await db.q('DELETE FROM groups WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    revalidatePath('/team');
    return { ok: true, message: 'Group deleted. Its agents are now ungrouped.' };
  }, 'group.delete');
}

// ── roles & permissions (V1 stored the matrix in one browser's localStorage) ────────────────────────────────────────
const Role = z.object({ id: zId.optional(), name: zReq('Role name', 60), description: opt(300), scope: z.enum(['all', 'team', 'own']),
  permissions: z.array(z.string().refine((p) => ALL_PERMISSIONS.includes(p), 'Unknown permission')).max(ALL_PERMISSIONS.length) }).strict();
export async function saveRole(input: unknown) {
  return guard(['roles.create', 'roles.edit', 'permissions.assign'], Role, input, async ({ db, user, data }) => {
    const extra = data.permissions.filter((p) => !user.permissions.includes(p));
    if (extra.length) return { ok: false, message: 'You cannot grant permissions you do not have.' };
    if (data.id) {
      const cur = await db.one<{ key: string; is_system: boolean }>('SELECT key, is_system FROM roles WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
      if (!cur) return { ok: false, message: 'Role not found.' };
      if (cur.key === 'admin' && !data.permissions.includes('permissions.assign')) return { ok: false, message: 'The Admin role must keep "Assign permissions".' };
      if (data.id === user.roleId && !data.permissions.includes('permissions.assign') && user.permissions.includes('permissions.assign')) return { ok: false, message: 'You cannot remove your own "Assign permissions".' };
      await db.q('UPDATE roles SET name=$3, description=$4, scope=$5, permissions=$6 WHERE id=$1 AND org_id=$2', [data.id, user.orgId, data.name, data.description, cur.key === 'admin' ? 'all' : data.scope, data.permissions]);
    } else {
      if (!user.permissions.includes('roles.create')) return { ok: false, message: 'Your role cannot create roles.' };
      const key = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'role';
      await db.q('INSERT INTO roles (org_id, key, name, description, scope, permissions) VALUES ($1,$2,$3,$4,$5,$6)', [user.orgId, /^[a-z]/.test(key) ? key : `r_${key}`, data.name, data.description, data.scope, data.permissions]);
    }
    revalidatePath('/team');
    return { ok: true, message: 'Role saved. It applies at each person’s next request.' };
  }, 'role.save');
}
export async function deleteRole(input: unknown) {
  return guard('roles.delete', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    const r = await db.one<{ is_system: boolean; users: number }>('SELECT is_system, (SELECT count(*)::int FROM users WHERE role_id = roles.id) AS users FROM roles WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    if (!r) return { ok: false, message: 'Role not found.' };
    if (r.is_system) return { ok: false, message: 'Built-in roles cannot be deleted. Edit their permissions instead.' };
    if (r.users > 0) return { ok: false, message: `${r.users} user(s) still have this role. Move them first.` };
    await db.q('DELETE FROM roles WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    revalidatePath('/team');
    return { ok: true, message: 'Role deleted.' };
  }, 'role.delete');
}
