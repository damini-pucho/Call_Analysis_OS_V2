# E2E test — Zoho CRM ↔ Call Analysis (2026-11-03)

Test data only: one invented Zoho contact, one synthetic recording (two Windows text-to-speech voices), demo org
*Sahyog Wealth Advisors* in the V2 dev database. Nothing is committed yet — waiting for your review.

## 1. Complete flow (as tested)

```
Dialer / Upload ──► V2 /upload  (stores .wav, creates call row, links customer by mobile)
                      │
                      ▼
      Studio webhook GTHrKkSY3nJKz1lCywbN5  (existing V1 "Call Processing Pipeline", unchanged)
      Search Rows → Speech to Text (Sarvam) → Ask LLM → Code → routers → Ask LLM (analysis) → Code → Create Row (V1 Supabase)
                      │  (V1 flow has no Return step, so the result was copied from the run's Create Row input)
                      ▼
      V2 /api/inbound/calls  (same write-back door the V2 flow uses)
                      │
          ┌───────────┴─────────────┐
          ▼                         ▼
   V2 DB: call processed      Zoho: Note on Contact + completed Call activity
```

| # | Step | Result |
|---|---|---|
| 1 | Inspected dialer + recording storage | Recordings are stored by V2 (`STORAGE_DIR/<org>/recording/<file id>.wav`, sha256 kept). The Dialer integration page (`/sources`) has no live dialer configured for the demo org |
| 2 | Created a dummy contact in Zoho (Zoho UI) | **E2E TEST Call Analysis Dummy**, mobile 9000011234, e2e.test@example.com — Contact `1476988000000559012` |
| 3 | Recording source check | Zoho cannot supply recordings: its Calls module has no recording field filled and no telephony integration. **Recordings must come from the dialer** (or manual upload) |
| 4 | Uploaded `20261103-TESTE2E01_9000011234_1011_SUPPORT-all.wav` (102 s, 4.3 MB) in V2 `/upload` | Stored, call row created, status *queued* (V2 flow URL not set → honestly marked `not_connected`) |
| 5 | Phone mapping | V2 found Contact 1476988000000559012 by mobile; customer linked (`zoho_id`, `zoho_module = Contacts`, name + email filled from Zoho) |
| 6 | Triggered the **same** Studio webhook `…/webhooks/GTHrKkSY3nJKz1lCywbN5` (no duplicate workflow) | 2 runs (3:25 and 3:31 PM), each ~40 s, all steps green — real Sarvam STT + LLM analysis |
| 7 | Applied the run's analysis to V2 via `/api/inbound/calls` | HTTP 200, call → `processed` |
| 8 | Zoho sync | Note + completed call activity written on the contact; shown back in V2's customer page |

## 2. CRM pages used

- **Zoho CRM:** Contacts → Create Contact; Contact detail → Notes, Closed Activities (Calls).
- **V2:** `/crm` (Zoho card: connect, settings, sync log), `/upload`, `/calls/:id`, `/customers/:id` (Zoho panel: record, Deals,
  Calls in Zoho, Notes, Open in Zoho), `/sources` (dialer integration).

## 3. Database updates (V2 dev DB)

| Table | Change |
|---|---|
| `files` | recording `bb5aa186…`, audio/wav, 4,479,460 bytes, sha256 `171a5e9b…` |
| `calls` | `bca86437…` — status **processed**, agent 1011 Dipti Shah, Inbound, 01:42, quality **5/5**, KPI **92**, SOP **6**, sentiment Positive, intent SIP ("SIP top-up 5000 → 10000"), BFSI compliance 100, priority Green, transcript 1,238 chars, 7 SOP + 15 KPI results |
| `flow_runs` | `not_connected` → `sent` (V1 webhook) → `completed` |
| `customers` | `5f80fa0f…` linked to Zoho Contact `1476988000000559012`, name + email filled |
| `crm_sync_log` | `zoho.call_note` ok — "Note + call activity added to Contact 1476988000000559012" |
| `notifications` | none — correct, the call was Green |

**V1 production Supabase:** the V1 flow's own *Create Row* step wrote **2 test rows** (one per run, `call_id` like
`call_1793700488337_…`, filename `…TESTE2E01…`). You approved this; please delete them.

