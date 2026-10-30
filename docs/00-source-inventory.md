# Feature inventory: Call Analysis dashboard (read-only audit)

Root: `D:\Pucho claude project\oct2026\Pucho_Call_Analysis\Call Analysis`. I modified nothing. Paths below are relative to `src\` unless written in full.

**Main takeaway:** almost every number is computed in the browser from the full `calls` table. A lot of what looks like live data is actually hardcoded or placeholder (listed in section 0.12). Several links and filters are not wired up (section 0.13). Do not carry those over as real features.

---

## 0. Global architecture and cross-cutting rules

### 0.1 Routing (`App.jsx`, HashRouter)

| Route | Page | `permissionCode` |
|---|---|---|
| `/login` | Login | none (public) |
| `/` | redirects to `/dashboard` | — |
| `/dashboard` | Dashboard | `dashboard.view` |
| `/call-records` (`?id=<call_id>` opens the detail view) | CallRecords | `calls.view` |
| `/customer-analysis` | CustomerAnalysis | `customer_analysis.view` |
| `/call-classification` | CallClassification | `classification.view` |
| `/analytics` | Analytics | `analytics.view` |
| `/agents` | Agents | `agents.view` |
| `/agents/:id` (`:id` = agent_code) | AgentDetail | `agents.view` |
| `/compliance` | Compliance | `compliance.view` |
| `/inbound-outbound` | InboundOutbound | `inbound_outbound.view` |
| `/upload` | Upload | `upload.analyze` |
| `/admin-panel` | AdminPanel | `users.view` |
| `/profile` | Profile | none (any logged-in user) |
| `*` | redirects to `/dashboard` | — |

- **Not routed / dead:** `pages/SystemDirectory.jsx` (see section 15) and `pages/SalesAnalytics.jsx` (mock sales charts built from `data/mockData.js`).
- **Guards:** `ProtectedRoute` checks `localStorage.isAuthenticated==='true'`. `RoleProtectedRoute` also calls `isPermissionAllowed(code, localStorage.userRole || 'SUPER_ADMIN')` and shows an "Access Restricted" card if it fails.
- Guards re-render on the window event `permissionsUpdated`, on `storage`, and on `BroadcastChannel('auralyze_permissions_channel')`.
- On app mount, `runDailyDbDeduplication()` runs (section 0.7).

### 0.2 RBAC (`utils/permissions.js`)

**Roles** (`ROLES_METADATA`):

| Key | Label |
|---|---|
| `super_admin` | "ADMIN" |
| `tl` | "TEAM LEADER" |
| `executive` | "EXECUTIVE / AGENT" |

**`normalizeRole(role)`:** upper-cases the role and replaces spaces with `_`.
- Contains `ADMIN` → `super_admin`
- Contains `LEAD` or `TL` → `tl`
- Anything else (including empty) → `executive`

**Permission matrix** (`INITIAL_PERMISSIONS`). Columns are Admin / TL / Exec; "path" is the sidebar route the permission controls.

| Code | Path | Admin | TL | Exec |
|---|---|---|---|---|
| agents.edit | — | Y | Y | N |
| agents.view | /agents | Y | Y | Y |
| analytics.view | /analytics | Y | Y | Y |
| calls.export | — | Y | Y | N |
| calls.view | /call-records | Y | Y | Y |
| campaigns.create / delete / edit | — | Y | N | N |
| campaigns.view | — | Y | Y | N |
| classification.view | /call-classification | Y | Y | Y |
| coaching.create | — | Y | Y | N |
| coaching.view | — | Y | Y | Y |
| compliance.view | /compliance | Y | Y | Y |
| customer_analysis.view | /customer-analysis | Y | Y | Y |
| dashboard.view | /dashboard | Y | Y | Y |
| groups.create / delete / edit | — | Y | N | N |
| groups.view | — | Y | Y | N |
| inbound_outbound.view | /inbound-outbound | Y | Y | Y |
| permissions.assign | — | Y | N | N |
| roles.create / delete / edit / view | — | Y | N | N |
| tags.create | — | Y | Y | N |
| tags.view | — | Y | Y | Y |
| upload.analyze | /upload | Y | N | N |
| users.create / delete / edit | — | Y | Y | N |
| users.view | /admin-panel | Y | Y | N |

**How checks work:**
- `getActivePermissions()` uses `localStorage.permissionsData` if set, otherwise the defaults above. Edits are browser-local only and never persisted to the DB.
- `isPathAllowed(path, role)` is used by the Sidebar.
- `isPermissionAllowed(code, role)` is used by routes and by every action button.
  - Aliases: `customer.view`→`customer_analysis.view`, `direction.view`→`inbound_outbound.view`, `upload.view`→`upload.analyze`, `admin.view`→`users.view`.
  - **An unknown code or path returns true** (default allow).
- Agent-only UI behaviour: `agents.edit`, `campaigns.*`, `groups.delete/edit`, `roles.create/delete/edit` and `users.delete/edit` are never checked anywhere. `users.view` gates both the route and the Team/Org Tree tabs.

### 0.3 Authentication (`pages/Login.jsx`): all in localStorage, no Supabase Auth

**Session keys:** `isAuthenticated`, `userEmail`, `userDisplayName`, `userRole`, `userRoleLabel`, `userId`, `userAvatar`.

**Quick-login buttons:**
- Admin → `superadmin@pucho.ai`, autoRole `'ADMIN'`. Bug: the label mapping sets `userRoleLabel` to 'AGENT' for this case.
- Team Leader → `kavya.gohil@pucho.ai`, `TEAM_LEAD`.
- Agent → `darshan.soni@pucho.ai`, `AGENT`.

**Typed-email shortcuts (substring match on the email):**
- Contains `superadmin`, or equals `admin`/`auralyze`, or contains `prudent.ai` → logs in as Admin.
- Contains `teamlead`, `tl` or `kavya` → logs in as Kavya, TEAM_LEAD.
- Contains `agent`, `executive`, `darshan` or `hiral` → logs in as Darshan, AGENT.

**Database path:**
- Runs `profiles.select('*').eq('email', lower).single()`.
- Password accepted if `data.password_hash === password`, **or the password is empty, or the password is `'Pucho@2026'`** (plaintext comparison).
- Sets `userId = data.user_id || data.id`.
- `data.role` maps to `TEAM_LEAD`/`TEAM_LEADER` → TEAM_LEAD; `AGENT`/`EXECUTIVE` → AGENT; anything else → SUPER_ADMIN.
- **If the profile is not found, or an error occurs, the user is logged in as SUPER_ADMIN anyway.** This is a security hole.

**Sign-out:**
- Sidebar removes `isAuthenticated`, `userRole`, `userRoleLabel`.
- Header removes `isAuthenticated`, `userId`.

**Other localStorage keys:** `permissionsData`, `credentialsWebhookUrl`, `sentEmailDispatches` (last 50 webhook dispatch logs), `last_db_deduplication_timestamp`.

**Legacy clean-up:** Header and Profile rewrite `'Super Admin'` / `SUPER_ADMIN` to `'Admin'` / `ADMIN` in localStorage on every render.

### 0.4 Data layer (`context/DataContext.jsx`)

**Load on mount:**
- `calls.select('*').order('created_at',{ascending:false})`
- `agents.select('*')`
- `coaching_notes.select('*')`
- No pagination: the whole table is loaded into memory.

**Client dedupe:** key = `(filename || call_id).trim()` basename (`split('/').pop()`). The first occurrence (newest) is kept. `refreshCalls()` re-fetches calls and agents but does not dedupe.

**Realtime subscriptions:**
- `calls` INSERT: prepend unless `call_id` or basename already exists.
- `calls` UPDATE: replace by `call_id`.
- `calls` DELETE: remove by `call_id`.
- `coaching_notes` INSERT: append.

**`normalizeCall(c, agents)`, applied to every call:**
1. Treats `agent_code`, `agent_name` or `mobile_number` equal to 'Unknown' as empty. Treats `call_id` starting with `CALL-` as empty.
2. Missing values are filled from `parseFilename(filename)` (agentCode, mobile, leadId → call_id).
3. If `agent_name` is empty, 'Unknown', or one of `PLC`/`NONPLC`/`BROKING`/`DEALERDE` (a campaign name stored as the agent name), the name is looked up in `agents` by `agent_code`.
4. Anything still empty becomes `'Unknown'`.
5. If `intelligence.campaign` is missing, `intel.campaign = parsed.campaign` and `intel.coaching_flag = parsed.coachingFlag`.
6. **KPI scaling:** `rawKpi = Number(kpi_score)||0`. If `rawKpi > 5` → `kpi_score = rawKpi/20` (converts 0–100 to 0–5); otherwise kept as is (2 decimals). From here on, `kpi_score` is the 0–5 quality score everywhere.
7. **If `scaledKpi <= 2`, `intel.compliance_risk = 'High'`.** This overrides the AI value.
8. **Fake heuristics:** mobile ending in `9` → `intel.nri_caller = true`; mobile ending in `6` → `intel.repeat_caller = true`.
9. `intelligence` is re-serialised to a JSON string.

`CallRecords` uses its own copy of this logic for directly fetched calls, and that copy always divides `kpi_score` by 20.

**Role scoping (`scopedCalls` / `scopedAgents`), from `localStorage.userRole`, `userEmail`, `userDisplayName`, `userId`:**
- **Admin** (role contains ADMIN): sees everything.
- **Team Leader** (role contains LEAD or TL): sees agents where `agents.supervisor` (lower-cased) equals `userId`, equals or contains the user's name (either direction), or equals the user's email (or the agent's `email` equals the user email).
  - Special case: a user whose email or name contains 'kavya' gets agents with `supervisor === '69b905dc-5745-482d-90cc-a95f15a6eb49'` or a supervisor containing 'kavya'.
  - Calls are filtered by those agent codes or names.
  - If the team list is empty, the TL sees all agents.
- **Agent / Executive:** matched to an agent by email, or by name (equal or contains).
  - Hardcoded fallbacks: `darshan`→1050, `anurag`→1018, `dipti`→1011, `darshana`→1028. The `darshana` entry can never be reached because `darshan` matches first.
  - Sees calls matching that code, or where the call's agent name matches the user name either way.

**Global date filter** (`dateFilter`: 'All Time' | 'Today' | 'Last 7 Days' | 'Last 30 Days' | 'Custom', with `customStart`/`customEnd`):
- Date field used: `call_date || created_at || date`. An 8-digit `YYYYMMDD` string is parsed.
- Calls with no date or an invalid date are always included.
- `diffDays = ceil(|now-date|/1 day)`. Today is `<=1`, 7 days is `<=7`, 30 days is `<=30`.
- Custom range: start at 00:00, end at 23:59:59.999.

**Exports from the context:** `calls` (scoped and date-filtered), `allCalls`, `scopedCalls`, `agents` (scoped), `allAgents`, `coachingNotes`, `loading`, the date filter setters, `refreshCalls`, and audio player state.

**Global audio player state:**
- `playCall(callObj)` requires `audio_url` (alerts if missing). Calling it on the active call toggles play/pause; otherwise it creates a new `Audio`.
- Also: `togglePlayActive`, `seekAudio`, `changeSpeed`, `changeVolume`, `stopAudio`; state `currentTime` and `duration`.

### 0.5 Filename parsing (`utils/parseFilename.js`)

- Format: `YYYYMMDD-LEADID_MOBILE_AGENTCODE_CAMPAIGN-FLAG.ext`, e.g. `20260406-092249_8779709849_1011_NONPLC-all.mp3`.
- Extensions stripped: mp3, wav, ogg, flac, m4a, webm, aac.
- Split on `_`. Fewer than 4 parts returns `{}`.
- `parts[0].split('-')` gives `date` and `leadId` (`time` is an alias of leadId).
- `parts[1]` is `mobile`; `parts[2]` is `agentCode` (`code` is an alias).
- `parts[3].split('-')` gives `campaign` (first part) and `coachingFlag` (the rest joined with '-', default `'all'`).

### 0.6 PII masking (`utils/piiMasker.js`)

Masking is display-only; the DB keeps raw values.

| Function | Rule |
|---|---|
| `maskPAN` | `ABCDE1234F` → `ABCDE****F` (regex `[A-Z]{5}[0-9]{4}[A-Z]`) |
| `maskAadhaar` | 12 digits, optional `-`/space separators → `XXXX-XXXX-<last4>` |
| `maskCreditCard` | 16 digits → `XXXX-XXXX-XXXX-<last4>` |
| `maskContextualAccountNo` | label (folio, account, acc, policy, demat, mandate, pan, aadhaar), optional no./number/#, then a 6–20 char value → `"<label>: XXXX-<last4>"` |
| `maskMobile` | optional +91, then `[6-9]\d{5}\d{4}` → `XXXXXX<last4>` |

- `maskPII` applies them in order: PAN → Aadhaar → card → contextual → mobile.
- **Only used on transcript turns in `CallDetailView`.**
- `maskMobile` is imported there but never called. Mobile numbers appear unmasked in every table.
- Aadhaar masking runs before card masking, so 12-digit groups inside a card number are masked first.

### 0.7 Deduplication (`services/dbDeduplicationService.js`)

**This is destructive.** It runs on app load for any logged-in user, at most once per 24h per browser (`last_db_deduplication_timestamp`).
- Selects `calls(id, filename, call_id, created_at)` ordered by created_at descending.
- Groups by basename of `filename||call_id`.
- `calls.delete().in('id', olderDuplicateIds)`.

Upload also deletes before re-upload: `calls.delete().eq('filename', name)` for non-ZIP files.

### 0.8 CSV export (`utils/exportCsv.js`)

- `exportToCsv(rows, filename)`: headers come from `Object.keys(rows[0])`; values are quoted if they contain a comma, quote or newline; downloaded as a Blob.
- Only `CallTable` uses it. The other pages build `data:text/csv` URIs by hand.

### 0.9 Credentials email webhook (`services/emailWebhookService.js`)

- `triggerCredentialsWebhook({name,email,password,role,agentCode,reportsTo,webhookUrl})`
- POSTs JSON to: the `webhookUrl` argument, else `localStorage.credentialsWebhookUrl`, else the default `https://studio.pucho.ai/api/v1/webhooks/rurnAbexMc5khGoKhgvVW`.
- **Payload:**
  - `event: 'USER_CREDENTIALS_DISPATCHED'`, `timestamp`, `to`, `recipient_email`, `recipient_name`, `subject`
  - `body` / `html` / `body_html` (HTML email), `body_text`
  - `recipient{name,email,role,agent_code,reports_to}`
  - `credentials{login_url, username, temporary_password}`
  - `email_content{subject, body, html, body_html, body_text}`
