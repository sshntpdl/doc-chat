// FILE: /apps/web/app/api/documents/route.ts
// GET /api/documents — returns all documents for the authenticated user

import { NextRequest }              from "next/server";
import { getAuthenticatedUser }     from "../_lib/auth";
import { successResponse, errorResponse } from "../_lib/response";

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    const { data: documents, error } = await supabase
      .from("documents")
      .select("id, user_id, name, size, type, status, chunk_count, error_message, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Map snake_case DB columns to camelCase TS types
    const mapped = (documents ?? []).map((d: any) => ({
      id:           d.id,
      userId:       d.user_id,
      name:         d.name,
      size:         d.size,
      type:         d.type,
      status:       d.status,
      chunkCount:   d.chunk_count,
      errorMessage: d.error_message,
      createdAt:    d.created_at,
      updatedAt:    d.updated_at,
    }));

    return successResponse({ documents: mapped });
  } catch (err) {
    return errorResponse(err);
  }
}
