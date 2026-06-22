// FILE: /packages/supabase/src/client.ts
//
// Shared Supabase client factories for web (Next.js) and mobile (Expo/RN).
//
// TWO CLIENT TYPES:
//   createBrowserClient — for client-side code (React components, RN screens).
//     • Web:    no storage adapter; @supabase/ssr manages cookies automatically.
//     • Mobile: caller passes AsyncStorage so sessions persist across restarts.
//
//   createServerClient — for server-side code (Next.js Route Handlers,
//     Server Components, Middleware). Reads/writes cookies via the
//     ReadonlyRequestCookies / ResponseCookies adapter the caller provides.
//
// WHY THE STORAGE PARAMETER EXISTS (mobile session persistence bug):
//   The original createBrowserClient() accepted no arguments, so the
//   AsyncStorage passed by the mobile supabase.ts was silently discarded.
//   Without a storage adapter, @supabase/ssr falls back to an in-memory store
//   wiped on every app restart, causing:
//     • No persisted session after first launch
//     • fetchDocuments() → 401 → empty library
//     • uploadDocument() → 401 → [TypeError: Network request failed]

import {
  createBrowserClient as _createBrowserClient,
  createServerClient as _createServerClient,
} from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

// ─── ENVIRONMENT ──────────────────────────────────────────────────────────────

interface SupabaseEnv {
  url: string;
  key: string;
}

/**
 * Read and validate the Supabase URL and anon key from environment variables.
 * Supports both Expo (EXPO_PUBLIC_*) and Next.js (NEXT_PUBLIC_*) prefixes so
 * this package can be imported from either app without forking.
 */
function getEnv(): SupabaseEnv {
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  return { url, key };
}

// ─── STORAGE INTERFACE ────────────────────────────────────────────────────────

/**
 * Minimal async key-value storage interface.
 *
 * Both React Native's AsyncStorage and the browser's localStorage satisfy
 * this contract — the union of their return types is used so neither adapter
 * needs a wrapper.
 */
export interface SupabaseStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

// ─── COOKIE STORE INTERFACE ───────────────────────────────────────────────────

/**
 * Minimal interface for the Next.js cookie store passed to createServerClient.
 *
 * IMPORTANT — the `delete` signature must exactly match the overloads exposed
 * by ReadonlyRequestCookies (next/headers) so the type is assignable without
 * a cast:
 *
 *   delete(key: string): ResponseCookies
 *   delete(options: Omit<ResponseCookie, "value" | "expires">): ResponseCookies
 *
 * We model this as a union of the two call signatures. The `set` signature
 * mirrors ResponseCookies.set() which Next.js types as accepting a plain
 * (name, value, options?) triple — matching CookieOptions from @supabase/ssr.
 */
export interface CookieStore {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  // Union of both overloads that ReadonlyRequestCookies exposes:
  delete(key: string): void;
  delete(options: Omit<ResponseCookie, "value" | "expires">): void;
}

// ─── BROWSER CLIENT ───────────────────────────────────────────────────────────

/**
 * Create a Supabase client for use in browser / React Native contexts.
 *
 * @param storage — Optional storage adapter.
 *   • Mobile:  pass AsyncStorage to persist sessions across app restarts.
 *   • Web:     omit — @supabase/ssr handles session storage via cookies.
 */
export function createBrowserClient(storage?: SupabaseStorage) {
  const { url, key } = getEnv();

  return _createBrowserClient(url, key, {
    auth: {
      persistSession: storage !== undefined,
      autoRefreshToken: storage !== undefined,
      detectSessionInUrl: false,
      ...(storage !== undefined ? { storage } : {}),
    },
  });
}

// ─── SERVER CLIENT ────────────────────────────────────────────────────────────

/**
 * Create a Supabase client for use in Next.js server contexts.
 *
 * The caller is responsible for providing a cookie store adapter that
 * bridges the Next.js cookies() API to the @supabase/ssr interface.
 *
 * @param cookieStore — Adapter produced by cookies() from next/headers,
 *   or the request/response pair in Middleware.
 *
 * COOKIE ADAPTER NOTES:
 *   - get()    reads a single cookie value by name.
 *   - set()    writes a cookie; swallowed in Server Components where the
 *              response is already committed (Middleware handles refresh there).
 *   - remove() deletes by name — we use the string overload of delete()
 *              so it works with both ReadonlyRequestCookies and custom stores.
 */
export function createServerClient(cookieStore: CookieStore) {
  const { url, key } = getEnv();

  return _createServerClient(url, key, {
    cookies: {
      get(name: string): string | undefined {
        return cookieStore.get(name)?.value;
      },

      set(name: string, value: string, options: CookieOptions): void {
        try {
          cookieStore.set(name, value, options);
        } catch {
          // Throws when called from a Server Component where the response
          // is already committed. Safe to swallow — the Middleware handles
          // token refresh for Server Components.
        }
      },

      remove(name: string, _options: CookieOptions): void {
        try {
          // Use the string overload — compatible with ReadonlyRequestCookies.
          cookieStore.delete(name);
        } catch {
          // Same reason as set() above.
        }
      },
    },
  });
}
