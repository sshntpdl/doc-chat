import { ChatGroq } from "@langchain/groq";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
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
 */
export async function retrieveChunks(
  queryEmbedding: number[],
  supabase: SupabaseClient,
  userId: string,
  documentId: string | null = null,
  k = 4,
): Promise<RetrievedChunk[]> {
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

export function buildChatHistory(
  messages: Array<{ role: string; content: string }>,
): BaseMessage[] {
  const recent = messages.slice(-20);

  return recent
    .filter((msg) => {
      if (msg.role === "assistant" && !msg.content?.trim()) return false;
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
