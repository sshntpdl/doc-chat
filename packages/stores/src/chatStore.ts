// FILE: /packages/stores/src/chatStore.ts

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { useShallow } from "zustand/react/shallow";
import type {
  ChatSession,
  ChatMessage,
  SourceCitation,
  SSEEvent,
  AppError,
} from "@docchat/types";
import { AppError as Err, ErrorCode } from "@docchat/types";
import { registerStoreReset, useAuthStore } from "./authStore";
import { getApiBase } from "./apiBase";

// ─── TYPES ────────────────────────────────────────────────────────────────────

/**
 * Per-document pagination state for the session list sidebar.
 * Tracks the cursor (created_at of the last loaded session) and
 * whether more pages exist.
 */
interface SessionPagination {
  /** ISO-8601 cursor for the next page. null = haven't fetched yet. */
  nextCursor: string | null;
  /** False until the first fetch completes. */
  hasFetched: boolean;
  /** True when more pages exist on the server. */
  hasMore: boolean;
  /** True while a fetch is in flight (prevents concurrent requests). */
  isFetching: boolean;
}

interface ChatState {
  sessions: Record<string, ChatSession>;
  activeSessionId: string | null;
  isStreaming: boolean;
  streamingMessageId: string | null;
  error: AppError | null;
  /**
   * Per-document pagination cursors.
   * Key = documentId, Value = pagination state for that document's session list.
   */
  sessionPagination: Record<string, SessionPagination>;
}

interface ChatActions {
  /**
   * ensureSessionForDocument — called by ChatPage on every documentId change.
   *
   * Decision tree:
   *   A) Active session already belongs to this document → do nothing.
   *   B) An existing EMPTY session for this document exists → activate it.
   *   C) No suitable session → create a new one.
   *
   * Also kicks off the initial session list fetch if not yet loaded.
   */
  ensureSessionForDocument(documentId: string): void;

  /**
   * requestNewChat — called by the "+ New Chat" button.
   *
   * Decision tree (same logic as Claude / ChatGPT / Gemini):
   *   A) Active session is already empty → do nothing (just return its id).
   *   B) An existing OTHER empty session for this document exists → activate it.
   *   C) No empty session → create a fresh one and prune other blank sessions.
   *
   * Returns the session id that ended up active.
   */
  requestNewChat(documentId: string): string;

  createSession(documentId?: string): string;
  loadHistory(sessionId: string): Promise<void>;

  /**
   * fetchSessions — loads the next page of sessions for a document.
   *
   * Call this:
   *   - On initial load (called automatically by ensureSessionForDocument)
   *   - When the user scrolls to the bottom of the session list
   *
   * The function is a no-op when:
   *   - A fetch is already in flight for that document
   *   - There are no more pages to load
   */
  fetchSessions(documentId: string): Promise<void>;

  sendMessage(
    sessionId: string,
    content: string,
    documentId?: string,
  ): Promise<void>;
  appendToken(sessionId: string, messageId: string, token: string): void;
  attachSources(
    sessionId: string,
    messageId: string,
    sources: SourceCitation[],
  ): void;
  finalizeStreaming(): void;
  deleteSession(sessionId: string): Promise<void>;
  setActiveSession(sessionId: string | null): void;
  clearError(): void;
  _reset(): void;
  /**
   * _handleSSEEvent — process a single SSE event.
   *
   * Returns the effective session ID to use for subsequent events.
   */
  _handleSSEEvent(
    sessionId: string,
    messageId: string,
    event: SSEEvent,
    localTitle: string,
  ): string;
}

type ChatStore = ChatState & ChatActions;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function newMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function newSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * deriveTitle — turns the first user message of a session into a short
 * display title, the same way ChatGPT/Claude/Gemini show a placeholder
 * title immediately instead of waiting on a round-trip to the server.
 *
 * Exported so non-store call sites (e.g. the mobile chat screen, which
 * streams via its own EventSource implementation instead of going through
 * `sendMessage()`) can apply the exact same optimistic title logic instead
 * of leaving sessions stuck at "New Chat".
 */
export function deriveTitle(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  return trimmed.length > 40 ? trimmed.slice(0, 40) + "…" : trimmed;
}

