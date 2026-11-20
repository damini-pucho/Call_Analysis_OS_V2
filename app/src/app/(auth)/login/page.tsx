import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { currentUser, demoPersonasAvailable, demoCredentials } from '@/lib/auth';
import { LoginPageClient } from '@/components/LoginPageClient';

export const metadata = { title: 'Sign in · Call Intelligence Platform' };

export default async function LoginPage() {
  const u = await currentUser().catch(() => null);
  if (u) redirect(u.mustChangePassword ? '/set-password' : '/overview');
  const [demoPersonas, demoAccounts] = await Promise.all([demoPersonasAvailable(), demoCredentials()]);
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-[#FAFAFF]" />}>
      <LoginPageClient demoPersonas={demoPersonas} demoAccounts={demoAccounts} />
    </Suspense>
  );
}
