import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // ✅ v0.3.0: get(name) → string, set(name, value, options), remove(name, options)
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: object) {
          request.cookies.set({ name, value, ...(options as any) });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...(options as any) });
        },
        remove(name: string, options: object) {
          request.cookies.set({ name, value: "", ...(options as any) });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...(options as any) });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user };
}
