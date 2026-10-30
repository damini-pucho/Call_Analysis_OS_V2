// src/lib/dal.ts — every read the pages make. Each runs inside withOrg (RLS) AND filters by org_id and the user's agent scope,
// so a row outside the person's scope is simply not found (404), never shown.
import 'server-only';
import { cache } from 'react';
import { withOrg, isUuid } from './db';
import type { SessionUser } from './auth';
import { agentScope } from './tenant';

// JSON-safe rows for client components (Date → ISO string, numeric → number)
const plain = <T,>(rows: T): T => JSON.parse(JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));

const LIGHT_COLS = `c.id, c.call_id, c.filename, c.call_date, c.agent_code, COALESCE(a.agent_name, c.agent_name) AS agent_name, c.mobile_number, c.customer_id,
  c.campaign, c.direction, c.duration, c.duration_seconds, c.status, c.status_reason, c.sop_score::float AS sop_score, c.kpi_score::float AS kpi_score,
  c.quality_score::float AS quality_score, c.sentiment, c.agent_sentiment, c.call_summary, c.sop_results, c.kpi_results, c.intelligence, c.compliance_risk,
  c.churn_risk, c.call_classification, c.call_intent, c.call_topic, c.call_sub_topic, c.language, c.improvement_areas, c.coaching_priority, c.ztp_violation,
  c.tags, c.audio_file_id, c.created_at, c.processed_at`;

export const scopeFor = cache(async (u: SessionUser) => withOrg(u.orgId, (db) => agentScope(db, u)));

export const loadCalls = cache(async (u: SessionUser) => {
  const scope = await scopeFor(u);
  return plain(await withOrg(u.orgId, (db) => db.q(
    `SELECT ${LIGHT_COLS} FROM calls c LEFT JOIN agents a ON a.org_id = c.org_id AND a.agent_code = c.agent_code
      WHERE c.org_id = $1 AND ($2::text[] IS NULL OR c.agent_code = ANY($2::text[]))
      ORDER BY COALESCE(c.call_date, c.created_at::date) DESC, c.created_at DESC LIMIT 5000`, [u.orgId, scope])));
});

export async function getCall(u: SessionUser, id: string) {
  if (!isUuid(id)) return null;
  const scope = await scopeFor(u);
  return withOrg(u.orgId, async (db) => {
    const call = await db.one(`SELECT c.*, c.sop_score::float AS sop_score, c.kpi_score::float AS kpi_score, c.quality_score::float AS quality_score,
        COALESCE(a.agent_name, c.agent_name) AS agent_name, cu.name AS customer_name
      FROM calls c LEFT JOIN agents a ON a.org_id = c.org_id AND a.agent_code = c.agent_code LEFT JOIN customers cu ON cu.id = c.customer_id
      WHERE c.id = $1 AND c.org_id = $2 AND ($3::text[] IS NULL OR c.agent_code = ANY($3::text[]))`, [id, u.orgId, scope]);
    if (!call) return null;
    const notes = await db.q('SELECT id, note_text, note_type, created_by_name, is_resolved, created_at FROM coaching_notes WHERE org_id = $1 AND call_id = $2 ORDER BY created_at DESC', [u.orgId, id]);
    const runs = await db.q("SELECT flow, status, http_status, detail, created_at FROM flow_runs WHERE org_id = $1 AND ref_id = $2 ORDER BY created_at DESC LIMIT 10", [u.orgId, id]);
    return plain({ call, notes, runs });
  });
}

export const loadAgents = cache(async (u: SessionUser) => {
  const scope = await scopeFor(u);
  return plain(await withOrg(u.orgId, (db) => db.q(
    `SELECT a.id, a.agent_code, a.agent_name, a.email, a.is_active, a.user_id, a.group_id, g.name AS group_name, a.supervisor_id, s.name AS supervisor_name
       FROM agents a LEFT JOIN groups g ON g.id = a.group_id LEFT JOIN users s ON s.id = a.supervisor_id
      WHERE a.org_id = $1 AND ($2::text[] IS NULL OR a.agent_code = ANY($2::text[])) ORDER BY a.agent_name`, [u.orgId, scope])));
});

export async function loadCoachingNotes(u: SessionUser, agentCode?: string) {
  const scope = await scopeFor(u);
  return plain(await withOrg(u.orgId, (db) => db.q(
    `SELECT n.id, n.call_id, n.agent_code, n.note_text, n.note_type, n.created_by_name, n.is_resolved, n.created_at FROM coaching_notes n
      WHERE n.org_id = $1 AND ($2::text[] IS NULL OR n.agent_code = ANY($2::text[])) AND ($3::text IS NULL OR n.agent_code = $3) ORDER BY n.created_at DESC LIMIT 300`,
    [u.orgId, scope, agentCode ?? null])));
}

