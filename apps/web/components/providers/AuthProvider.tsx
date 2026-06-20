// FILE: /apps/web/components/AuthProvider.tsx
//
// Wraps the app and calls authStore.initialize() once on mount.
//
// WHY THIS IS NEEDED:
// The store's `user` field starts as null. initialize() calls
// supabase.auth.getSession() to hydrate it from existing cookies, and
// also registers the onAuthStateChange listener that keeps it in sync
// going forward (including after a fresh sign-in).
//
// Without this, the login page's useEffect that watches `user` and
// `isInitialized` would never fire because isInitialized stays false.
//
// USAGE — add to /apps/web/app/layout.tsx:
//   import { AuthProvider } from "@/components/AuthProvider";
//   ...
//   <AuthProvider>{children}</AuthProvider>

"use client";

import { useEffect } from "react";
import { useAuthStore } from "@docchat/stores";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
    // initialize() is stable (Zustand action reference never changes),
    // so this runs exactly once on mount.
  }, [initialize]);

  return <>{children}</>;
}
