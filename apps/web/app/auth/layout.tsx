// FILE: apps/web/app/auth/layout.tsx
// Shared layout for all /auth/** pages (login, callback).
// Deliberately minimal — no nav bar, no sidebar.
// The theme script in the root layout already runs, so dark mode works here.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">{children}</div>
  );
}
