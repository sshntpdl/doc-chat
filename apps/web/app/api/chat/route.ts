// FILE: /apps/web/app/api/chat/route.ts
//
// POST /api/chat — Full RAG pipeline with Server-Sent Events streaming.
//
// PIPELINE:
//   1. Validate auth + rate limit
//   2. Parse and validate request body
//   3. Load or create chat session in DB
//   4. Embed the user's question (HuggingFace)
//   5. Retrieve top-K chunks (Supabase pgvector)
//   6. Resolve document names once (shared by prompt + citations)
//   7. Build message array manually (NO ChatPromptTemplate — see Step 3)
//   8. Stream Groq response token-by-token as SSE events
//   9. After stream ends, emit 'sources' event with citations
//   10. Persist the completed message to DB

import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { AppError, ErrorCode } from "@docchat/types";
import type { SSEEvent } from "@docchat/types";

type SupabaseClientAny = SupabaseClient<any, "public", any>;

// ─── VALIDATION SCHEMA ────────────────────────────────────────────────────────

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

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    rateLimiter(user.id, "chat", 30, 60 * 1000);

    const body = await request.json();
    const parsed = ChatRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        parsed.error.errors[0]?.message ?? "Invalid request",
        400,
        false,
      );
    }

    const { content, documentId, sessionId: incomingSessionId } = parsed.data;

    let sessionId = incomingSessionId;
    let existingMessages: Array<{ role: string; content: string }> = [];

    if (sessionId) {
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(20);

      existingMessages = msgs ?? [];
    } else {
      const title = content.slice(0, 40) + (content.length > 40 ? "…" : "");
      const { data: session, error } = await supabase
        .from("chat_sessions")
        .insert({
          user_id: user.id,
          document_id: documentId ?? null,
          title,
        })
        .select("id")
        .single();

      if (error || !session) {
        throw new AppError(
          ErrorCode.NETWORK_ERROR,
          "Failed to create session",
          500,
          true,
        );
      }
      sessionId = session.id;
    }

    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      user_id: user.id,
      role: "user",
      content,
    });

    const { data: assistantMsg } = await supabase
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        user_id: user.id,
        role: "assistant",
        content: "",
      })
      .select("id")
      .single();

    const assistantMsgId = assistantMsg?.id ?? crypto.randomUUID();
    const startEvent: SSEEvent = {
      type: "start",
      messageId: assistantMsgId,
      sessionId: sessionId!,
    };

    return streamResponse(
      generateStream({
        user,
        supabase,
        content,
        documentId: documentId ?? null,
        sessionId: sessionId!,
        existingMessages,
        assistantMsgId,
        startEvent,
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

// ─── STREAM GENERATOR ─────────────────────────────────────────────────────────

async function* generateStream({
  user,
  supabase,
  content,
  documentId,
  sessionId,
  existingMessages,
  assistantMsgId,
  startEvent,
}: {
  user: { id: string };
  supabase: SupabaseClientAny;
  content: string;
  documentId: string | null;
  sessionId: string;
  existingMessages: Array<{ role: string; content: string }>;
  assistantMsgId: string;
  startEvent: SSEEvent;
}): AsyncGenerator<SSEEvent> {
  yield startEvent;

  // ── Step 1: Embed ────────────────────────────────────────────────────
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(content);
  } catch (err) {
    console.error("[generateStream] embedQuery failed:", err);
    throw new AppError(
      ErrorCode.EMBEDDING_FAILED,
      `Embedding step failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
      true,
    );
  }

  // ── Step 2: Retrieve chunks ──────────────────────────────────────────
  let chunks: Awaited<ReturnType<typeof retrieveChunks>>;
  try {
    chunks = await retrieveChunks(
      queryEmbedding,
      supabase as any,
      user.id,
      documentId,
      4,
    );
  } catch (err) {
    console.error("[generateStream] retrieveChunks failed:", err);
    throw new AppError(
      ErrorCode.EMBEDDING_FAILED,
      `Vector search failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
      true,
    );
  }

  // ── Step 2.5: Resolve document names ────────────────────────────────
  let docNameMap: Record<string, string>;
  try {
    docNameMap = await fetchDocumentNameMap(chunks, supabase as any);
  } catch (err) {
    console.error("[generateStream] fetchDocumentNameMap failed:", err);
    docNameMap = {};
  }

  // ── Step 3: Build message array — NO ChatPromptTemplate ─────────────
  //
  // ROOT CAUSE OF ALL PREVIOUS ERRORS:
  // ChatPromptTemplate.fromMessages() runs an f-string parser over every
  // string it receives, looking for {variable} placeholders. Document chunks
  // from real files (JSON, TypeScript, code, etc.) contain curly braces, so
  // LangChain finds e.g. `{'role':'user','content':'Hello!'}` inside the
  // system prompt text and throws:
  //   "Missing value for input variable `'role':'user','content':'Hello!'`"
  //
  // SOLUTION: skip ChatPromptTemplate entirely. Build a plain BaseMessage[]
  // array and pass it directly to groq.stream(). BaseMessage content is
  // NEVER parsed for template variables — it's always treated as literal text.
  // This is the correct pattern for RAG pipelines where context is dynamic.
  const systemPrompt = buildSystemPrompt(chunks, docNameMap);
  const chatHistory = buildChatHistory(existingMessages);

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt), // literal — never f-string parsed
    ...chatHistory, // already BaseMessage instances
    new HumanMessage(content), // literal — never f-string parsed
  ];

  // ── Step 4: Init Groq ────────────────────────────────────────────────
  let groq: ReturnType<typeof getGroqClient>;
  try {
    groq = getGroqClient();
  } catch (err) {
    console.error("[generateStream] getGroqClient failed:", err);
    throw new AppError(
      ErrorCode.GROQ_UNAVAILABLE,
      `Groq client init failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
      false,
    );
  }

  // ── Step 5: Stream tokens ────────────────────────────────────────────
  let fullContent = "";
  let totalTokens = 0;

  let stream: Awaited<ReturnType<typeof groq.stream>>;
  try {
    // Call groq.stream() directly with the message array — no chain, no pipe,
    // no template parsing. Clean, direct, and immune to f-string issues.
    stream = await groq.stream(messages);
  } catch (err) {
    console.error("[generateStream] groq.stream() failed:", err);
    throw new AppError(
      ErrorCode.GROQ_UNAVAILABLE,
      `LLM stream failed to start: ${err instanceof Error ? err.message : String(err)}`,
      500,
      true,
    );
  }

  try {
    for await (const chunk of stream) {
      const token = typeof chunk.content === "string" ? chunk.content : "";
      if (!token) continue;

      fullContent += token;
      totalTokens++;

      yield { type: "token", content: token };
    }
  } catch (err) {
    console.error("[generateStream] Token streaming interrupted:", err);
    throw new AppError(
      ErrorCode.STREAM_INTERRUPTED,
      `Stream interrupted: ${err instanceof Error ? err.message : String(err)}`,
      500,
      true,
    );
  }

  // ── Step 6: Emit sources ─────────────────────────────────────────────
  const sources = buildSourceCitations(chunks, docNameMap);
  yield { type: "sources", sources };

  // ── Step 7: Persist completed message ───────────────────────────────
  try {
    await supabase
      .from("chat_messages")
      .update({
        content: fullContent,
        sources: sources.length > 0 ? sources : null,
      })
      .eq("id", assistantMsgId);
  } catch (err) {
    console.error("[generateStream] Failed to persist assistant message:", err);
    // Non-fatal — user already received the streamed response
  }

  // ── Step 8: Done ─────────────────────────────────────────────────────
  yield { type: "done", messageId: assistantMsgId, totalTokens };
}