/** Returns true when a session has no messages (is a blank "New Chat"). */
function isEmpty(session: ChatSession): boolean {
  return session.messages.length === 0;
}

/**
 * Returns true when an ID is a local-only temp ID that has never been
 * persisted server-side.
 */
function isLocalTempId(id: string): boolean {
  return id.startsWith("session_");
}

/**
 * getAuthToken — reads the current Supabase access token directly from
 * authStore so every chatStore network call can authenticate on mobile,
 * where there's no cookie jar (mirrors the Bearer-token pattern already
 * used by the streaming /api/chat call).
 */
function getAuthToken(): string | undefined {
  return useAuthStore.getState().session?.access_token;
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildUserMessage(
  content: string,
  sessionId: string,
  userId: string,
): ChatMessage {
  return {
    id: newMessageId(),
    sessionId,
    userId,
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

function buildAssistantPlaceholder(
  sessionId: string,
  userId: string,
): ChatMessage {
  return {
    id: newMessageId(),
    sessionId,
    userId,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
  };
}

function makeNewSession(id: string, documentId: string): ChatSession {
  return {
    id,
    userId: "",
    documentId,
    title: "New Chat",
    messages: [],
    createdAt: new Date().toISOString(),
    isLoaded: true,
  };
}

const DEFAULT_PAGINATION: SessionPagination = {
  nextCursor: null,
  hasFetched: false,
  hasMore: true,
  isFetching: false,
};

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => {
        const initialState: ChatState = {
          sessions: {},
          activeSessionId: null,
          isStreaming: false,
          streamingMessageId: null,
          error: null,
          sessionPagination: {},
        };

        registerStoreReset(() => get()._reset());

        return {
          ...initialState,

          // ── ensureSessionForDocument ──────────────────────────────────────
          ensureSessionForDocument(documentId: string) {
            const { activeSessionId, sessions } = get();

            // A) Already on the right document
            if (
              activeSessionId &&
              sessions[activeSessionId]?.documentId === documentId
            ) {
              // Still kick off the session list fetch if not yet loaded
              get().fetchSessions(documentId);
              return;
            }

            // B) Re-use an existing empty session for this document
            const existingEmpty = Object.values(sessions).find(
              (s) => s.documentId === documentId && isEmpty(s),
            );
            if (existingEmpty) {
              set((s) => {
                s.activeSessionId = existingEmpty.id;
              });
              get().fetchSessions(documentId);
              return;
            }

            // C) Create a fresh local session and start loading history
            const id = newSessionId();
            set((s) => {
              s.sessions[id] = makeNewSession(id, documentId);
              s.activeSessionId = id;
            });
            get().fetchSessions(documentId);
          },

          // ── fetchSessions ─────────────────────────────────────────────────
          async fetchSessions(documentId: string) {
            const pagination =
              get().sessionPagination[documentId] ?? DEFAULT_PAGINATION;

            // Guard: don't fire concurrent requests or fetch beyond the last page
            if (pagination.isFetching) return;
            if (pagination.hasFetched && !pagination.hasMore) return;

            set((s) => {
              if (!s.sessionPagination[documentId]) {
                s.sessionPagination[documentId] = { ...DEFAULT_PAGINATION };
              }
              s.sessionPagination[documentId].isFetching = true;
            });

            try {
              const params = new URLSearchParams({
                documentId,
                limit: "15",
              });

              const currentPagination = get().sessionPagination[documentId];
              if (currentPagination?.nextCursor) {
                params.set("cursor", currentPagination.nextCursor);
              }

              const token = getAuthToken();
              const res = await fetch(
                `${getApiBase()}/api/chat/sessions?${params.toString()}`,
                { headers: authHeaders(token) },
              );
              const json = await res.json();

              if (!res.ok) throw Err.fromJSON(json.error);

              const incoming: ChatSession[] = json.sessions ?? [];

              set((s) => {
                for (const session of incoming) {
                  // Only add sessions the client doesn't already know
                  // about. A session already present locally is either
                  // the active session (created client-side and possibly
                  // already renamed from a local temp id to its server id
                  // — see the SSE "start" handling in sendMessage /
                  // _handleSSEEvent) or one whose full message history is
                  // already loaded; in both cases `messages` / `isLoaded`
                  // must be left alone. We DO sync `title`, since the DB
                  // row is the source of truth for it and the client may
                  // only have an optimistic guess.
                  //
                  // NOTE: we deliberately do NOT sync `createdAt` here.
                  // Doing so previously let an already-rendered session's
                  // sort position shift on a later fetch (e.g. paging in
                  // more history, or a remount re-syncing page 1), which
                  // reorders the sidebar list while it may be open and
                  // makes it possible to tap a different row than the one
                  // the user intended. `createdAt` only ever affects sort
                  // order here, and the client's locally-recorded value
                  // (set at the moment of creation) is a perfectly stable
                  // sort key for as long as the session lives in this
                  // client — there's no need to chase the server's value.
                  const local = s.sessions[session.id];

                  if (!local) {
                    s.sessions[session.id] = session;
                    continue;
                  }

                  local.title = session.title;
                }

                s.sessionPagination[documentId] = {
                  nextCursor: json.nextCursor ?? null,
                  hasFetched: true,
                  hasMore: json.hasMore ?? false,
                  isFetching: false,
                };
              });
            } catch (err) {
              // Still flip `hasFetched` to true here. Previously this branch
              // only cleared `isFetching`, so a failed request (e.g. a 401
              // from a missing/expired auth token) left `hasFetched` stuck
              // at `false` forever — which is what kept the sidebar showing
              // its skeleton indefinitely instead of falling back to an
              // empty/error state. `hasMore` is left untouched so the next
              // call to fetchSessions (e.g. re-opening the sidebar) retries.
              set((s) => {
                if (!s.sessionPagination[documentId]) {
                  s.sessionPagination[documentId] = { ...DEFAULT_PAGINATION };
                }
                s.sessionPagination[documentId].isFetching = false;
                s.sessionPagination[documentId].hasFetched = true;
                s.error =
                  err instanceof Err
                    ? err
                    : new Err(
                        ErrorCode.NETWORK_ERROR,
                        "Failed to load sessions",
                      );
              });
            }
          },

          // ── requestNewChat ────────────────────────────────────────────────
          requestNewChat(documentId: string) {
            const { activeSessionId, sessions } = get();

            // A) Active session is already empty AND belongs to THIS document → reuse it
            if (
              activeSessionId &&
              sessions[activeSessionId]?.documentId === documentId &&
              isEmpty(sessions[activeSessionId])
            ) {
              return activeSessionId;
            }

            // B) There's an existing empty session for this document (not the active one)
            const existingEmpty = Object.values(sessions).find(
              (s) =>
                s.documentId === documentId &&
                isEmpty(s) &&
                s.id !== activeSessionId,
            );
            if (existingEmpty) {
              // Don't call setActiveSession here — let the caller do it
              // so we avoid the double-render in the old code path
              return existingEmpty.id;
            }

            // C) No empty session for this document → create one fresh
            // Prune OTHER empty sessions for this document to avoid accumulation
            const id = newSessionId();
            set((s) => {
              for (const sid of Object.keys(s.sessions)) {
                if (
                  s.sessions[sid].documentId === documentId &&
                  isEmpty(s.sessions[sid])
                ) {
                  delete s.sessions[sid];
                }
              }
              s.sessions[id] = makeNewSession(id, documentId);
              // NOTE: do NOT set activeSessionId here — caller sets it explicitly
              // This prevents the double-render where old activeSessionId persists
              // for one frame after the effect fires.
            });
            return id;
          },

          // ── createSession ─────────────────────────────────────────────────
          createSession(documentId?: string) {
            const id = newSessionId();
            set((s) => {
              s.sessions[id] = {
                id,
                userId: "",
                documentId: documentId ?? null,
                title: "New Chat",
                messages: [],
                createdAt: new Date().toISOString(),
                isLoaded: true,
              };
              s.activeSessionId = id;
            });
            return id;
          },

          // ── loadHistory ───────────────────────────────────────────────────
          async loadHistory(sessionId: string) {
            const existing = get().sessions[sessionId];
            if (existing?.isLoaded) return;

            try {
              const token = getAuthToken();
              const res = await fetch(
                `${getApiBase()}/api/chat/history/${sessionId}`,
                { headers: authHeaders(token) },
              );
              const json = await res.json();
              if (!res.ok) throw Err.fromJSON(json.error);

              set((s) => {
                s.sessions[sessionId] = { ...json.session, isLoaded: true };
              });
            } catch (err) {
              set((s) => {
                s.error =
                  err instanceof Err
                    ? err
                    : new Err(
                        ErrorCode.NETWORK_ERROR,
                        "Failed to load chat history",
                      );
              });
            }
          },

          // ── sendMessage ───────────────────────────────────────────────────
          async sendMessage(
            sessionId: string,
            content: string,
            documentId?: string,
          ) {
            const session = get().sessions[sessionId];
            if (!session) return;

            const userId = "local";
            const userMsg = buildUserMessage(content, sessionId, userId);
            const assistantMsg = buildAssistantPlaceholder(sessionId, userId);

            const isFirstMessage = session.messages.length === 0;
            const localTitle = isFirstMessage
              ? deriveTitle(content)
              : session.title;

            set((s) => {
              if (isFirstMessage) {
                s.sessions[sessionId].title = localTitle;
              }
              s.sessions[sessionId].messages.push(userMsg, assistantMsg);
              s.isStreaming = true;
              s.streamingMessageId = assistantMsg.id;
              s.error = null;
            });

            let currentSessionId = sessionId;

            try {
              const token = getAuthToken();
              const res = await fetch(`${getApiBase()}/api/chat`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...authHeaders(token),
                },
                body: JSON.stringify({
                  sessionId: isLocalTempId(sessionId) ? null : sessionId,
                  content,
                  documentId: documentId ?? session.documentId,
                }),
              });

              if (!res.ok || !res.body) {
                const json = await res.json();
                throw Err.fromJSON(json.error);
              }

              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr || jsonStr === "[DONE]") continue;

                  try {
                    const event = JSON.parse(jsonStr) as SSEEvent;
                    currentSessionId = get()._handleSSEEvent(
                      currentSessionId,
                      assistantMsg.id,
                      event,
                      localTitle,
                    );
                  } catch {
                    // Malformed JSON in stream — skip
                  }
                }
              }
            } catch (err) {
              set((s) => {
                const targetSession = s.sessions[currentSessionId];
                if (targetSession) {
                  const msgIdx = targetSession.messages.findIndex(
                    (m) => m.id === assistantMsg.id,
                  );
                  if (msgIdx >= 0) {
                    targetSession.messages[msgIdx].content =
                      "Sorry, I encountered an error. Please try again.";
                  }
                }
                s.error =
                  err instanceof Err
                    ? err
                    : new Err(
                        ErrorCode.STREAM_INTERRUPTED,
                        "Stream interrupted",
                      );
              });
              get().finalizeStreaming();
            }
          },

          // ── _handleSSEEvent ───────────────────────────────────────────────
          _handleSSEEvent(
            sessionId: string,
            messageId: string,
            event: SSEEvent,
            localTitle: string,
          ): string {
            switch (event.type) {
              case "start": {
                if (event.sessionId && event.sessionId !== sessionId) {
                  set((s) => {
                    const existing = s.sessions[sessionId];
                    if (existing) {
                      s.sessions[event.sessionId] = {
                        ...existing,
                        id: event.sessionId,
                        title: localTitle,
                        // Mark as truly loaded now that the server has confirmed it
                        isLoaded: true,
                      };
                      delete s.sessions[sessionId];
                      if (s.activeSessionId === sessionId) {
                        s.activeSessionId = event.sessionId;
                      }
                    }
                  });
                  return event.sessionId;
                }
                return sessionId;
              }

              case "token":
                get().appendToken(sessionId, messageId, event.content);
                return sessionId;

              case "sources":
                get().attachSources(sessionId, messageId, event.sources);
                return sessionId;

              case "done":
                get().finalizeStreaming();
                return sessionId;

              case "error":
                set((s) => {
                  s.error = new Err(
                    event.code,
                    event.message,
                    500,
                    event.retryable,
                  );
                });
                get().finalizeStreaming();
                return sessionId;

              default:
                return sessionId;
            }
          },

          // ── appendToken ───────────────────────────────────────────────────
          appendToken(sessionId: string, messageId: string, token: string) {
            set((s) => {
              const msg = s.sessions[sessionId]?.messages.find(
                (m) => m.id === messageId,
              );
              if (msg) msg.content += token;
            });
          },

          // ── attachSources ─────────────────────────────────────────────────
          attachSources(
            sessionId: string,
            messageId: string,
            sources: SourceCitation[],
          ) {
            set((s) => {
              const msg = s.sessions[sessionId]?.messages.find(
                (m) => m.id === messageId,
              );
              if (msg) msg.sources = sources;
            });
          },

          // ── finalizeStreaming ──────────────────────────────────────────────
          finalizeStreaming() {
            set((s) => {
              s.isStreaming = false;
              s.streamingMessageId = null;
            });
          },

          // ── deleteSession ─────────────────────────────────────────────────
          async deleteSession(sessionId: string) {
            const { sessions } = get();

            const remaining = Object.values(sessions)
              .filter((s) => s.id !== sessionId)
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
              );

            const nextId = remaining[0]?.id ?? null;

            set((s) => {
              delete s.sessions[sessionId];
              if (s.activeSessionId === sessionId) {
                s.activeSessionId = nextId;
              }
            });

            if (!isLocalTempId(sessionId)) {
              const token = getAuthToken();
              await fetch(`${getApiBase()}/api/chat/history/${sessionId}`, {
                method: "DELETE",
                headers: authHeaders(token),
              }).catch(() => {
                // Network failure during delete is non-critical.
              });
            }
          },

          setActiveSession(sessionId: string | null) {
            set((s) => {
              s.activeSessionId = sessionId;
            });
          },

          clearError() {
            set((s) => {
              s.error = null;
            });
          },

          _reset() {
            set(() => initialState);
          },
        };
      }),
    ),
    { name: "ChatStore" },
  ),
);

