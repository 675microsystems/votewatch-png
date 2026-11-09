"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p className="note" role="alert">The page could not be shown. Try again; if it keeps happening, contact an administrator.</p>
      <button className="p" onClick={reset}>Try again</button>
    </main>
  );
}