export const loadOrg = cache(async (u: SessionUser) => plain(await withOrg(u.orgId, (db) => db.one(
  'SELECT id, name, slug, industry, legal_name, website, email, phone, address, city, country, timezone, employees, description, logo_file_id, config, created_at FROM organizations WHERE id = $1', [u.orgId]))));

export const loadCampaigns = cache(async (u: SessionUser) => plain(await withOrg(u.orgId, (db) => db.q(
  'SELECT id, name, full_name, direction, greeting_standard, core_topics, created_at FROM campaigns WHERE org_id = $1 ORDER BY direction, name', [u.orgId]))));

export const loadRules = cache(async (u: SessionUser) => plain(await withOrg(u.orgId, (db) => db.q(
  `SELECT r.id, r.document_id, d.title AS document_title, r.kind, r.code, r.title, r.description, r.na_rule, r.pass_criteria, r.severity, r.weight, r.sort_order, r.source, r.is_active
     FROM sop_rules r LEFT JOIN company_documents d ON d.id = r.document_id WHERE r.org_id = $1 ORDER BY r.kind, r.sort_order, r.created_at`, [u.orgId]))));

export const loadDocuments = cache(async (u: SessionUser) => plain(await withOrg(u.orgId, (db) => db.q(
  `SELECT d.id, d.kind, d.title, d.status, d.status_reason, d.summary, d.effective_from, d.created_at, d.extracted_at, d.file_id, f.filename, f.size_bytes,
          u.name AS uploaded_by_name, (SELECT count(*)::int FROM sop_rules r WHERE r.document_id = d.id) AS rule_count
     FROM company_documents d LEFT JOIN files f ON f.id = d.file_id LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.org_id = $1 ORDER BY d.created_at DESC`, [u.orgId]))));

export const loadUsers = cache(async (u: SessionUser) => plain(await withOrg(u.orgId, (db) => db.q(
  `SELECT x.id, x.email, x.name, x.is_active, x.role_id, r.name AS role_name, r.key AS role_key, r.scope, x.reports_to, m.name AS reports_to_name,
          x.group_id, g.name AS group_name, x.last_login_at, x.created_at, x.must_change_password,
          (SELECT string_agg(a.agent_code, ', ') FROM agents a WHERE a.user_id = x.id) AS agent_codes
     FROM users x JOIN roles r ON r.id = x.role_id LEFT JOIN users m ON m.id = x.reports_to LEFT JOIN groups g ON g.id = x.group_id
    WHERE x.org_id = $1 ORDER BY x.created_at`, [u.orgId]))));

export const loadRoles = cache(async (u: SessionUser) => plain(await withOrg(u.orgId, (db) => db.q(
  'SELECT r.id, r.key, r.name, r.description, r.scope, r.is_system, r.permissions, (SELECT count(*)::int FROM users x WHERE x.role_id = r.id) AS users FROM roles r WHERE r.org_id = $1 ORDER BY r.is_system DESC, r.created_at', [u.orgId]))));

export const loadGroups = cache(async (u: SessionUser) => plain(await withOrg(u.orgId, (db) => db.q(
  `SELECT g.id, g.name, g.description, g.lead_ids, (SELECT count(*)::int FROM agents a WHERE a.group_id = g.id) AS members,
          (SELECT string_agg(x.name, ', ') FROM users x WHERE x.id = ANY(g.lead_ids)) AS lead_names
     FROM groups g WHERE g.org_id = $1 ORDER BY g.name`, [u.orgId]))));

export async function loadCustomers(u: SessionUser) {
  const scope = await scopeFor(u);
  return plain(await withOrg(u.orgId, (db) => db.q(
    `SELECT cu.id, cu.mobile_number, cu.name, cu.email, cu.city, cu.segment, cu.crm_source, cu.tags, cu.first_call_at, cu.last_call_at,
            count(c.id)::int AS calls, avg(CASE WHEN c.quality_score <= 5 THEN c.quality_score ELSE c.kpi_score / 20 END)::float AS avg_quality,
            sum(CASE WHEN lower(c.sentiment) LIKE 'neg%' THEN 1 ELSE 0 END)::int AS negative,
            sum(CASE WHEN lower(c.sentiment) LIKE 'pos%' THEN 1 ELSE 0 END)::int AS positive,
            max(c.churn_risk) FILTER (WHERE c.churn_risk ILIKE 'high%') AS churn_high
       FROM customers cu LEFT JOIN calls c ON c.customer_id = cu.id AND c.org_id = cu.org_id AND ($2::text[] IS NULL OR c.agent_code = ANY($2::text[]))
      WHERE cu.org_id = $1
      GROUP BY cu.id HAVING ($2::text[] IS NULL OR count(c.id) > 0) ORDER BY max(c.created_at) DESC NULLS LAST, cu.created_at DESC LIMIT 3000`, [u.orgId, scope])));
}

