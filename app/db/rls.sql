-- Row-level security: the second wall between organisations (the DAL's org_id filter is the first).
-- The app sets `app.org_id` per transaction (lib/db.ts withOrg). `app.platform = on` is set only by server code that
-- must work across tenants before an organisation is known: sign-in lookup, sign-up, verified inbound flow calls,
-- the platform console, migrations and the seed. FORCE makes the policies apply to the table owner too
-- (a superuser still bypasses RLS, which is why the app connects as the non-superuser role `cas_app`).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles','users','sessions','groups','agents','campaigns','files','customers','calls',
                           'coaching_notes','company_documents','sop_rules','training_modules','training_assignments',
                           'notifications','crm_connections','crm_sync_log','flow_runs','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (current_setting('app.platform', true) = 'on'
             OR org_id = nullif(current_setting('app.org_id', true), '')::uuid)
      WITH CHECK (current_setting('app.platform', true) = 'on'
             OR org_id = nullif(current_setting('app.org_id', true), '')::uuid)$p$, t);
  END LOOP;

  ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON organizations;
  CREATE POLICY tenant_isolation ON organizations
    USING (current_setting('app.platform', true) = 'on' OR id = nullif(current_setting('app.org_id', true), '')::uuid)
    WITH CHECK (current_setting('app.platform', true) = 'on' OR id = nullif(current_setting('app.org_id', true), '')::uuid);
END $$;
