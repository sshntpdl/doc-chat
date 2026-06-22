import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MAX_CHUNK_SIZE = 3180;

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface SetSessionBody {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  user?: Record<string, unknown>;
}

interface CookieOptions {
  path: string;
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none";
  secure: boolean;
  maxAge: number;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getProjectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  return url.split("//")[1].split(".")[0];
}

function buildCookieOptions(maxAge: number): CookieOptions {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

function splitIntoChunks(value: string): string[] {
  let encodedRemaining = encodeURIComponent(value);
  const chunks: string[] = [];

  while (encodedRemaining.length > 0) {
    // Take up to MAX_CHUNK_SIZE encoded characters
    let encodedHead = encodedRemaining.slice(0, MAX_CHUNK_SIZE);

    // Don't cut in the middle of a %XX escape: walk back to the last safe %
    const lastEscapePos = encodedHead.lastIndexOf("%");
    if (lastEscapePos > MAX_CHUNK_SIZE - 3) {
      encodedHead = encodedHead.slice(0, lastEscapePos);
    }

    // Decode the clean head — walk back further if decodeURIComponent throws
    let decodedHead = "";
    let safeEncodedHead = encodedHead;
    while (safeEncodedHead.length > 0) {
      try {
        decodedHead = decodeURIComponent(safeEncodedHead);
        break;
      } catch {
        // Trim the last 3 characters (one potential %XX sequence) and retry
        safeEncodedHead = safeEncodedHead.slice(0, safeEncodedHead.length - 3);
      }
    }

    chunks.push(decodedHead);
    encodedRemaining = encodedRemaining.slice(safeEncodedHead.length);
  }

  return chunks;
}

/**
 * Serialize the Supabase session into the JSON string that auth-js expects
 * to JSON.parse() when it reads the cookie back.
 */
function buildSessionPayload(body: SetSessionBody): string {
  return JSON.stringify({
    access_token: body.access_token,
    token_type: "bearer",
    expires_in: body.expires_in ?? 3600,
    expires_at: body.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    refresh_token: body.refresh_token,
    user: body.user,
  });
}

/**
 * Write session cookies onto an existing NextResponse.
 */
function writeSessionCookies(
  response: NextResponse,
  cookieName: string,
  payload: string,
  maxAge: number,
): void {
  const options = buildCookieOptions(maxAge);
  const encodedLength = encodeURIComponent(payload).length;

  if (encodedLength <= MAX_CHUNK_SIZE) {
    response.cookies.set(cookieName, payload, options);
    return;
  }

  const chunks = splitIntoChunks(payload);
  chunks.forEach((chunk, index) => {
    response.cookies.set(`${cookieName}.${index}`, chunk, options);
  });
}

/**
 * Clear the base cookie and the first 5 chunk cookies (indices 0–4).
 */
function clearSessionCookies(response: NextResponse, cookieName: string): void {
  const clearOptions = { path: "/", maxAge: 0 };
  response.cookies.set(cookieName, "", clearOptions);
  for (let i = 0; i < 5; i++) {
    response.cookies.set(`${cookieName}.${i}`, "", clearOptions);
  }
}

// ─── ROUTE HANDLERS ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as SetSessionBody;
    const { access_token, refresh_token, user } = body;

    if (!access_token || !refresh_token || !user) {
      return NextResponse.json(
        { error: "Missing tokens or user" },
        { status: 400 },
      );
    }

    const cookieName = `sb-${getProjectRef()}-auth-token`;
    const maxAge = body.expires_in ?? 3600;
    const payload = buildSessionPayload(body);
    const response = NextResponse.json({ ok: true });

    writeSessionCookies(response, cookieName, payload, maxAge);

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest): Promise<NextResponse> {
  const cookieName = `sb-${getProjectRef()}-auth-token`;
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response, cookieName);
  return response;
}
