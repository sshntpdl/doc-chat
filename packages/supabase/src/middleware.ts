// FILE: /packages/supabase/src/middleware.ts
//
// updateSession() is called from /apps/web/middleware.ts on every request.
//
// WHY THIS EXISTS:
// Supabase JWTs expire after 1 hour. The @supabase/ssr package handles
// silent refresh by storing both the access_token AND refresh_token in
// cookies. On each request, if the access_token is expired, this function
// uses the refresh_token to get a new pair and writes the updated cookies
// to the response before it reaches the route handler.
//
// Without this, users would be randomly logged out mid-session.

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          // 🔥 ONLY write to response cookies (DO NOT mutate request)
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // IMPORTANT: triggers refresh + validates session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