- `login_url = origin + pathname + '#/login'`. The default password is `Pucho@2026`, **sent in plaintext**.
- Dispatch status is logged to `localStorage.sentEmailDispatches`.

### 0.10 Layout shell

**`components/Layout.jsx`:** Sidebar + Header + `<Outlet>` + global AudioPlayer + a fixed "Powered by pucho.ai" badge.

**`components/Sidebar.jsx`:**
- Nav items, filtered by `isPathAllowed`: Dashboard, Call Records, Analytics, Agents, Customer Analysis, Compliance, Inbound / Outbound, Call Classification, Upload & Analyze, Admin Panel.
- Labels "CALL INTELLIGENCE V1" and "NAVIGATION".
- User card (avatar, or initials from `userDisplayName`; role label) links to /profile.
- Collapse toggle (w-20 vs 280px), Sign Out, mobile drawer with backdrop.
- Listens for `userAvatarChanged`, `userDisplayNameChanged`, `permissionsUpdated`, `storage`, and the BroadcastChannel.

**`components/Header.jsx`:**
- Per-route title and subtitle map. Notable entries: `/customer-analysis` → "Sentiment Analysis"; `/compliance` → "Compliance & Risk"; `/admin-panel` → "Prudent QA".
- Pulsing "Live" dot.
- Avatar dropdown with My Profile and Sign out.
- A clock and a 120s countdown are computed but never rendered.

**`components/AudioPlayer.jsx`:** fixed dark bar at the bottom.
- Shows agent name and code, call date, and campaign (`campaign_name || intel.campaign`).
- Prev/next move through the current `calls` list by `call_id` index.
- Play/pause; a 50-bar fake waveform you can click to seek.
- Time labels, speed buttons 1 / 1.25 / 1.5 / 2x, volume slider, close button.

**`context/ToastContext.jsx`:** `showToast({title,message,type})` or `showToast(msg, type, duration=4000)`. Types: success, error, warning, info.

### 0.11 Unused code

These are not imported by any routed page:
- Components: `AgentLeaderboard`, `CallIntentChart`, `RiskIndicatorsChart`, `KnowledgeGapsChart`, `CoachingPriorityChart`, `TopAgentsChart`, `PerformanceKPIsChart`, `QualityDistributionChart`, `TeamSentiment`, `PartnerSentiment`, `QuickSpotlight`, `CampaignPerformanceTable`, `StatCard`, `MiniStatCard`, `ui/primitives.jsx`, `ui/Card.jsx` (used only by SalesAnalytics).
- `lib/profile.js` (`getCurrentProfile`, `updateProfile`).
- `data/mockData.js`.

Their logic is in section 14 in case you want to revive any of it.

### 0.12 Hardcoded or fake values to avoid copying as real features

- **CallDetailView:**
  - Breadcrumb QA badge is always "48.0".
  - The "Overall QA Health" ring is always 38.0 / "Critical".
  - Quality/Resolution/Compliance/Cust.Sat meters are static (35%, 0%, 50%, 0%).
  - The "Inbound" chip is always shown.
  - KPI15 always says "Agent: Professional", with static paragraph text.
  - Every Quick-Overview description is static text.
  - Default SOP notes are sample text.
  - The NON-PLC greeting box and DealerDesk note are static.
- **AgentDetail:**
  - Hero ring is always 84.3 "EXCELLENT"; "10 rated" is static.
  - Meter points are static (26.3/35, 18.8/25, 15/15, 25/25); Compliance and CSAT always show 100%.
  - The "Why this score" text is static.
  - Chips "Green Coaching Priority" and "1 High Churn" are static.
  - Sentiment bar widths are static (100/0/0, 58/42/0).
  - Recent-calls Agent/Customer sentiment is always "Professional"/"Positive".
  - Many values fall back to defaults: 3.8, 6.4, 3.5, 75%, 260s, 'Rohan Contractor', 1028.
  - If an agent has no calls, it **shows the first 12 calls of anyone**.
  - Weekly chart weeks with no calls are filled with synthetic sine-wave data.
- **Agents page:**
  - Hero Resolution 75%, Compliance 100% and CSAT 100% are static; the "GOOD" badge is static.
  - Default dates are 2026-03-28 → 2026-07-08.
  - "Updated 02:11:02 PM" and "Auto in 9s" are static.
  - The Refresh button does nothing.
  - The "Why this score" weights say 35/25/25/15, which contradicts the real 35/25/15/25 formula.
- **AnalyticsTrends:** the 90-day heatmap is a fixed modulo pattern with static May–Aug labels.
- **QAHealthCard:** when there are no calls it shows demo numbers (75.2, 500 calls and so on). The avatar stack letters "I D T" are static; agent count falls back to 22. The text "92.88 of 100 measurable" is static.
- **Dashboard:**
  - The IVR "Extremely Satisfied" vs "Satisfied" split is decided by `idx % 2`.
  - The greeting always says "Good morning".
  - DetailedAnalysis shows demo insights when there are no calls.
- **CallTable:** the TYPE column is always "IN".
- **Compliance:** the "Healthy" badge is static; the Filters button does nothing; the tabs do not filter the table; the `BASELINE_AGENTS` constant is unused.
- **AdminPanel:**
  - "ROLES YOU CAN ASSIGN" is always 3.
  - "WITH A TEAM LEAD" just equals the group count.
  - User status badges are always green.
  - The group Edit icon does nothing.
  - Groups are not persisted.
  - Text says "0 unassigned code(s) available" and "No campaigns yet" (campaign assignment is not implemented).
- **Profile:** "Database Campaigns" falls back to 8; member-since falls back to '05 Aug 2026'; agent code falls back to 1001 / 2007 / 1011.

### 0.13 Broken wiring and bugs

