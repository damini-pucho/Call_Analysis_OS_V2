import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="label">404</div>
      <h1 className="font-display text-[28px] font-medium text-ink">Nothing here</h1>
      <p className="max-w-sm text-[14px] text-ink-3">This page does not exist, or the record is outside your organisation or your team's scope.</p>
      <Link href="/overview" className="btn btn-secondary mt-2">Go to overview</Link>
    </main>
  );
}
