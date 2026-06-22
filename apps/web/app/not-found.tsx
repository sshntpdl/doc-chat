import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center
                    bg-[var(--color-background)] px-4"
    >
      <div className="text-center space-y-6 max-w-sm">
        <p className="text-8xl select-none" aria-hidden="true">
          🔍
        </p>
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-foreground)]">
            Page not found
          </h1>
          <p className="mt-2 text-[var(--color-muted)]">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-[var(--radius-md)]
                       bg-[var(--color-primary)] text-white font-medium text-sm
                       hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-[var(--radius-md)] border
                       border-[var(--color-border)] text-[var(--color-foreground)]
                       text-sm hover:bg-[var(--color-surface)] transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
