'use client';
// Team & roles — V1 AdminPanel, persisted: users (create with credentials email, edit, deactivate, reset password), agents,
// org tree, groups (V1 kept them in memory), roles and the permission matrix (V1 kept it in one browser's localStorage).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Network, UsersRound, ShieldCheck, Plus, Pencil, Trash2, KeyRound, UserX, UserCheck, Search, ChevronRight, ChevronDown, Copy, Headset } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card, Tabs, Badge, Empty, Button, Modal, Field, Input, Textarea, Select, Switch, Avatar, Kpi, Callout, cn } from '@/components/ui';
import { useCan } from '@/components/providers';
import { createUser, updateUser, setUserActive, resetUserPassword, saveGroup, deleteGroup, saveRole, deleteRole, saveAgent } from '@/app/actions/team';
// @ts-ignore
import { PERMISSION_GROUPS } from '@/lib/catalog.mjs';

const SCOPES = { all: 'Whole organisation', team: 'Their team', own: 'Own calls only' };

function useRun() {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  return { busy, run: async (fn, after) => { setBusy(true); const r = await fn(); setBusy(false); if (r.ok) { if (r.data?.tempPassword) after?.(r); else toast.success(r.message || 'Saved'); router.refresh(); if (!r.data?.tempPassword) after?.(r); } else toast.error(r.message); return r; } };
}

export default function TeamView({ users, roles, groups, agents, me }) {
  const can = useCan();
  const tabs = [
    can('users.view') && { key: 'users', label: 'Team', icon: Users, count: users.length },
    can('users.view') && { key: 'agents', label: 'Agents', icon: Headset, count: agents.length },
    can('users.view') && { key: 'tree', label: 'Org tree', icon: Network },
    can('groups.view') && { key: 'groups', label: 'Groups', icon: UsersRound, count: groups.length },
    (can('roles.view') || can('permissions.assign')) && { key: 'roles', label: 'Roles & permissions', icon: ShieldCheck, count: roles.length },
  ].filter(Boolean);
  const [tab, setTab] = useState(tabs[0]?.key);
  const [temp, setTemp] = useState(null);
  return (
    <div className="space-y-5">
      <PageHeader title="Team & roles" sub="People in your organisation, who they report to, and what each role can see and do." />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'users' && <UsersTab users={users} roles={roles} groups={groups} me={me} onTemp={setTemp} />}
      {tab === 'agents' && <AgentsTab agents={agents} users={users} groups={groups} />}
      {tab === 'tree' && <TreeTab users={users} />}
      {tab === 'groups' && <GroupsTab groups={groups} users={users} />}
      {tab === 'roles' && <RolesTab roles={roles} />}
      <Modal open={!!temp?.data?.tempPassword} onClose={() => setTemp(null)} title="Temporary password" sub="The email flow is not connected, so share this securely. It is shown once and must be changed at first sign-in." footer={<Button variant="primary" onClick={() => setTemp(null)}>Done</Button>}>
        {temp?.data?.tempPassword && <><Callout tone="warn">{temp.message}</Callout><div className="mt-3 flex gap-2"><Input readOnly value={temp.data.tempPassword} className="font-mono" /><Button onClick={() => { navigator.clipboard.writeText(temp.data.tempPassword); toast.success('Copied'); }} aria-label="Copy password"><Copy size={15} /></Button></div></>}
      </Modal>
    </div>
  );
}

