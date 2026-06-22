"use client";

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

// ─── PAGE ─────────────────────────────────────────────────────────────────────

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

  // True only while loadHistory() is awaiting for a selected old session.
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!doc) fetchDocuments();
  }, [doc, fetchDocuments]);

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
   * handleSelectSession — activates the session immediately for snappy sidebar
   * highlighting, then lazy-loads the message history if this is a stub session.
   */
  const handleSelectSession = useCallback(
    async (id: string) => {
      setActiveSession(id);

      const session = sessions[id];
      if (session && !session.isLoaded) {
        setIsLoadingHistory(true);
        try {
          await loadHistory(id);
        } finally {
          // Always clear — even if loadHistory throws, we don't want a
          // permanent spinner blocking the UI.
          setIsLoadingHistory(false);
        }
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

  // ── Derived state ──────────────────────────────────────────────────────────

  const isEmpty = messages.length === 0;

  // Show suggested questions only for genuinely new (empty + not loading) sessions.
  const showSuggestions = isEmpty && !isLoadingHistory;

  // ── Render ────────────────────────────────────────────────────────────────

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
            {/* Loading skeleton — shown while fetching an old session's history */}
            {isLoadingHistory && (
              <div
                className="flex flex-col items-center justify-center gap-3 py-20
                  text-[var(--color-muted-foreground)]"
              >
                <span
                  className="w-7 h-7 rounded-full border-2
                 border-[var(--color-border)]
                 border-t-[var(--color-primary)]
                 animate-spin"
                />
                <p className="text-xs">Loading chat…</p>
              </div>
            )}

            {/* Suggested questions — only for genuinely new empty sessions */}
            {showSuggestions && (
              <SuggestedQuestions onSelect={handleSuggestedQuestion} />
            )}

            {/* Message list */}
            {!isLoadingHistory &&
              messages.map((message) => (
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
