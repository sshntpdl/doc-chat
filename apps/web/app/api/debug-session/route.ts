import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(_request: NextRequest) {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const supabaseCookies = allCookies
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => ({ name: c.name, length: c.value.length }));

  const projectRef = process.env
    .NEXT_PUBLIC_SUPABASE_URL!.split("//")[1]
    .split(".")[0];
  const rawCookie = allCookies.find(
    (c) => c.name === `sb-${projectRef}-auth-token`,
  );
  let decodedCookie = null,
    decodeError = null;
  if (rawCookie) {
    try {
      decodedCookie = JSON.parse(decodeURIComponent(rawCookie.value));
    } catch (e) {
      decodeError = `JSON parse failed: ${e}. Raw (first 200): ${rawCookie.value.slice(0, 200)}`;
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // ✅ v0.3.0: must use get(name) returning a string, NOT getAll()
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    },
  );

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    supabaseCookies,
    totalCookieCount: allCookies.length,
    decodedCookie,
    decodeError,
    session: session
      ? { expires_at: session.expires_at, has_user: !!session.user }
      : null,
    sessionError: sessionError?.message ?? null,
    user: user ? { id: user.id, email: user.email } : null,
    userError: userError?.message ?? null,
  });
}