## 4. Zoho sync

- **Note** "Call analysis — 2026-11-03 — SIP · 03/11/2026" with summary, scores and a link back to the call.
- **Call activity** "Inbound call — SIP", Inbound, 03/11/2026 15:19, 01:42 — appears under *Closed Activities*.

## 5. Issues found and fixed during the test

| Issue | Fix | Retest |
|---|---|---|
| After Zoho OAuth the app redirected to `localhost`, where the `127.0.0.1` session cookie isn't sent | Connect/callback redirect to the configured app address | Connected as damini@pucho.ai ✔ |
| Customer stayed "Unnamed caller" after the Zoho match | `linkCustomer()` fills name/email from the Zoho record (only when empty) | Name + email shown ✔ |
| "Calls in Zoho: None" although the call was logged | Zoho keeps completed calls in the `Calls_History` related list, not `Calls`; panel now reads both | "Inbound call — SIP" listed ✔ |

Files changed: `src/lib/zoho.ts`, `src/app/api/crm/zoho/connect/route.ts`, `src/app/api/crm/zoho/callback/route.ts`.
Test harness added: `scripts/e2e-v1-webhook.mjs`, `scripts/e2e-apply-v1-row.mjs`.

## 6. Test results

- E2E: upload → mapping → Studio webhook → analysis → V2 DB → Zoho note + call ✔
- `tsc --noEmit` clean · `test-api.mjs` **41/41** · `test-actions.mjs` **14/14** (Zoho note push paused during the run so test
  numbers could not touch real Zoho records, then restored).
- Not run: `test-v21.mjs` (its cleanup deletes the Zoho connection — would disconnect your real Zoho), `test-ui.mjs`
  (its 12 px checks already fail because of the UI restyle).

## 7. Screenshots (`evidence/e2e/`)

1. `01-zoho-dummy-contact-created.jpg`
2. `02-upload-queued-flow-not-connected.jpg`
3. `03-customer-mapped-to-zoho-contact.jpg`
4. `04-studio-v1-run-steps-succeeded.jpg`
5. `05-zoho-contact-note.jpg`
6. `06-zoho-closed-call-activity.jpg`
7. `07-v2-customer-analysis.jpg`
8. `08-v2-customer-zoho-panel-calls.jpg`

Also: the test recording, `v1-run-create-row-input.json` (signed audio link removed), `v2-inbound-response.json`.

## 8. Pending issues

1. **The V1 webhook can't return results to V2.** The V1 flow has no *Return* step and writes to V1 Supabase. For hands-off
   V2 processing, either import the V2 `CALL_PROCESSING` flow (same steps; posts to `/api/inbound/calls`) and set
   `WEBHOOK_CALL_PROCESSING`, or add a final HTTP step in the V1 flow posting to V2.
2. **No public URL.** Studio must reach V2 to download recordings and post results; `PUBLIC_APP_URL` is empty, and the
   links inside Zoho notes point to `127.0.0.1`. A tunnel or deployment is needed.
3. **2 test rows in V1 production Supabase** — delete them.
4. **Recordings need a dialer.** No dialer is connected yet; set one up on `/sources` (Exotel / Ozonetel / Smartflo / Knowlarity
   / MyOperator / generic webhook).
5. App scopes are read-only for contacts and leads, so the app can't create Zoho contacts (by design). The dummy contact was
   made in the Zoho UI. Delete it when done.
6. **Master password lines** in `src/lib/auth.ts` are still present (kept for demos); remove them before any real pilot.
7. A leftover webhook CRM connection named "test" is in the demo org (from earlier testing).
8. Zoho's WorkDrive migration popup was dismissed, not acted on.

---

# Automatic upload → Studio → V2 → Zoho (2026-11-03, second pass)

Goal: no manual triggering, no manual result submission, no new or duplicated workflow.

## Exact changes

**V2 code (3 files + .env.example)**

