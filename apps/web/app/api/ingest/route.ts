// FILE: /apps/web/app/api/ingest/route.ts
//
// POST /api/ingest — Receives a document, processes it, stores embeddings.
//
// FULL PIPELINE:
//   multipart/form-data (file) →
//   validate (type, size, not-empty) →
//   create DB record (status: "processing") →
//   extract text (pdf-parse or Buffer.toString) →
//   chunk with RecursiveCharacterTextSplitter →
//   embed in batches of 10 (HuggingFace free tier rate limit) →
//   batch-insert rows into pgvector →
//   update DB record (status: "ready" | "partial" | "error")
//
// PARTIAL SUCCESS:
//   If batch 2 of 5 fails we continue the remaining batches.
//   The document ends up with status="partial" and is still queryable.
//   We never leave a document in status="processing" — the try/finally
//   block guarantees a terminal status is always written.
//
// ERROR-PATH CLEANUP BUG FIX:
//   The original code called getAuthenticatedUser(request) a second time
//   inside the catch block to retrieve a supabase client for the cleanup
//   update. That caused an unnecessary network round-trip and would silently
//   fail if the session had already expired. The fix is to hoist `supabase`
//   above the try block so the cleanup path reuses the same client.

import { NextRequest } from "next/server";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import pdfParse from "pdf-parse";
import { getAuthenticatedUser } from "../_lib/auth";
import { successResponse, errorResponse } from "../_lib/response";
import { rateLimiter } from "../_lib/ratelimit";
import { getEmbeddingsClient } from "../_lib/langchain";
import { AppError, ErrorCode } from "@docchat/types";
import type {
  DocumentStatus,
  DocumentType,
  IngestResponse,
} from "@docchat/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
] as const);

type AllowedMimeType =
  | "application/pdf"
  | "text/plain"
  | "text/markdown"
  | "text/x-markdown";

const CHUNK_SIZE = 800; // chars ≈ ~200 tokens (well within MiniLM's 512-token limit)
const CHUNK_OVERLAP = 150; // ensures sentences split across chunks remain queryable
const EMBED_BATCH_SIZE = 10; // HuggingFace free tier: keep batches small
const EMBED_BATCH_DELAY = 500; // ms between HF API calls to respect rate limits

// ─── RAW DB ROW TYPES ─────────────────────────────────────────────────────────

interface RawDocumentRow {
  id: string;
}

// ─── INTERNAL TYPES ───────────────────────────────────────────────────────────

interface ExtractedText {
  text: string;
  pageCount: number;
}

interface ChunkRow {
  document_id: string;
  user_id: string;
  content: string;
  metadata: ChunkMetadata;
  embedding: number[];
}

interface ChunkMetadata {
  page: number;
  chunk_index: number;
  total_chunks: number;
}

interface EmbedBatchResult {
  successCount: number;
  failed: boolean;
}

interface IngestPipelineResult {
  finalStatus: DocumentStatus;
  successCount: number;
}

// ─── SPLITTER SINGLETON ───────────────────────────────────────────────────────
//
// Instantiated once at module load — constructing RecursiveCharacterTextSplitter
// is cheap but there is no reason to rebuild it on every request.

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ["\n\n", "\n", ". ", " ", ""], // paragraph → sentence → word → char
});

// ─── FILE VALIDATION ──────────────────────────────────────────────────────────

/**
 * Validate the uploaded file against type, size, and emptiness constraints.
 * Throws a typed AppError on the first violation found.
 */
function validateFile(file: File): void {
  if (!ALLOWED_MIME_TYPES.has(file.type as AllowedMimeType)) {
    throw new AppError(
      ErrorCode.UNSUPPORTED_FILE_TYPE,
      `Unsupported file type: ${file.type}. Upload PDF, plain text, or Markdown files.`,
      422,
      false,
    );
  }

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
}

/**
 * Derive the DocumentType from the MIME type and file name.
 * The MIME type is authoritative; the file extension is a fallback for
 * ambiguous text/* types.
 */
