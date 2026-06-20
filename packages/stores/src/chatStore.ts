// FILE: /packages/stores/src/chatStore.ts
//
// The most performance-critical store in the app.
//
// THE STREAMING PROBLEM:
// AI responses stream ~50 tokens per second. If each token update causes
// the entire messages array to re-render, we get 50 renders/second which
// will freeze the UI on low-end devices.
//
// THE SOLUTION:
// appendToken() uses immer's `produce` to mutate ONLY the single message
// node being streamed. Combined with useShallow on the selector, only the
// component rendering that specific message will re-render.
//
// We use subscribeWithSelector middleware so components can subscribe to
// deeply-nested paths (e.g., a single message's content) without the
// selector having to traverse the entire store.

import { create }             from "zustand";
import { devtools }           from "zustand/middleware";
import { subscribeWithSelector } from "zustand/middleware";
import { immer }              from "zustand/middleware/immer";
import { useShallow }         from "zustand/react/shallow";
import type {
  ChatSession,
  ChatMessage,
  SourceCitation,
  SSEEvent,
  AppError,
}                             from "@docchat/types";
import { AppError as Err, ErrorCode } from "@docchat/types";
import { registerStoreReset } from "./authStore";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ChatState {
  /** All sessions keyed by session ID for O(1) lookup */
  sessions:           Record<string, ChatSession>;
  activeSessionId:    string | null;
  isStreaming:        boolean;
  /** The ID of the assistant message currently being streamed */
  streamingMessageId: string | null;
  error:              AppError | null;
}

interface ChatActions {
  createSession(documentId?: string):                              string;
  loadHistory(sessionId: string):                                  Promise<void>;
  sendMessage(sessionId: string, content: string, documentId?: string): Promise<void>;
  appendToken(sessionId: string, messageId: string, token: string):  void;
  attachSources(sessionId: string, messageId: string, sources: SourceCitation[]): void;
  finalizeStreaming():                                             void;
  deleteSession(sessionId: string):                               Promise<void>;
  setActiveSession(sessionId: string | null):                     void;
  clearError():                                                   void;
  _reset():                                                       void;
}

type ChatStore = ChatState & ChatActions;

