// FILE: /apps/web/app/api/chat/sessions/route.ts
//
// GET /api/chat/sessions?documentId=<uuid>&cursor=<iso-timestamp>&limit=<n>
//
// Returns a page of chat sessions belonging to the authenticated user,
// filtered by documentId, ordered newest-first (created_at DESC).
//
// Pagination is cursor-based using `created_at` as the cursor:
//   - First page: omit `cursor`
//   - Next pages: pass the `nextCursor` value returned by the previous page
//
// This avoids the "offset drift" problem (rows shift when new sessions are
// created between pages) that plagues OFFSET-based pagination.
//
// Response shape:
// {
//   sessions: SessionSummary[],   // title + metadata only, no messages
//   nextCursor: string | null,    // ISO timestamp for the next page; null = end
//   hasMore: boolean,
// }

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "../../_lib/auth";
import { successResponse, errorResponse } from "../../_lib/response";
import { AppError, ErrorCode } from "@docchat/types";

// ─── VALIDATION ───────────────────────────────────────────────────────────────

const QuerySchema = z.object({
  documentId: z.string().uuid({ message: "documentId must be a valid UUID" }),
  // ISO-8601 timestamp — the created_at of the last item from the previous page
  cursor: z.string().datetime({ offset: true }).optional(),
  // How many sessions to return per page. Capped at 50 server-side.
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    // Parse + validate query params
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

    // We fetch limit + 1 rows so we can detect whether a next page exists
    // without a separate COUNT query.
    let query = supabase
      .from("chat_sessions")
      .select("id, user_id, document_id, title, created_at")
      .eq("user_id", user.id)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    // Cursor: return only sessions older than the cursor timestamp
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;

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
    const sessions = hasMore ? rows.slice(0, limit) : rows;

    // The next cursor is the created_at of the last item in this page.
    // The next request will use lt("created_at", nextCursor) to continue.
    const nextCursor =
      hasMore && sessions.length > 0
        ? sessions[sessions.length - 1].created_at
        : null;

    return successResponse({
      sessions: sessions.map((s: any) => ({
        id: s.id,
        userId: s.user_id,
        documentId: s.document_id,
        title: s.title,
        createdAt: s.created_at,
        // Sessions fetched from this endpoint are stubs — no messages loaded yet.
        // The chatStore will hydrate messages on demand via loadHistory().
        messages: [],
        isLoaded: false,
      })),
      nextCursor,
      hasMore,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
