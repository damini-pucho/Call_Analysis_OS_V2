'use client';
// The component layer: small vendored primitives on the Pucho tokens (no second UI library — frontend-design.md §3).
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Inbox, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpRight } from 'lucide-react';
import { D, E } from '@/lib/motion';

export const cn = (...a) => a.filter(Boolean).join(' ');

// Status words colour themselves (toneOf): healthy / waiting / needs action / in flight. Unknown words stay neutral.
const OK = /^(yes|pass|passed|resolved|processed|completed|active|connected|green|low|positive|professional|compliant|full|efficient|excellent|good|ok|extracted|sent|high csat|good standing)$/i;
const WARN = /^(partial|amber|yellow|medium|acceptable|queued|pending|in progress|assigned|neutral|needs attention|monitor|uploaded|extracting|processing|not connected|not_connected|unknown)$/i;
const BAD = /^(no|fail|failed|red|high|critical|negative|unprofessional|non-compliant|inefficient|violation|yes-ztp|escalated|suspended|inactive|skipped|ztp|lost|none)$/i;
export function toneOf(v, invert) {
  const s = String(v ?? '').trim();
  if (!s || /^(na|n\/a|—|-)$/i.test(s)) return null;
  if (invert) { if (/^(high|yes|critical)$/i.test(s)) return 'bad'; if (/^(medium)$/i.test(s)) return 'warn'; if (/^(low|no|none)$/i.test(s)) return 'ok'; }
  if (OK.test(s)) return 'ok'; if (WARN.test(s)) return 'warn'; if (BAD.test(s)) return 'bad';
  return null;
}
export function Badge({ children, tone, invert, dot = true, className, title }) {
  const t = tone === undefined ? toneOf(children, invert) : tone;
  if (children == null || children === '') return <span className="muted">—</span>;
  return <span title={title} className={cn('badge', t && `badge-${t}`, !dot && 'nodot', className)}>{children}</span>;
}

export function Button({ variant = 'secondary', size, className, loading, children, ...p }) {
  return (
    <button type="button" {...p} disabled={p.disabled || loading} aria-busy={loading || undefined}
      className={cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}>
      {loading ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}
export function LinkButton({ href, variant = 'secondary', size, className, children, ...p }) {
  return <Link href={href} {...p} className={cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}>{children}</Link>;
}

export function Card({ title, sub, action, children, className, pad = true, id }) {
  return (
    <section id={id} className={cn('card', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold text-ink">{title}</h3>}
            {sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, actions, crumbs }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs && <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1 text-[13px] text-ink-3">{crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">{i > 0 && <ChevronRight size={13} aria-hidden />}{c.href ? <Link className="hover:text-ink" href={c.href}>{c.label}</Link> : <span className="text-ink-2">{c.label}</span>}</span>))}</nav>}
        <h1 className="text-ink">{title}</h1>
        {sub && <p className="mt-1 max-w-3xl text-[14px] text-ink-3">{sub}</p>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A KPI tile. Every KPI opens the list behind it (href). Tone only when the number's meaning is a status. */
export function Kpi({ label, value, sub, tone, href, icon: Icon, onClick, selected }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        {Icon && <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tone ? `bg-${tone}-soft text-${tone}-text` : 'bg-surface-2 text-ink-2')}><Icon size={16} aria-hidden /></span>}
      </div>
      <div className={cn('mt-2 text-[28px] font-semibold leading-none tabular-nums', tone === 'bad' ? 'text-bad-text' : tone === 'warn' ? 'text-warn-text' : 'text-ink')} data-num>{value ?? '—'}</div>
      {sub && <div className="mt-2 text-[13px] text-ink-3">{sub}</div>}
      {href && <ArrowUpRight size={14} className="absolute bottom-3 right-3 text-ink-4 transition-colors group-hover:text-ink-2" aria-hidden />}
    </>
  );
  const cls = cn('card group relative block p-4 text-left transition-colors', (href || onClick) && 'hover:bg-surface-2', selected && 'ring-1 ring-accent border-accent');
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} aria-pressed={!!selected} className={cn(cls, 'w-full')}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function Progress({ value, max = 100, tone = 'auto', className, label }) {
  const pctv = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const t = tone === 'auto' ? (pctv >= 80 ? 'ok' : pctv >= 50 ? 'warn' : 'bad') : tone;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-valuenow={Math.round(pctv)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full" style={{ width: `${pctv}%`, background: t ? `var(--${t})` : 'var(--ink)' }} />
    </div>
  );
}