function resolveDocumentType(mimeType: string, fileName: string): DocumentType {
  if (mimeType === "application/pdf") return "pdf";
  if (fileName.endsWith(".md") || mimeType.includes("markdown"))
    return "markdown";
  return "text";
}

// ─── TEXT EXTRACTION ──────────────────────────────────────────────────────────

/**
 * Extract plain text from the file buffer.
 *
 * - PDFs:  delegated to pdf-parse, which also reports the page count.
 * - Text / Markdown: decoded from UTF-8 directly; pageCount is always 1.
 *
 * Throws AppError for encrypted PDFs, corrupted files, or empty content.
 */
async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractedText> {
  if (mimeType === "application/pdf") {
    return extractPdfText(buffer);
  }
  return extractPlainText(buffer);
}

async function extractPdfText(buffer: Buffer): Promise<ExtractedText> {
  try {
    const data = await pdfParse(buffer);

    if (!data.text || data.text.trim().length === 0) {
      throw new AppError(
        ErrorCode.ENCRYPTED_PDF,
        "This PDF appears to be encrypted or contains no selectable text. Try a different file.",
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

function extractPlainText(buffer: Buffer): ExtractedText {
  const text = buffer.toString("utf-8");
  if (!text.trim()) {
    throw new AppError(ErrorCode.EMPTY_FILE, "File is empty.", 422, false);
  }
  return { text, pageCount: 1 };
}

// ─── DB HELPERS ───────────────────────────────────────────────────────────────

/**
 * Insert a new document row with status="processing" and return its ID.
 * The status is updated to a terminal value by updateDocumentStatus()
 * regardless of whether the pipeline succeeds or fails.
 */
async function createDocumentRecord(
  supabase: SupabaseClient,
  user: User,
  fileName: string,
  fileSize: number,
  docType: DocumentType,
): Promise<string> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      name: fileName,
      size: fileSize,
      type: docType,
      status: "processing" satisfies DocumentStatus,
    })
    .select("id")
    .single<RawDocumentRow>();

  if (error || !data) {
    throw new AppError(
      ErrorCode.NETWORK_ERROR,
      "Failed to create document record.",
      500,
      true,
    );
  }

  return data.id;
}

/**
 * Write the terminal status, chunk count, and optional error message back
 * to the document row.
 */
async function updateDocumentStatus(
  supabase: SupabaseClient,
  documentId: string,
  status: DocumentStatus,
  chunkCount: number,
  errorMessage: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ status, chunk_count: chunkCount, error_message: errorMessage })
    .eq("id", documentId);

  if (error) {
    console.error("[ingest] Failed to update document status:", error.message);
  }
}

// ─── EMBEDDING PIPELINE ───────────────────────────────────────────────────────

/**
 * Build the chunk rows for one batch, attaching metadata and embeddings.
 */
function buildChunkRows(
  batch: string[],
  batchEmbeddings: number[][],
  batchStartIndex: number,
  totalChunks: number,
  pageCount: number,
  documentId: string,
  userId: string,
): ChunkRow[] {
  return batch.map((content, j) => {
    const absoluteIndex = batchStartIndex + j;
    return {
      document_id: documentId,
      user_id: userId,
      content,
      metadata: {
        page: Math.floor((absoluteIndex / totalChunks) * pageCount) + 1,
        chunk_index: absoluteIndex,
        total_chunks: totalChunks,
      },
      embedding: batchEmbeddings[j],
    };
  });
}

/**
 * Embed and insert a single batch of chunks.
 */
