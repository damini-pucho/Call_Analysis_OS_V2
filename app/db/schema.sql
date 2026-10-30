-- Call Analysis OS V2 — multi-tenant schema (PostgreSQL ≥ 14). Idempotent: safe to run twice.
-- Every tenant-owned table carries org_id; db/rls.sql adds row-level security on top of the DAL's own scoping.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── organisations (tenants) ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  industry         text NOT NULL DEFAULT 'generic',
  legal_name       text,
  website          text,
  email            text,
  phone            text,
  address          text,
  city             text,
  country          text DEFAULT 'India',
  timezone         text NOT NULL DEFAULT 'Asia/Kolkata',
  employees        text,
  description      text,
  logo_file_id     uuid,
  -- industry configuration: filename pattern, outbound intents, language list, QA weights …
  config           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── roles & permissions (per organisation, editable) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key          text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name         text NOT NULL,
  description  text,
  scope        text NOT NULL DEFAULT 'own' CHECK (scope IN ('all','team','own')),
  is_system    boolean NOT NULL DEFAULT false,
  permissions  text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

-- ── users ───────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email                 text NOT NULL,
  name                  text NOT NULL,
  password_hash         text NOT NULL,
  role_id               uuid NOT NULL REFERENCES roles(id),
  reports_to            uuid REFERENCES users(id) ON DELETE SET NULL,
  group_id              uuid,
  phone                 text,
  avatar_file_id        uuid,
  is_active             boolean NOT NULL DEFAULT true,
  must_change_password  boolean NOT NULL DEFAULT false,
  failed_logins         int NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- one account per email across the platform keeps sign-in unambiguous
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_org_idx ON users (org_id);

CREATE TABLE IF NOT EXISTS sessions (
  id          text PRIMARY KEY,                -- sha256 of the opaque cookie value
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  ip          text,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- ── teams / groups ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  lead_ids     uuid[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

-- ── agents (tele-callers whose calls are analysed) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_code     text NOT NULL CHECK (length(agent_code) BETWEEN 1 AND 32),
  agent_name     text NOT NULL,
  email          text,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  group_id       uuid REFERENCES groups(id) ON DELETE SET NULL,
  supervisor_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, agent_code)
);

-- ── campaigns (call lines) ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (name ~ '^[A-Za-z0-9_\-]{1,40}$'),
  full_name   text,
  direction   text NOT NULL DEFAULT 'Inbound' CHECK (direction IN ('Inbound','Outbound')),
  greeting_standard text,
  core_topics text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_org_name_uq ON campaigns (org_id, upper(name));

-- ── stored files (recordings, ZIPs, SOP / policy documents, logos, avatars) ─────────────────────
CREATE TABLE IF NOT EXISTS files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('recording','zip','sop','policy','logo','avatar','import')),
  filename      text NOT NULL,
  mime          text NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes >= 0),
  sha256        text NOT NULL,
  storage_path  text NOT NULL,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_org_idx ON files (org_id, kind);

-- ── customers (callers) ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mobile_number  text NOT NULL,
  name           text,
  email          text,
  city           text,
  segment        text,
  external_id    text,
  crm_source     text,
  tags           text[] NOT NULL DEFAULT '{}',
  notes          text,
  first_call_at  timestamptz,
  last_call_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, mobile_number)
);

