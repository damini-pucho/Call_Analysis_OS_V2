# CALL_PROCESSING — import checklist

1. Import `CALL_PROCESSING.json` into Pucho Studio.
2. Speech Intelligence Pro (STT) and Ask LLM steps are copied verbatim from the V1 flow — no connection needed beyond V1's.
   (The kit's registry does not list `speech-intelligence-pro`; the V1 export is the ground truth.)
3. Publish; copy the webhook URL into the V2 server env as `WEBHOOK_CALL_PROCESSING`. Set `PUBLIC_APP_URL` to the app's https address.
4. The app sends, per recording: `org_id, call_row_id, filename, recording (signed URL), agent_code, agent_name, mobile_number,
   call_id, call_date, campaign, coaching_flag, direction, agents[], company_context{…}, app_url, inbound_token`.
5. Test once with a real upload; check in the app that the call turns **Analysed** (Studio "Succeeded" is not proof — check the DB).

## What changed from V1 (and only this)
- ZIP branch removed (the app unzips); Supabase "Search Rows" → `trigger.body.agents`.
- Pre-filter code: appends the org's rules (`company_rules_text`); V1 Supabase fallback URL/key blanked.
- Analysis prompts (main + retry): one "ORGANISATION RULES" section before TRANSCRIPT.
- Supabase "Create Row" → HTTP POST `{{app_url}}/api/inbound/calls` (`body.data`, Bearer `inbound_token`), plus Return steps;
  non-contact → `status: skipped`; STT not completed → `status: failed`.
- **V1 bug fixed:** the single-recording status router tested `step_3` (ZIP branch only); it now tests `step_15`.

Paths: 9–13 steps, ≤ 2 AI calls (repair + analysis, as V1), every path ends in a Return. V1's large CODE nodes and nested
router are kept as they were (owner: "flows do not change").
