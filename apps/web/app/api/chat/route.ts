import { NextRequest } from "next/server";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getAuthenticatedUser } from "../_lib/auth";
import { streamResponse, errorResponse } from "../_lib/response";
import { rateLimiter } from "../_lib/ratelimit";
import {
  embedQuery,
  retrieveChunks,
  buildChatHistory,
  buildSystemPrompt,
  fetchDocumentNameMap,
  buildSourceCitations,
  getGroqClient,
} from "../_lib/langchain";
import type { RetrievedChunk } from "../_lib/langchain";
import { AppError, ErrorCode } from "@docchat/types";
import type { SSEEvent, SourceCitation } from "@docchat/types";
import type { User, SupabaseClient } from "@supabase/supabase-js";

// ─── RAW DB ROW TYPES ─────────────────────────────────────────────────────────

interface RawChatMessageRow {
  role: string;
  content: string;
}

interface RawSessionRow {
  id: string;
}

interface RawAssistantMsgRow {
  id: string;
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

const ChatRequestSchema = z.object({
  sessionId: z.string().uuid().optional().nullable(),
  content: z
    .string({
      required_error: "content is required",
      invalid_type_error: "content must be a string",
    })
    .min(1)
    .max(2000)
    .transform((s) => s.replace(/<[^>]*>/g, "").trim())
    .refine((s) => s.length > 0, { message: "content cannot be empty" }),
  documentId: z.string().uuid().optional().nullable(),
});

type ParsedChatRequest = z.infer<typeof ChatRequestSchema>;

// ─── INTERNAL TYPES ───────────────────────────────────────────────────────────

interface NormalisedChatMessage {
  role: string;
  content: string;
}

interface SessionContext {
  sessionId: string;
  existingMessages: NormalisedChatMessage[];
}

interface StreamContext {
  user: User;
  supabase: SupabaseClient;
  content: string;
  documentId: string | null;
  sessionId: string;
  existingMessages: NormalisedChatMessage[];
  assistantMsgId: string;
  startEvent: SSEEvent;
}

// ─── SESSION HELPERS ──────────────────────────────────────────────────────────

/**
 * Load an existing session's message history from the DB.
 * Returns at most 20 rows (the chat history builder trims further).
 */
async function loadExistingSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<NormalisedChatMessage[]> {
  const { data } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(20)
    .returns<RawChatMessageRow[]>();

  return (data ?? []).map((row) => ({
    role: row.role,
    content: row.content,
  }));
}

/**
 * Create a new chat session in the DB and return its generated ID.
 */
async function createSession(
  supabase: SupabaseClient,
  userId: string,
  documentId: string | null,
  firstMessage: string,
): Promise<string> {
  const title =
    firstMessage.slice(0, 40) + (firstMessage.length > 40 ? "…" : "");

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ user_id: userId, document_id: documentId, title })
    .select("id")
    .single<RawSessionRow>();

  if (error || !data) {
    throw new AppError(
      ErrorCode.NETWORK_ERROR,
      "Failed to create session",
      500,
      true,
    );
  }

  return data.id;
}

/**
 * Resolve (or create) a session and return the session ID together with
 * the existing message history that will seed the chat context.
 */
async function resolveSession(
  supabase: SupabaseClient,
  userId: string,
  documentId: string | null,
  content: string,
  incomingSessionId: string | null | undefined,
): Promise<SessionContext> {
  if (incomingSessionId) {
    const existingMessages = await loadExistingSession(
      supabase,
      incomingSessionId,
      userId,
    );
    return { sessionId: incomingSessionId, existingMessages };
  }

  const sessionId = await createSession(supabase, userId, documentId, content);
  return { sessionId, existingMessages: [] };
}

/**
 * Write the user's message and a placeholder assistant message to the DB.
 */
async function persistInitialMessages(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  content: string,
): Promise<string> {
  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    user_id: userId,
    role: "user",
    content,
  });

  const { data } = await supabase
    .from("chat_messages")
    .insert({
      session_id: sessionId,
      user_id: userId,
      role: "assistant",
      content: "",
    })
    .select("id")
    .single<RawAssistantMsgRow>();

  // Fall back to a random UUID if the insert somehow returns no row
  return data?.id ?? crypto.randomUUID();
}

// ─── RAG PIPELINE HELPERS ─────────────────────────────────────────────────────

/** Embed the query with retry semantics (see langchain.ts). */
async function embedUserQuery(content: string): Promise<number[]> {
  try {
    return await embedQuery(content);
  } catch (err) {
    throw new AppError(
      ErrorCode.EMBEDDING_FAILED,
      `Embedding step failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
      true,
    );
  }
}

/** Retrieve the top-K semantically similar chunks from pgvector. */
async function retrieveRelevantChunks(
  supabase: SupabaseClient,
  userId: string,
  documentId: string | null,
  queryEmbedding: number[],
): Promise<RetrievedChunk[]> {
  try {
    return await retrieveChunks(
      queryEmbedding,
      supabase,
      userId,
      documentId,
      4,
    );
  } catch (err) {
    throw new AppError(
      ErrorCode.EMBEDDING_FAILED,
      `Vector search failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
      true,
    );
  }
}