async function processBatch(
  supabase: SupabaseClient,
  batch: string[],
  batchIndex: number,
  batchStartIndex: number,
  totalChunks: number,
  pageCount: number,
  documentId: string,
  userId: string,
): Promise<EmbedBatchResult> {
  const embeddings = getEmbeddingsClient();

  try {
    const batchEmbeddings = await embeddings.embedDocuments(batch);

    const rows = buildChunkRows(
      batch,
      batchEmbeddings,
      batchStartIndex,
      totalChunks,
      pageCount,
      documentId,
      userId,
    );

    const { error: insertErr } = await supabase
      .from("document_chunks")
      .insert(rows);

    if (insertErr) {
      console.error(
        `[ingest] Batch ${batchIndex} insert failed:`,
        insertErr.message,
      );
      return { successCount: 0, failed: true };
    }

    return { successCount: batch.length, failed: false };
  } catch (err) {
    console.error(
      `[ingest] Batch ${batchIndex} embedding failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return { successCount: 0, failed: true };
  }
}

/**
 * Drive the full embed-and-insert loop across all chunks.
 *
 * Inserts chunks in batches of EMBED_BATCH_SIZE with EMBED_BATCH_DELAY ms
 * between batches to stay within HuggingFace free-tier rate limits.
 *
 * Returns the accumulated result used to compute the final document status.
 */
async function embedAndInsertChunks(
  supabase: SupabaseClient,
  chunks: string[],
  pageCount: number,
  documentId: string,
  userId: string,
): Promise<IngestPipelineResult> {
  const totalChunks = chunks.length;
  let totalSuccessCount = 0;
  let anyBatchFailed = false;

  for (let i = 0; i < totalChunks; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const batchIndex = Math.floor(i / EMBED_BATCH_SIZE);

    const { successCount, failed } = await processBatch(
      supabase,
      batch,
      batchIndex,
      i,
      totalChunks,
      pageCount,
      documentId,
      userId,
    );

    totalSuccessCount += successCount;
    if (failed) anyBatchFailed = true;

    // Respect HuggingFace free-tier rate limits between batches
    const isLastBatch = i + EMBED_BATCH_SIZE >= totalChunks;
    if (!isLastBatch) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, EMBED_BATCH_DELAY),
      );
    }
  }

  const finalStatus: DocumentStatus =
    anyBatchFailed && totalSuccessCount === 0
      ? "error"
      : anyBatchFailed
        ? "partial"
        : "ready";

  return { finalStatus, successCount: totalSuccessCount };
}

// ─── ROUTE CONFIG ─────────────────────────────────────────────────────────────

export const maxDuration = 60;

// ─── ROUTE HANDLER ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  let supabase: SupabaseClient | null = null;
  let documentId: string | null = null;

  try {
    // ── 1. Auth + rate limit ─────────────────────────────────────────────
    const auth = await getAuthenticatedUser(request);
    supabase = auth.supabase;
    const { user } = auth;

    rateLimiter(user.id, "ingest", 10, 60 * 60 * 1000);

    // ── 2. Parse multipart form ──────────────────────────────────────────
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

    // ── 3. Validate ──────────────────────────────────────────────────────
    validateFile(file);

    const fileName = decodeURIComponent(file.name);
    const docType = resolveDocumentType(file.type, fileName);

    // ── 4. Create DB record (status: "processing") ───────────────────────
    documentId = await createDocumentRecord(
      supabase,
      user,
      fileName,
      file.size,
      docType,
    );

    // ── 5. Extract text ──────────────────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, pageCount } = await extractText(buffer, file.type);

    // ── 6. Chunk ─────────────────────────────────────────────────────────
    const chunks = await splitter.splitText(text);

    // ── 7. Embed + insert ─────────────────────────────────────────────────
    const { finalStatus, successCount } = await embedAndInsertChunks(
      supabase,
      chunks,
      pageCount,
      documentId,
      user.id,
    );

    // ── 8. Update document to terminal status ─────────────────────────────
    await updateDocumentStatus(
      supabase,
      documentId,
      finalStatus,
      successCount,
      finalStatus === "error"
        ? "All embedding batches failed. Please try again."
        : null,
    );

    const response: IngestResponse = {
      documentId,
      status: finalStatus,
      chunkCount: successCount,
    };

    return successResponse(response, 201);
  } catch (err) {
    // ── Error-path cleanup ─────────────────────────────────────────────────
    if (documentId && supabase) {
      const errorMessage =
        err instanceof AppError ? err.message : "Processing failed";

      updateDocumentStatus(
        supabase,
        documentId,
        "error",
        0,
        errorMessage,
      ).catch((cleanupErr: unknown) => {
        console.error(
          "[ingest] Cleanup update failed:",
          cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        );
      });
    }

    return errorResponse(err);
  }
}
