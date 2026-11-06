import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { currentUser, demoLoginsOn } from '@/lib/auth';
import { LoginPageClient } from '@/components/LoginPageClient';

export const metadata = { title: 'Sign in · Call Intelligence Platform' };

export default async function LoginPage() {
  const u = await currentUser().catch(() => null);
  if (u) redirect(u.mustChangePassword ? '/set-password' : '/overview');
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-[#FAFAFF]" />}>
      <LoginPageClient demoLogins={demoLoginsOn()} />
    </Suspense>
  );
}