- The Dashboard passes navigation state (`classificationFilter`, `activeTab`) that CallRecords and Compliance never read.
- `?topic=` links from CallClassification are ignored by CallRecords.
- The `callType` filter in CallFilters is never applied.
- CallClassification's per-type Export buttons export all calls.
- `Dashboard.jsx` calls `parseFilename` without importing it (affects the sparkline fallback path).
- Upload's local `showToast(message, type)` is called with an object when permission is denied.
- The CustomerAnalysis drill-down modal can never open: `setSelectedCall` is never called with a call.
- AgentLeaderboard's "View Details" link sets a hash and then a non-hash href.
- `schema.sql` declares `profiles.user_id NOT NULL`, but AdminPanel's profile insert does not supply it.
- `cleaned_transcript` is JSONB in the schema, but the code treats it as a string.

---

## 1. Dashboard: `pages/Dashboard.jsx`

**Route and roles:** `/dashboard`, `dashboard.view` (all three roles). Data source: `useData().calls`.

**Header bar:**
- Avatar (falls back to `/avatar.png`, then initials) and today's date.
- "Good morning, {userDisplayName}".
- Pills: Live; "{n} calls" (goes to /call-records); Date Range (toggles the range bar); Search (goes to /call-records); Refresh (`refreshCalls`).
- **Date-range bar:** FROM and TO date inputs. Apply sets `customStart`/`customEnd` and `dateFilter='Custom'`, or 'All Time' if both are empty. Clear resets everything.

**`QAHealthCard`** (section 1a).

**4 stat cards:**
1. **Total Calls:** `calls.length`.
   - Sparkline: count per `call_date` (or the date part of `created_at`).
   - If only one date, groups by hour (from `created_at`, or the first 2 characters of the filename time token); if still only one, by minute.
   - Plotted as `y = 34 - (count/max)*24`, smoothed with cubic curves. Uniform counts get an artificial ±7 wave.
2. **Avg SOP score:** `sum(sop_score ?? 5)/n`, one decimal, "of 7".
   - "% achieved" = `round(avgSop/7*100)`.
   - Ring gauge.
3. **Avg duration:** `duration` (or duration_seconds, audio_duration, call_duration) parsed to seconds.
   - Accepted formats: "Xm Ys", "h:m:s", "m:s", or plain seconds.
   - `avg = floor(totalSecs/total)` → "Xm Ys".
   - Mini bar chart of 6 buckets: <60s, <180, <300, <420, <600, ≥600. Bar height = `count/max*100`, minimum 15% (8% when empty); the tallest bar is highlighted.
4. **Inbound vs outbound:** outbound if `call_intent || intel.call_category` is in `['SIP Review','Mandate Follow-up','Missed Payment','ARN Renewal','KYC Completion']`, otherwise inbound. Split bar with counts and %.

**Call Classification section:**
- **Bucketing:**
  - `call_classification` lower-case equal to `intent` or `inquiry` → Inquiry; `query` → Query; `complaint` → Complaint.
  - Otherwise uses the `kpi_results` entry named 'Call Intent': its `.call_classification` containing intent/inquiry → Inquiry, complaint → Complaint, anything else → Query.
- Segmented bar, plus 3 cards: Inquiry ("Customer wants to perform an action"), Query ("Customer asking a specific question"), Complaint (with a "watch" badge), each showing count and % of total.
- Clicking a card goes to `/call-records` with `state.classificationFilter` (ignored there).
- **Per-card Export CSV:** filename `<cls>_calls_export.csv`; columns `Sr, Call ID, Filename, Date, Agent, Classification, Topic (call_intent||intel.call_category||'General'), Summary`.
- "Deep dive →" goes to /call-classification.

**IVR Feedback section:**
- A call is "rated" if the KPI 'CSAT Indicator' value is not 'NA', or the KPI 'Customer & Agent Sentiment'.customer_sentiment is not 'NA'.
- **Positive:** CSAT = High or customer_sentiment = Positive. These are split into Extremely Satisfied / Satisfied by `idx % 2` (fake).
- **Negative** ("Not Satisfied"): CSAT = Low or customer_sentiment = Negative.
- **Otherwise** "Some improvement".
- Satisfaction ring = `(positive/rated)*100`, one decimal. Static red→green spectrum bar; 4 count cards with %.

**Risk & Compliance Alerts** (`AlertCard`: title, count, "% of total"; variant warning if count > 0):
- **High Compliance Risk:** `compliance_risk||intel.compliance_risk` contains high or critical. Goes to /compliance with state 'High Risk Calls'.
- **Coaching Red Flags:** `coaching_priority||intel.coaching_priority` is red, yellow or amber. Goes to /compliance with state 'Coaching Red Flags'.
- **High Churn Risk:** `churn_risk||intel.churn_risk` contains high. Goes to /compliance.
- **ZTP Violations:** `ztp_violation === true || ztp_violation === 'Yes' || intel.ztp_violation === 'Yes'`. Goes to /compliance with state 'ZTP Violations'.

**`DetailedAnalysis`** (section 1b).

### 1a. `components/QAHealthCard.jsx`: QA Health score (shared formula)

**Per call:**
- `quality = kpi_score`; if null, use the KPI 'Call Quality Score' value parsed as an integer (default 4). If greater than 5, `/100*5`.
- `resolved` if `intel.resolution_status==='Yes'`, or `intel.status==='Resolved'`, or KPI 'Call Resolution' value is 'Yes'.
- `compliancePass` unless compliance risk (`intel.complianceRisk || intel.compliance_risk || c.compliance_risk`) contains high or critical.
- `csatRated` and `csatPositive`: same definitions as the Dashboard IVR section.

**Formula:**
- `avgQuality = qualSum/n`, `resRate = res/n`, `compRate = pass/n`, `csatRate = csatPos/csatRated` (0.98 if nothing rated).
- `qualPts = avgQ/5*35`, `resPts = resRate*25`, `compPts = compRate*15`, `csatPts = csatRate*25`.
- **Score = sum of the four (out of 100).**
- **Status:** ≥80 Excellent; ≥60 Good; ≥45 Needs Attention; otherwise Critical.

**UI:**
- Animated gauge (1.4 s ease-out).
- 4 meters showing "x/5" or "%", "pts / max", and percent.
- "Why this score?" expands 4 explanation cards.
- Footer: "{n} calls · {rated} rated"; "See each of your {uniqueAgentCodes} agents' QA scores" goes to /agents.

### 1b. `components/DetailedAnalysis.jsx`: "What needs attention / What's working"

**Inputs per call:**
- Quality: same as the QA card, average to 2 decimals.
- FCR: `intel.fcr===true` or KPI 'First Call Resolution' = Yes.
- Intent counts by `call_intent || intel.call_category || 'Query'`.
- SOP lookups in `sop_results`, by `sop_id` or name substring: 1 'greeting', 2 'identify', 5 'closing', 6 'feedback', 7 'behaviour'.
  - `result !== 'NA'` counts as evaluated; `result === 'Pass'` counts as a pass.
  - Fail % = (evaluated − pass) / evaluated.

**Rules:**

| Check | Needs attention when | Link |
|---|---|---|
| FCR | FCR% < 80 | /call-records |
| Greeting | fail% > 0 | /analytics |
| Caller ID | fail% > 15 | /analytics |
| Closing | fail% > 0 | /analytics |
| Feedback IVR | fail% > 0 | /analytics |
| Behaviour | fail% > 0 ("potential ZTP") | /compliance |
| Avg quality | < 4.0 | /call-records |

- When a check passes, its message goes into "What's working" instead.
- "Most common call type" (the top intent and its %) is always added to the attention list.
- "What's working" is a collapsible accordion.

---

## 2. Call Records: `pages/CallRecords.jsx` + `CallFilters` + `CallTable` + `CallDetailView`

**Route and roles:** `/call-records`, `calls.view` (all roles). Export requires `calls.export` (Admin, TL).

**Detail mode** (when `?id=<call_id>` is set):
- Finds the call in context.
- If missing (for example a fresh upload), fetches `calls.select('*').eq('call_id', id).single()`, normalises it, then calls `refreshCalls()`.
- If still not found, **renders a hardcoded fake call** (Krishna Vaghela, 1849, …).
- Back removes `id` from the URL.

**Filter state:** agentCode, campaign, callId, date, mobile, coaching, compliance, churn, callType, classification, topic, sentiment.

**Filter logic** (all case-insensitive substring matches):

| Filter | Matches against |
|---|---|
| agentCode | `agent_code` or `agent_name` |
| callId | `call_id` |
| mobile | `mobile_number` (plain includes) |
| campaign | `intel.campaign` or `campaign_name` |
| date | `call_date` or `created_at` string includes (e.g. "2026" or "2026-03") |
| coaching | `intel.coachingPriority`, `intel.coaching_priority` or `coaching_priority` |
| compliance | `intel.complianceRisk`, `intel.compliance_risk` or `compliance_risk` |
| churn | `intel.churnRisk`, `intel.churn_risk` or `churn_risk` |
| classification | `call_classification` or `intel.call_category` |
| sentiment | `sentiment` or `intel.sentiment` |
| topic | `call_intent` or `intel.call_topic` |
| callType | **not applied** |

- Clicking a table cell sets the matching filter field to that value.

**`components/CallFilters.jsx`:**
- Row 1 text inputs: Agent Code, Campaign, Calls Meta ID, Date (placeholder "2026 or 20260317"), Mobile.
- Row 2 selects: COACHING (All/Red/Amber/Green), COMPLIANCE (All/High/Medium/Low), CHURN (All/High/Medium/Low), CALL TYPE (All/Inbound/Outbound), CLASSIFICATION (All/Inquiry/Complaint/Query).
- TOPIC text input (placeholder "KYC, SIP..."); SENTIMENT (All/Positive/Neutral/Negative).
- "✕ Clear all" appears when any filter is active.

**`components/CallTable.jsx`:**
- **Row mapping:**
  - `qualityNum`: `kpi_score > 5 ? round(kpi/100*5) : round(kpi)` (default 4).
  - `sopNum`: `sop_score ?? 5`.
  - `csat`: KPI 'CSAT Indicator' value, else `intel.csat`, default Medium.
  - `topic`: `call_intent || intel.call_topic || intel.call_category || 'Query'`.
  - `subTopic`: `intel.call_sub_topic || intel.summary || filename`.
  - `duration`: number → "Xm Ys", otherwise the string as is.
  - `date`: `call_date || created_at` formatted en-GB "dd Mon yyyy".
  - `campaign`: `campaign_name || intel.campaign || 'Default'`.
  - `lang`: `language || intel.language || 'Mixed'`.
  - `classification`: `call_classification || intel.call_category`, with a leading "?" stripped.
  - `ivr`: `intel.ivr_rating` (default Neutral).
  - `coaching`, `compliance`, `churn`, `sentiment`: column value, then intel value.
