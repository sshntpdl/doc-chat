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

import { ChatGroq }                     from "@langchain/groq";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage }             from "@langchain/core/messages";
import type { SupabaseClient }          from "@supabase/supabase-js";
import { AppError, ErrorCode }          from "@docchat/types";
import type { ChatMessage, SourceCitation } from "@docchat/types";

// ─── SINGLETON: ChatGroq ──────────────────────────────────────────────────────

let _groq: ChatGroq | null = null;

export function getGroqClient(): ChatGroq {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new AppError(ErrorCode.GROQ_UNAVAILABLE, "GROQ_API_KEY not set", 500, false);
    }
    _groq = new ChatGroq({
      apiKey:      process.env.GROQ_API_KEY,
      model:       "llama-3.3-70b-versatile",
      temperature: 0,       // deterministic/factual — not creative
      streaming:   true,
      maxRetries:  3,       // LangChain built-in retry with exponential backoff
    });
  }
  return _groq;
}

// ─── SINGLETON: HuggingFace Embeddings ───────────────────────────────────────

let _embeddings: HuggingFaceInferenceEmbeddings | null = null;

export function getEmbeddingsClient(): HuggingFaceInferenceEmbeddings {
  if (!_embeddings) {
    if (!process.env.HUGGINGFACE_API_KEY) {
      throw new AppError(ErrorCode.EMBEDDING_FAILED, "HUGGINGFACE_API_KEY not set", 500, false);
    }
    _embeddings = new HuggingFaceInferenceEmbeddings({
      apiKey: process.env.HUGGINGFACE_API_KEY,
      // all-MiniLM-L6-v2 produces 384-dim vectors.
      // Fast, free, and good enough for document Q&A (MTEB score ~59).
      model:  "sentence-transformers/all-MiniLM-L6-v2",
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
  const client     = getEmbeddingsClient();
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const [embedding] = await client.embedDocuments([text]);
      return embedding;
    } catch (err: unknown) {
      const isModelLoading =
        err instanceof Error && err.message.includes("loading");

      if (isModelLoading && attempt < maxRetries) {
        // Wait 3s for HuggingFace to warm up the model
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      throw new AppError(
        ErrorCode.EMBEDDING_FAILED,
        `Embedding failed: ${err instanceof Error ? err.message : "unknown"}`,
        500,
        attempt < maxRetries // retryable if we haven't exhausted attempts
      );
    }
  }

  throw new AppError(ErrorCode.EMBEDDING_FAILED, "Embedding failed after retries", 500, true);
}

// ─── retrieveChunks ───────────────────────────────────────────────────────────

export interface RetrievedChunk {
  id:          string;
  documentId:  string;
  content:     string;
  metadata:    { page: number; chunk_index: number };
  similarity:  number;
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
  supabase:       SupabaseClient,
  userId:         string,
  documentId:     string | null = null,
  k               = 4
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding:    queryEmbedding,
    match_user_id:      userId,
    match_count:        k,
    filter_document_id: documentId,
  });

  if (error) {
    throw new AppError(
      ErrorCode.EMBEDDING_FAILED,
      `Vector search failed: ${error.message}`,
      500,
      true
    );
  }

  return (data ?? []) as RetrievedChunk[];
}

// ─── buildChatHistory ─────────────────────────────────────────────────────────

/**
 * Convert DB chat messages to LangChain BaseMessage array.
 * The system message is injected separately in the chat Route Handler.
 * We only pass the last 10 message pairs (20 messages) to keep the
 * context window manageable — older history is truncated.
 */
export function buildChatHistory(messages: ChatMessage[]): BaseMessage[] {
  // Take last 20 messages (10 turns) for context window efficiency
  const recent = messages.slice(-20);

  return recent.map((msg) =>
    msg.role === "user"
      ? new HumanMessage(msg.content)
      : new AIMessage(msg.content)
  );
}

// ─── buildSystemPrompt ────────────────────────────────────────────────────────

/**
 * Build the system prompt with injected context chunks.
 * Context is formatted as numbered blocks so the model can cite precisely.
 */
export function buildSystemPrompt(chunks: RetrievedChunk[]): string {
  const contextBlocks = chunks
    .map(
      (c, i) =>
        `[${i + 1}] (Document: ${c.documentId}, Page: ${c.metadata.page})\n${c.content}`
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
 * 'sources' event. Fetches document names from DB.
 */
export async function buildSourceCitations(
  chunks:   RetrievedChunk[],
  supabase: SupabaseClient
): Promise<SourceCitation[]> {
  if (chunks.length === 0) return [];

  // Batch-fetch document names for all unique document IDs
  const docIds = [...new Set(chunks.map((c) => c.documentId))];
  const { data: docs } = await supabase
    .from("documents")
    .select("id, name")
    .in("id", docIds);

  const docNameMap = Object.fromEntries(
    (docs ?? []).map((d: { id: string; name: string }) => [d.id, d.name])
  );

  return chunks.map((chunk) => ({
    documentId:   chunk.documentId,
    documentName: docNameMap[chunk.documentId] ?? "Unknown Document",
    pageNumber:   chunk.metadata.page ?? 1,
    snippet:      chunk.content.slice(0, 200) + (chunk.content.length > 200 ? "…" : ""),
    similarity:   Math.round(chunk.similarity * 100) / 100,
  }));
}
