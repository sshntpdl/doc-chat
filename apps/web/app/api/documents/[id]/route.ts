// GET /api/documents/:id  — poll status during processing
// DELETE /api/documents/:id — cascade deletes chunks + sessions

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "../../_lib/auth";
import { successResponse, errorResponse } from "../../_lib/response";
import { AppError, ErrorCode } from "@docchat/types";

const UUIDSchema = z.string().uuid();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!UUIDSchema.safeParse(id).success) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        "Invalid document ID",
        400,
        false,
      );
    }

    const { data: document, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id) // RLS + explicit user check
      .single();

    if (error || !document) {
      throw new AppError(
        ErrorCode.DOCUMENT_NOT_FOUND,
        "Document not found",
        404,
        false,
      );
    }

    return successResponse({
      document: {
        id: document.id,
        userId: document.user_id,
        name: document.name,
        size: document.size,
        type: document.type,
        status: document.status,
        chunkCount: document.chunk_count,
        errorMessage: document.error_message,
        createdAt: document.created_at,
        updatedAt: document.updated_at,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!UUIDSchema.safeParse(id).success) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        "Invalid document ID",
        400,
        false,
      );
    }

    // RLS ensures only the document owner can delete.
    // ON DELETE CASCADE in the schema handles chunks automatically.
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      throw new AppError(
        ErrorCode.DOCUMENT_NOT_FOUND,
        "Delete failed",
        500,
        true,
      );
    }

    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
