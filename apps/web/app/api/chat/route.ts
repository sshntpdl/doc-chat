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
//   6. Build LangChain prompt (system + history + context + question)
//   7. Stream Groq response token-by-token as SSE events
//   8. After stream ends, emit 'sources' event with citations
//   9. Persist the completed message to DB

import { NextRequest }       from "next/server";
import { ChatGroq }          from "@langchain/groq";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { z }                 from "zod";
import { getAuthenticatedUser } from "../_lib/auth";
import { streamResponse, errorResponse } from "../_lib/response";
import { rateLimiter }       from "../_lib/ratelimit";
import {
  embedQuery,
  retrieveChunks,
  buildChatHistory,
  buildSystemPrompt,
  buildSourceCitations,
  getGroqClient,
} from "../_lib/langchain";
import { AppError, ErrorCode } from "@docchat/types";
import type { SSEEvent }       from "@docchat/types";

// ─── VALIDATION SCHEMA ────────────────────────────────────────────────────────

const ChatRequestSchema = z.object({
  sessionId:  z.string().optional(),
  content:    z.string().min(1).max(2000).transform((s) =>
    // Strip HTML tags — prevent XSS in stored messages
    s.replace(/<[^>]*>/g, "").trim()
  ),
  documentId: z.string().uuid().optional().nullable(),
});

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────
    const { user, supabase } = await getAuthenticatedUser(request);

    // ── Rate limit: 30 requests/minute per user ────────────────────────
    rateLimiter(user.id, "chat", 30, 60 * 1000);

    // ── Parse body ────────────────────────────────────────────────────
    const body   = await request.json();
    const parsed = ChatRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        parsed.error.errors[0]?.message ?? "Invalid request",
        400,
        false
      );
    }

    const { content, documentId, sessionId: incomingSessionId } = parsed.data;

    // ── Load or create session ─────────────────────────────────────────
    let sessionId = incomingSessionId;
    let existingMessages: Array<{ role: string; content: string }> = [];

    if (sessionId) {
      // Load existing session history for context
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)    // RLS defense in depth
        .order("created_at", { ascending: true })
        .limit(20);                // last 10 turns

      existingMessages = msgs ?? [];
    } else {
      // Create new session
      const title = content.slice(0, 40) + (content.length > 40 ? "…" : "");
      const { data: session, error } = await supabase
        .from("chat_sessions")
        .insert({
          user_id:     user.id,
          document_id: documentId ?? null,
          title,
        })
        .select("id")
        .single();

      if (error || !session) {
        throw new AppError(ErrorCode.NETWORK_ERROR, "Failed to create session", 500, true);
      }
      sessionId = session.id;
    }

    // Persist the user message before streaming (so it's saved even if stream fails)
    const { data: userMsg } = await supabase
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        user_id:    user.id,
        role:       "user",
        content,
      })
      .select("id")
      .single();

    // Pre-allocate assistant message row — update content after streaming
    const { data: assistantMsg } = await supabase
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        user_id:    user.id,
        role:       "assistant",
        content:    "", // filled in after streaming
      })
      .select("id")
      .single();

    const assistantMsgId = assistantMsg?.id ?? crypto.randomUUID();
    const startEvent: SSEEvent = {
      type:      "start",
      messageId: assistantMsgId,
      sessionId: sessionId!,
    };

    // ── Start SSE response with async generator ────────────────────────
    return streamResponse(generateStream({
      user,
      supabase,
      content,
      documentId:      documentId ?? null,
      sessionId:       sessionId!,
      existingMessages,
      assistantMsgId,
      startEvent,
    }));

  } catch (err) {
    return errorResponse(err);
  }
}

// ─── STREAM GENERATOR ─────────────────────────────────────────────────────────
// Separated from the handler so we can yield SSE events without coupling to
// the HTTP layer. The streamResponse() wrapper handles SSE serialization.

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
  user:             { id: string };
  supabase:         Awaited<ReturnType<typeof import("@supabase/supabase-js").createClient>>;
  content:          string;
  documentId:       string | null;
  sessionId:        string;
  existingMessages: Array<{ role: string; content: string }>;
  assistantMsgId:   string;
  startEvent:       SSEEvent;
}): AsyncGenerator<SSEEvent> {
  // Emit start event immediately so the client shows the typing indicator
  yield startEvent;

  // ── Step 1: Embed the question ───────────────────────────────────────
  const queryEmbedding = await embedQuery(content);

  // ── Step 2: Retrieve relevant chunks ────────────────────────────────
  const chunks = await retrieveChunks(
    queryEmbedding,
    supabase as any,
    user.id,
    documentId,
    4 // top-K
  );

  // ── Step 3: Build prompt ─────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(chunks);
  const chatHistory  = buildChatHistory(existingMessages as any);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
    ["human", "{question}"],
  ]);

  const groq   = getGroqClient();
  const chain  = prompt.pipe(groq);

  // ── Step 4: Stream tokens ────────────────────────────────────────────
  let fullContent  = "";
  let totalTokens  = 0;

  const stream = await chain.stream({
    history:  chatHistory,
    question: content,
  });

  for await (const chunk of stream) {
    const token = typeof chunk.content === "string" ? chunk.content : "";
    if (!token) continue;

    fullContent += token;
    totalTokens++;

    yield { type: "token", content: token };
  }

  // ── Step 5: Emit sources ─────────────────────────────────────────────
  const sources = await buildSourceCitations(chunks, supabase as any);
  yield { type: "sources", sources };

  // ── Step 6: Persist completed message ───────────────────────────────
  await supabase
    .from("chat_messages")
    .update({
      content: fullContent,
      sources: sources.length > 0 ? sources : null,
    })
    .eq("id", assistantMsgId);

  // ── Step 7: Done ─────────────────────────────────────────────────────
  yield { type: "done", messageId: assistantMsgId, totalTokens };
}