function UsersTab({ users, roles, groups, me, onTemp }) {
  const can = useCan(); const { run } = useRun();
  const [q, setQ] = useState(''); const [role, setRole] = useState(''); const [status, setStatus] = useState(''); const [edit, setEdit] = useState(null);
  const rows = users.filter((u) => (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())) && (!role || u.role_id === role) && (!status || (status === 'active') === u.is_active));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Users" value={users.length} /><Kpi label="Active" value={users.filter((u) => u.is_active).length} /><Kpi label="Roles" value={roles.length} /><Kpi label="Groups" value={groups.length} />
      </div>
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <label className="relative w-full sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" /><Input className="field-sm pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <Select className="field-sm w-auto" value={role} onChange={(e) => setRole(e.target.value)} placeholder="All roles" options={roles.map((r) => ({ value: r.id, label: r.name }))} />
          <Select className="field-sm w-auto" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Any status" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          {can('users.create') && <Button size="sm" variant="primary" className="ml-auto" onClick={() => setEdit({})}><Plus size={14} />New user</Button>}
        </div>
        {!rows.length ? <Empty icon={Users} title="No users match" /> : (
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Person</th><th>Role</th><th>Reports to</th><th>Group</th><th>Agent code</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.id}>
                <td><div className="flex items-center gap-2.5"><Avatar name={u.name} size={30} /><div><div className="font-medium text-ink">{u.name}{u.id === me && <span className="ml-1.5 text-[12px] text-ink-3">(you)</span>}</div><div className="text-[12px] text-ink-3">{u.email}</div></div></div></td>
                <td><Badge dot={false} tone={u.scope === 'all' ? 'info' : null}>{u.role_name}</Badge></td><td>{u.reports_to_name || '—'}</td><td>{u.group_name || '—'}</td><td className="tabular-nums">{u.agent_codes || '—'}</td>
                <td className="whitespace-nowrap text-ink-3">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-GB') : u.must_change_password ? 'Invited' : 'Never'}</td>
                <td><Badge tone={u.is_active ? 'ok' : 'bad'}>{u.is_active ? 'Active' : 'Inactive'}</Badge></td>
                <td className="whitespace-nowrap text-right">
                  {can('users.edit') && <button className="icon-btn" onClick={() => setEdit(u)} aria-label={`Edit ${u.name}`}><Pencil size={15} /></button>}
                  {can('users.edit') && u.id !== me && <button className="icon-btn" onClick={() => confirm(`Reset ${u.name}'s password? They will be signed out.`) && run(() => resetUserPassword({ id: u.id }), onTemp)} aria-label="Reset password"><KeyRound size={15} /></button>}
                  {can('users.delete') && u.id !== me && <button className="icon-btn" onClick={() => confirm(u.is_active ? `Deactivate ${u.name}? They are signed out everywhere.` : `Reactivate ${u.name}?`) && run(() => setUserActive({ id: u.id, active: !u.is_active }))} aria-label={u.is_active ? 'Deactivate' : 'Reactivate'}>{u.is_active ? <UserX size={15} /> : <UserCheck size={15} />}</button>}
                </td>
              </tr>))}</tbody></table></div>
        )}
      </div>
      <UserModal u={edit} onClose={() => setEdit(null)} roles={roles} groups={groups} users={users} onTemp={onTemp} />
    </div>
  );
}

