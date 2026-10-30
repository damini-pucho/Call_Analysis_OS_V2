'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { signInAction, signUpAction, setPasswordAction } from '@/app/actions/auth';

function Password({ value, onChange, error, autoComplete, id = 'password', label = 'Password' }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required
          aria-invalid={error ? 'true' : undefined} className="field pr-11" />
        <button type="button" onClick={() => setShow((s) => !s)} className="icon-btn absolute right-1 top-1/2 -translate-y-1/2" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function BrandSide({ title, sub }) {
  return (
    <div className="hidden flex-col justify-center gap-6 md:flex">
      <img src="/brand/pucho-logo.png" alt="Pucho.ai" className="h-8 w-auto self-start dark:invert" />
      <div className="label" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>Call Analysis OS · Built on Pucho.ai</div>
      <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] text-ink lg:text-[56px]">{title}</h1>
      <p className="max-w-md text-[15px] leading-relaxed text-ink-3">{sub}</p>
      <div className="flex flex-wrap gap-2">
        <span className="badge badge-info nodot gap-1.5"><Sparkles size={13} />15 KPIs + 7 SOP checkpoints</span>
        <span className="badge badge-ok nodot gap-1.5"><ShieldCheck size={13} />Each organisation's data kept separate</span>
      </div>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter(); const sp = useSearchParams();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [fields, setFields] = useState({});
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await signInAction({ email, password });
    setBusy(false);
    if (!r.ok) { setErr(r.message); setFields(r.fields || {}); return; }
    const next = sp.get('next');
    router.replace(r.data.next === '/set-password' ? '/set-password' : next && next.startsWith('/') && !next.startsWith('//') ? next : r.data.next);
    router.refresh();
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink-2">Work email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required aria-invalid={fields.email ? 'true' : undefined} className="field" placeholder="you@company.com" />
        {fields.email && <p className="field-error">{fields.email}</p>}
      </div>
      <Password value={password} onChange={setPassword} error={fields.password} autoComplete="current-password" />
      {err && <div className="callout callout-bad" role="alert">{err}</div>}
      <button type="submit" className="btn btn-primary h-12 w-full text-[15px]" disabled={busy}>{busy ? 'Signing in…' : <>Sign in <ArrowRight size={16} /></>}</button>
      <p className="text-center text-[13px] text-ink-3">New to Call Analysis OS? <Link href="/signup" className="font-medium text-ink underline-offset-2 hover:underline">Create your organisation</Link></p>
    </form>
  );
}

const INDUSTRIES = [
  ['bfsi', 'Banking, financial services & insurance'], ['healthcare', 'Healthcare & clinics'], ['ecommerce', 'E-commerce & retail'],
  ['telecom', 'Telecom & utilities'], ['education', 'Education & ed-tech'], ['generic', 'Other / general contact centre'],
];
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function SignupForm() {
  const router = useRouter();
  const [f, setF] = useState({ orgName: '', slug: '', industry: 'bfsi', name: '', email: '', password: '', accept: false });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [fields, setFields] = useState({});
  const set = (k, v) => setF((x) => ({ ...x, [k]: v, ...(k === 'orgName' && !slugTouched ? { slug: slugify(v) } : {}) }));
  const strength = useMemo(() => { const p = f.password; let s = 0; if (p.length >= 10) s++; if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p) || p.length >= 14) s++; return s; }, [f.password]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await signUpAction(f);
    setBusy(false);
    if (!r.ok) { setErr(r.message); setFields(r.fields || {}); return; }
    router.replace(r.data.next); router.refresh();
  };
  const field = (k, label, props = {}) => (
    <div className={props.className}>
      <label htmlFor={k} className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</label>
      <input id={k} value={f[k]} onChange={(e) => { if (k === 'slug') setSlugTouched(true); set(k, e.target.value); }} aria-invalid={fields[k] ? 'true' : undefined} className="field" {...props} />
      {fields[k] ? <p className="field-error">{fields[k]}</p> : props.hint ? <p className="mt-1 text-[12px] text-ink-3">{props.hint}</p> : null}
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {field('orgName', 'Organisation name', { placeholder: 'Acme Advisors', autoComplete: 'organization', className: 'sm:col-span-2' })}
        {field('slug', 'Workspace address', { placeholder: 'acme-advisors', hint: 'Lowercase letters, numbers and hyphens.' })}
        <div>
          <label htmlFor="industry" className="mb-1.5 block text-[13px] font-medium text-ink-2">Industry</label>
          <select id="industry" value={f.industry} onChange={(e) => set('industry', e.target.value)} className="field">{INDUSTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <p className="mt-1 text-[12px] text-ink-3">Sets your starting SOPs, KPIs and intents.</p>
        </div>
        {field('name', 'Your name', { autoComplete: 'name' })}
        {field('email', 'Work email', { type: 'email', autoComplete: 'email' })}
      </div>
      <div>
        <Password value={f.password} onChange={(v) => set('password', v)} error={fields.password} autoComplete="new-password" />
        <div className="mt-2 flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i < strength ? (strength === 3 ? 'var(--ok)' : 'var(--warn)') : 'var(--surface-2)' }} />)}</div>
        <p className="mt-1 text-[12px] text-ink-3">At least 10 characters with letters and numbers.</p>
      </div>
      <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
        <input type="checkbox" className="check mt-0.5" checked={f.accept} onChange={(e) => set('accept', e.target.checked)} />
        <span>I agree to the terms of service and confirm I may upload these call recordings.</span>
      </label>
      {fields.accept && <p className="field-error">{fields.accept}</p>}
      {err && <div className="callout callout-bad" role="alert">{err}</div>}
      <button type="submit" className="btn btn-primary h-12 w-full text-[15px]" disabled={busy}>{busy ? 'Creating your workspace…' : <>Create organisation <ArrowRight size={16} /></>}</button>
      <p className="text-center text-[13px] text-ink-3">Already have an account? <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">Sign in</Link></p>
    </form>
  );
}

export function SetPasswordForm({ name }) {
  const router = useRouter();
  const [p, setP] = useState(''); const [c, setC] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [fields, setFields] = useState({});
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await setPasswordAction({ password: p, confirm: c });
    setBusy(false);
    if (!r.ok) { setErr(r.message); setFields(r.fields || {}); return; }
    router.replace('/overview'); router.refresh();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[14px] text-ink-3">Welcome{name ? `, ${name}` : ''}. You signed in with a temporary password — choose your own to continue.</p>
      <Password value={p} onChange={setP} error={fields.password} autoComplete="new-password" label="New password" />
      <Password value={c} onChange={setC} error={fields.confirm} autoComplete="new-password" id="confirm" label="Confirm new password" />
      {err && <div className="callout callout-bad" role="alert">{err}</div>}
      <button type="submit" className="btn btn-primary h-12 w-full" disabled={busy}>{busy ? 'Saving…' : 'Set password and continue'}</button>
    </form>
  );
}