// ─── SELECTORS ────────────────────────────────────────────────────────────────

export function useCurrentMessages(sessionId: string | null) {
  return useChatStore(
    useShallow((s) =>
      sessionId ? (s.sessions[sessionId]?.messages ?? []) : [],
    ),
  );
}

/**
 * useSessionList — returns sessions for a document sorted newest-first,
 * the active-session-is-empty flag, pagination loading state, and a
 * loadMore callback — all as a single stable object.
 *
 * Used exclusively by ChatSidebar so it has one place to subscribe.
 */
export function useSessionList(documentId: string) {
  return useChatStore(
    useShallow((s) => {
      const activeId = s.activeSessionId;

      const allSessions = Object.values(s.sessions)
        .filter(
          (sess) =>
            sess.documentId === documentId ||
            (!sess.documentId && documentId === ""),
        )
        .sort((a, b) => {
          // Pin a brand-new, never-sent "draft" session to the very top
          // whenever it's the active one. Its createdAt is "now" so it
          // would almost always win this comparison anyway — this is a
          // deterministic guarantee on top of that, independent of any
          // clock-skew edge case, so the conversation currently on screen
          // is always easy to find rather than depending purely on
          // timestamp comparison.
          //
          // We deliberately do NOT pin already-persisted conversations
          // (sessions that have messages). Doing so would re-sort the
          // list out of its normal chronological order every time the
          // user switches between two existing chats — exactly the kind
          // of mid-interaction reordering that makes a tap land on the
          // wrong row.
          const aIsActiveDraft = a.id === activeId && a.messages.length === 0;
          const bIsActiveDraft = b.id === activeId && b.messages.length === 0;
          if (aIsActiveDraft && !bIsActiveDraft) return -1;
          if (bIsActiveDraft && !aIsActiveDraft) return 1;

          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });

      const pagination = s.sessionPagination[documentId] ?? DEFAULT_PAGINATION;

      return {
        sessions: allSessions,
        hasMore: pagination.hasMore,
        isFetching: pagination.isFetching,
        hasFetched: pagination.hasFetched,
      };
    }),
  );
}

export const selectIsStreaming = (s: ChatStore) => s.isStreaming;
export const selectStreamingMessageId = (s: ChatStore) => s.streamingMessageId;
export const selectSessions = (s: ChatStore) => s.sessions;