| File | Change |
|---|---|
| `src/lib/flows.ts` | `callFlow()` takes an optional file and then posts **multipart** (file + fields, objects as JSON text), the way V1 Upload posts to the same webhook. JSON stays the default. Timeout 120 s with a file. |
| `src/lib/ingest.ts` | `sendToFlow()` sends the stored recording itself as `recording` when `WEBHOOK_CALL_PROCESSING_BODY=multipart`, so Studio needs no download link. Fields: `call_row_id, filename, agent_code, agent_name, mobile_number, call_id, call_date, campaign, coaching_flag, direction, org_id, app_url, inbound_token` (+ agents, company_context). |
| `src/app/api/inbound/calls/route.ts` | Accepts `call_row_id` beside `data`, as it already did for `org_id`. |
| `.env.example` | Documents `WEBHOOK_CALL_PROCESSING_BODY`. |

**`.env` (not committed):** `WEBHOOK_CALL_PROCESSING=https://studio.pucho.ai/api/v1/webhooks/GTHrKkSY3nJKz1lCywbN5`
(async URL, not `/sync`), `WEBHOOK_CALL_PROCESSING_BODY=multipart`, `PUBLIC_APP_URL=<Cloudflare quick-tunnel URL>`.

**Existing Studio flow "Call Processing Pipeline(call-analysis)-v1" (edited and published, not duplicated):** one HTTP step,
"Send result to V2 (/api/inbound/calls)", added after each single-recording Create Row (`Create Row Copy` and `Create Row Copy Copy`):
POST `{{trigger.body.app_url}}/api/inbound/calls`, `Authorization: Bearer {{trigger.body.inbound_token}}`. The body is the same
fields Create Row writes, plus `org_id` and `call_row_id` from the trigger. **On Failure = Continue flow on all errors.** V1 uploads
send no `app_url`, so for them this step fails quietly and the V1 run is unchanged. All other steps (STT, LLM prompts, Create Row
in V1 Supabase) are untouched. The step definition is saved as `workflows/V1_FLOW_WRITE_BACK_STEP.json`.

## Test (recording `20261103-TESTE2E02_9000011234_1011_SUPPORT-all.wav`, uploaded on V2 `/upload`)

| Time (IST) | Event |
|---|---|
| 16:18:14 | Upload → V2 stored the file and posted multipart to the webhook → HTTP 200, call `processing` (`flow_runs: sent`) |
| 16:18 | Studio run `YIoZsqONZjTyKFtIpb8L2`, 11 steps, all green; step 31 "Send result to V2" took 1 s |
| 16:25:35 | `POST /api/inbound/calls` 200 (from Studio via the tunnel) → call `processed`; `flow_runs: completed` |
| 16:25:35 | Zoho: "Note + call activity added to Contact 1476988000000559012" |

Total ≈ 7 min 20 s: the flow's Delay step waits for Sarvam STT. Result: quality 5, KPI 92, SOP 6, Positive, SIP — "SIP amount
increase request", Green, BFSI compliance 100, 7 SOP + 15 KPI results, transcript 1,238 chars, agent Dipti Shah.

**Manual triggering required: No. Manual result submission required: No.**

Screenshots: `09-studio-flow-write-back-steps-published.jpg`, `10-v2-upload-auto-sent-processing.jpg`,
`11-studio-auto-run-send-result-to-v2.jpg`, `12-v2-customer-zoho-two-calls-synced.jpg`.

## Still to know

1. **Public URL.** Studio reaches V2 through a temporary Cloudflare quick tunnel. When it closes or its URL changes, results can't
   come back and calls stay *processing*. For lasting use, deploy V2 (or use a named tunnel) and set `PUBLIC_APP_URL`.
2. **Every V2 upload also writes a row to V1 Supabase**, because the flow's Create Row is unchanged. This run added a 3rd test row
   (filename `…TESTE2E02…`). Please delete the 3 test rows.
3. The demo master-password lines in `auth.ts` are disabled (commented, marked `TEMP-TUNNEL-TEST`) while the tunnel is open.
4. While the webhook is set, *any* V2 upload or "Send for analysis" goes to the production flow. The 3 old demo calls on the Upload
   page ("Send 3 for analysis") were deliberately not sent.
5. Regression suites were not re-run with the webhook set: `test-api.mjs` uploads recordings, which would now reach the production
   flow. Typecheck is clean.
