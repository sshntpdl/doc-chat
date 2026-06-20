// FILE: /apps/web/app/api/auth/set-session/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CHUNK_SIZE = 3180; // v0.3.0 MAX_CHUNK_SIZE

function getProjectRef() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!.split("//")[1].split(".")[0];
}

function buildCookieOptions(maxAge: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at?: number;
      expires_in?: number;
      user?: object;
    };

    const { access_token, refresh_token, expires_at, expires_in, user } = body;

    if (!access_token || !refresh_token || !user) {
      return NextResponse.json(
        { error: "Missing tokens or user" },
        { status: 400 },
      );
    }

    const COOKIE_NAME = `sb-${getProjectRef()}-auth-token`;
    const maxAge = expires_in ?? 3600;

    // v0.3.0: plain JSON string, no base64 encoding
    // auth-js stores session as JSON.stringify(session) and reads with JSON.parse()
    // @supabase/ssr v0.3.0 getItem returns raw cookie value, auth-js JSON.parses it
    const sessionPayload = JSON.stringify({
      access_token,
      token_type: "bearer",
      expires_in: expires_in ?? 3600,
      expires_at: expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      refresh_token,
      user,
    });

    const response = NextResponse.json({ ok: true });

    // v0.3.0 createChunks uses encodeURIComponent to measure size
    const encodedLength = encodeURIComponent(sessionPayload).length;

    if (encodedLength <= CHUNK_SIZE) {
      // Fits in one cookie — name: sb-*-auth-token
      response.cookies.set(
        COOKIE_NAME,
        sessionPayload,
        buildCookieOptions(maxAge),
      );
    } else {
      // Chunk it — v0.3.0 reads sb-*-auth-token.0, .1, .2 ...
      // Must chunk exactly like createChunks does
      let encodedValue = encodeURIComponent(sessionPayload);
      const chunks: string[] = [];

      while (encodedValue.length > 0) {
        let encodedChunkHead = encodedValue.slice(0, CHUNK_SIZE);
        const lastEscapePos = encodedChunkHead.lastIndexOf("%");
        if (lastEscapePos > CHUNK_SIZE - 3) {
          encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
        }
        let valueHead = "";
        while (encodedChunkHead.length > 0) {
          try {
            valueHead = decodeURIComponent(encodedChunkHead);
            break;
          } catch {
            encodedChunkHead = encodedChunkHead.slice(
              0,
              encodedChunkHead.length - 3,
            );
          }
        }
        chunks.push(valueHead);
        encodedValue = encodedValue.slice(encodedChunkHead.length);
      }

      chunks.forEach((chunk, i) => {
        response.cookies.set(
          `${COOKIE_NAME}.${i}`,
          chunk,
          buildCookieOptions(maxAge),
        );
      });
    }

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest) {
  const COOKIE_NAME = `sb-${getProjectRef()}-auth-token`;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  for (let i = 0; i < 5; i++) {
    response.cookies.set(`${COOKIE_NAME}.${i}`, "", { path: "/", maxAge: 0 });
  }
  return response;
}