/** 0–max ring with bands (score ≥80 ok, ≥60 info, ≥45 warn, else bad). Values show immediately — no count-up. */
export function ScoreRing({ value, max = 100, size = 132, stroke = 10, label, sub }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const v = value == null ? 0 : Math.max(0, Math.min(max, value));
  const p = (v / max) * 100; const tone = value == null ? null : p >= 80 ? 'ok' : p >= 60 ? 'info' : p >= 45 ? 'warn' : 'bad';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {value != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(--${tone})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (p / 100) * c} />}
      </svg>
      <div className="absolute flex flex-col items-center text-center">
        <span className="text-[26px] font-semibold leading-none tabular-nums text-ink">{value == null ? '—' : Number.isInteger(value) ? value : value.toFixed(1)}</span>
        {label && <span className="mt-1 text-[12px] text-ink-3">{label}</span>}
        {sub && <span className="text-[12px] text-ink-3">{sub}</span>}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-ink-3"><Icon size={20} aria-hidden /></span>
      <p className="font-display text-[19px] text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-[13px] text-ink-3">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Callout({ tone, title, children, icon: Icon, className }) {
  if (!children && !title) return null;
  return (
    <div className={cn('callout', tone && `callout-${tone}`, className)} role={tone === 'bad' ? 'alert' : undefined}>
      {Icon && <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />}
      <div className="min-w-0">{title && <div className="font-medium">{title}</div>}{children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}</div>
    </div>
  );
}

export function Avatar({ name, size = 32, src }) {
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
  if (src) return <img src={src} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-medium text-ink-2" style={{ width: size, height: size, fontSize: 12 }}>{initials}</span>;
}

/** Tabs with a gliding indicator (200 ms, no overshoot). */
export function Tabs({ tabs, value, onChange, className }) {
  const reduce = useReducedMotion(); const id = useId();
  return (
    <div role="tablist" className={cn('scroll-x flex gap-1 border-b border-line', className)}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" type="button" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={cn('relative -mb-px flex h-10 shrink-0 items-center gap-2 px-3 text-[14px] transition-colors', value === t.key ? 'font-medium text-ink' : 'text-ink-3 hover:text-ink')}>
          {t.icon && <t.icon size={15} aria-hidden />}{t.label}
          {t.count != null && <span className="rounded-full bg-surface-2 px-1.5 text-[12px] tabular-nums text-ink-3">{t.count}</span>}
          {value === t.key && <motion.span layoutId={`tab-${id}`} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 44, mass: 0.7 }} className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-ink" />}
        </button>
      ))}
    </div>
  );
}

