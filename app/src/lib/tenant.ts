// src/lib/tenant.ts — what every organisation gets on day one, and the role scope that narrows a user to their agents.
import 'server-only';
import type { Db } from './db';
import type { SessionUser } from './auth';
// @ts-ignore — plain ESM shared with the node scripts
import { DEFAULT_ROLES, templateRules, defaultConfig, INDUSTRIES as IND } from './catalog.mjs';
const INDUSTRIES: Record<string, any> = IND;

export async function seedOrganization(db: Db, orgId: string, industry: string): Promise<Record<string, string>> {
  const ind = INDUSTRIES[industry] ? industry : 'generic';
  await db.q('UPDATE organizations SET config = $2 WHERE id = $1', [orgId, defaultConfig(ind)]);
  const roles: Record<string, string> = {};
  for (const r of DEFAULT_ROLES) {
    const row = await db.one<{ id: string }>('INSERT INTO roles (org_id, key, name, description, scope, is_system, permissions) VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id',
      [orgId, r.key, r.name, r.description, r.scope, r.permissions]);
    roles[r.key] = row!.id;
  }
  for (const r of templateRules(ind)) {
    await db.q(`INSERT INTO sop_rules (org_id, kind, code, title, description, na_rule, pass_criteria, severity, weight, sort_order, source)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'template')`, [orgId, r.kind, r.code, r.title, r.description, r.na_rule || null, r.pass_criteria || null, r.severity, r.weight, r.sort_order]);
  }
  for (const cp of INDUSTRIES[ind].campaigns) {
    await db.q('INSERT INTO campaigns (org_id, name, full_name, direction, core_topics) VALUES ($1,$2,$3,$4,$5)', [orgId, cp.name, cp.full_name, cp.direction, cp.core_topics]);
  }
  return roles;
}

/** The agent codes a user may see: null = the whole organisation. A team leader sees agents they supervise, agents in a group
 *  they lead and agents linked to users who report to them; an executive sees only their own linked agent code. */
export async function agentScope(db: Db, u: SessionUser): Promise<string[] | null> {
  if (u.scope === 'all') return null;
  if (u.scope === 'own') {
    const rows = await db.q<{ agent_code: string }>('SELECT agent_code FROM agents WHERE org_id = $1 AND user_id = $2', [u.orgId, u.id]);
    return rows.map((r) => r.agent_code);
  }
  const rows = await db.q<{ agent_code: string }>(
    `SELECT a.agent_code FROM agents a
      WHERE a.org_id = $1 AND (
        a.supervisor_id = $2 OR a.user_id = $2
        OR a.group_id IN (SELECT g.id FROM groups g WHERE g.org_id = $1 AND $2 = ANY(g.lead_ids))
        OR a.user_id IN (SELECT x.id FROM users x WHERE x.org_id = $1 AND x.reports_to = $2))`, [u.orgId, u.id]);
  return rows.map((r) => r.agent_code);
}

/** SQL fragment + params for "calls this user may see". */
export function scopeWhere(scope: string[] | null, param: number, column = 'agent_code') {
  return scope === null ? { sql: 'TRUE', params: [] as unknown[] } : { sql: `${column} = ANY($${param}::text[])`, params: [scope] as unknown[] };
}
