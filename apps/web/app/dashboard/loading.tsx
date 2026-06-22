export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Nav skeleton */}
      <div
        className="sticky top-0 z-40 border-b border-[var(--color-border)]
                      bg-[var(--color-background)]/80 backdrop-blur-sm"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="skeleton h-5 w-24 rounded" />
            <div className="skeleton h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome heading skeleton */}
        <div className="mb-8 space-y-2">
          <div className="skeleton h-8 w-64 rounded" />
          <div className="skeleton h-4 w-40 rounded" />
        </div>

        {/* Action bar skeleton */}
        <div className="flex gap-3 mb-6">
          <div className="skeleton h-10 flex-1 max-w-xs rounded-[var(--radius-md)]" />
          <div className="skeleton h-10 w-36 rounded-[var(--radius-md)]" />
        </div>

        {/* Document grid skeleton — 6 cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)]
                         bg-[var(--color-surface)] p-5 space-y-3"
              aria-hidden="true"
            >
              <div className="flex items-start justify-between">
                <div className="skeleton h-9 w-9 rounded" />
                <div className="skeleton h-5 w-16 rounded-full" />
              </div>
              <div className="skeleton h-5 w-4/5 rounded" />
              <div className="skeleton h-3 w-3/5 rounded" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
