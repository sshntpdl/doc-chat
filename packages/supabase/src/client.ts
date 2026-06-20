// FILE: /packages/supabase/src/client.ts

import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import { createServerClient as _createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

function getEnv() {
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

// Optional storage interface — matches AsyncStorage shape on mobile
export interface SupabaseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Pass `storage` on mobile (AsyncStorage), leave undefined on web (uses cookies)
export function createBrowserClient(storage?: SupabaseStorage) {
  const { url, key } = getEnv();

  if (storage) {
    // Mobile path: use @supabase/supabase-js directly with AsyncStorage
    // Import dynamically to avoid pulling supabase-js into web bundle path
    const { createClient } = require("@supabase/supabase-js");
    return createClient(url, key, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // no URL hash on mobile
      },
    });
  }

  // Web path: @supabase/ssr handles cookie storage automatically
  return _createBrowserClient(url, key);
}

export function createServerClient(cookieStore: {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): void;
  delete(name: string): void;
}) {
  const { url, key } = getEnv();

  return _createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set(name, value, options);
        } catch {}
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        } catch {}
      },
    },
  });
}
