// FILE: apps/web/app/error.tsx
// Next.js error boundary — catches unhandled runtime errors in
// Server and Client Components within the same layout segment.
// Must be a Client Component (it receives the error object from React).

"use client";

import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log to your monitoring service here (e.g. Sentry)
    console.error("[Global Error Boundary]", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center
                    bg-[var(--color-background)] px-4"
    >
      <div className="text-center space-y-6 max-w-sm">
        <p className="text-7xl select-none" aria-hidden="true">
          ⚠️
        </p>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)] font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-[var(--radius-md)]
                       bg-[var(--color-primary)] text-white font-medium text-sm
                       hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="px-5 py-2.5 rounded-[var(--radius-md)] border
                       border-[var(--color-border)] text-[var(--color-foreground)]
                       text-sm hover:bg-[var(--color-surface)] transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
