# Intake & decisions — Call Analysis OS V2 (30 Oct 2026)

Source: the V1 app `../Call Analysis` (Vite + React + Supabase + Studio flow), feature inventory in `00-source-inventory.md`.
Skill: Pucho OS v5.1 (design system, security baseline, flow conventions).

## Owner's answers
| Question | Answer |
|---|---|
| Tenancy | **Multi-tenant SaaS** — one app, organisations self-register. Deliberate deviation from the skill's P2 (one deployment per client); the kernel is single-tenant, so V2 is built to the skill's full-stack standard as a bespoke app. |
| Stage | Pilot-ready |
| AI pipeline | Keep the same flows; company-profile SOP/policy uploads are extracted into the DB by one new flow and the UI works from them |
| Org SOPs | Calls are scored against the **organisation's own** SOPs/rules (the flow's prompt gains one section; V1 text remains the fallback) |
| CRM | No CRM yet → vendor-neutral webhook connector + CSV import; native connectors listed as not available |
| Look | Pucho Design System (skill default) |

## Not copied from V1 (on purpose)
- Login that fell through to admin; plaintext passwords; Supabase service-role key in the browser and in the flow; public RLS.
- Destructive browser-side dedupe → a unique index per org + filename (re-upload replaces).
- Hardcoded/fake values (static QA rings and meters, "NRI = mobile ends in 9", synthetic chart weeks, "first 12 calls of anyone").
- Unwired filters and links (call type, topic links, dashboard → list state, compliance tabs, per-type exports) — all wired in V2.

## Not in v1
Native CRM connectors (HubSpot, Zoho, Salesforce, LeadSquared) · live telephony ingestion · SaaS billing / plans ·
email one-time-code sign-in · server-side paging beyond 5,000 calls per page load.
