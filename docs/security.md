# Security — V2 (standards §19 baseline)

| Control | How | Proof |
|---|---|---|
| Tenant isolation | DAL filters by session org + agent scope; Postgres RLS `FORCE`d on every tenant table; app role `cas_app` is not superuser and has no BYPASSRLS | `test-api`: cross-org pages/files/inbound 404, RLS checks |
| Passwords & sessions | argon2id (+ pepper), opaque `cas-session` / `__Host-cas-session` HttpOnly SameSite=Lax cookie, sha256 stored server-side, revoked on deactivate / password / role change, rate-limited sign-in & sign-up | `test-api` argon2id check; `test-signup` |
| Authorization | Every page `requireUser(permission)`, every Server Action `guard()` (permission → Zod `.strict` → withOrg → audit), no privilege escalation when assigning roles, last admin protected | `test-api` RBAC, `test-actions` escalation & live permission change |
| Input | Parameterised SQL only, Zod on every action and inbound body, body size caps (1–2 MB inbound, 200 MB upload), type/extension checks | `test-api` malformed JSON / bad payloads |
| Secrets | Server env only (`AUTH_PEPPER`, `FILE_LINK_SECRET`, `FIELD_KEY`, `INBOUND_TOKEN`, webhook URLs); nothing behind `NEXT_PUBLIC_`; CRM secrets AES-256-GCM, inbound tokens sha256 | `test-actions` CRM check |
| Headers | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, no X-Powered-By; HSTS when `APP_ORIGIN` is https | `test-api` headers |
| Files | Recordings served only within org + scope, or via HMAC-signed expiring links for Studio | `test-api` file checks |
| PII | Transcript and mobile masking on screen (per-org switch); DB keeps originals | UI |

## Known-broken (dated 30 Oct 2026)
- **zod 3 advisory GHSA-mrhx-c7xc-m3w5** (high) — accepted by the Pucho kit until 31 Dec 2026; mitigated by body/array caps. Move to zod 4.
- **CSP allows `'unsafe-inline'` scripts** (theme boot script) — per-request nonce is the fix.
- **Studio webhooks accept unauthenticated calls** (platform gap) — keep webhook URLs in server env only.
- **Not run on a real deployment yet**: TLS to the DB, `__Host-` cookie on https, CP Portal build.
- **Flows not imported/run in Studio yet** — see each `workflows/*/CHECKLIST.md`.
- Field-level encryption of customer PII columns is not enabled (masking is display-only, as in V1).

## Rotate after V1 review
V1 shipped a Supabase **service-role key** in `src/pages/Upload.jsx` and in its Studio flow code. V2 does not use it, but it
should be rotated in the V1 Supabase project.
