// FILE: /apps/web/app/api/_lib/auth.ts
//
// Every Route Handler calls getAuthenticatedUser() as its first line.
// This function validates the request regardless of whether it came from:
//   - The Next.js web app (JWT in HTTP-only cookie, set by @supabase/ssr)
//   - The React Native mobile app (JWT in Authorization: Bearer <token> header)
//
// WHY DUAL-SOURCE VALIDATION:
// Next.js Server Components and Route Handlers automatically have access to
// cookies. But React Native can't use cookies (no browser cookie jar), so
// mobile passes the token in the Authorization header instead.
// We check cookies first (web), then fall back to the header (mobile).
//
// WHY getUser() NOT getSession():
// getSession() trusts the JWT without re-validating it against Supabase.
// getUser() makes a network call to verify the token is still valid and
// not revoked. Security-critical: always use getUser() in Route Handlers.
//
// WHY A SEPARATE CLIENT FOR MOBILE:
// The cookie-based createServerClient has no awareness of Authorization
// headers. Even if getUser(token) succeeds on it, every subsequent query
// (insert, update, select) still runs as an anonymous user because the
// client's internal session is cookie-derived (and empty for mobile).
// We must create a second client with the Bearer token baked into
// global.headers so that auth.uid() resolves correctly inside RLS policies.

import { cookies } from "next/headers";
import { createServerClient } from "@docchat/supabase";
import { createClient } from "@supabase/supabase-js";
import { AppError, ErrorCode } from "@docchat/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface AuthContext {
  user: User;
  supabase: SupabaseClient;
}

export async function getAuthenticatedUser(
  request?: Request,
): Promise<AuthContext> {
  // ── Mobile path: Bearer token in Authorization header ───────────────────
  // Check this FIRST — if a Bearer token is present, use the token-scoped
  // client. Don't fall through to cookies, which would produce a client
  // that can validate the user but can't satisfy RLS on subsequent queries.
  if (request) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);

      // Create a client with the token baked into every request header.
      // This is what makes auth.uid() resolve inside RLS policies.
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      );

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw new AppError(
          ErrorCode.UNAUTHORIZED,
          "Invalid or expired token.",
          401,
          false,
        );
      }

      return { user, supabase };
    }
  }

  // ── Web path: session stored in HTTP-only cookies ───────────────────────
  // createServerClient wires up the @supabase/ssr cookie adapter, which
  // handles silent token refresh and writes updated cookies to the response.
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      "Authentication required.",
      401,
      false,
    );
  }

  return { user, supabase };
}
