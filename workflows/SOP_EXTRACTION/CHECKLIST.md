# SOP_EXTRACTION — import checklist

1. Import `SOP_EXTRACTION.json`; confirm the Ask LLM (Pucho) and Document/OCR (ocr-analytics) piece props in Studio — the kit's
   prop schemas are from an older piece version.
2. Publish; set `WEBHOOK_SOP_EXTRACTION` in the V2 server env.
3. Payload: `org_id, document_id, kind, title, filename, mime, file_url (signed), document_text (txt/md only), company_name,
   industry, existing_rules[], app_url, inbound_token`.
4. Router: text sent by the app → Ask LLM; otherwise (PDF / scan / Word) → ocr-analytics askImage/PDF. One AI call per path,
   a CODE parse that keeps only declared keys, POST `/api/inbound/sop-extraction`, Return.
5. Test: upload a one-page PDF SOP under Company profile → SOPs & policies; the document turns **extracted** and rules appear
   under Scoring rules tagged "from <document>". UNVERIFIED: Word (.docx) reading by the OCR piece.
