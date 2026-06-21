// FILE: /apps/web/app/api/_lib/langchain.ts
//
// Singleton instances of expensive AI clients reused across requests.
//
// WHY SINGLETONS:
// Creating a new ChatGroq or HuggingFaceInferenceEmbeddings instance on
// every request wastes time (constructor overhead, connection setup) and
// could exhaust file descriptors. Node.js module caching ensures these
// are created once per serverless function warm instance.
//
// EMBEDDING RETRY LOGIC:
// HuggingFace free tier "cold starts" a model if it hasn't been used recently.
// The first request returns HTTP 503 with {"error":"Model ... is currently loading"}.
// We wait 3 seconds and retry up to 2 times. After that, we fail loudly.

import { ChatGroq } from "@langchain/groq";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, ErrorCode } from "@docchat/types";
import type { SourceCitation } from "@docchat/types";

// ─── SINGLETON: ChatGroq ──────────────────────────────────────────────────────

let _groq: ChatGroq | null = null;

export function getGroqClient(): ChatGroq {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new AppError(
        ErrorCode.GROQ_UNAVAILABLE,
        "GROQ_API_KEY is not set in environment variables",
        500,
        false,
      );
    }
    _groq = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      temperature: 0, // deterministic/factual — not creative
      streaming: true,
      maxRetries: 3, // LangChain built-in retry with exponential backoff
    });
  }
  return _groq;
}

// ─── SINGLETON: HuggingFace Embeddings ───────────────────────────────────────

let _embeddings: HuggingFaceInferenceEmbeddings | null = null;

export function getEmbeddingsClient(): HuggingFaceInferenceEmbeddings {
  if (!_embeddings) {
    if (!process.env.HUGGINGFACE_API_KEY) {
      throw new AppError(
        ErrorCode.EMBEDDING_FAILED,
        "HUGGINGFACE_API_KEY is not set in environment variables",
        500,
        false,
      );
    }
    _embeddings = new HuggingFaceInferenceEmbeddings({
      apiKey: process.env.HUGGINGFACE_API_KEY,
      // all-MiniLM-L6-v2 produces 384-dim vectors.
      // Fast, free, and good enough for document Q&A (MTEB score ~59).
      model: "sentence-transformers/all-MiniLM-L6-v2",
    });
  }
  return _embeddings;
}

// ─── embedQuery (with retry) ──────────────────────────────────────────────────

/**
 * Embed a single query string with HuggingFace.
 * Retries twice on 503 (model loading) with a 3-second delay.
 * Returns a 384-dimensional float array.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const client = getEmbeddingsClient();
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const [embedding] = await client.embedDocuments([text]);

      // Sanity-check: HuggingFace occasionally returns an empty array on
      // the free tier when the model is loading even without throwing.
      if (!embedding || embedding.length === 0) {
        throw new Error(
          "HuggingFace returned an empty embedding vector — model may still be loading",
        );
      }

      return embedding;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isModelLoading =
        errMsg.toLowerCase().includes("loading") ||
        errMsg.toLowerCase().includes("503") ||
        errMsg.toLowerCase().includes("currently loading");

      console.warn(
        `[embedQuery] attempt ${attempt + 1}/${maxRetries + 1} failed:`,
        errMsg,
      );

      if (isModelLoading && attempt < maxRetries) {
        console.log(`[embedQuery] Model loading — waiting 3s before retry...`);
        // Wait 3s for HuggingFace to warm up the model
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      throw new AppError(
        ErrorCode.EMBEDDING_FAILED,
        `Embedding failed (attempt ${attempt + 1}): ${errMsg}`,
        500,
        attempt < maxRetries, // retryable if we haven't exhausted attempts
      );
    }
  }

  throw new AppError(
    ErrorCode.EMBEDDING_FAILED,
    "Embedding failed after all retries — HuggingFace model may be unavailable",
    500,
    true,
  );
}

// ─── retrieveChunks ───────────────────────────────────────────────────────────

export interface RetrievedChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: { page: number; chunk_index: number };
  similarity: number;
}

/**
 * FIX #11 — "Unknown Document" / "[Doc: undefined, ...]" (NEW):
 *   The match_chunks RPC returns raw Postgres rows, whose columns are
 *   snake_case (document_id) — NOT the camelCase (documentId) shape
 *   RetrievedChunk declares. retrieveChunks was casting the raw rows
 *   straight to RetrievedChunk[] with `as`, which is a compile-time-only
 *   assertion — it doesn't actually rename anything at runtime. So
 *   chunk.documentId was `undefined` for every chunk, which broke the
 *   "Unknown Document" badge AND injected the literal string "undefined"
 *   into the prompt sent to the model.
 *
 *   This mapper normalizes either casing defensively (row.documentId ??
 *   row.document_id), so it's correct regardless of how match_chunks
 *   happens to alias its output columns.
 */
