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

export interface SupabaseStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

// ─── COOKIE STORE INTERFACE ───────────────────────────────────────────────────

export interface CookieStore {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(key: string): void;
  delete(options: Omit<ResponseCookie, "value" | "expires">): void;
}

// ─── BROWSER CLIENT ───────────────────────────────────────────────────────────

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
          cookieStore.delete(name);
        } catch {
          // Same reason as set() above.
        }
      },
    },
  });
}
