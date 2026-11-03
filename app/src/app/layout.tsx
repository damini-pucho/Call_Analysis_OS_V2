import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Toaster } from 'sonner';
import '@/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Call Analysis OS', template: '%s · Call Analysis OS' },
  description: 'Multi-tenant call intelligence: recordings, transcripts, QA scores, agent training and customer profiles.',
  icons: { icon: '/favicon.ico' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, colorScheme: 'light dark', themeColor: '#141413' };
export const dynamic = 'force-dynamic';

// Resolves theme before first paint, defaulting to clean light theme
const THEME_SCRIPT = `(function(){try{var d=document.documentElement,m=null;try{m=localStorage.getItem('pucho-theme')}catch(e){}
if(!m){var c=document.cookie.match(/(?:^|; )pucho-theme=(light|dark|system)/);m=c?c[1]:null}
if(!m||m==='system')m='light';
d.setAttribute('data-theme',m);d.setAttribute('data-theme-mode',m)}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = (await cookies()).get('pucho-theme')?.value;
  const theme = mode === 'dark' ? 'dark' : 'light';
  return (
    <html lang="en" data-theme={theme} data-tone="pucho" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>
        {children}
        <Toaster position="bottom-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', boxShadow: 'var(--toast-shadow)', borderRadius: '12px', fontFamily: 'var(--font-app)' } }} />
      </body>
    </html>
  );
}