export async function getCustomer(u: SessionUser, id: string) {
  if (!isUuid(id)) return null;
  const scope = await scopeFor(u);
  return withOrg(u.orgId, async (db) => {
    const customer = await db.one('SELECT * FROM customers WHERE id = $1 AND org_id = $2', [id, u.orgId]);
    if (!customer) return null;
    const calls = await db.q(`SELECT ${LIGHT_COLS} FROM calls c LEFT JOIN agents a ON a.org_id = c.org_id AND a.agent_code = c.agent_code
      WHERE c.org_id = $1 AND c.customer_id = $2 AND ($3::text[] IS NULL OR c.agent_code = ANY($3::text[])) ORDER BY c.created_at DESC`, [u.orgId, id, scope]);
    if (scope !== null && calls.length === 0) return null;   // a customer you have no calls with is outside your scope
    return plain({ customer, calls });
  });
}

export async function loadTraining(u: SessionUser) {
  const scope = await scopeFor(u);
  return withOrg(u.orgId, async (db) => plain({
    modules: await db.q('SELECT m.id, m.title, m.topic, m.description, m.content, m.resource_url, m.duration_min, m.created_at, (SELECT count(*)::int FROM training_assignments t WHERE t.module_id = m.id) AS assigned FROM training_modules m WHERE m.org_id = $1 ORDER BY m.created_at DESC', [u.orgId]),
    assignments: await db.q(`SELECT t.id, t.agent_code, a.agent_name, t.module_id, t.title, t.gap, t.source_call_id, t.due_date, t.status, t.agent_notes, t.completed_at, t.created_at, x.name AS assigned_by_name
        FROM training_assignments t LEFT JOIN agents a ON a.org_id = t.org_id AND a.agent_code = t.agent_code LEFT JOIN users x ON x.id = t.assigned_by
       WHERE t.org_id = $1 AND ($2::text[] IS NULL OR t.agent_code = ANY($2::text[])) ORDER BY t.status = 'Completed', t.due_date NULLS LAST, t.created_at DESC`, [u.orgId, scope]),
  }));
}

export async function loadNotifications(u: SessionUser, limit = 100) {
  return plain(await withOrg(u.orgId, (db) => db.q('SELECT id, kind, title, body, link, email_status, read_at, created_at FROM notifications WHERE org_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3', [u.orgId, u.id, limit])));
}
export async function unreadCount(u: SessionUser) {
  const r = await withOrg(u.orgId, (db) => db.one<{ n: number }>('SELECT count(*)::int n FROM notifications WHERE org_id = $1 AND user_id = $2 AND read_at IS NULL', [u.orgId, u.id]));
  return r?.n ?? 0;
}

export async function loadCrm(u: SessionUser) {
  return withOrg(u.orgId, async (db) => plain({
    connections: await db.q('SELECT id, provider, name, outbound_url, events, is_active, last_sync_at, last_status, created_at, (inbound_token_hash IS NOT NULL) AS has_inbound, (secret_enc IS NOT NULL) AS has_secret FROM crm_connections WHERE org_id = $1 ORDER BY created_at', [u.orgId]),
    log: await db.q('SELECT l.id, l.direction, l.event, l.status, l.http_status, l.records, l.detail, l.created_at, c.name AS connection_name FROM crm_sync_log l LEFT JOIN crm_connections c ON c.id = l.connection_id WHERE l.org_id = $1 ORDER BY l.created_at DESC LIMIT 100', [u.orgId]),
    customers: (await db.one<{ n: number }>('SELECT count(*)::int n FROM customers WHERE org_id = $1', [u.orgId]))?.n ?? 0,
  }));
}

export async function loadFlowRuns(u: SessionUser) {
  return plain(await withOrg(u.orgId, (db) => db.q('SELECT flow, status, http_status, detail, created_at FROM flow_runs WHERE org_id = $1 ORDER BY created_at DESC LIMIT 50', [u.orgId])));
}