- **Columns** (toggle via the "Columns" dropdown; all visible by default):
  - SR., play button, DATE.
  - AGENT: initials, name, code, and pencil edit. Hover popover shows Quality /5, SOP /7, Coaching badge, "View agent profile →" (/agents) and Edit.
  - LEAD ID, MOBILE, CAMPAIGN, TYPE (always IN), LANG, DURATION.
  - QUALITY: colour red if ≤2, amber if 3, green if ≥4.
  - SOP: amber if ≤4, green if >4.
  - CLASSIFICATION, INTENT / TOPIC (with sub-topic), CSAT (Low red / Medium grey / High green), SENTIMENT, IVR FEEDBACK, COACHING (Red / Amber / else green), COMPLIANCE (High blue), CHURN (High red / else amber).
- **Interactions:**
  - Row click → `?id=call_id`.
  - Clickable cells set filters: leadId (also opens detail), mobile, campaign, type, classification, topic, csat (sets the *sentiment* filter, a bug), sentiment, coaching, compliance, churn.
  - Play button uses the global player.
- **Pagination:** 25 rows per page; first / prev / "Page x / y" / next / last; "Showing a–b of n" at top and bottom. Resets to page 1 when the call count changes.
- **No sorting, no free-text search.** A "Comfortable" density button does nothing.
- **Export CSV:** `exportToCsv(displayCalls, 'call_records')`, i.e. all filtered rows with the mapped keys (sr, audioUrl, date, agentName, agentId, …, churn). Gated by `calls.export`.
- **Edit Agent Name modal:**
  - Scope "This call only": `calls.update({agent_name}).eq('call_id', id)`.
  - Scope "All calls for agent (code)": `agents.update({agent_name}).eq('agent_code', code)` and `calls.update({agent_name}).eq('agent_code', code)`.
  - Then `refreshCalls()`.
  - **Not gated by `agents.edit`.**

**`components/CallDetailView.jsx`** (rendered at `/call-records?id=`):
- **Parsed fields:** `intelligence`, `kpi_results` (array), `sop_results` (array).
- **Quality number:** KPI named 'Call Quality Score' (or name containing 'quality') `.value`; else `kpi_score > 5 ? round(kpi/100*5) : kpi_score || 2`.
- **SOP number:** count of sop_results with `result` in Pass/NA/Yes; else `sop_score || 4`.
- **Breadcrumb:** QA Health Overview (/dashboard) › Agents › {agent} › Call #{call_id}, plus the static 48.0 badge.
- **Agent header:**
  - Initials, name, code, date.
  - Chips: duration, language, Lead ID, campaign (`campaign_name||intel.campaign`).
  - Badges: Coaching, Sentiment, Compliance, Churn, ZTP (column first, then intel). Fallbacks: Red / Negative / Medium / Medium / 'Violation'.
  - QUALITY x/5, SOP x/7, Play/Pause.
- **Badge colour rule (`getBadgeStyle`):**
  - Green: yes, pass, efficient, high, compliant, full, positive.
  - Red: no, fail, inefficient, low, non-compliant, negative, red.
  - Amber: partial, amber, yellow, medium, acceptable.
  - Everything else (na/none/neutral/unknown): green.
- **Accordions:**
  - AI Summary (`call_summary`).
  - Improvement Areas (`improvement_areas` split on newlines, leading "-" stripped).
  - **Quick Overview — AI Intelligence:**
    - Cards: Compliance Risk, ZTP, Coaching Priority, Churn Risk.
    - BFSI card: `bfsi_false_guarantee_flag` (Yes → "Violation Flagged", else Pass), `bfsi_risk_disclaimer_spoken`, `bfsi_identity_verified`, `bfsi_product_category || call_topic` (default 'Mutual Funds').
    - KPIs 1–6.
  - **SOP Checkpoints:**
    - Uses `sop_results` if it has ≥7 items, otherwise 7 sample defaults.
    - Each row: name, result badge, note.
    - Static "Expected greeting standard — NON-PLC" box and DealerDesk note: verified partner lines must not be marked ZTP and must not reduce KPI.
    - Footer "SOP Score x/7".
  - **Transcript:** `cleaned_transcript` split on `\n`. "Speaker 1:" is the Agent, "Speaker 2:" the Customer; otherwise text before ":" is the speaker. Chat bubbles, **text masked with `maskPII`**.
  - **Call Performance KPIs:** KPIs 1–10 as cards.
  - **KPI 11 — Intent:** `call_intent || intel.call_topic`; Category `intel.customer_type` (default Non-PLC); Sub-topic `intel.call_sub_topic`; detail `intel.kpi11_intent_detail || call_summary`.
  - **KPI 15 — Sentiment:** Customer = `call.sentiment`; Agent = static "Professional".
  - **Call Tags** (`tags.view`):
    - Auto tag: `bfsi_product_category || call_topic`.
    - `intel.tags[]` chips; ✕ delete and "+ Add tag" (Enter saves, Esc cancels) require `tags.create`.
    - Write: `calls.update({intelligence: JSON.stringify({...intel, tags})}).eq('call_id', id)`.
  - **Coaching Notes** (`coaching.view`):
    - AI note card: `coaching_summary_note || coaching_note || intel.coaching_summary_note || coaching_reason`, plus `improvement_areas`, `recommendations` and priority.
    - Manual notes: from context `coachingNotes` filtered by `call_id`; show type badge, date and `created_by`.
    - "+ Add Note" (`coaching.create`): textarea plus type select (Manager / Advice / Feedback / Critical). Inserts into `coaching_notes` `{call_id, agent_code, note_text, note_type, created_by:'Manager', is_resolved:false}`. Realtime then appends it.

**15 KPI definitions** (id, name, key, default):

| # | Name | Key | Default |
|---|---|---|---|
| 1 | Call Resolution | kpi1_call_resolution | No |
| 2 | First Call Res. | kpi2_fcr | No |
| 3 | AHT Efficiency | kpi3_aht_efficiency | Inefficient |
| 4 | Call Abandonment | kpi4_call_abandonment | No |
| 5 | CSAT Indicator | kpi5_csat_indicator | Low |
| 6 | Call Quality Score | kpi6_call_quality_score | `{q}/5` |
| 7 | Hold Compliance | kpi7_hold_compliance | Compliant |
| 8 | IVR Transfer | kpi8_transfer_to_ivr | No |
| 9 | Process Adherence | kpi9_process_adherence | Partial |
| 10 | Escalation | kpi10_escalated | No |
| 11 | Call Intent & Topic | kpi11_intent | `intel.call_category` or Query |
| 12 | Service Level | kpi12_service_level | Compliant |
| 13 | Repeat Call Signal | kpi13_repeat_call | No |
| 14 | Query Raised | kpi14_query_raised | Yes |
| 15 | Customer & Agent Sentiment | kpi15_sentiment | `sentiment` |

- Matched by `kpi_id === id` or `name` containing the label.
- Note text: `found.note || intel['kpi{id}_note']`.

**7 SOPs:** 1 Professional Greeting, 2 Caller Identified, 3 Hold Permission, 4 Hold Refresh, 5 Closing Script, 6 Feedback IVR, 7 No Behaviour Issue. Result values: Pass / Fail / NA (also Yes).

---

## 3. Analytics: `pages/Analytics.jsx`

**Route and roles:** `/analytics`, `analytics.view` (all roles). Pill tabs: Overview, Trends, SOP Analysis, Language.

### 3a. Overview (`components/AnalyticsOverview.jsx`)

1. **Call Intent Distribution:** horizontal bar. Key `call_intent || intel.call_topic || intel.call_category || 'Query'`; top 12 by count; labels truncated to 18 characters.
2. **Compliance Risk Breakdown:** donut with "{n} CALLS" in the centre.
   - Buckets from `compliance_risk||intel.complianceRisk||intel.compliance_risk`: contains high / medium / low, else "No Risk".
   - Legend plus 4 descriptions: No Risk "Zero compliance issues detected", Low "Minor issues, monitor occasionally", Medium "Moderate risk, requires follow-up", High "Serious violation, immediate action needed".
3. **Quality Score Distribution:** bar chart.
   - Score = `kpi_score` (or KPI quality value, default 4); if >5, `round(/100*5)`, else rounded; clamped 1–5.
   - Displays only Score 2–5 (Score 1 is counted but not shown). Colours: 2 red, 3 amber, 4–5 green.
4. **Customer Sentiment Overview:** donut over `sentiment||intel.sentiment`. Buckets: contains positive / negative / "na" / else Neutral.
5. **Campaign Performance Comparison:** grouped bars, first 5 campaigns (not sorted).
   - Campaign key: `campaign_name || intel.campaign || 'Default'`.
   - quality = average of the rounded score.
   - sop = `avg(sop_score||5)*(5/7)`.
   - res% = resolved / count, where resolved means `intel.status==='Resolved'` or KPI resolution = Yes.
   - Y axis is fixed 0–5 while res% is 0–100 (scale bug).
6. **Resolution Rate by Call Intent:** horizontal bar, % resolved per intent, top 12.
7. **Agent Knowledge Gaps:** horizontal bar, count of calls per intent where the rounded score is < 4.
8. **KPI cards:**
   - NRI Callers: `intel.nri_caller===true` or intent contains 'nri'. Because of the fake rule in section 0.4, this effectively means mobile ends in 9.
   - Repeat Callers: `intel.repeat_caller` or intent contains 'repeat' (effectively mobile ends in 6).
   - Systemic Issues: count of High compliance risk.

### 3b. Trends (`components/AnalyticsTrends.jsx`)

- **Fake 90-day heatmap** (112 cells), showing "{n} TOTAL".
- Grouped by day (`call_date || created_at` date part), sorted ascending:
  - **Daily Call Volume** (area chart).
  - **Quality Score Trend:** area chart of the average of `kpi_score` (>5 → /20); 4.0 if no data; Y axis 0–5.
  - **Churn Risk Trend:** line chart, highChurn (churn contains high) vs lowChurn (everything else).
  - **Compliance Violations Trend:** line chart of compliance contains high or `ztp_violation===true`.

