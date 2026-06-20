// FILE: /apps/web/components/providers/StoreInitializer.tsx
"use client";
// WHY "use client":
// useAuthStore.initialize() calls supabase.auth.getSession() which is a
// browser API. Server Components can't call browser APIs, so initialization
// must happen on the client side after hydration.
//
// WHY NOT A CONTEXT PROVIDER:
// Zustand stores are global singletons — they don't need React context to
// share state. A simple component that calls initialize() once on mount is
// enough. This also avoids the "children must be wrapped" pattern.

import { useEffect, useRef } from "react";
import { useAuthStore }      from "@docchat/stores";

export function StoreInitializer() {
  const initialize  = useAuthStore((s) => s.initialize);
  // useRef prevents double-initialization in React StrictMode
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initialize();
    }
  }, [initialize]);

  // Renders nothing — pure side effect component
  return null;
}