function mapRetrievedChunk(row: any): RetrievedChunk {
  return {
    id: row.id,
    documentId: row.documentId ?? row.document_id,
    content: row.content,
    metadata: {
      page: row.metadata?.page ?? 1,
      chunk_index: row.metadata?.chunk_index ?? row.metadata?.chunkIndex ?? 0,
    },
    similarity: row.similarity,
  };
}

/**
 * Call the Supabase match_chunks RPC to find the K nearest chunks.
 * This is where the RAG "retrieval" step happens.
 *
 * @param queryEmbedding  — 384-dim vector from embedQuery()
 * @param supabase        — authenticated Supabase client (RLS enforced)
 * @param userId          — defense-in-depth filter inside the SQL function
 * @param documentId      — scope to one document (null = all user docs)
 * @param k               — number of chunks to return (default 4)
 */
export async function retrieveChunks(
  queryEmbedding: number[],
  supabase: SupabaseClient,
  userId: string,
  documentId: string | null = null,
  k = 4,
): Promise<RetrievedChunk[]> {
  // FIX: validate embedding before sending to avoid a confusing pgvector error
  if (!queryEmbedding || queryEmbedding.length === 0) {
    throw new AppError(
      ErrorCode.EMBEDDING_FAILED,
      "Cannot perform vector search: embedding is empty",
      500,
      false,
    );
  }

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_user_id: userId,
    match_count: k,
    filter_document_id: documentId,
  });

  if (error) {
    // Surface the Supabase/pgvector error message directly
    throw new AppError(
      ErrorCode.EMBEDDING_FAILED,
      `Vector search failed: ${error.message} (code: ${error.code})`,
      500,
      true,
    );
  }

  return (data ?? []).map(mapRetrievedChunk);
}

// ─── buildChatHistory ─────────────────────────────────────────────────────────

/**
 * Convert DB chat messages (or plain {role, content} rows) to LangChain
 * BaseMessage instances.
 *
 * WHY THE SIGNATURE ACCEPTS A BROADER TYPE:
 * The route handler fetches messages directly from Supabase as
 * Array<{role: string, content: string}> — plain objects, not full ChatMessage
 * entities. Passing them to this function with `as any` was suppressing a
 * type error but letting malformed data through. We now accept the raw DB
 * shape explicitly so the cast is unnecessary and the mapping is safe.
 *
 * IMPORTANT — do NOT pass the pre-allocated empty assistant message that was
 * just inserted into the DB (content: "") into history. The route handler
 * already excludes it because it fetches history BEFORE inserting the new
 * messages, so this is safe as-is.
 *
 * We only pass the last 20 messages (10 turns) to keep the context window
 * manageable — older history is truncated.
 */
