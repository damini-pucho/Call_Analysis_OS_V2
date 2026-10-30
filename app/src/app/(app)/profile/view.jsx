'use client';
// Profile & security — V1 Profile: name, photo, workspace facts, and a password change that checks the current password.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Mail, ShieldCheck, Building2, UsersRound, UserCheck, Hash, CalendarDays, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card, Field, Input, Button, Avatar, MetaRow, Badge } from '@/components/ui';
import { useUser } from '@/components/providers';
import { updateProfile, uploadAvatar } from '@/app/actions/misc';
import { changePasswordAction } from '@/app/actions/auth';

const ACCESS = { all: 'You can see every call, agent and customer in the organisation.', team: 'You can see the calls of the agents in your team.', own: 'You can see your own calls, scores, coaching and training.' };

export default function ProfileView({ me, avatar }) {
  const user = useUser(); const router = useRouter(); const photo = useRef(null);
  const [name, setName] = useState(user.name); const [phone, setPhone] = useState(me.phone || ''); const [busy, setBusy] = useState(false); const [errs, setErrs] = useState({});
  const [pw, setPw] = useState({ current: '', password: '', confirm: '' }); const [show, setShow] = useState(false); const [pwBusy, setPwBusy] = useState(false); const [pwErrs, setPwErrs] = useState({});
  const save = async () => { setBusy(true); const r = await updateProfile({ name, phone }); setBusy(false); setErrs(r.fields || {}); r.ok ? toast.success(r.message) : toast.error(r.message); router.refresh(); };
  const onPhoto = async (f) => { if (!f) return; const fd = new FormData(); fd.append('file', f); const r = await uploadAvatar(fd); r.ok ? toast.success(r.message) : toast.error(r.message); router.refresh(); };
  const changePw = async () => { setPwBusy(true); const r = await changePasswordAction(pw); setPwBusy(false); setPwErrs(r.fields || {}); if (r.ok) { toast.success(r.message); setPw({ current: '', password: '', confirm: '' }); } else toast.error(r.message); };
  return (
    <div className="space-y-5">
      <PageHeader title="Profile & security" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <div className="flex flex-col items-center text-center">
            <div className="relative"><Avatar name={user.name} size={88} src={avatar} />
              <button onClick={() => photo.current?.click()} className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-2 hover:bg-surface-2" aria-label="Change photo"><Camera size={15} /></button>
              <input ref={photo} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} /></div>
            <h2 className="mt-3 text-ink">{user.name}</h2>
            <Badge className="mt-1" dot={false} tone={user.scope === 'all' ? 'info' : null}>{user.roleName}</Badge>
          </div>
          <div className="mt-5 border-t border-line pt-3">
            <MetaRow icon={Mail} label="Email">{user.email}</MetaRow>
            <MetaRow icon={Building2} label="Organisation">{user.orgName}</MetaRow>
            <MetaRow icon={UsersRound} label="Group">{me.group_name}</MetaRow>
            <MetaRow icon={UserCheck} label="Reports to">{me.reports_to}</MetaRow>
            <MetaRow icon={Hash} label="Agent code">{user.agentCode}</MetaRow>
            <MetaRow icon={CalendarDays} label="Member since">{me.created_at ? new Date(me.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null}</MetaRow>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="My profile">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name" error={errs.name}><Input value={name} onChange={(e) => setName(e.target.value)} error={errs.name} /></Field>
              <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            </div>
            <div className="mt-4 flex justify-end"><Button variant="primary" loading={busy} onClick={save}>Save</Button></div>
          </Card>
          <Card title="My workspace">
            <p className="text-[14px] text-ink-2">{ACCESS[user.scope]}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {user.permissions.includes('users.view') && <Link href="/team" className="btn btn-secondary btn-sm">Team & roles</Link>}
              {user.agentCode && <Link href={`/agents/${encodeURIComponent(user.agentCode)}`} className="btn btn-secondary btn-sm">My QA profile</Link>}
              <Link href="/calls" className="btn btn-secondary btn-sm">{user.scope === 'own' ? 'My calls' : 'Calls'}</Link>
            </div>
          </Card>
          <Card title={<span className="flex items-center gap-2"><ShieldCheck size={16} />Change password</span>} sub="Other devices are signed out when you change it.">
            <div className="grid gap-4 sm:grid-cols-3">
              {[['current', 'Current password', 'current-password'], ['password', 'New password', 'new-password'], ['confirm', 'Confirm new password', 'new-password']].map(([k, l, ac]) => (
                <Field key={k} label={l} error={pwErrs[k]}><Input type={show ? 'text' : 'password'} autoComplete={ac} value={pw[k]} onChange={(e) => setPw({ ...pw, [k]: e.target.value })} error={pwErrs[k]} /></Field>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? <EyeOff size={14} /> : <Eye size={14} />}{show ? 'Hide' : 'Show'} passwords</button>
              <Button variant="primary" loading={pwBusy} disabled={!pw.current || !pw.password} onClick={changePw}>Change password</Button>
            </div>
            <p className="mt-2 text-[12px] text-ink-3">At least 10 characters with letters and numbers.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