function UserModal({ u, onClose, roles, groups, users, onTemp }) {
  const { busy, run } = useRun();
  const [f, setF] = useState(null); const [errs, setErrs] = useState({}); const [code, setCode] = useState('');
  const key = u ? u.id || 'new' : null;
  if (u && f?.__k !== key) setF({ __k: key, name: u.name || '', email: u.email || '', role_id: u.role_id || roles.find((r) => r.key === 'executive')?.id || roles[0]?.id || '', reports_to: u.reports_to || '', group_id: u.group_id || '', agent_codes: [] });
  if (!u || !f) return null;
  const close = () => { setF(null); setErrs({}); onClose(); };
  const role = roles.find((r) => r.id === f.role_id);
  const save = async () => {
    const { __k, ...d } = f;
    const r = await run(() => (u.id ? updateUser({ id: u.id, name: d.name, role_id: d.role_id, reports_to: d.reports_to, group_id: d.group_id }) : createUser(d)), (res) => { if (res.data?.tempPassword) onTemp(res); close(); });
    if (!r.ok) setErrs(r.fields || {});
  };
  const managers = users.filter((x) => x.id !== u.id && x.is_active && x.scope !== 'own');
  return (
    <Modal open onClose={close} title={u.id ? `Edit ${u.name}` : 'New user'} sub={u.id ? u.email : 'They get an email with a temporary password (changed at first sign-in).'} width={600}
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{u.id ? 'Save' : 'Create user'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errs.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errs.name} /></Field>
        <Field label="Email" error={errs.email}><Input type="email" value={f.email} disabled={!!u.id} onChange={(e) => setF({ ...f, email: e.target.value })} error={errs.email} /></Field>
        <Field label="Role" error={errs.role_id} hint={role ? `${SCOPES[role.scope]} · ${role.permissions.length} permissions` : ''}><Select value={f.role_id} onChange={(e) => setF({ ...f, role_id: e.target.value })} options={roles.map((r) => ({ value: r.id, label: r.name }))} error={errs.role_id} /></Field>
        <Field label="Reports to" error={errs.reports_to}><Select value={f.reports_to} onChange={(e) => setF({ ...f, reports_to: e.target.value })} placeholder="No one" options={managers.map((m) => ({ value: m.id, label: `${m.name} · ${m.role_name}` }))} /></Field>
        <Field label="Group"><Select value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })} placeholder="No group" options={groups.map((g) => ({ value: g.id, label: g.name }))} /></Field>
        {!u.id && (
          <Field label="Agent code(s)" hint={role?.scope === 'own' ? 'Leave empty to get the next free 1xxx code' : 'Only if this person takes calls'} error={errs.agent_codes}>
            <div className="flex gap-2"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 1052" onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) { e.preventDefault(); setF({ ...f, agent_codes: [...new Set([...f.agent_codes, code.trim()])] }); setCode(''); } }} />
              <Button onClick={() => { if (code.trim()) { setF({ ...f, agent_codes: [...new Set([...f.agent_codes, code.trim()])] }); setCode(''); } }}>Add</Button></div>
            {f.agent_codes.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{f.agent_codes.map((c) => <span key={c} className="badge nodot gap-1">{c}<button onClick={() => setF({ ...f, agent_codes: f.agent_codes.filter((x) => x !== c) })} aria-label={`Remove ${c}`}>×</button></span>)}</div>}
          </Field>
        )}
      </div>
    </Modal>
  );
}

function AgentsTab({ agents, users, groups }) {
  const can = useCan(); const [edit, setEdit] = useState(null);
  return (
    <Card title="Agents" sub="The agent codes on recordings. Link a code to a user so they see their own calls." pad={false} action={can('agents.edit') && <Button size="sm" variant="primary" onClick={() => setEdit({})}><Plus size={14} />Add agent</Button>}>
      {!agents.length ? <Empty icon={Headset} title="No agents yet">Agents are created from the agent code on uploaded recordings, or added here.</Empty> : (
        <div className="mt-3 overflow-x-auto"><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Dialer IDs</th><th>Linked user</th><th>Group</th><th>Supervisor</th><th>Status</th><th /></tr></thead>
          <tbody>{agents.map((a) => <tr key={a.id}><td className="font-mono font-medium">{a.agent_code}</td><td>{a.agent_name}</td><td className="font-mono text-[12px] text-ink-3">{(a.dialer_ids || []).join(', ') || '—'}</td><td>{users.find((u) => u.id === a.user_id)?.name || <span className="text-ink-3">—</span>}</td><td>{a.group_name || '—'}</td><td>{a.supervisor_name || '—'}</td><td><Badge tone={a.is_active ? 'ok' : null}>{a.is_active ? 'Active' : 'Inactive'}</Badge></td><td className="text-right">{can('agents.edit') && <button className="icon-btn" onClick={() => setEdit(a)} aria-label="Edit agent"><Pencil size={15} /></button>}</td></tr>)}</tbody></table></div>
      )}
      <AgentModal a={edit} onClose={() => setEdit(null)} users={users} groups={groups} />
    </Card>
  );
}

