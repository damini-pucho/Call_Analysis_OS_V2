// The Pucho brand pages (sign-in, sign-up, first password): IBM Plex, self-hosted — the app itself uses Geist.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(var(--line-soft) 1px, transparent 1px), linear-gradient(90deg, var(--line-soft) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)' }} />
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full blur-[110px]" style={{ background: 'var(--accent-soft)' }} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
