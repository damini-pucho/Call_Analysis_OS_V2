import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { LoginForm, BrandSide } from '@/components/AuthForms';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const u = await currentUser().catch(() => null);
  if (u) redirect(u.mustChangePassword ? '/set-password' : '/overview');
  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-2 lg:gap-20">
      <BrandSide title={<>Listen.<br />Analyse.<br />Coach.</>} sub="Every call transcribed, scored against your own SOPs and turned into coaching for each agent — for every team in your organisation." />
      <div className="mx-auto w-full max-w-md">
        <img src="/brand/pucho-logo.png" alt="Pucho.ai" className="mx-auto mb-8 h-7 md:hidden dark:invert" />
        <div className="card p-7 shadow-float sm:p-9">
          <h2 className="text-[24px] font-semibold text-ink">Welcome back</h2>
          <p className="mb-6 mt-1 text-[14px] text-ink-3">Sign in to your organisation's workspace.</p>
          <Suspense><LoginForm /></Suspense>
        </div>
        <p className="mt-6 text-center text-[12px] text-ink-3">Powered by Pucho.ai</p>
      </div>
    </main>
  );
}