function AgentModal({ a, onClose, users, groups }) {
  const { busy, run } = useRun(); const [f, setF] = useState(null); const [errs, setErrs] = useState({});
  const key = a ? a.id || 'new' : null;
  if (a && f?.__k !== key) setF({ __k: key, agent_code: a.agent_code || '', agent_name: a.agent_name || '', email: a.email || '', user_id: a.user_id || '', group_id: a.group_id || '', supervisor_id: a.supervisor_id || '', is_active: a.is_active ?? true, dialer_ids: (a.dialer_ids || []).join(', ') });
  if (!a || !f) return null;
  const close = () => { setF(null); setErrs({}); onClose(); };
  const save = async () => { const { __k, ...d } = f; const r = await run(() => saveAgent({ ...(a.id ? { id: a.id } : {}), ...d, dialer_ids: d.dialer_ids.split(',').map((x) => x.trim()).filter(Boolean) }), close); if (!r.ok) setErrs(r.fields || {}); };
  return (
    <Modal open onClose={close} title={a.id ? `Edit agent ${a.agent_code}` : 'Add agent'} footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Agent code" error={errs.agent_code} hint={a.id ? 'Changing it re-labels this agent’s calls' : ''}><Input value={f.agent_code} onChange={(e) => setF({ ...f, agent_code: e.target.value })} error={errs.agent_code} className="font-mono" /></Field>
        <Field label="Name" error={errs.agent_name}><Input value={f.agent_name} onChange={(e) => setF({ ...f, agent_name: e.target.value })} error={errs.agent_name} /></Field>
        <Field label="Linked user"><Select value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} placeholder="Not linked" options={users.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }))} /></Field>
        <Field label="Email" error={errs.email}><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Group"><Select value={f.group_id} onChange={(e) => setF({ ...f, group_id: e.target.value })} placeholder="No group" options={groups.map((g) => ({ value: g.id, label: g.name }))} /></Field>
        <Field label="Supervisor"><Select value={f.supervisor_id} onChange={(e) => setF({ ...f, supervisor_id: e.target.value })} placeholder="None" options={users.filter((u) => u.scope !== 'own').map((u) => ({ value: u.id, label: u.name }))} /></Field>
        <Field label="Dialer IDs" className="sm:col-span-2" hint="How your calling platform names this agent — extension, agent number or login, comma-separated (Dialer integration)" error={errs.dialer_ids}><Input value={f.dialer_ids} onChange={(e) => setF({ ...f, dialer_ids: e.target.value })} placeholder="e.g. 201, 9876500011" /></Field>
        <div className="flex items-center justify-between rounded-xl border border-line p-3 text-[14px] sm:col-span-2"><span>Active</span><Switch checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label="Active" /></div>
      </div>
    </Modal>
  );
}

function TreeTab({ users }) {
  const byManager = useMemo(() => { const m = new Map(); users.forEach((u) => { const k = u.reports_to || 'root'; if (!m.has(k)) m.set(k, []); m.get(k).push(u); }); return m; }, [users]);
  const ids = new Set(users.map((u) => u.id));
  const roots = users.filter((u) => !u.reports_to || !ids.has(u.reports_to));
  const size = (id) => (byManager.get(id) || []).reduce((s, c) => s + 1 + size(c.id), 0);
  return (
    <Card title="Org tree" sub="A manager's data scope is everyone in their branch">
      <ul className="space-y-1">{roots.map((u) => <Node key={u.id} u={u} byManager={byManager} size={size} depth={0} />)}</ul>
    </Card>
  );
}
function Node({ u, byManager, size, depth }) {
  const kids = byManager.get(u.id) || []; const [open, setOpen] = useState(depth < 2);
  return (
    <li>
      <div className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2" style={{ paddingLeft: depth * 22 + 8 }}>
        {kids.length ? <button className="icon-btn h-6 w-6" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="w-6" />}
        <Avatar name={u.name} size={26} /><span className={cn('text-[14px] text-ink', !u.is_active && 'line-through opacity-60')}>{u.name}</span>
        <Badge dot={false} tone={u.scope === 'all' ? 'info' : null}>{u.role_name}</Badge>
        {kids.length > 0 && <span className="text-[12px] text-ink-3">{size(u.id)} in branch</span>}
      </div>
      {open && kids.length > 0 && <ul>{kids.map((k) => <Node key={k.id} u={k} byManager={byManager} size={size} depth={depth + 1} />)}</ul>}
    </li>
  );
}

