// FILE: /packages/supabase/src/client.ts

import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import { createServerClient as _createServerClient } from "@supabase/ssr";

function getEnv() {
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error("[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  return { url, key };
}

// ─── Storage interface ────────────────────────────────────────────────────────
//
// AsyncStorage (React Native) and localStorage (browser) both satisfy this.
// We accept it as an optional parameter so:
//   - Mobile passes AsyncStorage  → sessions persist across app restarts
//   - Web passes nothing          → @supabase/ssr uses its own cookie storage
//
// WHY THIS WAS BROKEN:
//   The old signature `createBrowserClient()` accepted NO arguments, so the
//   AsyncStorage passed by the mobile supabase.ts was silently discarded.
//   Without a storage adapter, @supabase/ssr falls back to an in-memory store
//   that is wiped on every app restart. This meant:
//     • Mobile had no persisted session after the first launch
//     • fetchDocuments() received no token → 401 → empty library
//     • uploadDocument() received no token → 401 → RN's fetch polyfill
//       surfaces this as [TypeError: Network request failed] before the
//       request even leaves the device

export interface SupabaseStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export function createBrowserClient(storage?: SupabaseStorage) {
  const { url, key } = getEnv();

  return _createBrowserClient(url, key, {
    auth: {
      // Only persist & auto-refresh when a real storage adapter is provided.
      // On web, @supabase/ssr manages cookies itself (no adapter needed).
      persistSession: !!storage,
      autoRefreshToken: !!storage,
      detectSessionInUrl: false,
      ...(storage ? { storage } : {}),
    },
  });
}

// ─── Server client (Next.js API routes / middleware) ──────────────────────────

export function createServerClient(cookieStore: {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options: object): void;
  delete(name: string, options?: object): void;
}) {
  const { url, key } = getEnv();

  return _createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: object) {
        try {
          cookieStore.set(name, value, options);
        } catch {}
      },
      remove(name: string, options: object) {
        try {
          cookieStore.delete(name, options);
        } catch {}
      },
    },
  });
}