const API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function newMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildUserMessage(content: string, sessionId: string, userId: string): ChatMessage {
  return {
    id:        newMessageId(),
    sessionId,
    userId,
    role:      "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

function buildAssistantPlaceholder(sessionId: string, userId: string): ChatMessage {
  return {
    id:        newMessageId(),
    sessionId,
    userId,
    role:      "assistant",
    content:   "",       // empty — tokens will append here
    createdAt: new Date().toISOString(),
  };
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => {
        const initialState: ChatState = {
          sessions:           {},
          activeSessionId:    null,
          isStreaming:        false,
          streamingMessageId: null,
          error:              null,
        };

        registerStoreReset(() => get()._reset());

        return {
          ...initialState,

          // ── createSession ─────────────────────────────────────────────────
          // Creates the session locally (lazy — no DB write yet).
          // The backend creates the DB row on the first chat message.
          createSession(documentId?: string) {
            const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

            set((s) => {
              s.sessions[id] = {
                id,
                userId:     "",       // filled in after first server response
                documentId: documentId ?? null,
                title:      "New Chat",
                messages:   [],
                createdAt:  new Date().toISOString(),
                isLoaded:   true,     // new session has no history to load
              };
              s.activeSessionId = id;
            });

            return id;
          },

          // ── loadHistory ───────────────────────────────────────────────────
          async loadHistory(sessionId: string) {
            const existing = get().sessions[sessionId];
            // Skip if already loaded to prevent redundant API calls
            if (existing?.isLoaded) return;

            try {
              const res  = await fetch(`${API_BASE}/api/chat/history/${sessionId}`);
              const json = await res.json();

              if (!res.ok) throw Err.fromJSON(json.error);

              set((s) => {
                s.sessions[sessionId] = {
                  ...json.session,
                  isLoaded: true,
                };
              });
            } catch (err) {
              set((s) => {
                s.error = err instanceof Err
                  ? err
                  : new Err(ErrorCode.NETWORK_ERROR, "Failed to load chat history");
              });
            }
          },

          // ── sendMessage ───────────────────────────────────────────────────
          // Full SSE streaming flow:
          // 1. Optimistically add user message + empty assistant placeholder
          // 2. POST /api/chat → receive ReadableStream (SSE)
          // 3. Parse each SSE event and dispatch to store actions
          // 4. On 'done', finalize streaming state
          async sendMessage(sessionId: string, content: string, documentId?: string) {
            const session = get().sessions[sessionId];
            if (!session) return;

            // Placeholder user for local messages (real userId comes from server)
            const userId = "local";

            const userMsg       = buildUserMessage(content, sessionId, userId);
            const assistantMsg  = buildAssistantPlaceholder(sessionId, userId);

            // Step 1: Optimistically add both messages
            set((s) => {
              s.sessions[sessionId].messages.push(userMsg, assistantMsg);
              s.isStreaming        = true;
              s.streamingMessageId = assistantMsg.id;
              s.error              = null;
            });

            try {
              // Step 2: Start SSE stream
              const res = await fetch(`${API_BASE}/api/chat`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                  sessionId,
                  content,
                  documentId: documentId ?? session.documentId,
                }),
              });

              if (!res.ok || !res.body) {
                const json = await res.json();
                throw Err.fromJSON(json.error);
              }

              // Step 3: Parse SSE stream
              const reader  = res.body.getReader();
              const decoder = new TextDecoder();
              let   buffer  = "";

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // SSE chunks may arrive split across multiple reads
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";  // keep incomplete line in buffer

                for (const line of lines) {
                  // SSE format: "data: {...json...}"
                  if (!line.startsWith("data: ")) continue;
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr || jsonStr === "[DONE]") continue;

                  try {
                    const event = JSON.parse(jsonStr) as SSEEvent;
                    get()._handleSSEEvent(sessionId, assistantMsg.id, event);
                  } catch {
                    // Malformed JSON in stream — skip this event
                  }
                }
              }
            } catch (err) {
              set((s) => {
                // Update the assistant placeholder to show an error state
                const msgIdx = s.sessions[sessionId]?.messages.findIndex(
                  (m) => m.id === assistantMsg.id
                );
                if (msgIdx !== undefined && msgIdx >= 0) {
                  s.sessions[sessionId].messages[msgIdx].content =
                    "Sorry, I encountered an error. Please try again.";
                }
                s.error = err instanceof Err
                  ? err
                  : new Err(ErrorCode.STREAM_INTERRUPTED, "Stream interrupted");
              });
              get().finalizeStreaming();
            }
          },

          // ── _handleSSEEvent (private) ──────────────────────────────────────
          _handleSSEEvent(sessionId: string, messageId: string, event: SSEEvent) {
            switch (event.type) {
              case "start":
                // Server has confirmed the session ID (may differ if session was lazy)
                // We could sync the session ID here if needed
                break;

              case "token":
                get().appendToken(sessionId, messageId, event.content);
                break;

              case "sources":
                get().attachSources(sessionId, messageId, event.sources);
                break;

              case "done":
                get().finalizeStreaming();
                break;

              case "error":
                set((s) => {
                  s.error = new Err(event.code, event.message, 500, event.retryable);
                });
                get().finalizeStreaming();
                break;
            }
          },

          // ── appendToken ───────────────────────────────────────────────────
          // PERFORMANCE: immer only diffs the changed leaf node (message.content).
          // React will only re-render the component that reads this specific field
          // when paired with a fine-grained selector.
          appendToken(sessionId: string, messageId: string, token: string) {
            set((s) => {
              const msg = s.sessions[sessionId]?.messages.find(
                (m) => m.id === messageId
              );
              if (msg) {
                msg.content += token;
              }
            });
          },

          // ── attachSources ─────────────────────────────────────────────────
          attachSources(sessionId: string, messageId: string, sources: SourceCitation[]) {
            set((s) => {
              const msg = s.sessions[sessionId]?.messages.find(
                (m) => m.id === messageId
              );
              if (msg) {
                msg.sources = sources;
              }
            });
          },

          // ── finalizeStreaming ──────────────────────────────────────────────
          finalizeStreaming() {
            set((s) => {
              s.isStreaming        = false;
              s.streamingMessageId = null;
            });
          },

          // ── deleteSession ─────────────────────────────────────────────────
          async deleteSession(sessionId: string) {
            set((s) => {
              delete s.sessions[sessionId];
              if (s.activeSessionId === sessionId) {
                s.activeSessionId = null;
              }
            });

            // Fire-and-forget — UI is already updated
            await fetch(`${API_BASE}/api/chat/history/${sessionId}`, {
              method: "DELETE",
            });
          },

          setActiveSession(sessionId: string | null) {
            set((s) => { s.activeSessionId = sessionId; });
          },

          clearError() {
            set((s) => { s.error = null; });
          },

          _reset() {
            set(() => initialState);
          },
        };
      })
    ),
    { name: "ChatStore" }
  )
);

// ─── SELECTORS ────────────────────────────────────────────────────────────────

/**
 * useCurrentMessages — returns the messages array for a session.
 *
 * HOW useShallow PREVENTS EXCESS RE-RENDERS:
 * Without useShallow, if ANY part of the store changes, the component
 * re-renders because the selector returns a new array reference each time.
 * useShallow does a shallow equality check on the returned value, so
 * re-renders only happen when the array contents actually change.
 *
 * This is critical for the chat sidebar which lists many sessions —
 * a token arriving in session A should not re-render session B's preview.
 */
export function useCurrentMessages(sessionId: string | null) {
  return useChatStore(
    useShallow((s) =>
      sessionId ? (s.sessions[sessionId]?.messages ?? []) : []
    )
  );
}

/** Returns just the streaming state for the stop button */
export const selectIsStreaming        = (s: ChatStore) => s.isStreaming;
export const selectStreamingMessageId = (s: ChatStore) => s.streamingMessageId;
export const selectSessions           = (s: ChatStore) => s.sessions;
