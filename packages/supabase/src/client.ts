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

export function createBrowserClient() {
  const { url, key } = getEnv();
  return _createBrowserClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// ✅ v0.3.0: cookieStore must expose get(name), set(name,value,options), delete(name)
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
