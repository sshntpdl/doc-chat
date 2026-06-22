import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface SessionUpdateResult {
  response: NextResponse;
  user: import("@supabase/supabase-js").User | null;
}

// ─── SESSION REFRESH ──────────────────────────────────────────────────────────

export async function updateSession(
  request: NextRequest,
): Promise<SessionUpdateResult> {
  // Start with a pass-through response that forwards the original headers.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "[Middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string): string | undefined {
        return request.cookies.get(name)?.value;
      },

      set(name: string, value: string, options: CookieOptions): void {
        // Write the updated cookie onto the request so subsequent middleware
        request.cookies.set(name, value);

        // Recreate the response so the Set-Cookie header is included.
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set(name, value, options);
      },

      remove(name: string, options: CookieOptions): void {
        request.cookies.set(name, "");

        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set(name, "", options);
      },
    },
  });

  // Calling getUser() triggers a token refresh if the access token has
  // expired but the refresh token is still valid.  We don't gate routing
  // logic on the result here — that belongs in individual route handlers.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
