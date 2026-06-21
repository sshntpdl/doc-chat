// FILE: apps/web/app/chat/[documentId]/page.tsx
"use client";
//
// CHANGES vs v3:
//
// 1. handleSelectSession — when the user clicks a session in the sidebar that
//    was fetched as a stub (isLoaded = false), we call loadHistory() to hydrate
//    its messages before activating it. This is lazy loading: we don't fetch
//    every session's full message history upfront, only on demand.
//
// 2. handleNewChat now calls requestNewChat(documentId) instead of
//    createSession(documentId). requestNewChat() refuses to create a new
//    session when the active session is already empty — matching Claude /
//    ChatGPT / Gemini behaviour.
//
// 3. ensureSessionForDocument dependency array is correct (documentId only).
//    The action itself is stable (defined inside immer, never re-created).

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

export default function ChatPage() {
  const { documentId } = useParams<{ documentId: string }>();

  const doc = useDocumentStore((s) => s.getDocumentById(documentId));
  const fetchDocuments = useDocumentStore((s) => s.fetchDocuments);

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const isStreaming = useChatStore(selectIsStreaming);
  const streamingMessageId = useChatStore(selectStreamingMessageId);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const finalizeStreaming = useChatStore((s) => s.finalizeStreaming);
  const ensureSessionForDocument = useChatStore(
    (s) => s.ensureSessionForDocument,
  );
  const requestNewChat = useChatStore((s) => s.requestNewChat);

  const messages = useCurrentMessages(activeSessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [input, setInput] = useState<string>("");

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!doc) fetchDocuments();
  }, [doc, fetchDocuments]);

  // Ensures a session exists for this document and kicks off session list fetch.
  useEffect(() => {
    ensureSessionForDocument(documentId);
  }, [documentId, ensureSessionForDocument]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !activeSessionId) return;
    setInput("");
    await sendMessage(activeSessionId, trimmed, documentId);
  }, [input, isStreaming, activeSessionId, sendMessage, documentId]);

  function handleStop() {
    finalizeStreaming();
  }

  function handleNewChat() {
    requestNewChat(documentId);
    inputRef.current?.focus();
  }

  /**
   * handleSelectSession — called when the user clicks a session row in the sidebar.
   *
   * If the session is a stub (fetched from server list, not yet fully loaded),
   * we call loadHistory() first so the message list is populated.
   * setActiveSession runs immediately so the UI highlights the row without
   * waiting for the network — the message area will show a brief empty state
   * then populate once loadHistory resolves.
   */
  const handleSelectSession = useCallback(
    async (id: string) => {
      // Activate immediately for snappy UI
      setActiveSession(id);

      const session = sessions[id];
      if (session && !session.isLoaded) {
        // Lazy-load the full message history for this session stub
        await loadHistory(id);
      }
    },
    [sessions, setActiveSession, loadHistory],
  );

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
      <ChatSidebar
        document={doc}
        documentId={documentId}
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center gap-3 px-4 h-14 shrink-0
                     border-b border-[var(--color-border)]
                     bg-[var(--color-background)]"
        >
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

          <span
            className="text-sm font-medium text-[var(--color-foreground)] truncate"
            title={doc?.name}
          >
            {doc?.name ?? "Chat"}
          </span>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {isEmpty && (
              <SuggestedQuestions onSelect={handleSuggestedQuestion} />
            )}

            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={isStreaming && message.id === streamingMessageId}
              />
            ))}

            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
        </div>

        {/* Input bar */}
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