export function ChipRow({ options, value, onChange, label }) {
  return (
    <div className="scroll-x flex gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className="chip" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}{o.count != null && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => { window.removeEventListener('keydown', h); if (prev && prev.focus) prev.focus(); };
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, sub, children, footer, width = 560 }) {
  const reduce = useReducedMotion(); const ref = useRef(null);
  useEscape(open, onClose);
  useEffect(() => { if (open) setTimeout(() => ref.current?.querySelector('input,select,textarea,button')?.focus(), 30); }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0" style={{ background: 'var(--scrim)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : D.QUICK }} onClick={onClose} />
          <motion.div ref={ref} className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-float sm:rounded-2xl" style={{ maxWidth: width }}
            initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }} transition={{ duration: reduce ? 0 : D.QUICK, ease: E.OUT }}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div><h2 className="text-ink">{title}</h2>{sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}</div>
              <button type="button" className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({ open, onClose, title, sub, children, footer, width = 520 }) {
  const reduce = useReducedMotion();
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0" style={{ background: 'var(--scrim)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : D.QUICK }} onClick={onClose} />
          <motion.aside className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-float" style={{ maxWidth: width }}
            initial={reduce ? false : { x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={reduce ? { opacity: 0 } : { x: 16, opacity: 0 }} transition={{ duration: reduce ? 0 : D.BASE, ease: E.OUT }}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0"><h2 className="truncate text-ink">{title}</h2>{sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}</div>
              <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, error, hint, children, className, htmlFor }) {
  return (
    <label className={cn('block', className)} htmlFor={htmlFor}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>}
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-ink-3">{hint}</span> : null}
    </label>
  );
}
export const Input = ({ error, className, ...p }) => <input {...p} aria-invalid={error ? 'true' : undefined} className={cn('field', className)} />;
export const Textarea = ({ error, className, ...p }) => <textarea {...p} aria-invalid={error ? 'true' : undefined} className={cn('field', className)} />;
export function Select({ options, placeholder, error, className, ...p }) {
  return (
    <select {...p} aria-invalid={error ? 'true' : undefined} className={cn('field', className)}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-accent' : 'bg-line-strong')}>
      <span className={cn('inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
    </button>
  );
}

/** Pager (V1: 25 rows, first / prev / page x of y / next / last, "Showing a–b of n"). */
export function usePager(rows, size = 25, resetKey) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey, rows.length]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(page, pages);
  return { page: p, pages, setPage, slice: rows.slice((p - 1) * size, p * size), from: rows.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, rows.length), total: rows.length };
}
export function Pager({ pager }) {
  if (pager.total <= 0) return null;
  const { page, pages, setPage } = pager;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-3">
      <span className="tabular-nums">Showing {pager.from}–{pager.to} of {pager.total}</span>
      <div className="flex items-center gap-1">
        <button className="icon-btn" onClick={() => setPage(1)} disabled={page === 1} aria-label="First page"><ChevronsLeft size={16} /></button>
        <button className="icon-btn" onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <span className="px-2 tabular-nums text-ink-2">Page {page} / {pages}</span>
        <button className="icon-btn" onClick={() => setPage(page + 1)} disabled={page === pages} aria-label="Next page"><ChevronRight size={16} /></button>
        <button className="icon-btn" onClick={() => setPage(pages)} disabled={page === pages} aria-label="Last page"><ChevronsRight size={16} /></button>
      </div>
    </div>
  );
}

export function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 text-[13px]">
      {Icon && <Icon size={15} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />}
      <span className="w-28 shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 flex-1 break-words text-ink">{children ?? '—'}</span>
    </div>
  );
}

export function Stat({ label, value, sub }) {
  return <div className="rounded-xl bg-surface-2 p-3"><div className="label">{label}</div><div className="mt-1 text-[18px] font-semibold tabular-nums text-ink">{value ?? '—'}</div>{sub && <div className="text-[12px] text-ink-3">{sub}</div>}</div>;
}

/** Simple proportional bar list (top topics, gaps…) with counts and %; each row can open its list. */
export function BarList({ rows, total, onPick, max = 8, tone, hrefOf, selected }) {
  const top = rows[0]?.value || 1;
  return (
    <ul className="space-y-2.5">
      {rows.slice(0, max).map((r) => {
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]"><span className="truncate text-ink">{r.name}</span><span className="shrink-0 tabular-nums text-ink-3">{r.value}{total ? ` · ${Math.round((r.value / total) * 100)}%` : ''}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(r.value / top) * 100}%`, background: tone ? `var(--${tone})` : 'var(--cat-1)' }} /></div>
          </>
        );
        return <li key={r.name}>{hrefOf ? <Link href={hrefOf(r)} className="block rounded-lg hover:opacity-80">{content}</Link> : onPick ? <button type="button" aria-pressed={selected === r.name} className={cn('-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left transition-opacity', selected === r.name ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]' : selected ? 'opacity-45 hover:opacity-80' : 'hover:bg-surface-2')} onClick={() => onPick(r)}>{content}</button> : content}</li>;
      })}
    </ul>
  );
}

export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Reveal({ children, className, delay = 0 }) {
  const reduce = useReducedMotion();
  return <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : D.BASE, ease: E.OUT, delay: reduce ? 0 : delay }}>{children}</motion.div>;
}