-- ── calls (recording + transcript + AI analysis) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id               text NOT NULL,                  -- lead id from the filename, or generated
  filename              text NOT NULL,
  call_date             date,
  agent_code            text,
  agent_name            text,
  mobile_number         text,
  customer_id           uuid REFERENCES customers(id) ON DELETE SET NULL,
  campaign              text,
  coaching_flag         text,
  direction             text CHECK (direction IS NULL OR direction IN ('Inbound','Outbound')),
  duration              text,
  duration_seconds      int CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  audio_file_id         uuid REFERENCES files(id) ON DELETE SET NULL,
  upload_batch          uuid,
  -- processing lifecycle: queued (stored, flow not connected) → processing (sent to the flow) → processed | skipped | failed
  status                text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','processed','skipped','failed')),
  status_reason         text,
  sent_to_flow_at       timestamptz,
  -- scores & sentiment (same meaning as V1)
  sop_score             numeric CHECK (sop_score IS NULL OR (sop_score >= 0 AND sop_score <= 100)),
  kpi_score             numeric CHECK (kpi_score IS NULL OR (kpi_score >= 0 AND kpi_score <= 100)),
  quality_score         numeric CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
  sentiment             text,
  agent_sentiment       text,
  call_summary          text,
  cleaned_transcript    text,
  sop_results           jsonb NOT NULL DEFAULT '[]'::jsonb,
  kpi_results           jsonb NOT NULL DEFAULT '[]'::jsonb,
  intelligence          jsonb NOT NULL DEFAULT '{}'::jsonb,
  compliance_risk       text,
  churn_risk            text,
  call_classification   text,
  call_intent           text,
  call_topic            text,
  call_sub_topic        text,
  language              text,
  improvement_areas     text,
  recommendations       text,
  coaching_note         text,
  coaching_summary_note text,
  coaching_priority     text,
  ztp_violation         text,
  call_validity_tier    int,
  bfsi_false_guarantee_flag   text,
  bfsi_risk_disclaimer_spoken text,
  bfsi_identity_verified      text,
  bfsi_product_category       text,
  bfsi_compliance_score       numeric,
  tags                  text[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  processed_at          timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- replaces V1's destructive browser dedupe job: one row per recording filename per organisation
CREATE UNIQUE INDEX IF NOT EXISTS calls_org_filename_uq ON calls (org_id, lower(filename));
CREATE INDEX IF NOT EXISTS calls_org_date_idx ON calls (org_id, call_date DESC);
CREATE INDEX IF NOT EXISTS calls_org_agent_idx ON calls (org_id, agent_code);
CREATE INDEX IF NOT EXISTS calls_org_customer_idx ON calls (org_id, customer_id);
CREATE INDEX IF NOT EXISTS calls_org_status_idx ON calls (org_id, status);

-- ── coaching notes ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coaching_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id       uuid REFERENCES calls(id) ON DELETE CASCADE,
  agent_code    text,
  note_text     text NOT NULL CHECK (length(note_text) BETWEEN 1 AND 4000),
  note_type     text NOT NULL DEFAULT 'Manager' CHECK (note_type IN ('Manager','Advice','Feedback','Critical','AI_Coaching')),
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_name text,
  is_resolved   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coaching_notes_call_idx ON coaching_notes (org_id, call_id);

-- ── company profile: SOP / policy documents and the rules extracted from them ───────────────────
CREATE TABLE IF NOT EXISTS company_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('sop','policy')),
  title         text NOT NULL,
  file_id       uuid REFERENCES files(id) ON DELETE SET NULL,
  -- uploaded (stored, flow not connected) → extracting → extracted | failed
  status        text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','extracting','extracted','failed')),
  status_reason text,
  summary       text,
  effective_from date,
  uploaded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  extracted_at  timestamptz
);

CREATE TABLE IF NOT EXISTS sop_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id   uuid REFERENCES company_documents(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('sop','kpi','policy','ztp','topic','compliance')),
  code          text,
  title         text NOT NULL,
  description   text,
  na_rule       text,          -- when the rule does not apply (V1: "NA if no hold")
  pass_criteria text,
  severity      text NOT NULL DEFAULT 'normal' CHECK (severity IN ('low','normal','high','critical')),
  weight        numeric NOT NULL DEFAULT 1 CHECK (weight >= 0 AND weight <= 100),
  sort_order    int NOT NULL DEFAULT 0,
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('template','extracted','manual')),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sop_rules_org_idx ON sop_rules (org_id, kind, sort_order);

-- ── agent training ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_modules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  topic         text,
  description   text,
  content       text,
  resource_url  text,
  duration_min  int CHECK (duration_min IS NULL OR (duration_min > 0 AND duration_min <= 600)),
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_code     text NOT NULL,
  module_id      uuid REFERENCES training_modules(id) ON DELETE SET NULL,
  title          text NOT NULL,
  gap            text,               -- the knowledge gap this addresses
  source_call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  assigned_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date       date,
  status         text NOT NULL DEFAULT 'Assigned' CHECK (status IN ('Assigned','In Progress','Completed')),
  agent_notes    text,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_assign_org_idx ON training_assignments (org_id, agent_code);

-- ── notifications (in-app, optionally emailed through the email flow) ───────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  title        text NOT NULL,
  body         text,
  link         text,
  email_status text NOT NULL DEFAULT 'not_sent' CHECK (email_status IN ('not_sent','sent','failed','not_connected')),
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (org_id, user_id, read_at);

-- ── CRM integration ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider         text NOT NULL DEFAULT 'webhook' CHECK (provider IN ('webhook')),
  name             text NOT NULL,
  outbound_url     text,
  secret_enc       text,            -- HMAC signing secret, encrypted with FIELD_KEY
  inbound_token_hash text,          -- sha256 of the token a CRM uses to push customers in
  events           text[] NOT NULL DEFAULT '{call.processed}',
  is_active        boolean NOT NULL DEFAULT true,
  last_sync_at     timestamptz,
  last_status      text,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_sync_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id  uuid REFERENCES crm_connections(id) ON DELETE CASCADE,
  direction      text NOT NULL CHECK (direction IN ('outbound','inbound','import')),
  event          text NOT NULL,
  status         text NOT NULL CHECK (status IN ('ok','failed')),
  http_status    int,
  records        int NOT NULL DEFAULT 0,
  detail         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_sync_log_org_idx ON crm_sync_log (org_id, created_at DESC);

-- ── flow runs (every call to a Studio flow, with its outcome) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS flow_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flow         text NOT NULL,
  ref_id       uuid,
  status       text NOT NULL CHECK (status IN ('sent','not_connected','failed','completed')),
  http_status  int,
  detail       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_runs_org_idx ON flow_runs (org_id, created_at DESC);

-- ── audit log ───────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  detail      jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_org_idx ON audit_log (org_id, created_at DESC);

-- ── rate limiting for sign-in / sign-up (per key, sliding window) ───────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key         text PRIMARY KEY,
  hits        int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
