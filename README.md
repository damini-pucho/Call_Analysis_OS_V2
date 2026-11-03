# Call Analysis OS — V2 (multi-tenant SaaS)

A separate, new project. The V1 app in `../Call Analysis` is untouched; V2 has its own code, database, `.env` and Studio flows.

**Stack:** Next.js 16 (App Router, Server Actions) · PostgreSQL ≥ 14 with row-level security · argon2id sign-in with opaque
HttpOnly sessions · the Pucho Design System (Geist, ink primary, violet accent, warm greys, dark mode) · Recharts · Lucide ·
framer-motion · Pucho Studio flows for speech-to-text and AI.

## Modules

| Module | Pages | What it does |
|---|---|---|
| Overview | `/overview` | QA health (35/25/15/25, weights per org), stats, classification, IVR feedback, risk alerts, needs attention |
| Call Analysis | `/calls`, `/calls/:id`, `/upload`, `/analytics`, `/classification`, `/direction`, `/compliance` | Recordings, transcripts (PII-masked), summaries, 15 KPIs, 7 SOPs, tags, coaching notes, analytics |
| Agent Training | `/agents`, `/agents/:code`, `/training` | Agent scores, knowledge gaps, improvement areas, training assignments + modules, manager notifications; an assigned agent's dashboard stays locked until their team leader marks the training Done |
| Customer Profile | `/customers`, `/customers/:id`, `/sentiment` | Callers built from recordings / CRM, call history with recordings and analysis, sentiment |
| Company Profile | `/company` | Details, logo, industry configuration, SOP & policy uploads → extracted rules, scoring rules, campaigns |
| CRM Integration | `/crm` | Zoho CRM (OAuth; contact lookup, import, call notes + activities), signed outbound webhooks, inbound customer endpoint, CSV import, sync log |
| Dialer integration | `/sources` | Recordings arrive from Exotel / Ozonetel / Smartflo / Knowlarity / MyOperator / any webhook and are analysed without upload |
| Admin | `/team`, `/settings`, `/notifications`, `/profile`, `/platform` | Users, agents, org tree, groups, roles & permission matrix, flow wiring, platform console |

## SaaS model

- An organisation signs up at `/signup`; it gets its own admin, three default roles, its industry's rule template and campaigns.
- Every tenant table carries `org_id`. Isolation is enforced twice: the data layer filters by the session's organisation and
  agent scope, and **Postgres row-level security** (`db/rls.sql`, `FORCE`d) confines every transaction to `app.org_id`.
  The app connects as `cas_app` — not a superuser, no `BYPASSRLS`.
- Roles carry a data scope: **all** (whole org) · **team** (agents they supervise / groups they lead / people reporting to them)
  · **own** (their linked agent code). Permissions are per role, per organisation, editable in Team & roles.
- `PLATFORM_ADMIN_EMAILS` get `/platform`: every organisation with counts only, suspend / reactivate.

## Run locally

```bash
cd app
npm install
node scripts/db.mjs create && node scripts/db.mjs migrate && node scripts/db.mjs seed
npm run dev        # http://127.0.0.1:3200
```

`app/.env` is generated with fresh secrets (never committed). The seed creates two invented demo organisations
(Sahyog Wealth Advisors — BFSI, 63 calls; Nirmal Care Clinics — healthcare) plus a platform org, and writes their demo
sign-ins to `app/db/seed-logins.local.md` (git-ignored). The seed refuses any database not named `*_dev` / `*_demo`.

## Flows (Pucho Studio)

`workflows/build_flows.mjs` regenerates them from the V1 export:

| Flow | Env var | From V1 |
|---|---|---|
| `CALL_PROCESSING` | `WEBHOOK_CALL_PROCESSING` | Same steps, STT, prompts and formatter. Only plumbing changed: app unzips + stores recordings, agents come in the payload, the org's rules are added to the prompt, results POST to `/api/inbound/calls` |
| `SOP_EXTRACTION` | `WEBHOOK_SOP_EXTRACTION` | New: document → rules → `/api/inbound/sop-extraction` |
| `EMAIL` | `WEBHOOK_EMAIL` | V1 "user create and send email", unchanged (+ a Return step) |

Each has a `CHECKLIST.md`. Until a URL is set the app never simulates: recordings stay **queued**, documents **uploaded**,
emails are marked **not connected** and temporary passwords are shown to the admin once.
Studio must reach the app over the internet (`PUBLIC_APP_URL`) to download recordings and post results.

## Tests (evidence in `evidence/`)

```bash
cd app
node scripts/test-api.mjs       # 41 checks: isolation, scope, RBAC, upload, ZIP, write-back, CRM, RLS, argon2id
node scripts/test-actions.mjs   # 13 checks: the main writes through the real UI
node scripts/test-signup.mjs    # 7 checks: a new organisation end-to-end
node scripts/test-v21.mjs       # 37 checks: training lock + Done, Zoho (mock), dialer ingestion (see docs/v2.1-changes.md)
node scripts/test-ui.mjs        # 103 page checks: every page × persona at 1440px, 390px and dark
```

V2.1 changes: `docs/v2.1-changes.md`. See `docs/` for the intake decisions, the V1 feature inventory, security notes and known gaps.
