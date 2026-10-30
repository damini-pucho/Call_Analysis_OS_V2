'use client';
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="label">Something went wrong</div>
      <h1 className="font-display text-[26px] font-medium text-ink">This page could not load</h1>
      <p className="max-w-md text-[14px] text-ink-3">Nothing was changed. Try again — if it keeps happening, share this reference with support: <code className="kbd">{error.digest || 'n/a'}</code></p>
      <button className="btn btn-primary mt-2" onClick={reset}>Try again</button>
    </main>
  );
}
