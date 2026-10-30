import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { SignupForm, BrandSide } from '@/components/AuthForms';

export const metadata = { title: 'Create your organisation' };

export default async function SignupPage() {
  const u = await currentUser().catch(() => null);
  if (u) redirect('/overview');
  const open = process.env.SIGNUP_OPEN !== 'false';
  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-2 lg:gap-20">
      <BrandSide title={<>Your team.<br />Your SOPs.<br />Your workspace.</>} sub="Create an organisation, invite your team leaders and agents, upload your SOPs and policies, and start analysing calls the same day." />
      <div className="mx-auto w-full max-w-lg">
        <div className="card p-7 shadow-float sm:p-9">
          <h2 className="text-[24px] font-semibold text-ink">Create your organisation</h2>
          <p className="mb-6 mt-1 text-[14px] text-ink-3">You become its first admin. Everything you add stays inside this workspace.</p>
          {open ? <SignupForm /> : <div className="callout callout-info">New organisations are invite-only on this deployment. Ask your Pucho contact for access.</div>}
        </div>
      </div>
    </main>
  );
}
