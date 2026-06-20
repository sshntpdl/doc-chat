// FILE: /apps/web/app/chat/[documentId]/page.tsx
"use client";
//
// Two-column chat layout:
//   LEFT  (280px, collapsible): document info + session history
//   RIGHT (flex-1):             chat messages + input area
//
// The streaming flow is handled entirely by useChatStore.sendMessage(),
// which parses SSE events and calls appendToken per token.
// This component only subscribes to the data it needs.

import { useState, useEffect, useRef, useCallback, use } from "react";
import Link                          from "next/link";
import { useRouter }                 from "next/navigation";
import {
  useChatStore,
  useDocumentStore,
  useUIStore,
  useCurrentMessages,
  selectIsStreaming,
  selectSessions,
}                                    from "@docchat/stores";
import { MessageBubble }             from "@/components/chat/MessageBubble";

const SUGGESTED_QUESTIONS = [
  "Summarize this document",
  "What are the key takeaways?",
  "List all main topics covered",
];

// ─── PAGE ────────────────────────────────────────────────────────────────────

export default function ChatPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  // Unwrap the async params (Next.js 15 requirement)
  const { documentId } = use(params);

  const router          = useRouter();
  const getDocById      = useDocumentStore((s) => s.getDocumentById);
  const doc             = getDocById(documentId);

  const sidebarCollapsed   = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar      = useUIStore((s) => s.toggleSidebar);

  const sessions           = useChatStore(selectSessions);
  const isStreaming        = useChatStore(selectIsStreaming);
  const createSession      = useChatStore((s) => s.createSession);
  const sendMessage        = useChatStore((s) => s.sendMessage);
  const setActiveSession   = useChatStore((s) => s.setActiveSession);
  const activeSessionId    = useChatStore((s) => s.activeSessionId);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);

  const messages           = useCurrentMessages(activeSessionId);

  const [input,      setInput]      = useState("");
  const [charCount,  setCharCount]  = useState(0);
  const messagesEndRef              = useRef<HTMLDivElement>(null);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);
  const abortRef                    = useRef<(() => void) | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  // Create initial session on mount if none exists
  useEffect(() => {
    if (!activeSessionId) {
      const id = createSession(documentId);
      setActiveSession(id);
    }
  }, []); // eslint-disable-line

  // Auto-grow textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);
    setCharCount(val.length);
    // Reset height then expand to scrollHeight
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`; // max 5 lines ≈ 144px
  }

  // Send on Enter (Shift+Enter = newline)
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !activeSessionId) return;

    setInput("");
    setCharCount(0);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    await sendMessage(activeSessionId, trimmed, documentId);
  }, [input, isStreaming, activeSessionId, sendMessage, documentId]);

  function handleStop() {
    // Signal abort — the ReadableStream reader will throw on next read
    abortRef.current?.();
    useChatStore.getState().finalizeStreaming();
  }

  function handleNewChat() {
    const id = createSession(documentId);
    setActiveSession(id);
  }

  // Filter sessions belonging to this document
  const docSessions = Object.values(sessions)
    .filter((s) => s.documentId === documentId || !s.documentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-[var(--color-background)] overflow-hidden">

      {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
      <aside
        className={`flex flex-col border-r border-[var(--color-sidebar-border)]
                   bg-[var(--color-sidebar)] transition-all duration-[var(--duration-normal)]
                   ${sidebarCollapsed ? "w-0 overflow-hidden" : "w-[280px]"}`}
        aria-label="Chat history"
      >
        {/* Document header */}
        <div className="p-4 border-b border-[var(--color-sidebar-border)]">
          <Link
            href="/dashboard"
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)]
                       transition-colors flex items-center gap-1 mb-3"
          >
            ← Library
          </Link>
          {doc ? (
            <div>
              <p className="font-semibold text-sm text-[var(--color-foreground)] truncate" title={doc.name}>
                {doc.name}
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                {doc.chunkCount} chunks · {doc.type.toUpperCase()}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">Loading document…</p>
          )}
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <p className="px-2 py-1 text-xs font-medium text-[var(--color-muted-foreground)] uppercase tracking-wide">
            Chats
          </p>
          {docSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setActiveSession(session.id)}
              className={`w-full text-left px-3 py-2.5 rounded-[var(--radius-md)]
                         text-sm transition-colors
                         ${activeSessionId === session.id
                           ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                           : "text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
                         }`}
            >
              <p className="font-medium truncate">{session.title}</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                {new Date(session.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>

        {/* New chat button */}
        <div className="p-3 border-t border-[var(--color-sidebar-border)]">
          <button
            onClick={handleNewChat}
            className="w-full py-2 rounded-[var(--radius-md)] border border-[var(--color-border)]
                       text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]
                       hover:bg-[var(--color-surface)] transition-colors flex items-center justify-center gap-2"
          >
            <span aria-hidden="true">+</span> New Chat
          </button>
        </div>
      </aside>

      {/* ── RIGHT: CHAT AREA ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--color-border)]">
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)]
                       hover:bg-[var(--color-surface)] transition-colors text-[var(--color-muted)]
                       text-lg"
          >
            {sidebarCollapsed ? "→" : "←"}
          </button>
          <span className="text-sm font-medium text-[var(--color-foreground)] truncate">
            {doc?.name ?? "Chat"}
          </span>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Empty state with suggested questions */}
            {isEmpty && (
              <div className="flex flex-col items-center text-center py-16 gap-6">
                <div className="text-5xl select-none" aria-hidden="true">💬</div>
                <div>
                  <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
                    Ask anything about this document
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    {doc?.name ?? "Your document"} is ready
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                      className="px-4 py-2 rounded-[var(--radius-full)] border border-[var(--color-border)]
                                 text-sm text-[var(--color-foreground)] bg-[var(--color-surface)]
                                 hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-primary)]
                                 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={isStreaming && message.id === streamingMessageId}
              />
            ))}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── INPUT AREA ─────────────────────────────────────────────────── */}
        <div className="border-t border-[var(--color-border)] px-4 py-4">
          <div className="max-w-2xl mx-auto">
            <div
              className="flex items-end gap-3 rounded-[var(--radius-xl)] border
                         border-[var(--color-border)] bg-[var(--color-surface)]
                         px-4 py-3 focus-within:ring-2 focus-within:ring-[var(--color-primary)]
                         focus-within:border-transparent transition-all"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your document…"
                rows={1}
                maxLength={2000}
                disabled={isStreaming}
                aria-label="Chat input"
                className="flex-1 resize-none bg-transparent text-[var(--color-foreground)]
                           placeholder:text-[var(--color-muted-foreground)] text-sm
                           focus:outline-none leading-relaxed disabled:opacity-50"
                style={{ minHeight: "24px", maxHeight: "144px" }}
              />

              {/* Character counter (shown at 1500+) */}
              {charCount >= 1500 && (
                <span
                  className={`text-xs shrink-0 mb-0.5 tabular-nums
                             ${charCount >= 1900 ? "text-[var(--color-destructive)]" : "text-[var(--color-muted)]"}`}
                  aria-live="polite"
                >
                  {charCount}/2000
                </span>
              )}

              {/* Send / Stop button */}
              {isStreaming ? (
                <button
                  onClick={handleStop}
                  aria-label="Stop generating"
                  className="shrink-0 w-8 h-8 flex items-center justify-center
                             rounded-[var(--radius-md)] bg-[var(--color-destructive)]
                             text-white hover:bg-[var(--color-destructive-hover)]
                             transition-colors active:scale-95"
                >
                  {/* Stop icon (square) */}
                  <span className="w-3 h-3 bg-white rounded-sm" aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  aria-label="Send message"
                  className="shrink-0 w-8 h-8 flex items-center justify-center
                             rounded-[var(--radius-md)] bg-[var(--color-primary)]
                             text-white hover:bg-[var(--color-primary-hover)]
                             disabled:opacity-40 disabled:cursor-not-allowed
                             transition-all active:scale-95"
                >
                  {/* Send arrow icon */}
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M1 7h12M7 1l6 6-6 6" stroke="currentColor" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Keyboard hint */}
            <p className="mt-2 text-center text-xs text-[var(--color-muted-foreground)]">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