/** Build the LangChain message array without using ChatPromptTemplate. */
function buildMessageArray(
  chunks: RetrievedChunk[],
  docNameMap: Record<string, string>,
  existingMessages: NormalisedChatMessage[],
  content: string,
): BaseMessage[] {
  const systemPrompt = buildSystemPrompt(chunks, docNameMap);
  const chatHistory = buildChatHistory(existingMessages);

  return [
    new SystemMessage(systemPrompt),
    ...chatHistory,
    new HumanMessage(content),
  ];
}

// ─── STREAM GENERATOR ─────────────────────────────────────────────────────────

/**
 * Core async generator driving the SSE stream.
 */
async function* generateStream(ctx: StreamContext): AsyncGenerator<SSEEvent> {
  yield ctx.startEvent;

  // ── 1. Embed ──────────────────────────────────────────────────────────
  const queryEmbedding = await embedUserQuery(ctx.content);

  // ── 2. Retrieve chunks ────────────────────────────────────────────────
  const chunks = await retrieveRelevantChunks(
    ctx.supabase,
    ctx.user.id,
    ctx.documentId,
    queryEmbedding,
  );

  // ── 3. Resolve document names (shared by prompt + citations) ──────────
  let docNameMap: Record<string, string>;
  try {
    docNameMap = await fetchDocumentNameMap(chunks, ctx.supabase);
  } catch (err) {
    // Non-fatal — fall back to UUID labels rather than aborting the stream
    console.error("[generateStream] fetchDocumentNameMap failed:", err);
    docNameMap = {};
  }

  // ── 4. Build BaseMessage[] (no ChatPromptTemplate) ────────────────────
  const messages = buildMessageArray(
    chunks,
    docNameMap,
    ctx.existingMessages,
    ctx.content,
  );

  // ── 5. Initialise Groq client ─────────────────────────────────────────
  let groq: ReturnType<typeof getGroqClient>;
  try {
    groq = getGroqClient();
  } catch (err) {
    throw new AppError(
      ErrorCode.GROQ_UNAVAILABLE,
      `Groq client init failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
      false,
    );
  }

  // ── 6. Stream tokens ──────────────────────────────────────────────────
  let stream: Awaited<ReturnType<typeof groq.stream>>;
  try {
    stream = await groq.stream(messages);
  } catch (err) {
    throw new AppError(
      ErrorCode.GROQ_UNAVAILABLE,
      `LLM stream failed to start: ${err instanceof Error ? err.message : String(err)}`,
      500,
      true,
    );
  }

  let fullContent = "";
  let totalTokens = 0;

  try {
    for await (const chunk of stream) {
      const token = typeof chunk.content === "string" ? chunk.content : "";
      if (!token) continue;

      fullContent += token;
      totalTokens++;

      yield { type: "token", content: token };
    }
  } catch (err) {
    throw new AppError(
      ErrorCode.STREAM_INTERRUPTED,
      `Stream interrupted: ${err instanceof Error ? err.message : String(err)}`,
      500,
      true,
    );
  }

  // ── 7. Emit citations ─────────────────────────────────────────────────
  const sources: SourceCitation[] = buildSourceCitations(chunks, docNameMap);
  yield { type: "sources", sources };

  // ── 8. Persist completed assistant message ────────────────────────────
  try {
    await ctx.supabase
      .from("chat_messages")
      .update({
        content: fullContent,
        sources: sources.length > 0 ? sources : null,
      })
      .eq("id", ctx.assistantMsgId);
  } catch (err) {
    console.error("[generateStream] Failed to persist assistant message:", err);
  }

  // ── 9. Done ───────────────────────────────────────────────────────────
  yield { type: "done", messageId: ctx.assistantMsgId, totalTokens };
}

// ─── ROUTE HANDLER ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    rateLimiter(user.id, "chat", 30, 60 * 1000);

    // ── Validate body ────────────────────────────────────────────────────
    const body: unknown = await request.json();
    const parsed = ChatRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        parsed.error.errors[0]?.message ?? "Invalid request",
        400,
        false,
      );
    }

    const {
      content,
      documentId,
      sessionId: incomingSessionId,
    } = parsed.data as ParsedChatRequest;

    // ── Resolve / create session ─────────────────────────────────────────
    const { sessionId, existingMessages } = await resolveSession(
      supabase,
      user.id,
      documentId ?? null,
      content,
      incomingSessionId,
    );

    // ── Persist user message + assistant placeholder ──────────────────────
    const assistantMsgId = await persistInitialMessages(
      supabase,
      sessionId,
      user.id,
      content,
    );

    // ── Build start event ─────────────────────────────────────────────────
    const startEvent: SSEEvent = {
      type: "start",
      messageId: assistantMsgId,
      sessionId,
    };

    // ── Start SSE stream ──────────────────────────────────────────────────
    return streamResponse(
      generateStream({
        user,
        supabase,
        content,
        documentId: documentId ?? null,
        sessionId,
        existingMessages,
        assistantMsgId,
        startEvent,
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