function GroupsTab({ groups, users }) {
  const can = useCan(); const { run } = useRun(); const [edit, setEdit] = useState(null);
  return (
    <Card title="Groups" sub="Teams of agents. A group's leads see its agents' calls." pad={false} action={can('groups.create') && <Button size="sm" variant="primary" onClick={() => setEdit({})}><Plus size={14} />Add group</Button>}>
      {!groups.length ? <Empty icon={UsersRound} title="No groups yet" /> : (
        <div className="mt-3 overflow-x-auto"><table className="table"><thead><tr><th>Name</th><th>Team lead(s)</th><th>Agents</th><th /></tr></thead>
          <tbody>{groups.map((g) => <tr key={g.id}><td><div className="font-medium">{g.name}</div>{g.description && <div className="text-[12px] text-ink-3">{g.description}</div>}</td><td>{g.lead_names || <span className="text-ink-3">No lead</span>}</td><td className="tabular-nums">{g.members}</td>
            <td className="whitespace-nowrap text-right">{can('groups.edit') && <button className="icon-btn" onClick={() => setEdit(g)} aria-label="Edit group"><Pencil size={15} /></button>}{can('groups.delete') && <button className="icon-btn" onClick={() => confirm(`Delete group ${g.name}?`) && run(() => deleteGroup({ id: g.id }))} aria-label="Delete group"><Trash2 size={15} /></button>}</td></tr>)}</tbody></table></div>
      )}
      <GroupModal g={edit} onClose={() => setEdit(null)} users={users} />
    </Card>
  );
}
function GroupModal({ g, onClose, users }) {
  const { busy, run } = useRun(); const [f, setF] = useState(null); const [errs, setErrs] = useState({});
  const key = g ? g.id || 'new' : null;
  if (g && f?.__k !== key) setF({ __k: key, name: g.name || '', description: g.description || '', lead_ids: g.lead_ids || [] });
  if (!g || !f) return null;
  const close = () => { setF(null); onClose(); };
  const save = async () => { const { __k, ...d } = f; const r = await run(() => saveGroup({ ...(g.id ? { id: g.id } : {}), ...d }), close); if (!r.ok) setErrs(r.fields || {}); };
  const leads = users.filter((u) => u.is_active && u.scope !== 'own');
  return (
    <Modal open onClose={close} title={g.id ? 'Edit group' : 'Add group'} footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" error={errs.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errs.name} /></Field>
        <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[64px]" /></Field>
        <Field label="Team leads"><div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line p-2">{leads.map((u) => <label key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-surface-2"><input type="checkbox" className="check" checked={f.lead_ids.includes(u.id)} onChange={(e) => setF({ ...f, lead_ids: e.target.checked ? [...f.lead_ids, u.id] : f.lead_ids.filter((x) => x !== u.id) })} />{u.name}<span className="ml-auto text-ink-3">{u.role_name}</span></label>)}</div></Field>
      </div>
    </Modal>
  );
}

