// FILE: apps/web/components/chat/ChatSidebar.tsx
"use client";
//
// CHANGES vs v2:
//
// 1. REAL SESSION LIST WITH INFINITE SCROLL:
//    Sessions are fetched from the server via fetchSessions() (called by
//    ensureSessionForDocument in the store). The list renders all sessions
//    for the current document, newest-first. As the user scrolls to the
//    bottom of the list, an IntersectionObserver fires fetchSessions() again
//    to load the next page (cursor-based pagination, 15 per page).
//
// 2. LOADING STATES:
//    - Initial load: shows a skeleton shimmer for 3 placeholder rows.
//    - Load-more (scroll): shows a subtle spinner row at the list bottom.
//    - Each row fetches its full message history lazily on first select
//      (loadHistory is called by onSelectSession in ChatPage).
//
// 3. ACTIVE SESSION HIGHLIGHT + HISTORY STUB DISPLAY:
//    Sessions fetched from the server are stubs (no messages yet). Their
//    message count is only shown after loadHistory() fills them in.
//    Until then we show just the date.
//
// 4. DELETE BUTTON (unchanged from v2 — kept as-is):
//    Trash icon on hover, confirm for sessions with messages, streaming guard.
//
// 5. "+ New Chat" BUTTON STATE (unchanged from v2):
//    Dimmed + tooltip when already in an empty session.

import { useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useChatStore, useSessionList } from "@docchat/stores";
import type { Document } from "@docchat/types";
import { useState } from "react";

interface ChatSidebarProps {
  document: Document | undefined;
  documentId: string;
  collapsed: boolean;
  onToggle: () => void;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
}

// ─── ICONS ────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.75 3.5h10.5M5.25 3.5V2.333a.583.583 0 0 1 .583-.583h2.334a.583.583 0 0 1 .583.583V3.5M11.083 3.5l-.583 8.167H3.5L2.917 3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────
// Shown on the very first load before any sessions arrive.

