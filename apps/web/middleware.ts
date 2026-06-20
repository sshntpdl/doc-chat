// FILE: /apps/web/middleware.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@docchat/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtectedRoute =
    pathname.startsWith("/dashboard") || pathname.startsWith("/chat");

  if (isProtectedRoute && !user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAuthRoute =
    pathname.startsWith("/auth") && !pathname.startsWith("/auth/callback");

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Excluded from middleware:
    // - _next/static, _next/image, favicon.ico  → static assets
    // - auth/callback                            → PKCE code exchange must run before auth check
    // - api/auth                                 → set-session and debug routes, no session needed
    // - api/debug-session                        → diagnostic (already under api/auth if you want,
    //                                              but kept separate for clarity)
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|api/auth|api/debug-session).*)",
  ],
};