### 3c. SOP Analysis (`components/AnalyticsSOP.jsx`)

- Checkpoints: Greeting, Caller Identified, Hold Permission, Hold Refresh, Closing Script, Feedback IVR, No Behaviour Issue.
- **The logic looks in `kpi_results`, not `sop_results`.**
  - It finds a KPI whose name contains the checkpoint name. Value 'Yes' or true is a pass; 'N/A' is NA; anything else is a fail.
  - **If not found, fake defaults are used:** Greeting, No Behaviour and Caller Identified are passes; Hold Permission and Hold Refresh are NA; everything else is a pass.
- **SOP Pass Rate per Checkpoint:** horizontal bar, `pass/(pass+fail)`; red if <50%.
- **SOP Score Distribution:** bars for 3/7 … 7/7 (`sop_score ?? intel.sop_score ?? 5`, rounded, clamped 3–7). Colours: 3 red, 4–5 amber, 6–7 green. Reference line at 6/7; "Avg x.x" label. Legend: Critical 0–3, Needs Work 4–5, Compliant 6–7.
- **SOP Checkpoint Detail table:**
  - Columns: CHECKPOINT, PASS %, FAIL %, N/A % (each divided by total), STATUS (Good if pass% ≥ 70, else Critical). Pass bar is red if <40%.
  - The subtitle says "sorted by fail rate", but the table is not sorted.

### 3d. Language (`components/AnalyticsLanguage.jsx`)

- **Buckets** from `language||intel.language||'Mixed'`: contains 'guj' → Gujarati, 'hin' → Hindi, 'eng' → English, else Mixed.
- **Language Distribution:** donut.
- **Quality & SOP by Language:** bars of avg quality (`kpi_score` >5 → /20, default 4) and `avg sop×5/7`.
- **Quality Metrics by Language table:** LANGUAGE (with flag IN/GB/globe), CALLS, AVG QUALITY x.xx/5, AVG SOP x.x/7, RESOLUTION %, HIGH COMPLIANCE RISK count.

---

## 4. Agents: `pages/Agents.jsx` + `components/AgentSentiment.jsx`

**Route and roles:** `/agents`, `agents.view` (all roles).

**Toolbar:** FROM and TO dates bound to the global `customStart`/`customEnd`; Apply sets `dateFilter='Custom'`. Static "Updated…" and "Auto in 9s" text; Refresh does nothing.

**KPI cards** (grouped by `agent_name`):
- **Active Agents:** number of distinct agents.
- **"Top Quality":** average of per-agent average quality (`kpi_score`, >5 → /20).
- **Agents w/ Red Flags:** agents with at least one red call. Red = `coaching_priority||intel.coaching_priority` is 'red'; if no priority is set, `0 < q ≤ 2`.
- **Agents w/ Yellow:** amber or yellow priority; if no priority is set, `q ≤ 3` or `sop_score < 5`.

**Team QA hero:**
- Gauge = `teamAvgQuality×20`; text "{calls} calls · {calls} rated · {agents} agents".
- Quality bar is real; the other three bars are static.

**`AgentSentiment` sections** (grouped by `agent_name`):
- **Per-agent values:**
  - q = `kpi_score` (or KPI quality value, default 4), >5 → /20.
  - s = `sop_score||5`, >7 → `/100*7`.
  - empathy = `intel.empathy_score||4`.
  - Agent sentiment from `agent_sentiment||intel.agent_sentiment||'Professional'`: contains 'professional' but not 'unprofessional' → pro; contains 'unprofessional' → unpro; else neutral.
  - Resolved: `intel.status==='Resolved'`, `c.status==='Resolved'`, or KPI resolution = Yes.
  - Red flag: priority red, or q ≤ 2.
  - **score = round(avgQ/5×100)**; status Excellent ≥80, Good ≥60, else Critical.
  - Sorted by score; rank assigned in that order.
- **1. Agent QA Health ("North-Star"):** card grid with a ring (green ≥80, blue ≥60, amber ≥50, red otherwise), name, code, "{calls} Calls · {rated} Rated", status. Click goes to `/agents/{code}`.
- **2. Sentiment Lens (KPI 15):**
  - Overall % Professional / Neutral / Unprofessional.
  - **Team Health Score = round((pro×100 + neu×50)/total)**: Excellent ≥80, Good ≥50, else Critical.
  - Per-agent sentiment cards: score, pro% bar, P/N/U counts; click goes to the agent.
  - **Export CSV:** `Agent_Performance_Report_<YYYY-MM-DD>.csv`, columns Rank, Agent Name, Employee ID, Total Calls, Quality Score, SOP Score, Empathy Score, Resolution Rate, Red Flags.
  - **Export PDF:** opens a print window with a table (Rank, Name, ID, Calls, Quality, SOP, Resolution).
- **3. Agent Performance Leaderboard table:**
  - Columns: AGENT (avatar, name, code), CALLS, QUALITY SCORE (bar /5), SOP SCORE (bar /7), EMPATHY SCORE (bar /5), RESOLUTION %, SENTIMENT (= score), RED FLAGS (red if >0), DRILL DOWN (View → `/agents/{code}`).
  - No sort controls, search or pagination.

---

## 5. Agent Detail: `pages/AgentDetail.jsx`

**Route and roles:** `/agents/:id`, `agents.view`. For Agent/Executive users the breadcrumb reads "Dashboard › My QA Profile" with a back-to-dashboard link; otherwise "QA Health Overview › Agents › {name}".

**Call selection:** `agent_code == id`, or `agent_name` includes id. If no match, the first 12 calls of anyone are used.

**Per call:**
- q = `kpi_score||3.8` (>5 → /20).
- s = `sop_score||6.4` (>7 → `/100*7`).
- empathy = `intel.empathy_score||3.5`.
- Resolved and FCR are the same test: `intel.fcr==='Yes'`, `intel.call_outcome==='Resolved'`, or KPI resolution = Yes.
- Duration: "m:s" parsed, otherwise 260 s.
- Agent sentiment buckets (as in section 4); customer sentiment from `sentiment||intel.sentiment` (default Positive).
- **Coaching priority:** Red if priority is red or q ≤ 2; Amber if yellow/amber or q ≤ 3; otherwise Green.
- Compliance: high vs low. High churn counted.
- **Campaign from filename substring:** 'nonplc' → NONPLC, 'plc' → PLC, 'broking' → BROKING, 'dealer' → DEALER; default NONPLC.

**UI:**
- Static hero ring (section 0.12). Resolution meter uses real resRate.
- Profile card: initial, name, empId, "{n} calls", "Sentiment: Excellent ({healthScore}/100)", static chips, AVG QUALITY box.
  - `healthScore = round((pro×100 + neu×50)/(pro+neu+unpro))`.
- **6 KPI cards:** AVG QUALITY /5, AVG SOP /7, AVG EMPATHY /5, RESOLUTION %, FCR RATE %, AVG DURATION.
- **Agent Sentiment card:** counts (widths static) and the health score.
- **Customer Sentiment card:** counts and "Positive Customer Rate" = `round(pos/n×100)` (fallback 58).
- **Risk & Coaching card:** Red Flag Calls, Yellow Priority, Green, High Compliance Risk, Low Compliance Risk, High Churn Risk.
- **Weekly KPI Score History:** Recharts area chart, toggles 12W / 26W / 52W.
  - Weekly KPI score = `clamp(round(avgQ×20), 40, 100)`.
  - Tooltip shows KPI /100, Quality /5, SOP /7 and call count.
  - Trend badge = last − first week ("↑ Trending Up", "↓ Trending Down", "Stable").
  - Empty weeks are synthetic.
- **Campaign Performance Breakdown table:** CAMPAIGN, TOTAL CALLS, AVG QUALITY (bar), RESOLUTION RATE, SHARE %.
- **Recent Calls table** (first 12 in context order, i.e. newest first):
  - Columns: PLAY, DATE, QA (`round(kpi_score×20)`), CAMPAIGN, INTENT (`call_intent`), DURATION, QUALITY, SOP, AGENT SENTIMENT (static), CUSTOMER SENTIMENT (static), COACHING (computed), COMPLIANCE.
  - Play: if `audio_url` is missing, it builds `https://tqwfjaqfrihvbauzvgjy.supabase.co/storage/v1/object/public/recordings/<basename(filename)>`.
  - Row click → `/call-records?id=<call_id>`.

---

## 6. Customer Analysis: `pages/CustomerAnalysis.jsx`

**Route and roles:** `/customer-analysis`, `customer_analysis.view` (all roles). The header labels it "Sentiment Analysis"; the subtitle calls it "Partner sentiment".

**Helpers:**
- `getCallSentiment`: `c.sentiment` (positive / negative / neutral substring); else KPI 15 (`kpi_id 15` or name 'Customer & Agent Sentiment') `.customer_sentiment`; default Neutral.
- `getAgentSentiment`: `agent_sentiment`, else KPI15 `.agent_sentiment`, default Professional.
- `getCoachingPriority`: column, then intel, default Amber.
- `getComplianceRisk`: column, then intel (ignoring 'None'); if still empty and `kpi_score ≤ 2` → High; else Low.
- `getCampaign`: `intel.campaign`; else the last filename segment without .mp3; default 'HIN_PRO_MUTUAL_FUND'.
- `getIntentCategory`: `call_intent → call_classification → intel.call_category → intel.category → 'Query'`.
- `getIntentDesc`: `intel.call_sub_topic → intel.call_topic → call_summary`.

**Sections:**
- **Hero "Customer Mood":**
  - Mostly Positive if pos ≥ neu and pos ≥ neg; Mostly Neutral if neu is the largest; otherwise "Needs Improvement".
  - "x% positive · y% negative"; large "z% felt neutral".
  - "WORTH A LOOK — Top reason for negative calls: {top intent} — N calls"; scrolls to the negative table.