function SessionSkeleton() {
  return (
    <div className="space-y-0.5 px-2 py-1" aria-hidden="true">
      {[72, 56, 80].map((w) => (
        <div key={w} className="px-3 py-2.5 rounded-[var(--radius-md)]">
          <div
            className="h-3 rounded-full bg-[var(--color-surface-hover)] animate-pulse mb-2"
            style={{ width: `${w}%` }}
          />
          <div
            className="h-2 rounded-full bg-[var(--color-surface-hover)] animate-pulse opacity-60"
            style={{ width: "40%" }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── LOAD-MORE SENTINEL ───────────────────────────────────────────────────────
// An invisible element at the bottom of the list. When it scrolls into view
// the IntersectionObserver fires and we fetch the next page.

interface SentinelProps {
  onVisible: () => void;
  isFetching: boolean;
}

function LoadMoreSentinel({ onVisible, isFetching }: SentinelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onVisible();
        }
      },
      {
        // Fire when the sentinel is fully within the scrollable container
        threshold: 0.1,
        // Root = the nearest scrollable ancestor (the session list div)
        rootMargin: "0px 0px 40px 0px",
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <div ref={ref} className="flex items-center justify-center py-3">
      {isFetching && (
        <span
          className="w-4 h-4 border-2 border-[var(--color-muted)] border-t-transparent
                     rounded-full animate-spin opacity-50"
          aria-label="Loading more chats…"
        />
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function ChatSidebar({
  document: doc,
  documentId,
  collapsed,
  onToggle,
  activeSessionId,
  onSelectSession,
  onNewChat,
}: ChatSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Store subscriptions ────────────────────────────────────────────────────
  const { sessions, hasMore, isFetching, hasFetched } =
    useSessionList(documentId);

  const deleteSession = useChatStore((s) => s.deleteSession);
  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeIsEmpty = !activeSession || activeSession.messages.length === 0;

  // ── Load-more callback (stable ref so IntersectionObserver doesn't re-attach) ──
  const handleLoadMore = useCallback(() => {
    if (!isFetching && hasMore) {
      fetchSessions(documentId);
    }
  }, [isFetching, hasMore, fetchSessions, documentId]);

  // ── Delete handler ─────────────────────────────────────────────────────────
  async function handleDelete(
    e: React.MouseEvent,
    sessionId: string,
    hasMessages: boolean,
  ) {
    e.stopPropagation();

    // Block deletion of the currently-streaming session
    if (isStreaming && streamingMessageId) {
      const streamingSession = sessions.find((s) =>
        s.messages.some((m) => m.id === streamingMessageId),
      );
      if (streamingSession?.id === sessionId) return;
    }

    if (
      hasMessages &&
      !window.confirm("Delete this chat? This cannot be undone.")
    ) {
      return;
    }

    setDeletingId(sessionId);
    await deleteSession(sessionId);
    setDeletingId(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <aside
      aria-label="Chat history"
      className={`flex flex-col border-r border-[var(--color-sidebar-border)]
                 bg-[var(--color-sidebar)] transition-all duration-[var(--duration-normal)]
                 overflow-hidden shrink-0
                 ${collapsed ? "w-0" : "w-[280px]"}`}
    >
      {/* ── Document header ──────────────────────────────────────────── */}
      <div className="p-4 border-b border-[var(--color-sidebar-border)] shrink-0">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs
                     text-[var(--color-muted)] hover:text-[var(--color-primary)]
                     transition-colors mb-3"
        >
          ← Library
        </Link>

        {doc ? (
          <>
            <p
              className="font-semibold text-sm text-[var(--color-foreground)]
                         truncate leading-snug"
              title={doc.name}
            >
              {doc.name}
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-1">
              {doc.chunkCount > 0 ? `${doc.chunkCount} chunks · ` : ""}
              {doc.type.toUpperCase()}
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        )}
      </div>

      {/* ── New chat button ───────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <button
          onClick={onNewChat}
          title={
            activeIsEmpty ? "You're already in a new chat" : "Start a new chat"
          }
          className={`w-full py-2 rounded-[var(--radius-md)]
                     border border-[var(--color-border)] text-sm
                     transition-colors flex items-center justify-center gap-2
                     ${
                       activeIsEmpty
                         ? "text-[var(--color-muted)] opacity-50 cursor-default"
                         : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)] cursor-pointer"
                     }`}
          aria-label="Start a new chat"
          aria-disabled={activeIsEmpty}
        >
          <span aria-hidden="true">+</span> New Chat
        </button>
      </div>

      {/* ── Session list ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        <p
          className="px-2 pt-1 pb-2 text-xs font-semibold
                      text-[var(--color-muted-foreground)] uppercase tracking-wide"
        >
          Chats
        </p>

        {/* Empty state — only shown after fetch with zero results */}
        {hasFetched && sessions.length === 0 && (
          <p className="px-2 py-3 text-xs text-[var(--color-muted)]">
            No previous chats yet.
          </p>
        )}

        {/* Session rows */}
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          // isLoaded = true means messages array is hydrated from the server.
          // For stub sessions (isLoaded=false), we don't know the message count yet.
          const hasMessages = session.messages.length > 0;
          const msgCount = session.messages.length;
          const dateLabel = new Date(session.createdAt).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" },
          );
          const isDeleting = deletingId === session.id;
          const showDelete = hoveredId === session.id && !isDeleting;

          // Sub-label: show msg count when loaded, "empty" for confirmed-empty,
          // nothing (just date) for unhydrated stubs.
          let subLabel: string;
          if (session.isLoaded) {
            subLabel = hasMessages
              ? `${msgCount} msg${msgCount !== 1 ? "s" : ""}`
              : "empty";
          } else {
            // Not yet loaded from server — just show date, no msg count
            subLabel = "";
          }

          return (
            <div
              key={session.id}
              className="relative group"
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Session row button */}
              <button
                onClick={() => onSelectSession(session.id)}
                disabled={isDeleting}
                className={`w-full text-left px-3 py-2.5 rounded-[var(--radius-md)]
                           text-sm transition-colors pr-9
                           ${
                             isActive
                               ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                               : "text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
                           }
                           ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
                aria-current={isActive ? "true" : undefined}
              >
                <p className="font-medium truncate">
                  {session.title || "New Chat"}
                </p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">
                  {dateLabel}
                  {subLabel ? ` · ${subLabel}` : ""}
                </p>
              </button>

              {/* Delete button — revealed on hover */}
              {showDelete && (
                <button
                  onClick={(e) => handleDelete(e, session.id, hasMessages)}
                  aria-label={`Delete chat "${session.title || "New Chat"}"`}
                  title="Delete chat"
                  className="absolute right-2 top-1/2 -translate-y-1/2
                             w-6 h-6 flex items-center justify-center
                             rounded-[var(--radius-sm)]
                             text-[var(--color-muted)]
                             hover:text-[var(--color-destructive)]
                             hover:bg-[var(--color-destructive-subtle,rgba(239,68,68,0.1))]
                             transition-colors"
                >
                  <TrashIcon />
                </button>
              )}

              {/* Deleting spinner */}
              {isDeleting && (
                <span
                  className="absolute right-2 top-1/2 -translate-y-1/2
                               w-4 h-4 border-2 border-current border-t-transparent
                               rounded-full animate-spin opacity-50"
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}

        {/* Initial skeleton — shown only before the first fetch completes */}
        {!hasFetched && <SessionSkeleton />}

        {/* Infinite-scroll sentinel — only rendered when more pages exist */}
        {hasFetched && hasMore && (
          <LoadMoreSentinel
            onVisible={handleLoadMore}
            isFetching={isFetching}
          />
        )}

        {/* Bottom padding so last item isn't flush against the edge */}
        <div className="h-2" aria-hidden="true" />
      </div>
    </aside>
  );
}
