import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "../../../_lib/auth";
import { successResponse, errorResponse } from "../../../_lib/response";
import { AppError, ErrorCode } from "@docchat/types";
import type {
  ChatSession,
  ChatMessage,
  MessageRole,
  SourceCitation,
} from "@docchat/types";

// ─── VALIDATION ───────────────────────────────────────────────────────────────

const UUIDSchema = z.string().uuid();

// ─── RAW DB ROW TYPES ─────────────────────────────────────────────────────────

interface RawSessionRow {
  id: string;
  user_id: string;
  document_id: string | null;
  title: string;
  created_at: string;
}

interface RawMessageRow {
  id: string;
  session_id: string;
  user_id: string;
  role: string;
  content: string;
  sources: SourceCitation[] | null;
  created_at: string;
}

// ─── MAPPERS ──────────────────────────────────────────────────────────────────

function mapMessage(row: RawMessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    role: row.role as MessageRole,
    content: row.content,
    sources: row.sources ?? undefined,
    createdAt: row.created_at,
  };
}

function mapSession(row: RawSessionRow, messages: ChatMessage[]): ChatSession {
  return {
    id: row.id,
    userId: row.user_id,
    documentId: row.document_id,
    title: row.title,
    messages,
    createdAt: row.created_at,
    isLoaded: true,
  };
}

// ─── ROUTE HANDLERS ───────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  try {
    const { sessionId } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!UUIDSchema.safeParse(sessionId).success) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        "Invalid session ID",
        400,
        false,
      );
    }

    // ── Fetch session row ────────────────────────────────────────────────
    const { data: sessionRow, error: sessionErr } = await supabase
      .from("chat_sessions")
      .select("id, user_id, document_id, title, created_at")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single<RawSessionRow>();

    if (sessionErr || !sessionRow) {
      throw new AppError(
        ErrorCode.SESSION_NOT_FOUND,
        "Session not found",
        404,
        false,
      );
    }

    // ── Fetch all messages in chronological order ────────────────────────
    const { data: messageRows, error: msgsErr } = await supabase
      .from("chat_messages")
      .select("id, session_id, user_id, role, content, sources, created_at")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .returns<RawMessageRow[]>();

    if (msgsErr) {
      throw new AppError(
        ErrorCode.NETWORK_ERROR,
        "Failed to load messages",
        500,
        true,
      );
    }

    const messages = (messageRows ?? [])
      .filter(
        (row): row is RawMessageRow =>
          row.role === "user" || row.role === "assistant",
      )
      .map(mapMessage);

    return successResponse({ session: mapSession(sessionRow, messages) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  try {
    const { sessionId } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!UUIDSchema.safeParse(sessionId).success) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        "Invalid session ID",
        400,
        false,
      );
    }

    // ON DELETE CASCADE removes chat_messages automatically
    const { error } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", user.id);

    if (error) {
      throw new AppError(ErrorCode.NETWORK_ERROR, "Delete failed", 500, true);
    }

    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