- **3 cards:** Positive, Neutral, Negative (count, %, bar). The Negative card scrolls to the table.
- **Overall Distribution** stacked bar with legend.
- **Top Intents — Negative Calls:** custom horizontal bars by intent category. Shows top 8, with "View More" / "Show Top 8". Uses all calls if there are no negatives.
- **Customer Sentiment Trend Over Time:** line chart with Positive / Neutral / Negative per formatted date.
- **Agent Breakdown — Negative View table** (sorted by negative count descending):
  - Columns: AGENT (name, code), TOTAL, NEGATIVE, POSITIVE, NEUTRAL, NEGATIVE RATE %, RED COACHING (negative calls whose priority is Red).
  - Row click → `/agents/{code}`.
- **Negative Calls table:**
  - Columns: DATE, LEAD ID (button), MOBILE (unmasked), AGENT, CAMPAIGN, DURATION, INTENT (category + description), AGENT SENT. (Professional / Neutral / Unprofessional pill), COACHING pill, COMPLIANCE pill.
  - Row click → `/call-records?id=`.
- **Export Negative CSV:** `negative_sentiment_calls_export.csv`, columns Sr, Date, Lead ID, Mobile, Agent (code), Campaign, Duration, Intent, Agent Sentiment, Coaching, Compliance, Summary.
- Dead drill-down modal (section 0.13). `FALLBACK_CALLS` is defined but unused.

---

## 7. Compliance: `pages/Compliance.jsx`

**Route and roles:** `/compliance`, `compliance.view` (all roles).

**Stats:**
- Priority buckets from `coaching_priority||intel.coaching_priority||'green'`: red / amber or yellow / everything else green.
- ZTP: `ztp_violation === true`, `ztp_violation === 'Yes'`, or `intel.ztp_violation === 'Yes'`.
- High risk: compliance risk contains high or critical.
- **Compliance health % = round((total − highRisk − ztp)/total×100)**, shown as a "clean" ring (badge always "Healthy").
- Call distribution by priority: stacked bar plus Red "urgent review", Amber "monitor", Green "good standing" with counts and %.
- **Cards:**
  - ZTP violations (count, %; "Review →" switches the tab).
  - High-risk calls (count, %; "Review →").
  - **Agents to coach = red + amber call count**, shown "of {distinct agent_name count}". "Coach →" goes to /agents.

**Agents table:**
- Tabs: Agents {n} / ZTP violations {n} / High risk {n}. The tabs do not change the rows.
- Search box filters by agent name or code.
- **Per-agent values:**
  - `clean% = (calls − highRisk − ztp)/calls`.
  - **Status "Monitor" if clean < 75% or highRisk > 0**, otherwise "Good standing".
- Columns: AGENT (initials, name, status), CALLS, RISK MIX (orange = 100−clean, green = clean), ZTP, CLEAN %, VIEW (→ `/agents/{code}`).
- **"Export high risk" CSV:** `high_risk_compliance_report.csv`, columns Sr, Agent Name, Status, Total Calls, ZTP Violations, Clean %. It exports all agents, not just high-risk ones.

---

## 8. Inbound / Outbound: `pages/InboundOutbound.jsx`

**Route and roles:** `/inbound-outbound`, `inbound_outbound.view` (all roles).

**Taxonomy:**
- Inbound intents (19): Complaint, Query, SIP Start, SIP Stop, SIP Modify, Redemption, Purchase, KYC Initiation, KYC Update, eMandate Setup, eMandate Issue, Login/OTP Issue, ARN Transfer, Portfolio Review, Liquiloan Query, Stock Broking Query, Account Management, General Information, Callback Request.
- Outbound intents (10): SIP Review, Mandate Follow-up, Missed Payment, ARN Renewal, KYC Completion, Lapsed SIP, Campaign Outreach, Virtual RM Advisory, Lead Follow-up, Upsell/Cross-sell.

**Direction rule (`isCallInbound`):**
1. `call_direction` or `direction` column: contains 'out' → outbound; contains 'in' → inbound.
2. Otherwise `intel.direction`, same test.
3. Otherwise category (`call_intent||intel.call_category||intel.category`) in the inbound list → in; in the outbound list → out.
4. Otherwise inbound.

This differs from the Dashboard rule. The campaign-direction mapping in Admin is **not** used here.

**KPI cards:**
- Total, Inbound (% of total), Outbound (%).
- **Feedback Collected % = inbound calls with KPI 'IVR Transfer' = Yes ÷ inbound.**
- Avg Quality (In) and Avg Quality (Out) = `avg(kpi_score)`.

