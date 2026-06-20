// FILE: /apps/web/middleware.ts
//
// Runs on EVERY request before it reaches any route handler or page.
// Two responsibilities:
//   1. Refresh the Supabase JWT if it's expired (via updateSession)
//   2. Enforce authentication rules — redirect unauthenticated users
//      away from protected routes, and authenticated users away from
//      auth pages (so they don't see the login form when already signed in)
//
// ROUTE RULES:
//   /dashboard/**  → must be authenticated  → else redirect to /auth/login
//   /chat/**       → must be authenticated  → else redirect to /auth/login
//   /auth/**       → must be unauthenticated → else redirect to /dashboard
//   everything else → public (landing page, static assets)

import { NextResponse }    from "next/server";
import type { NextRequest } from "next/server";
import { updateSession }   from "@docchat/supabase/middleware";

export async function middleware(request: NextRequest) {
  // updateSession() refreshes the JWT cookie if needed and returns
  // the (possibly updated) response and the current user.
  const { response, user } = await updateSession(request);

  const { pathname } = request.nextUrl;

  // ── Protected routes ────────────────────────────────────────────────────────
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/chat");

  if (isProtectedRoute && !user) {
    // Preserve the attempted URL so we can redirect back after login
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Auth routes (redirect away if already logged in) ─────────────────────
  const isAuthRoute = pathname.startsWith("/auth");

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Pass the (possibly cookie-refreshed) response through
  return response;
}

// Tell Next.js which paths to run middleware on.
// Exclude static files, _next internals, and the Supabase auth callback
// (callback needs to run without session to exchange the code).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/callback).*)",
  ],
};
