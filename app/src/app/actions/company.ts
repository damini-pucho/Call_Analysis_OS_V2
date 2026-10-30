'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guard, zId, zText, zReq } from '@/lib/action';
import { saveFile, signedFileUrl, readStored, DOC_EXT } from '@/lib/files';
import { callFlow } from '@/lib/flows';
import type { Db } from '@/lib/db';
// @ts-ignore
import { INDUSTRY_KEYS, templateRules } from '@/lib/catalog.mjs';

const opt = (max = 200) => zText(max).optional().transform((v) => (v ? v : null));

const Company = z.object({
  name: zReq('Company name', 120), legal_name: opt(160), industry: z.string().refine((v) => INDUSTRY_KEYS.includes(v), 'Choose an industry'),
  website: opt(200).refine((v) => !v || /^https?:\/\//.test(v), 'Start with https://'), email: opt(160).refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email'),
  phone: opt(40), address: opt(400), city: opt(80), country: opt(80), timezone: zReq('Time zone', 60), employees: opt(40), description: opt(2000),
}).strict();
export async function updateCompany(input: unknown) {
  return guard('company.edit', Company, input, async ({ db, user, data }) => {
    await db.q(`UPDATE organizations SET name=$2, legal_name=$3, industry=$4, website=$5, email=$6, phone=$7, address=$8, city=$9, country=$10, timezone=$11,
                employees=$12, description=$13, updated_at=now() WHERE id=$1`,
      [user.orgId, data.name, data.legal_name, data.industry, data.website, data.email, data.phone, data.address, data.city, data.country, data.timezone, data.employees, data.description]);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Company profile saved.' };
  }, 'company.update');
}

const Config = z.object({
  filename_pattern: zReq('Filename pattern', 120), aht_target_min: z.coerce.number().int().min(1, 'At least 1 minute').max(60, 'At most 60 minutes'),
  languages: z.array(z.string().trim().min(2).max(30)).max(20), pii_masking: z.boolean(),
  qa_weights: z.object({ quality: z.coerce.number().min(0).max(100), resolution: z.coerce.number().min(0).max(100), compliance: z.coerce.number().min(0).max(100), csat: z.coerce.number().min(0).max(100) })
    .refine((w) => w.quality + w.resolution + w.compliance + w.csat === 100, 'The four weights must add up to 100'),
  notify_on: z.object({ red_coaching: z.boolean(), ztp: z.boolean(), high_compliance: z.boolean(), training_assigned: z.boolean() }),
}).strict();
export async function updateConfig(input: unknown) {
  return guard('company.edit', Config, input, async ({ db, user, data }) => {
    await db.q("UPDATE organizations SET config = config || $2::jsonb, updated_at = now() WHERE id = $1", [user.orgId, JSON.stringify(data)]);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Industry configuration saved.' };
  }, 'company.config');
}

// ── campaigns (V1 kept these in a JSON file in a public storage bucket) ─────────────────────────────────────────────
const Campaign = z.object({
  id: zId.optional(), name: z.string().trim().toUpperCase().regex(/^[A-Z0-9_\-]{1,40}$/, 'Letters, numbers, - and _ only (as in the filename)'),
  full_name: opt(120), direction: z.enum(['Inbound', 'Outbound']), greeting_standard: opt(400), core_topics: z.array(z.string().trim().min(1).max(60)).max(40),
}).strict();
export async function saveCampaign(input: unknown) {
  return guard(['campaigns.create', 'campaigns.edit'], Campaign, input, async ({ db, user, data }) => {
    if (data.id) {
      if (!user.permissions.includes('campaigns.edit')) return { ok: false, message: 'Your role cannot edit campaigns.' };
      await db.q('UPDATE campaigns SET name=$3, full_name=$4, direction=$5, greeting_standard=$6, core_topics=$7 WHERE id=$1 AND org_id=$2',
        [data.id, user.orgId, data.name, data.full_name, data.direction, data.greeting_standard, data.core_topics]);
      await db.q('UPDATE calls SET direction = $3 WHERE org_id = $1 AND upper(campaign) = $2', [user.orgId, data.name, data.direction]);
    } else {
      if (!user.permissions.includes('campaigns.create')) return { ok: false, message: 'Your role cannot create campaigns.' };
      if (await db.one('SELECT 1 FROM campaigns WHERE org_id = $1 AND upper(name) = $2', [user.orgId, data.name])) return { ok: false, message: 'A campaign with this name exists.', fields: { name: 'Already exists' } };
      await db.q('INSERT INTO campaigns (org_id, name, full_name, direction, greeting_standard, core_topics) VALUES ($1,$2,$3,$4,$5,$6)',
        [user.orgId, data.name, data.full_name, data.direction, data.greeting_standard, data.core_topics]);
    }
    revalidatePath('/company');
    return { ok: true, message: 'Campaign saved.' };
  }, 'campaign.save');
}
export async function deleteCampaign(input: unknown) {
  return guard('campaigns.delete', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    await db.q('DELETE FROM campaigns WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    revalidatePath('/company');
    return { ok: true, message: 'Campaign deleted.' };
  }, 'campaign.delete');
}

// ── rules (SOP / KPI / compliance / policy / ZTP / intents) ─────────────────────────────────────────────────────────
const Rule = z.object({
  id: zId.optional(), kind: z.enum(['sop', 'kpi', 'policy', 'ztp', 'topic', 'compliance']), code: opt(20), title: zReq('Title', 200),
  description: opt(2000), na_rule: opt(400), pass_criteria: opt(400), severity: z.enum(['low', 'normal', 'high', 'critical']),
  weight: z.coerce.number().min(0).max(100), sort_order: z.coerce.number().int().min(0).max(1000), is_active: z.boolean(),
}).strict();
export async function saveRule(input: unknown) {
  return guard('company.edit', Rule, input, async ({ db, user, data }) => {
    if (data.id) {
      await db.q(`UPDATE sop_rules SET kind=$3, code=$4, title=$5, description=$6, na_rule=$7, pass_criteria=$8, severity=$9, weight=$10, sort_order=$11, is_active=$12, updated_at=now()
                  WHERE id=$1 AND org_id=$2`, [data.id, user.orgId, data.kind, data.code, data.title, data.description, data.na_rule, data.pass_criteria, data.severity, data.weight, data.sort_order, data.is_active]);
    } else {
      await db.q(`INSERT INTO sop_rules (org_id, kind, code, title, description, na_rule, pass_criteria, severity, weight, sort_order, is_active, source)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual')`, [user.orgId, data.kind, data.code, data.title, data.description, data.na_rule, data.pass_criteria, data.severity, data.weight, data.sort_order, data.is_active]);
    }
    revalidatePath('/company');
    return { ok: true, message: 'Rule saved. New calls are scored against it.' };
  }, 'rule.save');
}
export async function toggleRule(input: unknown) {
  return guard('company.edit', z.object({ id: zId, is_active: z.boolean() }).strict(), input, async ({ db, user, data }) => {
    await db.q('UPDATE sop_rules SET is_active = $3, updated_at = now() WHERE id = $1 AND org_id = $2', [data.id, user.orgId, data.is_active]);
    revalidatePath('/company');
    return { ok: true };
  }, 'rule.toggle');
}
export async function deleteRule(input: unknown) {
  return guard('company.edit', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    await db.q('DELETE FROM sop_rules WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    revalidatePath('/company');
    return { ok: true, message: 'Rule removed.' };
  }, 'rule.delete');
}
/** Add the industry template's rules that the organisation does not have yet (by kind + title). */
export async function applyTemplate(input: unknown) {
  return guard('company.edit', z.object({ industry: z.string().refine((v) => INDUSTRY_KEYS.includes(v)) }).strict(), input, async ({ db, user, data }) => {
    let added = 0;
    for (const r of templateRules(data.industry)) {
      const exists = await db.one('SELECT 1 FROM sop_rules WHERE org_id = $1 AND kind = $2 AND lower(title) = lower($3)', [user.orgId, r.kind, r.title]);
      if (exists) continue;
      await db.q(`INSERT INTO sop_rules (org_id, kind, code, title, description, na_rule, pass_criteria, severity, weight, sort_order, source)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'template')`, [user.orgId, r.kind, r.code, r.title, r.description, r.na_rule || null, r.pass_criteria || null, r.severity, r.weight, r.sort_order]);
      added++;
    }
    revalidatePath('/company');
    return { ok: true, message: added ? `${added} template rule(s) added.` : 'You already have every rule in this template.' };
  }, 'rule.template');
}

// ── SOP / policy documents → the extraction flow ────────────────────────────────────────────────────────────────────
async function sendForExtraction(db: Db, orgId: string, docId: string) {
  const d = await db.one<any>(`SELECT d.id, d.kind, d.title, d.file_id, f.filename, f.mime, f.storage_path, f.size_bytes FROM company_documents d JOIN files f ON f.id = d.file_id WHERE d.id = $1 AND d.org_id = $2`, [docId, orgId]);
  if (!d) return { status: 'failed' as const, detail: 'Document not found.' };
  const org = await db.one<any>('SELECT name, industry FROM organizations WHERE id = $1', [orgId]);
  const existing = await db.q('SELECT kind, title FROM sop_rules WHERE org_id = $1 AND is_active', [orgId]);
  // plain-text documents go to the flow as text (the flow reads PDFs and scans through its document piece instead)
  const document_text = /\.(txt|md)$/i.test(d.filename) && Number(d.size_bytes) <= 200_000 ? (await readStored(d.storage_path)).toString('utf8') : '';
  const r = await callFlow(db, orgId, 'sop_extraction', d.id, {
    document_id: d.id, kind: d.kind, title: d.title, filename: d.filename, mime: d.mime, file_url: signedFileUrl(d.file_id),
    document_text, company_name: org?.name, industry: org?.industry, existing_rules: existing,
  });
  await db.q('UPDATE company_documents SET status = $2, status_reason = $3 WHERE id = $1', [d.id, r.status === 'sent' ? 'extracting' : 'uploaded', r.status === 'sent' ? null : r.detail]);
  return r;
}

export async function uploadDocument(form: FormData) {
  const file = form.get('file');
  const input = { kind: form.get('kind'), title: form.get('title'), effective_from: form.get('effective_from') || undefined };
  const Doc = z.object({ kind: z.enum(['sop', 'policy']), title: zReq('Title', 160), effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();
  return guard('documents.upload', Doc, input, async ({ db, user, data }) => {
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose a file to upload.', fields: { file: 'Required' } };
    if (!DOC_EXT.test(file.name)) return { ok: false, message: 'Upload a PDF, Word, text or Markdown file.', fields: { file: 'Unsupported type' } };
    if (file.size > 25 * 1024 * 1024) return { ok: false, message: 'Documents are limited to 25 MB.', fields: { file: 'Too large' } };
    const f = await saveFile(db, user.orgId, user.id, data.kind, file.name, Buffer.from(await file.arrayBuffer()));
    const doc = await db.one<{ id: string }>('INSERT INTO company_documents (org_id, kind, title, file_id, effective_from, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [user.orgId, data.kind, data.title, f.id, data.effective_from || null, user.id]);
    const r = await sendForExtraction(db, user.orgId, doc!.id);
    revalidatePath('/company');
    return r.status === 'sent'
      ? { ok: true, message: 'Uploaded. Rules will appear here once extraction finishes.' }
      : { ok: true, message: `Uploaded and stored. Not extracted yet: ${r.detail}` };
  }, 'document.upload');
}
export async function reextractDocument(input: unknown) {
  return guard('documents.upload', z.object({ id: zId }).strict(), input, async ({ db, user, data }) => {
    const r = await sendForExtraction(db, user.orgId, data.id);
    revalidatePath('/company');
    return r.status === 'sent' ? { ok: true, message: 'Sent for extraction.' } : { ok: false, message: r.detail || 'Could not send.' };
  }, 'document.reextract');
}
export async function deleteDocument(input: unknown) {
  return guard('documents.upload', z.object({ id: zId, keepRules: z.boolean() }).strict(), input, async ({ db, user, data }) => {
    if (!data.keepRules) await db.q('DELETE FROM sop_rules WHERE org_id = $1 AND document_id = $2', [user.orgId, data.id]);
    await db.q('DELETE FROM company_documents WHERE id = $1 AND org_id = $2', [data.id, user.orgId]);
    revalidatePath('/company');
    return { ok: true, message: 'Document removed.' };
  }, 'document.delete');
}

export async function uploadLogo(form: FormData) {
  const file = form.get('file');
  return guard('company.edit', z.object({}).strict(), {}, async ({ db, user }) => {
    if (!(file instanceof File) || !/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 2 * 1024 * 1024) return { ok: false, message: 'Upload a PNG, JPG or WebP under 2 MB.' };
    const f = await saveFile(db, user.orgId, user.id, 'logo', file.name, Buffer.from(await file.arrayBuffer()));
    await db.q('UPDATE organizations SET logo_file_id = $2 WHERE id = $1', [user.orgId, f.id]);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Logo updated.' };
  }, 'company.logo');
}