**Charts and panels:**
- **Call Type Split** donut (Inbound #7f56d9 / Outbound #f97316).
- **Tab panel (Inbound | Outbound):** Total Calls, Avg SOP, Avg Quality, Resolution % (KPI 'Call Resolution' = Yes); "Top Topics" bars by category with count and %.
- **IVR Feedback Deep Dive:**
  - "How IVR Feedback Works" accordion (static text: rating 1–4, where 1–2 positive, 3 neutral, 4 negative).
  - Among inbound calls with IVR = Yes: positive / neutral / negative from `sentiment` (or `intel.sentiment`) containing 'pos' or 'neg'.
  - Positive % defaults to 100 if nothing is rated.
  - The Neutral card shows only a %, no count.

---

## 9. Call Classification: `pages/CallClassification.jsx`

**Route and roles:** `/call-classification`, `classification.view` (all roles).

**Hierarchy: Classification → Topic → Sub-topic.**
- Classification from `call_classification || intel.call_category || intel.call_classification || 'query'`, lower-cased: contains intent or inquiry → **inquiry**; contains complaint → **complaint**; else **query**.
- Topic = `call_topic || intel.call_topic || 'Other'`.
- Sub-topic = `call_sub_topic || intel.call_sub_topic || call_summary || 'General Inquiry'`.

**UI:**
- **Hero:** most common topic overall, with count and % of total. "View Calls →" goes to `/call-records?topic=Account Management` (hardcoded topic, and the param is ignored anyway).
- **3 cards** (Inquiry purple, Query green, Complaint red), each with:
  - count, % of total.
  - "Top Topics" bars (width relative to the top topic). Clicking a bar toggles the sub-topic filter; "∨ All N topics" resets it.
  - "Common Sub-Topics" list: text, count, and % of **total calls**. Shows 8, with show-all toggle and a filter chip.
  - Clicking a sub-topic goes to `/call-records?topic=<topic>` (ignored).
  - **Export** button.
- **Export CSV:** `<type>_classification_export.csv`, columns Sr, Call ID, Classification, Topic (`call_intent` or 'Account Management'), Summary. **Exports all calls, regardless of type.**
- Header buttons: "Export All Calls"; Refresh (`window.location.reload()`).
- **Quick Filters** pills toggle `selectedFilter`; this only adds a ring highlight to the card.

---

## 10. Upload & Analyze: `pages/Upload.jsx`

**Route and roles:** `/upload`, `upload.analyze` (Admin only). Accepted: `.mp3,.wav,.ogg,.flac,.m4a,.webm,.aac,.zip`. The UI says max 200 MB but this is not enforced. Drag-and-drop or browse; only the first file is used.

**File-type banner:**
- ZIP: "Bulk ZIP Archive Detected — Batch Process".
- Single audio file: "~4 to 7 Mins".

**Flow for "Analyze Call":**
1. Checks `upload.analyze`.
2. Shows a 3-step progress UI (Uploading → Transcribing → Analyzing). Step timers: 3 s / 7 s for single files, 15 s / 45 s for ZIP.
3. `parseFilename(name)` extracts metadata.
4. **Single file:**
   - `calls.delete().eq('filename', name)` (pre-dedupe).
   - Polls every 3 s: `calls.select('*').eq('filename', name).gte('created_at', startTime).order('created_at',{ascending:false}).limit(1)`. The first hit shows the preview.
5. **ZIP:**
   - Direct `fetch POST https://tqwfjaqfrihvbauzvgjy.supabase.co/storage/v1/object/recordings/<filename>` with headers `Authorization: Bearer <SERVICE ROLE JWT hardcoded at Upload.jsx:322>`, `Content-Type: application/zip`, `x-upsert: true`.
   - `zipUrl = …/storage/v1/object/public/recordings/<filename>`.
   - **The service-role key in client code is critical: rotate it.**
6. **Webhook:** `POST https://studio.pucho.ai/api/v1/webhooks/GTHrKkSY3nJKz1lCywbN5/sync` as **multipart FormData**:
   - `recording`: the binary File, or `zipUrl` for ZIP
   - `zip_url`, `is_zip='true'` (ZIP only)
   - `filename`, `agent_code`, `mobile_number`, `call_id` (= leadId), `call_date` (YYYYMMDD), `campaign`, `coaching_flag`
7. **Response:**
   - ZIP: toast "Bulk ZIP processing complete!" and navigate to /call-records.
   - Single file: reads `body = json.body || json`. If `status==='success'` or `call_id` is present, builds a synthetic result from: `call_id, agent_name, duration, call_intent, kpi_score (default 95), quality_score (default 4), sop_score, call_summary, improvement_areas, coaching_priority, sentiment, compliance_risk, recommendations, status`.
   - If the webhook errors or times out, polling continues.
8. Hard timeout at 10 minutes: "taking longer than expected" toast.

**`AnalysisPreviewCard`:**
- "Analysis Complete" banner with filename.
- Cards: Agent, Campaign (parsed from filename), Duration, Intent.
- Quality Score = `quality_score || kpi_score/20`; SOP Score /7.
- KPI Quick View: Call Resolution (`intel.status`), First Call Res. (`intel.fcr`), CSAT (`intel.csat_indicator`), Compliance Risk, Coaching Priority, Sentiment.
- Call Summary and Improvement Areas.
- "View Full Analysis" → `/call-records?id=<call_id>`. "New Upload" resets.
- Static "How It Works" cards: Transcribe, Analyze, Score.

---

## 11. Admin Panel: `pages/AdminPanel.jsx`

**Route and roles:** `/admin-panel`, `users.view` (Admin, TL).

**Tabs, filtered by permission:** Team (`users.view`), Org Tree (`users.view`), Groups (`groups.view`), Campaigns (`campaigns.view`), Roles & Permissions (`roles.view` or `permissions.assign`).

**Load:**
- `agents.select('*')` and `profiles.select('*')`.
- Agents are deduped by email, keeping the one with the highest `total_calls`.
- **Users are built from profiles first.**
  - Role is ADMIN if `p.role` is SUPER_ADMIN or ADMIN, or the display name is 'Super Admin' / 'Admin'.
  - TEAM_LEADER if `p.role` is TEAM_LEADER or TEAM_LEAD, or the name is in the hardcoded list Kavya Gohil, Yuvraj Sanghavi, Devendra Sharma.
  - Otherwise Agent.
  - Group = `agent.team || 'General'`.
  - `supervisorId = agent.supervisor`. TLs default to the Admin UUID `3063d8cc-409d-41d8-bf6b-fa329dc29d0e`.
  - Status = `is_active`; agent codes from `agent_code`.
- Agents without a profile are added after that.
- Groups are derived from distinct `team` values. TL names are joined per group. Member count = agents per team.

**Team tab:**
- **Stat cards:** TOTAL USERS, ACTIVE, ROLES YOU CAN ASSIGN (static 3), GROUPS.
- Search (name or email), role filter (All / Admin / Team Lead / Agent), status filter (All / Active / Inactive). Refresh reloads the page.
- **"+ New User" form** (`users.create`):
  - Full name, Email, Temporary password, Role (Admin / Team Leader / Agent).
  - Group (from groupsList).
  - Reports to: Admin → none; Team Leader → pick an Admin user; Agent → pick a TL user.
  - Agent code(s) chips (type a code, then "+ Add").
  - Campaign section is a placeholder only.
- **Auto agent code** when none is given: Team Leader = next 2xxx (max+1, else 2007); Agent = next 1xxx (max+1, else 1097).
- **Create user writes:**
  - `agents.insert({agent_code: primaryCode, agent_name, email, team: group||'General', supervisor: reportsTo name string, is_active:true})`. Only the first code is stored.
  - `profiles.insert({email: lower, password_hash: password||'Pucho@2026' (plaintext), display_name, role: role.toUpperCase().replace(' ','_')})`.
  - `triggerCredentialsWebhook(...)` (section 0.9).
- "Users in your scope" list: initials, name, email · role, status chip. No edit, deactivate or delete actions exist.

**Org Tree tab:**
- Cards: PEOPLE IN YOUR ORG (non-admins), TOP OF TREE (number of roots, always 1).
- Info banner: "manager's data scope = everyone in their branch".
- **Tree:** the first Admin is the root; TLs are its children.
- Executives attach to a TL when `exec.supervisorId` (lower-cased) equals the TL's profile id, agentDbId, email or name. Otherwise they go to "Unassigned Executives".
- `teamSize` per node. Expand/collapse per node (Admin, Kavya, Yuvraj and Devendra expanded by default).
- Badges ADMIN / TL / EXECUTIVE; avatar colour hashed from the name.

**Groups tab:**
- Cards: TOTAL GROUPS, WITH A TEAM LEAD.
- Table: NAME, TEAM LEAD, MEMBERS, ACTIONS (Edit does nothing; Delete removes from local state only).
- "Add group" modal (`groups.create`): name plus multi-select of TLs. **Saved to local state only, no DB.**

**Campaigns tab:**
- **Storage:** Supabase Storage bucket `recordings`, object `config/campaigns.json`, an array of `{id:'cmp-<ts>', name, direction:'Inbound'|'Outbound'}`.
  - Read: `storage.from('recordings').download('config/campaigns.json')`.
  - Write: `.upload('config/campaigns.json', json, {upsert:true, contentType:'application/json'})`.
- **Defaults if the file is empty:**
  - Inbound: NONPLC, PLC, BROKING, TollFree.
  - Outbound: DEALERDE, CUSTOMERCARE, MFADVIS, VIRTUALRM.
- **Auto-discovery:** `calls.select('filename')`. Every parsed campaign not already in the list is added (upper-cased) with direction Outbound if in {CUSTOMERCARE, MFADVIS, VIRTUALRM, DEALERDE}, else Inbound. Discovered campaigns are not saved until the next write.
- Cards: TOTAL, INBOUND, OUTBOUND.
- Add form (`campaigns.create`): name plus direction. Duplicate names rejected case-insensitively.
- Table: NAME, DIRECTION badge, ACTIONS. Edit modal (`campaigns.edit`) for name and direction; Delete (`campaigns.delete`).

**Roles & Permissions tab:**
- Matrix of categories → permissions (name and code) × ADMIN / TEAM LEADER / EXECUTIVE, with a count per role.
- Clicking a toggle requires `permissions.assign`. It writes `localStorage.permissionsData`, dispatches `permissionsUpdated`, and broadcasts on `auralyze_permissions_channel`.
- **Not persisted to the DB**, so other users and browsers never see the change.

---

## 12. Profile: `pages/Profile.jsx`

**Route and roles:** `/profile`, no permission code (everyone).

**Load:**
- `profiles.select('*').eq('email', userEmail)` (or `.ilike('display_name', name)`), limit 1.
- `agents.select('*').or('agent_name.ilike.%name%,email.ilike.%email%')`, limit 1.
- `calls.select('filename, campaign_name').limit(200)`: callsCount, plus campaignsCount = distinct `campaign_name` (fallback 8).

**Left card:**
- Avatar, name, role badge (ADMIN / TEAM LEADER / EXECUTIVE / AGENT), Active, email.
- "Change avatar": the file is read as a base64 data URL and written with `profiles.update({avatar_url: base64, updated_at}).eq('email', email)` plus localStorage. Fires `userAvatarChanged`.
- Group/Team (`agent.team`, with role-based fallback).
- **Reports to (`formatReportsTo`):**
  - Admin and TL roles → 'Admin'.
  - Admin UUID or a value containing 'admin' → Admin.
  - Kavya UUID, or a value containing 'kavya', 'tl' or 'team', or any UUID or numeric value → 'Team Leader'.
  - Otherwise the raw string.
- Agent Dial Code, Member since (`profile.created_at`).

**Tabs:**
- **My Profile:**
  - Display name form: `profiles.update({display_name, updated_at}).eq('email')` plus localStorage and `userDisplayNameChanged`.
  - "Change password" button.
  - Email shown with a "verified in database" label.
- **My Workspace:** role card with description. Admin/TL get an "Admin Panel" button; Agents get "My Call Records". Cards: Group, Reports To, Database Campaigns. Role-specific access sentence.
- **Security:** Change password button.

**Change Password modal:**
- Email (read-only), new password, confirm (show/hide toggle).
- Validation: not empty, must match, at least 6 characters. **The old password is never checked.**
- Write: `profiles.update({password_hash: newPassword (plaintext), updated_at}).eq('email', email)`.

---

## 13. Login: `pages/Login.jsx`

Logic is in section 0.3.

UI: animated grid background with a mouse-following glow, 4 floating mascots, marketing copy ("Listen. Analyze. Elevate.", "15 KPIs + 7 SOP Checkpoints"), email/username and password fields (eye toggle), error banner, 3 quick-login tiles.

---

## 14. Unused components (logic for reference)

| Component | What it computes |
|---|---|
| **QuickSpotlight** | Groups by `agent_code`; quality as usual; `sop_score` default 5; red flag if `intel.coaching_priority` contains red. Cards for top and bottom agent by avg quality ("Top Performer" / "Needs Coaching") with Total Calls, Red Flags, SOP. Drill-down goes to /agents. |
| **PartnerSentiment** | Customer sentiment Positive/Neutral/Negative split with stacked bar and boxes. "Agent vs Partner" table, top 5 agents by volume: tone "% pro" (proxy `sop_score ≥ 5`), "% pos", "N neg". |
| **TeamSentiment** | Professional if `sop_score ≥ 5`, Neutral if 4, else Unprofessional (SOP proxy). Stacked bar and %; "View per agent" link. |
| **CampaignPerformanceTable** | Groups by `campaign_name || agent_name`. Columns Calls, Quality /5, SOP /7, Resolution % (green ≥50%), Avg Duration (m:s). Sorted by call count. |
| **AgentLeaderboard** | Groups by name; campaign from filename; Quality (raw `kpi_score`, labelled %), SOP, Empathy (default 4), Resolution %, sentiment P/N/Neg counts, red/yellow flags (priority, else kpi ≤2 or ≤3 / sop <5) linking to /compliance; "View Details". Sorted by quality. |
| **CallIntentChart** | Top 10 intents (`call_intent || intel.call_category || intel.callCategory`), horizontal bar with labels. |
| **RiskIndicatorsChart** | % ZTP (`intel.ztp_violation===true` or `intel.ztp==='Yes'`), % Escalated (`intel.status==='Escalated'` or resolution No), % High risk. Alert reference line at 10%. |
| **KnowledgeGapsChart** | Top 5 SOP names where `sop_results.result === 'Fail'`. |
| **CoachingPriorityChart** | Donut Green vs Red (`intel.coaching_priority` contains red or `intel.coaching_needed`), showing green %. |
| **TopAgentsChart** | Top 10 agents by avg quality (1–5). |
| **PerformanceKPIsChart** | % Resolution, FCR, "CSAT High" (quality ≥4 or ≥80), "Prof Agent" (no ZTP), Positive sentiment. Target reference line at 70%. |
| **QualityDistributionChart** | Scores 1–5 (always shows 3 and 4) with an average reference line on the nearest bar. |
| **StatCard / MiniStatCard / AlertCard** | Presentational only (AlertCard is used by the Dashboard). |

---

## 15. System Directory: `pages/SystemDirectory.jsx` (not routed, but contains business documentation)

Tabs: Index, System Flow, Validity Tiers, SOPs Explained, KPIs Explained, QA Health Score, Compliance & ZTP, Charts Directory, API Endpoints. All use live counts.

**System Flow (10 steps):** Upload → Sarvam STT → transcript stored → pre-LLM Python fast classifier → LLM (Claude / GPT-4o / Gemini / Groq, temperature 0) → JSON parse of 15 KPIs + 7 SOPs → saved to DB → API fetch → charts → fallback / quota guard.

**Validity tiers** (`intel.call_validity_tier || c.call_validity_tier`, default 5):

| Tier | Name | Scoring rule |
|---|---|---|
| 0 | Non-Contact | all SOP NA, Quality 3, Risk None |
| 1 | Disconnect | all SOP NA, Quality 3 |
| 2 | Hold-Drop | SOP 1–2 evaluated if there was a pre-hold exchange |
| 3 | Noise | all SOP NA, Quality 3 |
| 4 | Non-Evaluable | all SOP NA, Quality 3 |
| 5 | Valid | full scoring |

**SOP rules** (pass rate from `sop_results` by `sop_id`, excluding NA; colour ≥80 green, ≥50 yellow, else red):
- **1 Greeting:** never NA.
- **2 Caller Identified:** NA on DealerDesk/partner lines.
- **3 Hold Permission / 4 Hold Refresh:** NA if no hold or hold under 1 minute.
- **5 Closing:** NA if closing was unreachable.
- **6 Feedback IVR:** NA if closing is NA.
- **7 No Behaviour Issue:** never NA.
- Each applicable SOP is worth 1 point; NA is excluded.

**KPI value scales:**

| KPI | Values (score) |
|---|---|
| Resolution | Yes 100, No 0, Partial 60, NA 80 |
| FCR | Yes 100, No 0, Unknown 60 |
| AHT | Efficient 100, Acceptable 70, Inefficient 30 (5-min target) |
| Abandonment | Yes 0, No 100 |
| CSAT | High / Medium / Low / NA |
| Quality | 1–5, default 4 |
| Hold Compliance | — |
| IVR Transfer | Yes / No / Customer Refused / NA |
| Process Adherence | Full 100, Partial 60, None 0 |
| Escalation | — |
| Intent | fixed taxonomy, copied character for character |
| Service Level | needs telephony data |
| Repeat Call | needs CRM data |
| Query Raised | — |
| Sentiment | customer Pos/Neu/Neg; agent Prof/Neu/Unprof |

**QA Health formula:** as in section 1a, with the same tiers (80/60/45). Note that CSAT here is `csatHigh/total`, while the Dashboard uses `/rated`.

**ZTP — 5 scenarios (all High risk):**
1. Misleading investment advice / false guarantees
2. Customer data breach (PAN, mobile, balance shared with a third party)
3. Abusive or threatening language
4. Deliberate call abandonment (line drops never count)
5. Off-platform money solicitation

**Coaching priority rules:**
- **Red:** ZTP, Compliance High, rudeness, or 3+ SOP failures. Same-day 1:1, escalate to HR if ZTP.
- **Amber:** 1–2 SOP gaps, AHT well over target, or partial resolution. Review within 5 business days.
- **Green:** minor or no gaps. Positive reinforcement, monthly review.

**Charts Directory and API Endpoints:** document a FastAPI backend that does not exist in this repo (`/stats`, `/analytics/overview|trends|sop|call-type`, `/calls`, `/calls/{id}`, `/agents`).

---

## 16. Supabase inventory

### Tables and every operation

**`calls`**
- **Read:**
  - `select('*').order('created_at', desc)` (DataContext)
  - `select('*').eq('call_id').single()` (CallRecords)
  - `select('id, filename, call_id, created_at')` (dedupe)
  - `select('filename')` (AdminPanel campaign discovery)
  - `select('filename, campaign_name').limit(200)` (Profile)
  - `select('*').eq('filename').gte('created_at').order().limit(1)` (Upload polling)
- **Update:**
  - `{agent_name}` by `call_id` or by `agent_code` (CallTable)
  - `{intelligence}` by `call_id` (tags, CallDetailView)
- **Delete:**
  - `.in('id', [...])` (daily dedupe)
  - `.eq('filename')` (Upload pre-clean)
- **Realtime:** INSERT / UPDATE / DELETE.
- **Insert:** never from the frontend (the Pucho Studio workflow inserts).

**`agents`**
- `select('*')` (DataContext, AdminPanel)
- `select('*').or('agent_name.ilike…,email.ilike…').limit(1)` (Profile)
- `update({agent_name}).eq('agent_code')` (CallTable)
- `insert({agent_code, agent_name, email, team, supervisor, is_active})` (AdminPanel)

**`coaching_notes`**
- `select('*')`
- `insert({call_id, agent_code, note_text, note_type, created_by, is_resolved})`
- Realtime INSERT.

**`profiles`**
- `select('*').eq('email').single()` (Login)
- `select('*')` (AdminPanel)
- `select('*').eq('email') | ilike('display_name').limit(1)` (Profile)
- `select('*').eq('user_id').single()` (`lib/profile.js`, unused)
- `insert({email, password_hash, display_name, role})` (AdminPanel)
- `update({avatar_url, updated_at} | {display_name, updated_at} | {password_hash, updated_at}).eq('email')` (Profile)
- `update(updates).eq('user_id')` (`lib/profile.js`, unused)

**RPC:** none.

**Storage bucket `recordings`:**
- `config/campaigns.json`: download, and upload with upsert.
- ZIP upload via raw REST with the service-role key.
- Audio served publicly at `/storage/v1/object/public/recordings/<basename>` (AgentDetail fallback).

### Columns referenced

**`calls`** (in `schema.sql`):
`id, call_id, filename, call_date, agent_code, agent_name, mobile_number, duration, audio_url, sop_score, kpi_score, quality_score, sentiment, call_summary, cleaned_transcript, sop_results, kpi_results, intelligence, status, compliance_risk, churn_risk, call_classification, call_intent, language, improvement_areas, recommendations, coaching_note, coaching_priority, ztp_violation, call_topic, call_sub_topic, coaching_summary_note, bfsi_false_guarantee_flag, bfsi_risk_disclaimer_spoken, bfsi_identity_verified, bfsi_product_category, created_at`

Also in the schema but unused: `bfsi_compliance_score`, `note_type`, `processed_at`.

**`calls`** columns read by the code but **not in `schema.sql`**:
`campaign_name, agent_sentiment, call_direction, direction, duration_seconds, audio_duration, call_duration, call_validity_tier, coaching_reason, transcript, file_name, date`

**`calls.intelligence` JSON keys used:**
`campaign, coaching_flag, compliance_risk / complianceRisk, coaching_priority / coachingPriority, churn_risk / churnRisk, call_category / callCategory / category / call_classification, call_topic, call_sub_topic, ztp_violation / ztp, status ('Resolved' | 'Escalated'), resolution_status, fcr, call_outcome, sentiment, agent_sentiment, language, tags[], empathy_score, bfsi_* (4 fields), coaching_summary_note, nri_caller, repeat_caller, direction, summary, sop_score, kpi11_intent_detail, kpi{n}_note, ivr_rating, improvement_areas, call_summary, duration, customer_type, csat, csat_indicator, coaching_needed, call_validity_tier, recommendations`

**`calls.kpi_results`:** array of `{kpi_id, name, value, note, score, customer_sentiment, agent_sentiment, call_classification}`. Names matched exactly:
'Call Resolution', 'First Call Resolution', 'First Call Resolution (FCR)', 'AHT Efficiency', 'Call Abandonment', 'CSAT Indicator', 'Call Quality Score', 'Hold Compliance', 'IVR Transfer', 'Process Adherence', 'Escalation', 'Call Intent', 'Query Raised', 'Customer & Agent Sentiment'.

**`calls.sop_results`:** array of `{sop_id 1–7, name, result: 'Pass' | 'Fail' | 'NA' | 'Yes', note}`.

**`calls.cleaned_transcript`:** read as a string with lines "Speaker 1: …" (agent) and "Speaker 2: …" (customer).

**`agents`:** `id, agent_code, agent_name, email, team, supervisor` (free text: a user UUID, a TL name or an email), `is_active, total_calls`.
In the schema but unused: `avg_quality_score, avg_sop_score, compliance_rate, coaching_priority, created_at, updated_at`.

**`coaching_notes`:** `id, call_id, agent_code, note_text, note_type` ('Manager' | 'Advice' | 'Feedback' | 'Critical'; AI default 'AI_Coaching'), `created_by, created_at, is_resolved`.

**`profiles`:** `id, user_id, email, display_name, avatar_url` (stored as base64 data URL), `password_hash` (**plaintext**), `role` (ADMIN / SUPER_ADMIN / TEAM_LEAD / TEAM_LEADER / AGENT / EXECUTIVE), `created_at, updated_at`.

**RLS (`schema.sql`):** public select / insert / update policies on every table.

---

## 17. External URLs, webhooks and environment variables

**Environment variables (`.env`, `lib/supabase.js`):**
- `VITE_SUPABASE_URL` = `https://tqwfjaqfrihvbauzvgjy.supabase.co`
- `VITE_SUPABASE_ANON_KEY`

These are the only env vars.

**Hardcoded Supabase host:** `https://tqwfjaqfrihvbauzvgjy.supabase.co/storage/v1/object/recordings/<file>` (upload) and `/storage/v1/object/public/recordings/<file>` (public) in `pages/Upload.jsx:323,339` and `pages/AgentDetail.jsx:886`.

**Hardcoded Supabase service-role JWT:** `pages/Upload.jsx:322`. Treat it as compromised and rotate it.

**Webhooks:**
- Analysis: `https://studio.pucho.ai/api/v1/webhooks/GTHrKkSY3nJKz1lCywbN5/sync`. Multipart POST, sync response `{body:{status, call_id, agent_name, duration, call_intent, kpi_score, quality_score, sop_score, call_summary, improvement_areas, coaching_priority, sentiment, compliance_risk, recommendations}}`.
- Credentials email: `https://studio.pucho.ai/api/v1/webhooks/rurnAbexMc5khGoKhgvVW`. JSON POST, overridable via `localStorage.credentialsWebhookUrl`.

**Hardcoded identities and IDs:**
- Admin UUID `3063d8cc-409d-41d8-bf6b-fa329dc29d0e`
- Kavya TL UUID `69b905dc-5745-482d-90cc-a95f15a6eb49`
- Demo emails: `superadmin@pucho.ai`, `kavya.gohil@pucho.ai`, `darshan.soni@pucho.ai`
- TL names: Kavya Gohil, Yuvraj Sanghavi, Devendra Sharma
- Agent code map: darshan→1050, anurag→1018, dipti→1011, darshana→1028
- Default password `Pucho@2026`

**BroadcastChannel:** `auralyze_permissions_channel`. **Window events:** `permissionsUpdated`, `userAvatarChanged`, `userDisplayNameChanged`.

**Other files in the project root worth reading for the rebuild** (not part of `src`, not audited here):
- `schema.sql`, `DOCS_*.md`, `README.md`
- `code-tool-*.js`, `meta-prompt-ask-llm.js` (the Pucho Studio pipeline: taxonomy, prompt builder, validators)
- `call-analysis-prompt\`, `workflow\`