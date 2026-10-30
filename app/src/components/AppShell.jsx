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
  Play, Pause, SkipBack, SkipForward, Volume2,
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
    <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
      {NAV.map((g, gi) => {
        const items = g.items.filter((i) => allowed(user, i.perm));
        if (!items.length) return null;
        return (
          <div key={gi} className="mt-4 first:mt-2">
            {g.group && !collapsed && <div className="label mb-1 px-3">{g.group}</div>}
            {g.group && collapsed && <div className="mx-3 mb-2 border-t border-nav-line" />}
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = path === i.href || path.startsWith(`${i.href}/`);
                return (
                  <li key={i.href}>
                    <Link href={i.href} onClick={onNavigate} title={collapsed ? i.label : undefined} aria-current={active ? 'page' : undefined}
                      className={cn('flex items-center gap-3 rounded-[12px] px-3 text-[14px] transition-colors', collapsed && 'justify-center px-0',
                        active ? 'bg-nav-active font-medium text-nav-ink' : 'text-nav-2 hover:bg-nav-hover hover:text-nav-ink')}
                      style={{ height: 'var(--nav-row-h)' }}>
                      <i.icon size={17} className="shrink-0" aria-hidden />
                      {!collapsed && <span className="truncate">{i.label}</span>}
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
    <div className="relative border-t border-nav-line p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu"
        className={cn('flex w-full items-center gap-3 rounded-[12px] p-2 text-left hover:bg-nav-hover', collapsed && 'justify-center')}>
        <Avatar name={user.name} size={32} src={avatarSrc} />
        {!collapsed && <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium text-nav-ink">{user.name}</span><span className="block truncate text-[12px] text-nav-2">{user.roleName} · {user.orgName}</span></span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute bottom-full left-3 z-50 mb-2 w-60 rounded-2xl border border-line bg-surface p-1.5 shadow-float">
            <div className="px-3 py-2"><div className="truncate text-[13px] font-medium text-ink">{user.email}</div><div className="truncate text-[12px] text-ink-3">{user.orgName}</div></div>
            <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink"><UserCircle size={16} />Profile & security</Link>
            <Link role="menuitem" href="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink"><Bell size={16} />Notifications</Link>
            <form action={signOutAction}><button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-ink-2 hover:bg-surface-2 hover:text-ink"><LogOut size={16} />Sign out</button></form>
          </div>
        </>
      )}
    </div>
  );
}

const fmt = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;
function PlayerBar() {
  const p = usePlayer(); const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {(p.current || p.error) && (
        <motion.div initial={reduce ? false : { y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: reduce ? 0 : D.QUICK, ease: E.OUT }}
          className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-line bg-surface p-3 shadow-float md:left-auto md:right-6 md:w-[560px]" role="region" aria-label="Audio player">
          {p.error && !p.current ? (
            <div className="flex items-center justify-between gap-3 text-[13px] text-bad-text"><span>{p.error}</span><button className="icon-btn" onClick={p.clearError} aria-label="Dismiss"><X size={16} /></button></div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button className="icon-btn" onClick={() => p.step(-1)} aria-label="Previous call"><SkipBack size={16} /></button>
                <button className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-on" onClick={p.toggle} aria-label={p.playing ? 'Pause' : 'Play'}>{p.playing ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}</button>
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
    <div className="flex h-14 shrink-0 items-center gap-2.5 px-5">
      {logoSrc ? <img src={logoSrc} alt="" className="h-7 w-7 rounded-lg object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-[13px] font-semibold text-canvas">{(user.orgName || 'C')[0]}</span>}
      {!collapsed && <span className="min-w-0"><span className="block truncate text-[14px] font-semibold text-nav-ink">{user.orgName}</span><span className="label block !text-[12px] leading-tight">Call Analysis OS</span></span>}
    </div>
  ), [collapsed, logoSrc, user.orgName]);

  const submitSearch = (e) => { e.preventDefault(); const v = q.trim(); if (v) router.push(`/calls?q=${encodeURIComponent(v)}`); };

  return (
    <div className="min-h-screen bg-canvas">
      {/* desktop sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-nav-line bg-nav lg:flex', collapsed ? 'w-[var(--rail-w)]' : 'w-[var(--nav-w)]')} style={{ transition: `width ${D.QUICK}s` }}>
        {collapsed ? <div className="flex h-14 items-center justify-center">{logoSrc ? <img src={logoSrc} alt="" className="h-7 w-7 rounded-lg object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-[13px] font-semibold text-canvas">{(user.orgName || 'C')[0]}</span>}</div> : brand}
        <NavList user={user} collapsed={collapsed} />
        <AccountMenu user={user} collapsed={collapsed} avatarSrc={avatarSrc} />
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {mobile && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <motion.div className="absolute inset-0" style={{ background: 'var(--scrim)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} />
            <motion.aside initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -16, opacity: 0 }} transition={{ duration: D.QUICK, ease: E.OUT }}
              className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-nav-line bg-nav">
              <div className="flex items-center justify-between pr-2">{brand}<button className="icon-btn" onClick={() => setMobile(false)} aria-label="Close menu"><X size={18} /></button></div>
              <NavList user={user} collapsed={false} onNavigate={() => setMobile(false)} />
              <AccountMenu user={user} collapsed={false} avatarSrc={avatarSrc} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className={cn('flex min-h-screen flex-col', collapsed ? 'lg:pl-[var(--rail-w)]' : 'lg:pl-[var(--nav-w)]')}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5" style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}>
          <button className="icon-btn lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu size={19} /></button>
          <button className="icon-btn hidden lg:inline-flex" onClick={toggleRail} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
          <form onSubmit={submitSearch} className="mx-auto w-full max-w-md" role="search">
            <label className="relative block">
              <span className="sr-only">Search calls</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search calls by lead ID, mobile, agent…" className="field field-sm !h-9 pl-9" />
            </label>
          </form>
          <ThemeToggle />
          <Link href="/notifications" className="icon-btn relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell size={18} />
            {unread > 0 && <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-accent px-1 text-center text-[12px] font-medium leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-28 pt-6 sm:px-6">{children}</main>
        <footer className="px-6 pb-6 text-center text-[12px] text-ink-3 no-print">Powered by Pucho.ai</footer>
      </div>
      <PlayerBar />
    </div>
  );
}
