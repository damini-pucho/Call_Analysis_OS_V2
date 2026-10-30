'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { signIn, signUp, signOut, currentUser, hashPassword, checkPassword, strongEnough, revokeSessions } from '@/lib/auth';
import { withOrg } from '@/lib/db';
import { seedOrganization } from '@/lib/tenant';
import { fieldErrors, type ActionResult } from '@/lib/action';
// @ts-ignore
import { INDUSTRY_KEYS } from '@/lib/catalog.mjs';

const SignIn = z.object({ email: z.string().trim().email('Enter a valid email').max(160), password: z.string().min(1, 'Enter your password').max(200) }).strict();

export async function signInAction(input: unknown): Promise<ActionResult> {
  const p = SignIn.safeParse(input);
  if (!p.success) return { ok: false, message: 'Please fix the highlighted fields.', fields: fieldErrors(p.error) };
  const r = await signIn(p.data.email, p.data.password);
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, data: { next: r.mustChange ? '/set-password' : '/overview' } };
}

const SignUp = z.object({
  orgName: z.string().trim().min(2, 'Organisation name is required').max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,48}$/, 'Use 2–49 lowercase letters, numbers or hyphens'),
  industry: z.string().refine((v) => INDUSTRY_KEYS.includes(v), 'Choose an industry'),
  name: z.string().trim().min(2, 'Your name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid work email').max(160),
  password: z.string().max(200),
  accept: z.literal(true, { errorMap: () => ({ message: 'Accept the terms to continue' }) }),
}).strict();

export async function signUpAction(input: unknown): Promise<ActionResult> {
  if (process.env.SIGNUP_OPEN === 'false') return { ok: false, message: 'New organisations are invite-only on this deployment.' };
  const p = SignUp.safeParse(input);
  if (!p.success) return { ok: false, message: 'Please fix the highlighted fields.', fields: fieldErrors(p.error) };
  const weak = strongEnough(p.data.password);
  if (weak) return { ok: false, message: weak, fields: { password: weak } };
  let r: Awaited<ReturnType<typeof signUp>>;
  try { r = await signUp(p.data, seedOrganization); }
  catch (e: any) {
    if (e?.code === '23505') return { ok: false, message: 'That email or workspace address was just taken. Try another.' };
    console.error('sign-up failed:', e?.message);
    return { ok: false, message: 'We could not create the workspace. Nothing was saved — please try again.' };
  }
  if (!r.ok) return { ok: false, message: r.message, fields: r.field ? { [r.field]: r.message } : undefined };
  return { ok: true, data: { next: '/company?welcome=1' } };
}

export async function signOutAction() {
  await signOut();
  redirect('/login');
}

const SetPw = z.object({ password: z.string().max(200), confirm: z.string().max(200) }).strict();
/** First sign-in with a temporary password (created by an admin): set your own. */
export async function setPasswordAction(input: unknown): Promise<ActionResult> {
  const u = await currentUser();
  if (!u) return { ok: false, message: 'Your session has ended. Sign in again.' };
  const p = SetPw.safeParse(input);
  if (!p.success) return { ok: false, message: 'Please fix the highlighted fields.' };
  const weak = strongEnough(p.data.password);
  if (weak) return { ok: false, message: weak, fields: { password: weak } };
  if (p.data.password !== p.data.confirm) return { ok: false, message: 'The passwords do not match.', fields: { confirm: 'Does not match' } };
  const hashed = await hashPassword(p.data.password);
  await withOrg(u.orgId, (db) => db.q('UPDATE users SET password_hash = $2, must_change_password = false, updated_at = now() WHERE id = $1 AND org_id = $3', [u.id, hashed, u.orgId]));
  await revokeSessions(u.orgId, u.id, true);
  return { ok: true, data: { next: '/overview' } };
}

const ChangePw = z.object({ current: z.string().min(1, 'Enter your current password').max(200), password: z.string().max(200), confirm: z.string().max(200) }).strict();
/** Profile → Security. V1 never checked the old password; V2 does, and ends every other session. */
export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const u = await currentUser();
  if (!u) return { ok: false, message: 'Your session has ended. Sign in again.' };
  const p = ChangePw.safeParse(input);
  if (!p.success) return { ok: false, message: 'Please fix the highlighted fields.', fields: fieldErrors(p.error) };
  const weak = strongEnough(p.data.password);
  if (weak) return { ok: false, message: weak, fields: { password: weak } };
  if (p.data.password !== p.data.confirm) return { ok: false, message: 'The passwords do not match.', fields: { confirm: 'Does not match' } };
  const row = await withOrg(u.orgId, (db) => db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [u.id]));
  if (!row || !(await checkPassword(row.password_hash, p.data.current))) return { ok: false, message: 'Your current password is incorrect.', fields: { current: 'Incorrect' } };
  const hashed = await hashPassword(p.data.password);
  await withOrg(u.orgId, (db) => db.q('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [u.id, hashed]));
  await revokeSessions(u.orgId, u.id, true);
  return { ok: true, message: 'Password changed. Other devices were signed out.' };
}
