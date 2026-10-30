import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { SetPasswordForm } from '@/components/AuthForms';

export const metadata = { title: 'Set your password' };

export default async function SetPasswordPage() {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (!u.mustChangePassword) redirect('/overview');
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="card w-full max-w-md p-7 shadow-float sm:p-9">
        <img src="/brand/pucho-logo.png" alt="Pucho.ai" className="mb-6 h-6 dark:invert" />
        <h2 className="mb-2 text-[22px] font-semibold text-ink">Set your password</h2>
        <SetPasswordForm name={u.name} />
      </div>
    </main>
  );
}