function RolesTab({ roles }) {
  const can = useCan(); const { busy, run } = useRun(); const [edit, setEdit] = useState(null);
  const canAssign = can('permissions.assign');
  const toggle = (r, code) => run(() => saveRole({ id: r.id, name: r.name, description: r.description || '', scope: r.scope, permissions: r.permissions.includes(code) ? r.permissions.filter((p) => p !== code) : [...r.permissions, code] }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3">{canAssign ? 'Toggle a permission to change it for everyone with that role, from their next request.' : 'You can view roles but not change permissions.'}</p>
        {can('roles.create') && <Button size="sm" variant="primary" onClick={() => setEdit({})}><Plus size={14} />New role</Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">{roles.map((r) => (
        <div key={r.id} className="card p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-medium text-ink">{r.name}</div><div className="text-[12px] text-ink-3">{SCOPES[r.scope]} · {r.users} user{r.users === 1 ? '' : 's'}</div></div>
          <div className="flex">{can('roles.edit') && <button className="icon-btn" onClick={() => setEdit(r)} aria-label={`Edit ${r.name}`}><Pencil size={15} /></button>}{can('roles.delete') && !r.is_system && <button className="icon-btn" onClick={() => confirm(`Delete role ${r.name}?`) && run(() => deleteRole({ id: r.id }))} aria-label="Delete role"><Trash2 size={15} /></button>}</div></div>
          {r.description && <p className="mt-2 text-[13px] text-ink-2">{r.description}</p>}</div>))}</div>
      <Card pad={false} title="Permission matrix">
        <div className="mt-3 max-h-[70vh] overflow-auto">
          <table className="table"><thead><tr><th>Permission</th>{roles.map((r) => <th key={r.id} className="text-center">{r.name}<div className="normal-case tracking-normal text-ink-3">{r.permissions.length}</div></th>)}</tr></thead>
            <tbody>{PERMISSION_GROUPS.map((g) => [
              <tr key={g.category}><td colSpan={roles.length + 1} className="bg-surface-2 py-2"><span className="label">{g.category}</span></td></tr>,
              ...g.items.map(([code, label]) => (
                <tr key={code}><td><div className="text-ink">{label}</div><div className="font-mono text-[12px] text-ink-3">{code}</div></td>
                  {roles.map((r) => <td key={r.id} className="text-center"><div className="flex justify-center"><Switch checked={r.permissions.includes(code)} disabled={!canAssign || busy || (r.key === 'admin' && code === 'permissions.assign')} onChange={() => toggle(r, code)} label={`${r.name}: ${label}`} /></div></td>)}</tr>)),
            ])}</tbody></table>
        </div>
      </Card>
      <RoleModal r={edit} onClose={() => setEdit(null)} />
    </div>
  );
}
function RoleModal({ r, onClose }) {
  const { busy, run } = useRun(); const [f, setF] = useState(null); const [errs, setErrs] = useState({});
  const key = r ? r.id || 'new' : null;
  if (r && f?.__k !== key) setF({ __k: key, name: r.name || '', description: r.description || '', scope: r.scope || 'own', permissions: r.permissions || ['dashboard.view', 'calls.view'] });
  if (!r || !f) return null;
  const close = () => { setF(null); onClose(); };
  const save = async () => { const { __k, ...d } = f; const res = await run(() => saveRole({ ...(r.id ? { id: r.id } : {}), ...d }), close); if (!res.ok) setErrs(res.fields || {}); };
  return (
    <Modal open onClose={close} title={r.id ? `Edit ${r.name}` : 'New role'} sub={r.id ? '' : 'Start with view access; switch more on in the matrix.'} footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save role</Button></>}>
      <div className="space-y-4">
        <Field label="Role name" error={errs.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errs.name} /></Field>
        <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[64px]" /></Field>
        <Field label="Data scope" hint="Which calls people with this role can see"><Select value={f.scope} disabled={r.key === 'admin'} onChange={(e) => setF({ ...f, scope: e.target.value })} options={Object.entries(SCOPES).map(([v, l]) => ({ value: v, label: l }))} /></Field>
      </div>
    </Modal>
  );
}