export function buildChatHistory(
  messages: Array<{ role: string; content: string }>,
): BaseMessage[] {
  // Take last 20 messages (10 turns) for context window efficiency
  const recent = messages.slice(-20);

  return recent
    .filter((msg) => {
      // Skip empty assistant placeholders that sneak in from pre-allocation
      if (msg.role === "assistant" && !msg.content?.trim()) return false;
      // Skip anything with an unrecognised role to avoid LangChain choking
      if (msg.role !== "user" && msg.role !== "assistant") return false;
      return true;
    })
    .map((msg) =>
      msg.role === "user"
        ? new HumanMessage(msg.content)
        : new AIMessage(msg.content),
    );
}

// ─── fetchDocumentNameMap ─────────────────────────────────────────────────────

/**
 * FIX #11 (continued) — resolve documentId → filename ONCE, up front, and
 * reuse the same map for both the system prompt's citation labels and the
 * SSE "sources" event. Previously this lookup only happened inside
 * buildSourceCitations, AFTER streaming had already finished — so the
 * model itself never saw real filenames, only raw UUIDs (or, with the bug
 * above, the string "undefined"), and had no way to honor the system
 * prompt's own instruction to cite as "[Doc: filename, p.N]". Fetching
 * once and sharing the map also removes a duplicate DB round-trip.
 */
export async function fetchDocumentNameMap(
  chunks: RetrievedChunk[],
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  if (chunks.length === 0) return {};

  const docIds = [...new Set(chunks.map((c) => c.documentId))].filter(Boolean);

  if (docIds.length === 0) return {};

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, name")
    .in("id", docIds);

  if (error) {
    console.warn(
      "[fetchDocumentNameMap] Failed to fetch document names:",
      error.message,
    );
    return {};
  }

  return Object.fromEntries(
    (docs ?? []).map((d: { id: string; name: string }) => [d.id, d.name]),
  );
}

// ─── buildSystemPrompt ────────────────────────────────────────────────────────

/**
 * Build the system prompt with injected context chunks.
 * Context is formatted as numbered blocks so the model can cite precisely.
 *
 * FIX #11 (continued): now takes docNameMap so the "Document:" label shown
 * to the model is an actual filename — matching what the rules below ask
 * it to cite as — instead of a raw UUID (or "undefined", pre-FIX #11).
 */
export function buildSystemPrompt(
  chunks: RetrievedChunk[],
  docNameMap: Record<string, string>,
): string {
  const contextBlocks = chunks
    .map(
      (c, i) =>
        `[${i + 1}] (Document: ${docNameMap[c.documentId] ?? "Unknown document"}, Page: ${c.metadata.page})\n${c.content}`,
    )
    .join("\n\n---\n\n");

  return `You are DocChat, a precise AI that answers questions based strictly on the user's uploaded documents.

Rules:
- Base answers ONLY on the provided context below
- Cite sources inline as [Doc: filename, p.N] using the page numbers shown
- If the context is insufficient, say exactly: "I couldn't find this in your uploaded documents."
- Keep answers concise — prefer bullet points for lists
- Maintain conversational continuity using chat history

Context:
${contextBlocks || "No context available."}`;
}

// ─── buildSourceCitations ─────────────────────────────────────────────────────

/**
 * Convert retrieved chunks into SourceCitation objects for the SSE
 * 'sources' event.
 *
 * FIX #11 (continued): now takes the pre-fetched docNameMap instead of a
 * supabase client, and is synchronous — the DB round-trip happens once,
 * earlier, in fetchDocumentNameMap, shared with buildSystemPrompt. If
 * anything else in the codebase calls buildSourceCitations with the old
 * (chunks, supabase) signature, it'll need updating to this one.
 */
export function buildSourceCitations(
  chunks: RetrievedChunk[],
  docNameMap: Record<string, string>,
): SourceCitation[] {
  if (chunks.length === 0) return [];

  return chunks.map((chunk) => ({
    documentId: chunk.documentId,
    documentName: docNameMap[chunk.documentId] ?? "Unknown Document",
    pageNumber: chunk.metadata.page ?? 1,
    snippet:
      chunk.content.slice(0, 200) + (chunk.content.length > 200 ? "…" : ""),
    similarity: Math.round(chunk.similarity * 100) / 100,
  }));
}
