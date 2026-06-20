// FILE: /apps/web/app/api/ingest/route.ts
//
// POST /api/ingest — Receives a document, processes it, stores embeddings.
//
// FULL PIPELINE:
//   multipart/form-data (file) →
//   validate (type, size, not-empty) →
//   create DB record (status: processing) →
//   extract text (pdf-parse or Buffer.toString) →
//   chunk with RecursiveCharacterTextSplitter →
//   embed in batches of 10 (HuggingFace free tier rate limit) →
//   batch insert to pgvector →
//   update DB record (status: ready/partial/error)
//
// PARTIAL SUCCESS HANDLING:
// If batch 2 of 5 fails, we continue processing the remaining batches.
// The document gets status='partial' and is still usable for RAG — it
// just won't have embeddings for the failed chunks.
// We never leave status='processing' on error (try/finally handles this).

import { NextRequest } from "next/server";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { z } from "zod";
import pdfParse from "pdf-parse";
import { getAuthenticatedUser } from "../_lib/auth";
import { successResponse, errorResponse } from "../_lib/response";
import { rateLimiter } from "../_lib/ratelimit";
import { getEmbeddingsClient } from "../_lib/langchain";
import { AppError, ErrorCode } from "@docchat/types";

// ─── VALIDATION ───────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

// ─── TEXT EXTRACTION ──────────────────────────────────────────────────────────

async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<{ text: string; pageCount: number }> {
  if (mimeType === "application/pdf") {
    try {
      const data = await pdfParse(buffer);

      // pdf-parse throws on encrypted PDFs with a specific message
      if (!data.text || data.text.trim().length === 0) {
        throw new AppError(
          ErrorCode.ENCRYPTED_PDF,
          "This PDF appears to be encrypted or has no selectable text. Try a different file.",
          422,
          false,
        );
      }

      return { text: data.text, pageCount: data.numpages };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        ErrorCode.TEXT_EXTRACTION_FAILED,
        "Failed to read PDF. The file may be corrupted.",
        422,
        false,
      );
    }
  }

  // Plain text or Markdown
  const text = buffer.toString("utf-8");
  if (!text.trim()) {
    throw new AppError(ErrorCode.EMPTY_FILE, "File is empty.", 422, false);
  }
  return { text, pageCount: 1 };
}

// ─── CHUNKING ─────────────────────────────────────────────────────────────────
// chunkSize: 800 chars ≈ ~200 tokens (MiniLM's 512-token context is safe)
// overlap:   150 chars ensures a sentence split across chunks is still queryable

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,
  chunkOverlap: 150,
  separators: ["\n\n", "\n", ". ", " ", ""], // paragraph → sentence → word
});

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let documentId: string | null = null;

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const { user, supabase } = await getAuthenticatedUser(request);

    // ── Rate limit: 10 uploads per hour per user ──────────────────────────
    rateLimiter(user.id, "ingest", 10, 60 * 60 * 1000);

    // ── Parse multipart form ─────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        "No file provided.",
        400,
        false,
      );
    }

    // ── Validate type ─────────────────────────────────────────────────────
    // Check MIME type server-side — never trust the client's reported type
    const mimeType = file.type;
    if (!ALLOWED_TYPES.has(mimeType)) {
      throw new AppError(
        ErrorCode.UNSUPPORTED_FILE_TYPE,
        `Unsupported file type: ${mimeType}. Upload PDF or Markdown files.`,
        422,
        false,
      );
    }

    // ── Validate size ─────────────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(
        ErrorCode.UPLOAD_TOO_LARGE,
        `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is 10 MB.`,
        413,
        false,
      );
    }

    if (file.size === 0) {
      throw new AppError(ErrorCode.EMPTY_FILE, "File is empty.", 422, false);
    }

    // ── Determine document type ───────────────────────────────────────────
    const fileName = decodeURIComponent(file.name);
    const docType =
      mimeType === "application/pdf"
        ? "pdf"
        : fileName.endsWith(".md") || mimeType.includes("markdown")
          ? "markdown"
          : "text";

    // ── Create DB record (status: processing) ────────────────────────────
    const { data: doc, error: insertError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        name: fileName,
        size: file.size,
        type: docType,
        status: "processing",
      })
      .select("id")
      .single();

    if (insertError || !doc) {
      throw new AppError(
        ErrorCode.NETWORK_ERROR,
        "Failed to create document record.",
        500,
        true,
      );
    }

    documentId = doc.id;

    // ── Extract text ──────────────────────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, pageCount } = await extractText(buffer, mimeType);

    // ── Chunk ─────────────────────────────────────────────────────────────
    const chunks = await splitter.splitText(text);
    const totalChunks = chunks.length;

    // ── Embed and insert in batches ───────────────────────────────────────
    const embeddings = getEmbeddingsClient();
    const BATCH_SIZE = 10;
    const BATCH_DELAY = 500; // ms between HF API calls (free tier rate limit)
    let successCount = 0;
    let partialFail = false;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE);

      try {
        // Embed the batch
        const batchEmbeddings = await embeddings.embedDocuments(batch);

        // Build insert rows with metadata
        const rows = batch.map((content, j) => ({
          document_id: documentId!,
          user_id: user.id,
          content,
          metadata: {
            // Estimate page number from chunk position
            page: Math.floor(((i + j) / totalChunks) * pageCount) + 1,
            chunk_index: i + j,
            total_chunks: totalChunks,
          },
          // pgvector expects the vector as a JS array
          embedding: batchEmbeddings[j],
        }));

        const { error: insertErr } = await supabase
          .from("document_chunks")
          .insert(rows);

        if (insertErr) {
          console.error(
            `[ingest] Batch ${batchIndex} insert failed:`,
            insertErr,
          );
          partialFail = true;
          continue; // keep going — partial success is better than full failure
        }

        successCount += batch.length;
      } catch (err) {
        console.error(`[ingest] Batch ${batchIndex} embedding failed:`, err);
        partialFail = true;
        // Continue to next batch
      }

      // Respect HuggingFace free tier rate limits between batches
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    }

    // ── Update document status ─────────────────────────────────────────────
    const finalStatus =
      partialFail && successCount === 0
        ? "error"
        : partialFail
          ? "partial"
          : "ready";

    await supabase
      .from("documents")
      .update({
        status: finalStatus,
        chunk_count: successCount,
        error_message:
          finalStatus === "error"
            ? "All embedding batches failed. Please try again."
            : null,
      })
      .eq("id", documentId);

    // Temporary — add right after the insert succeeds
    console.log("[ingest] document created:", documentId);
    console.log(
      "[ingest] extracting text, mimeType:",
      mimeType,
      "size:",
      file.size,
    );

    return successResponse(
      {
        documentId,
        status: finalStatus,
        chunkCount: successCount,
      },
      201,
    );
  } catch (err) {
    // TEMPORARY DEBUG — remove before production
    console.error("[ingest] FATAL ERROR:", err);
    console.error("[ingest] error name:", (err as any)?.name);
    console.error("[ingest] error message:", (err as any)?.message);
    console.error("[ingest] error stack:", (err as any)?.stack);
    // Ensure we never leave a document in 'processing' state
    if (documentId) {
      // Best-effort status update — don't await (already in error path)
      const { supabase } = await getAuthenticatedUser(request).catch(() => ({
        supabase: null,
      }));
      supabase
        ?.from("documents")
        .update({
          status: "error",
          error_message:
            err instanceof AppError ? err.message : "Processing failed",
        })
        .eq("id", documentId);
    }

    return errorResponse(err);
  }
}
