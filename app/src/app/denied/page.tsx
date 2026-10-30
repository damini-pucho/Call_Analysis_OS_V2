import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export const metadata = { title: 'Access restricted' };

export default function Denied() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bad-soft text-bad-text"><ShieldAlert size={26} /></span>
      <h1 className="text-ink">Access restricted</h1>
      <p className="max-w-md text-[14px] text-ink-3">Your role does not include this page. Ask an admin of your organisation to change your role's permissions under Team &amp; roles.</p>
      <Link href="/overview" className="btn btn-primary">Back to overview</Link>
    </main>
  );
}
