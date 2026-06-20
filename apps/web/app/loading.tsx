// FILE: apps/web/app/loading.tsx
// Next.js Suspense boundary shown while any Server Component on this
// layout level is still streaming/fetching. Keeps the UI from being
// blank during initial page transitions.

export default function RootLoading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center
                    bg-[var(--color-background)]"
      aria-label="Loading"
      role="status"
    >
      <div className="flex flex-col items-center gap-4">
        <span className="text-2xl font-bold text-[var(--color-primary)]">
          DocChat
        </span>
        <div
          className="w-8 h-8 rounded-full border-2
                     border-[var(--color-primary)] border-t-transparent
                     animate-spin"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
