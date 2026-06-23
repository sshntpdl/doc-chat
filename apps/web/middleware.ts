import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@docchat/supabase/middleware";

// ─── CSP BUILDER ─────────────────────────────────────────────────────────────

function buildCSP(requestUrl: string): string {
  const isDev = process.env.NODE_ENV === "development";

  let requestOrigin = "";
  try {
    requestOrigin = new URL(requestUrl).origin;
  } catch {
    // Malformed URL — skip; 'self' will still cover it in most cases
  }

  const devConnectOrigins = isDev
    ? [
        requestOrigin,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? [process.env.NEXT_PUBLIC_APP_URL]
          : []),
      ].filter(Boolean)
    : [];

  const extraOrigins = [...new Set(devConnectOrigins)];

  const connectSrc = [
    "'self'",
    ...extraOrigins,
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://api.groq.com",
    "https://api-inference.huggingface.co",
  ].join(" ");

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
  ].join("; ");
}

// ─── CORS FOR /api/* ──────────────────────────────────────────────────────────

function isAllowedApiOrigin(origin: string, requestUrl: string): boolean {
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev) {
    // Production: only the canonical app URL may call the API cross-origin.
    return (
      !!process.env.NEXT_PUBLIC_APP_URL &&
      origin === process.env.NEXT_PUBLIC_APP_URL
    );
  }

  let requestOrigin = "";
  try {
    requestOrigin = new URL(requestUrl).origin;
  } catch {
    // ignore
  }

  const allowed = new Set(
    [
      requestOrigin,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      process.env.NEXT_PUBLIC_APP_URL,
    ].filter(Boolean) as string[],
  );

  return allowed.has(origin);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");

  // ── CORS preflight short-circuit ────────────────────────────────────────
  if (pathname.startsWith("/api/") && request.method === "OPTIONS") {
    const allowed = origin ? isAllowedApiOrigin(origin, request.url) : false;
    return new NextResponse(null, {
      status: 204,
      headers: allowed ? corsHeaders(origin!) : {},
    });
  }

  // ── Supabase session refresh ──────────────────────────────────────────────
  const { response, user } = await updateSession(request);

  // ── Route protection ──────────────────────────────────────────────────────
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

  // ── CORS headers on the actual API response ────────────────────────────────
  if (
    pathname.startsWith("/api/") &&
    origin &&
    isAllowedApiOrigin(origin, request.url)
  ) {
    Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  // ── Security headers ──────────────────────────────────────────────────────
  response.headers.set("Content-Security-Policy", buildCSP(request.url));

  return response;
}

// ─── MATCHER ─────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|api/auth|api/debug-session).*)",
  ],
};
