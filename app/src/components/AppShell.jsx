'use client';
// The shell: a 260px light sidebar (collapsible to a rail), the header with search in the centre and the bell, the account
// menu as the profile at the bottom-left, a mobile drawer, and the global audio player bar.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  LayoutDashboard, PhoneCall, UploadCloud, BarChart3, Layers, ArrowLeftRight, ShieldCheck, Users, GraduationCap, Contact, Smile,
  Building2, Plug, UserCog, Settings, Globe, Bell, Search, Menu, X, Sun, Moon, Monitor, LogOut, UserCircle, PanelLeftClose, PanelLeftOpen,
  Play, Pause, SkipBack, SkipForward, Volume2, Lock, Radio,
} from 'lucide-react';
import { useUser, usePlayer } from './providers';
import { Avatar, cn } from './ui';
import { signOutAction } from '@/app/actions/auth';
import { D, E } from '@/lib/motion';

export const NAV = [
  { group: null, items: [{ href: '/overview', label: 'Overview', icon: LayoutDashboard, perm: 'dashboard.view' }] },
  { group: 'Call analysis', items: [
    { href: '/calls', label: 'Calls', icon: PhoneCall, perm: 'calls.view' },
    { href: '/upload', label: 'Upload & analyse', icon: UploadCloud, perm: 'upload.analyze' },
    { href: '/sources', label: 'Dialer integration', icon: Radio, perm: 'upload.analyze' },
    { href: '/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics.view' },
    { href: '/classification', label: 'Classification', icon: Layers, perm: 'classification.view' },
    { href: '/direction', label: 'Inbound / outbound', icon: ArrowLeftRight, perm: 'inbound_outbound.view' },
    { href: '/compliance', label: 'Compliance', icon: ShieldCheck, perm: 'compliance.view' },
  ] },
  { group: 'Agent training', items: [
    { href: '/agents', label: 'Agents', icon: Users, perm: 'agents.view' },
    { href: '/training', label: 'Training', icon: GraduationCap, perm: 'training.view' },
  ] },
  { group: 'Customers', items: [
    { href: '/customers', label: 'Customer profiles', icon: Contact, perm: 'customers.view' },
    { href: '/sentiment', label: 'Sentiment', icon: Smile, perm: 'customer_analysis.view' },
  ] },
  { group: 'Company', items: [
    { href: '/company', label: 'Company profile', icon: Building2, perm: 'company.view' },
    { href: '/crm', label: 'CRM integration', icon: Plug, perm: 'crm.view' },
  ] },
  { group: 'Admin', items: [
    { href: '/team', label: 'Team & roles', icon: UserCog, perm: ['users.view', 'groups.view', 'roles.view'] },
    { href: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
    { href: '/platform', label: 'Platform', icon: Globe, perm: 'platform' },
  ] },
];

function allowed(user, perm) {
  if (perm === 'platform') return !!user?.isPlatform;
  const list = Array.isArray(perm) ? perm : [perm];
  // a training-locked agent sees only Training until their team leader marks it Done (the server enforces the same)
  if (user?.trainingLocked && !list.includes('training.view')) return false;
  return list.some((p) => user?.permissions?.includes(p));
}

function ThemeToggle({ compact }) {
  const [mode, setMode] = useState('system');
  useEffect(() => { setMode(document.documentElement.getAttribute('data-theme-mode') || 'system'); }, []);
  const apply = (m) => {
    setMode(m);
    try { localStorage.setItem('pucho-theme', m); } catch {}
    document.cookie = `pucho-theme=${m};path=/;max-age=31536000;samesite=lax`;
    const dark = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme-mode', m);
  };
  const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
  const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor;
  return <button type="button" className="icon-btn" onClick={() => apply(next)} aria-label={`Theme: ${mode}. Switch to ${next}`} title={`Theme: ${mode}`}><Icon size={18} />{!compact && null}</button>;
}

function NavList({ user, collapsed, onNavigate }) {
  const path = usePathname();
  return (
    <nav className="flex-1 pr-3 mt-2 space-y-1 overflow-y-auto" aria-label="Main">
      {NAV.map((g, gi) => {
        const items = g.items.filter((i) => allowed(user, i.perm));
        if (!items.length) return null;
        return (
          <div key={gi} className="mt-4 first:mt-2">
            {g.group && !collapsed && (
              <div className="px-5 py-1.5 text-[10px] font-bold text-gray-400 tracking-widest uppercase">
                {g.group}
              </div>
            )}
            {g.group && collapsed && <div className="mx-3 mb-2 border-t border-gray-100" />}
            <ul className="space-y-1">
              {items.map((i) => {
                const active = path === i.href || path.startsWith(`${i.href}/`);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      title={collapsed ? i.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 pl-5 pr-3 py-2.5 rounded-r-full transition-all text-[14px] font-medium whitespace-nowrap overflow-hidden relative group',
                        collapsed && 'justify-center pl-0 rounded-xl',
                        active
                          ? 'bg-gradient-to-r from-[#7C4DFF] to-[#6C38FF] font-semibold text-white shadow-md'
                          : 'text-gray-600 hover:bg-purple-50 hover:text-[#7C4DFF]'
                      )}
                      style={{ height: 'var(--nav-row-h)' }}
                    >
                      <i.icon size={18} className={cn('shrink-0 transition-colors', active ? 'text-white' : 'text-gray-400 group-hover:text-[#7C4DFF]')} aria-hidden />
                      {!collapsed && <span className="flex-1 truncate">{i.label}</span>}
                      {active && !collapsed && <div className="w-2 h-2 rounded-full bg-white absolute right-4 shadow-sm" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function AccountMenu({ user, collapsed, avatarSrc }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const h = (e) => e.key === 'Escape' && setOpen(false); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open]);
  return (
    <div className="relative border-t border-gray-100 p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className={cn('flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-purple-50 transition-colors', collapsed && 'justify-center')}>
        <Avatar name={user.name} size={34} src={avatarSrc} className="bg-purple-100 text-[#7C4DFF] font-bold ring-2 ring-purple-200/50" />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-gray-900 leading-tight">{user.name}</span>
            <span className="block truncate text-[11px] font-semibold text-gray-500">{user.roleName} · {user.orgName}</span>
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute bottom-full left-3 z-50 mb-2 w-60 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-lg">
            <div className="px-3 py-2"><div className="truncate text-[13px] font-semibold text-gray-900">{user.email}</div><div className="truncate text-[12px] text-gray-500">{user.orgName}</div></div>
            <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-gray-600 hover:bg-purple-50 hover:text-[#7C4DFF]"><UserCircle size={16} />Profile & security</Link>
            <Link role="menuitem" href="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-gray-600 hover:bg-purple-50 hover:text-[#7C4DFF]"><Bell size={16} />Notifications</Link>
            <form action={signOutAction}><button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-gray-600 hover:bg-purple-50 hover:text-[#7C4DFF]"><LogOut size={16} />Sign out</button></form>
          </div>
        </>
      )}
    </div>
  );
}

const fmt = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;
function PlayerBar({ collapsed }) {
  const p = usePlayer(); const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {(p.current || p.error) && (
        <motion.div initial={reduce ? false : { y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: reduce ? 0 : D.QUICK, ease: E.OUT }}
          className={cn('fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 py-3 shadow-float sm:px-6', collapsed ? 'lg:left-[var(--rail-w)]' : 'lg:left-[var(--nav-w)]')} role="region" aria-label="Audio player">
          {p.error && !p.current ? (
            <div className="flex items-center justify-between gap-3 text-[13px] text-bad-text"><span>{p.error}</span><button className="icon-btn" onClick={p.clearError} aria-label="Dismiss"><X size={16} /></button></div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button className="icon-btn" onClick={() => p.step(-1)} aria-label="Previous call"><SkipBack size={16} /></button>
                <button className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-[#7C4DFF] to-[#6C38FF] text-white shadow-[0_4px_12px_rgba(124,77,255,0.35)] hover:scale-105 transition-all" onClick={p.toggle} aria-label={p.playing ? 'Pause' : 'Play'}>{p.playing ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}</button>
                <button className="icon-btn" onClick={() => p.step(1)} aria-label="Next call"><SkipForward size={16} /></button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-[13px]"><span className="truncate font-medium text-ink">{p.current.agent_name || 'Unknown agent'} <span className="text-ink-3">· {p.current.agent_code} · {p.current.campaign || '—'}</span></span><span className="shrink-0 tabular-nums text-ink-3">{fmt(p.time)} / {fmt(p.duration)}</span></div>
                <input type="range" min={0} max={p.duration || 0} step={0.1} value={p.time} onChange={(e) => p.seek(Number(e.target.value))} aria-label="Seek" className="mt-1.5 w-full accent-[var(--accent)]" />
                {p.error && <div className="text-[12px] text-bad-text">{p.error}</div>}
              </div>
              <div className="hidden items-center gap-1 sm:flex">
                {[1, 1.25, 1.5, 2].map((s) => <button key={s} onClick={() => p.setSpeed(s)} aria-pressed={p.speed === s} className={cn('rounded-md px-1.5 py-0.5 text-[12px] tabular-nums', p.speed === s ? 'bg-ink text-canvas' : 'text-ink-3 hover:text-ink')}>{s}x</button>)}
                <Volume2 size={15} className="ml-1 text-ink-3" aria-hidden />
                <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => p.setVolume(Number(e.target.value))} aria-label="Volume" className="w-16 accent-[var(--accent)]" />
              </div>
              <button className="icon-btn" onClick={p.stop} aria-label="Close player"><X size={16} /></button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function AppShell({ children, unread, logoSrc, avatarSrc }) {
  const user = useUser(); const router = useRouter(); const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => { try { setCollapsed(localStorage.getItem('cas-nav') === 'rail'); } catch {} }, []);
  useEffect(() => { setMobile(false); }, [path]);
  const toggleRail = () => { setCollapsed((c) => { try { localStorage.setItem('cas-nav', c ? 'full' : 'rail'); } catch {} return !c; }); };
  const brand = useMemo(() => (
    <div className="flex h-16 shrink-0 items-center gap-3 px-5 border-b border-gray-100">
      <img src="/brand/pucho_logo_official.png" alt="Pucho.ai" className="h-7 w-auto object-contain" />
      {!collapsed && (
        <div className="min-w-0">
          <span className="block truncate text-[13px] font-bold text-gray-900 leading-tight">{user.orgName}</span>
          <span className="label block !text-[10px] font-black tracking-widest text-[#7C4DFF] leading-tight">CALL ANALYSIS OS</span>
        </div>
      )}
    </div>
  ), [collapsed, user.orgName]);

  const submitSearch = (e) => { e.preventDefault(); const v = q.trim(); if (v) router.push(`/calls?q=${encodeURIComponent(v)}`); };

  return (
    <div className="min-h-screen bg-canvas">
      {/* desktop sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-gray-200 bg-white shadow-[2px_0_8px_-4px_rgba(0,0,0,0.06)] lg:flex', collapsed ? 'w-[var(--rail-w)]' : 'w-[var(--nav-w)]')} style={{ transition: `width ${D.QUICK}s` }}>
        {collapsed ? <div className="flex h-16 items-center justify-center border-b border-gray-100"><img src="/brand/pucho_logo_official.png" alt="Pucho.ai" className="h-6 w-auto object-contain" /></div> : brand}
        <NavList user={user} collapsed={collapsed} />
        <AccountMenu user={user} collapsed={collapsed} avatarSrc={avatarSrc} />
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {mobile && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <motion.div className="absolute inset-0" style={{ background: 'var(--scrim)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} />
            <motion.aside initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -16, opacity: 0 }} transition={{ duration: D.QUICK, ease: E.OUT }}
              className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-gray-200 bg-white">
              <div className="flex items-center justify-between pr-2">{brand}<button className="icon-btn" onClick={() => setMobile(false)} aria-label="Close menu"><X size={18} /></button></div>
              <NavList user={user} collapsed={false} onNavigate={() => setMobile(false)} />
              <AccountMenu user={user} collapsed={false} avatarSrc={avatarSrc} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className={cn('flex min-h-screen flex-col', collapsed ? 'lg:pl-[var(--rail-w)]' : 'lg:pl-[var(--nav-w)]')}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-gray-200 bg-white/95 px-3 backdrop-blur sm:px-5">
          <button className="icon-btn lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu size={19} /></button>
          <button className="icon-btn hidden lg:inline-flex" onClick={toggleRail} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
          <form onSubmit={submitSearch} className="mx-auto w-full max-w-md" role="search">
            <label className="relative block">
              <span className="sr-only">Search calls</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search calls by lead ID, mobile, agent…" className="field field-sm !h-9 pl-9" />
            </label>
          </form>
          <ThemeToggle />
          <Link href="/notifications" className="icon-btn relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell size={18} />
            {unread > 0 && <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-accent px-1 text-center text-[12px] font-medium leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-28 pt-6 sm:px-6">
          {user.trainingLocked && (
            <div className="callout callout-warn mb-5" role="status">
              <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
              <div><div className="font-medium">Your dashboard is locked while you complete your training</div>
                <div className="opacity-90">Work through the training assigned to you. Your team leader reviews it and marks it Done — your dashboard opens again after that.</div></div>
            </div>
          )}
          {children}
        </main>
        <footer className="px-6 pb-6 text-center text-[12px] text-ink-3 no-print">Powered by Pucho.ai</footer>
      </div>
      <PlayerBar collapsed={collapsed} />
    </div>
  );
}
