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
  if (request) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);

      // Create a client with the token baked into every request header.
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
