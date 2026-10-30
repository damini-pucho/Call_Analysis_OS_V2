// src/lib/notify.ts — in-app notifications, mirrored to email through the email flow (the V1 "user create and send email"
// flow, same payload shape) when it is connected. Email failures are recorded on the notification, never hidden.
import 'server-only';
import type { Db } from './db';
import { callFlow, publicAppUrl } from './flows';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function emailHtml(title: string, lines: string[], cta?: { label: string; url: string }) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #E7E5E0;border-radius:16px;padding:28px;background:#fff">
  <p style="color:#676F77;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 6px">Call Analysis OS</p>
  <h1 style="color:#141413;font-size:20px;margin:0 0 16px">${esc(title)}</h1>
  ${lines.map((l) => `<p style="color:#45413A;font-size:14px;line-height:1.5;margin:0 0 10px">${l}</p>`).join('')}
  ${cta ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#141413;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-size:14px">${esc(cta.label)}</a></p>` : ''}
  <p style="color:#676F77;font-size:12px;border-top:1px solid #E7E5E0;padding-top:14px;margin-top:20px">Powered by Pucho.ai</p></div>`;
}

/** Same top-level fields as V1's USER_CREDENTIALS_DISPATCHED payload, so the existing email flow sends it unchanged. */
export async function sendEmail(db: Db, orgId: string, refId: string | null, msg: { event: string; to: string; name: string; subject: string; html: string; text: string; extra?: Record<string, unknown> }) {
  return callFlow(db, orgId, 'email', refId, {
    event: msg.event, timestamp: new Date().toISOString(), to: msg.to, recipient_email: msg.to, recipient_name: msg.name,
    subject: msg.subject, body: msg.html, html: msg.html, body_html: msg.html, body_text: msg.text,
    // the V1 email flow sends to recipient.email with email_content.body_text — every message carries both
    recipient: { name: msg.name, email: msg.to },
    email_content: { subject: msg.subject, body: msg.html, html: msg.html, body_html: msg.html, body_text: msg.text }, ...(msg.extra || {}),
  });
}

export async function sendCredentials(db: Db, orgId: string, u: { id: string; name: string; email: string; role: string; agentCode?: string | null; reportsTo?: string | null; orgName: string; password: string }) {
  const loginUrl = `${publicAppUrl()}/login`;
  const subject = `Welcome to ${u.orgName} on Call Analysis OS — your sign-in`;
  const text = `Hello ${u.name},\n\nAn account was created for you at ${u.orgName} with the role ${u.role}.\nSign in: ${loginUrl}\nEmail: ${u.email}\nTemporary password: ${u.password}\n\nYou will be asked to set your own password at first sign-in.`;
  const html = emailHtml(`Hello ${u.name}`, [
    `An account was created for you at <strong>${esc(u.orgName)}</strong> with the role <strong>${esc(u.role)}</strong>.`,
    `Email: <strong>${esc(u.email)}</strong><br/>Temporary password: <code>${esc(u.password)}</code>${u.agentCode ? `<br/>Agent code: <strong>${esc(u.agentCode)}</strong>` : ''}`,
    'You will be asked to set your own password the first time you sign in.',
  ], { label: 'Sign in', url: loginUrl });
  return sendEmail(db, orgId, u.id, {
    event: 'USER_CREDENTIALS_DISPATCHED', to: u.email, name: u.name, subject, html, text,
    extra: {
      recipient: { name: u.name, email: u.email, role: u.role, agent_code: u.agentCode || 'N/A', reports_to: u.reportsTo || 'Admin' },
      credentials: { login_url: loginUrl, username: u.email, temporary_password: u.password },
    },
  });
}

/** Notify people inside one organisation; emails each when the email flow is connected. */
export async function notify(db: Db, orgId: string, userIds: string[], n: { kind: string; title: string; body: string; link?: string }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  for (const uid of ids) {
    const u = await db.one<{ email: string; name: string; is_active: boolean }>('SELECT email, name, is_active FROM users WHERE id = $1 AND org_id = $2', [uid, orgId]);
    if (!u?.is_active) continue;
    const row = await db.one<{ id: string }>('INSERT INTO notifications (org_id, user_id, kind, title, body, link) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [orgId, uid, n.kind, n.title, n.body, n.link || null]);
    const url = n.link ? `${publicAppUrl()}${n.link}` : publicAppUrl();
    const r = await sendEmail(db, orgId, row!.id, { event: 'MANAGER_NOTIFICATION', to: u.email, name: u.name, subject: n.title,
      html: emailHtml(n.title, [esc(n.body)], { label: 'Open in Call Analysis OS', url }), text: `${n.title}\n\n${n.body}\n\n${url}` });
    await db.q('UPDATE notifications SET email_status = $2 WHERE id = $1', [row!.id, r.status === 'sent' ? 'sent' : r.status === 'not_connected' ? 'not_connected' : 'failed']);
  }
}

/** The managers of an agent: their supervisor, the leads of their group, and every user whose role sees the whole org and can assign training. */
export async function managersOf(db: Db, orgId: string, agentCode: string): Promise<string[]> {
  const rows = await db.q<{ id: string }>(
    `SELECT a.supervisor_id AS id FROM agents a WHERE a.org_id = $1 AND a.agent_code = $2 AND a.supervisor_id IS NOT NULL
     UNION SELECT unnest(g.lead_ids) FROM agents a JOIN groups g ON g.id = a.group_id WHERE a.org_id = $1 AND a.agent_code = $2
     UNION SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.org_id = $1 AND u.is_active AND r.scope = 'all' AND 'training.assign' = ANY(r.permissions)`,
    [orgId, agentCode]);
  return rows.map((r) => r.id);
}
