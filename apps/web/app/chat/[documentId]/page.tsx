// FILE: apps/web/app/chat/[documentId]/page.tsx
"use client";
//
// FIXES vs previous version:
//
// 1. `use` from React removed — only available in @types/react 19+.
//    Replaced with `useParams<{ documentId: string }>()` from next/navigation,
//    which is the correct approach for "use client" pages in Next.js 15.
//    Server Components should use `await params`; Client Components use `useParams`.
//
// 2. `params: Promise<...>` prop type removed — Client Components in Next.js 15
//    do NOT receive params as a Promise. Only Server Components do.
//    useParams() reads the same value with full TypeScript safety.
//
// 3. `selectStreamingMessageId` is now imported properly from @docchat/stores
//    (was accessed inline before which bypassed the selector pattern).
//
// 4. `handleSend` wrapped with proper null-guards so TypeScript doesn't
//    complain about `activeSessionId` potentially being null inside the callback.
//
// 5. `setTimeout` inside `onSelect` replaced with direct `sendMessage` call
//    to avoid closure-over-stale-state bugs.

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  useChatStore,
  useDocumentStore,
  useUIStore,
  useCurrentMessages,
  selectIsStreaming,
  selectStreamingMessageId,
} from "@docchat/stores";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatInput } from "@/components/chat/ChatInput";
import { SuggestedQuestions } from "@/components/chat/SuggestedQuestions";

// ─── PAGE ────────────────────────────────────────────────────────────────────
// No props needed — route params come from useParams().

export default function ChatPage() {
  // ── Route params ─────────────────────────────────────────────────────────
  // useParams() is the correct hook for "use client" pages.
  // TypeScript generic ensures documentId is typed as string (not string | string[]).
  const { documentId } = useParams<{ documentId: string }>();

  // ── Store slices ──────────────────────────────────────────────────────────
  const doc = useDocumentStore((s) => s.getDocumentById(documentId));
  const fetchDocuments = useDocumentStore((s) => s.fetchDocuments);

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  // Fine-grained selectors — each one only re-renders this component when
  // its specific slice changes, not on every store update.
  const isStreaming = useChatStore(selectIsStreaming);
  const streamingMessageId = useChatStore(selectStreamingMessageId);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const createSession = useChatStore((s) => s.createSession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const finalizeStreaming = useChatStore((s) => s.finalizeStreaming);

  // useCurrentMessages uses useShallow internally so only the active
  // session's messages trigger a re-render of this component.
  const messages = useCurrentMessages(activeSessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState<string>("");

  // ── Effects ───────────────────────────────────────────────────────────────

  // If user navigates directly to /chat/:id the document store may be empty.
  // Fetch all documents to populate the sidebar document info.
  useEffect(() => {
    if (!doc) {
      fetchDocuments();
    }
  }, [doc, fetchDocuments]);

  // Create a fresh session when the page first mounts (if none is active).
  // The empty dep array is intentional — we only want this on mount.
  useEffect(() => {
    if (!activeSessionId) {
      const id = createSession(documentId);
      setActiveSession(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll the messages list to the latest message.
  // Triggers on new messages and while streaming (token by token).
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    // Guard: need content, no active stream, and a valid session
    if (!trimmed || isStreaming || !activeSessionId) return;

    setInput("");
    await sendMessage(activeSessionId, trimmed, documentId);
  }, [input, isStreaming, activeSessionId, sendMessage, documentId]);

  // Called when the Stop button (■) is clicked during streaming
  function handleStop() {
    finalizeStreaming();
  }

  // Start a fresh chat session in this document's context
  function handleNewChat() {
    const id = createSession(documentId);
    setActiveSession(id);
  }

  // Called when user taps a suggested question chip.
  // Sends directly without routing through the input field to avoid
  // a stale-closure bug that occurred with the previous setTimeout approach.
  const handleSuggestedQuestion = useCallback(
    async (question: string) => {
      if (isStreaming || !activeSessionId) return;
      await sendMessage(activeSessionId, question, documentId);
    },
    [isStreaming, activeSessionId, sendMessage, documentId],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-[var(--color-background)] overflow-hidden">
      {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
      <ChatSidebar
        document={doc}
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        activeSessionId={activeSessionId}
        onSelectSession={(id: string) => setActiveSession(id)}
        onNewChat={handleNewChat}
      />

      {/* ── MAIN CHAT COLUMN ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center gap-3 px-4 h-14 shrink-0
                     border-b border-[var(--color-border)]
                     bg-[var(--color-background)]"
        >
          {/* Sidebar toggle */}
          <button
            onClick={toggleSidebar}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            className="w-8 h-8 flex items-center justify-center shrink-0
                       rounded-[var(--radius-md)] text-lg
                       text-[var(--color-muted)] hover:bg-[var(--color-surface)]
                       transition-colors"
          >
            {sidebarCollapsed ? "→" : "←"}
          </button>

          {/* Document name breadcrumb */}
          <span
            className="text-sm font-medium text-[var(--color-foreground)] truncate"
            title={doc?.name}
          >
            {doc?.name ?? "Chat"}
          </span>
        </div>

        {/* ── Messages area ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Empty state: suggested questions when chat is new */}
            {isEmpty && (
              <SuggestedQuestions onSelect={handleSuggestedQuestion} />
            )}

            {/* Message bubbles */}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={
                  // Only the actively-streaming message gets the cursor
                  isStreaming && message.id === streamingMessageId
                }
              />
            ))}

            {/* Invisible anchor element — scrolled into view on new messages */}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
        </div>

        {/* ── Input bar ───────────────────────────────────────────────── */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
