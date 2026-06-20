// FILE: /apps/web/app/api/chat/history/[sessionId]/route.ts
// GET /api/chat/history/:sessionId — load full message history
// DELETE /api/chat/history/:sessionId — delete session + messages

import { NextRequest }           from "next/server";
import { z }                     from "zod";
import { getAuthenticatedUser }  from "../../../_lib/auth";
import { successResponse, errorResponse } from "../../../_lib/response";
import { AppError, ErrorCode }   from "@docchat/types";

const UUIDSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId }       = await params;
    const { user, supabase }  = await getAuthenticatedUser(request);

    if (!UUIDSchema.safeParse(sessionId).success) {
      throw new AppError(ErrorCode.INVALID_INPUT, "Invalid session ID", 400, false);
    }

    // Fetch the session row
    const { data: session, error: sessionErr } = await supabase
      .from("chat_sessions")
      .select("id, user_id, document_id, title, created_at")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionErr || !session) {
      throw new AppError(ErrorCode.SESSION_NOT_FOUND, "Session not found", 404, false);
    }

    // Fetch all messages in chronological order
    const { data: messages, error: msgsErr } = await supabase
      .from("chat_messages")
      .select("id, session_id, user_id, role, content, sources, created_at")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (msgsErr) {
      throw new AppError(ErrorCode.NETWORK_ERROR, "Failed to load messages", 500, true);
    }

    return successResponse({
      session: {
        id:         session.id,
        userId:     session.user_id,
        documentId: session.document_id,
        title:      session.title,
        messages:   (messages ?? []).map((m: any) => ({
          id:        m.id,
          sessionId: m.session_id,
          userId:    m.user_id,
          role:      m.role,
          content:   m.content,
          sources:   m.sources,
          createdAt: m.created_at,
        })),
        createdAt:  session.created_at,
        isLoaded:   true,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId }       = await params;
    const { user, supabase }  = await getAuthenticatedUser(request);

    if (!UUIDSchema.safeParse(sessionId).success) {
      throw new AppError(ErrorCode.INVALID_INPUT, "Invalid session ID", 400, false);
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
