import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "../../_lib/auth";
import { successResponse, errorResponse } from "../../_lib/response";
import { AppError, ErrorCode } from "@docchat/types";
import type { ChatSession } from "@docchat/types";

// ─── RAW DB ROW TYPE ──────────────────────────────────────────────────────────

interface RawSessionRow {
  id: string;
  user_id: string;
  document_id: string | null;
  title: string;
  created_at: string;
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

const QuerySchema = z.object({
  documentId: z.string().uuid({ message: "documentId must be a valid UUID" }),
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

// ─── MAPPER ───────────────────────────────────────────────────────────────────

/**
 * Map a raw Supabase session row to the ChatSession domain type.
 */
function mapSessionStub(row: RawSessionRow): ChatSession {
  return {
    id: row.id,
    userId: row.user_id,
    documentId: row.document_id,
    title: row.title,
    messages: [],
    createdAt: row.created_at,
    isLoaded: false,
  };
}

// ─── ROUTE HANDLER ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = QuerySchema.safeParse(raw);

    if (!parsed.success) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        parsed.error.errors[0]?.message ?? "Invalid query parameters",
        400,
        false,
      );
    }

    const { documentId, cursor, limit } = parsed.data;

    // 1. Start with the base query and immediate filters
    let query = supabase
      .from("chat_sessions")
      .select("id, user_id, document_id, title, created_at")
      .eq("user_id", user.id)
      .eq("document_id", documentId);

    // 2. Conditionally apply the cursor filter while it's still a FilterBuilder
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    // 3. Apply sorting, limits, and type casting at the very end
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit + 1)
      .returns<RawSessionRow[]>();

    if (error) {
      throw new AppError(
        ErrorCode.NETWORK_ERROR,
        "Failed to load sessions",
        500,
        true,
      );
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    // Trim the extra row we fetched for the hasMore check
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // The next cursor is the created_at of the last row in this page.
    const nextCursor: string | null =
      hasMore && pageRows.length > 0
        ? pageRows[pageRows.length - 1].created_at
        : null;

    const sessions: ChatSession[] = pageRows.map(mapSessionStub);

    return successResponse({ sessions, nextCursor, hasMore });
  } catch (err) {
    return errorResponse(err);
  }
}
