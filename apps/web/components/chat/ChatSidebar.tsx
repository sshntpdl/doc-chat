"use client";
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

// ─── FILE TYPE → COLOR (kept consistent with DocumentCard's palette) ──────────

const FILE_ICON_CONFIG: Record<string, string> = {
  pdf: "from-emerald-400 to-teal-500",
  markdown: "from-violet-400 to-purple-500",
  text: "from-sky-400 to-blue-500",
};
const FALLBACK_ICON_GRADIENT = "from-slate-400 to-slate-500";

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

function ArrowLeftIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9.5 6h-7M5.25 2.75 2 6l3.25 3.25"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 1.5h5.5L13 5v8a1 1 0 01-1 1H4a1 1 0 01-1-1V2.5a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 1.5V5h3.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M5 8.25h6M5 10.5h6M5 12.75h3.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────

function SessionSkeleton() {
  return (
    <div className="space-y-1 px-2 py-1" aria-hidden="true">
      {[72, 56, 80].map((w) => (
        <div key={w} className="px-3 py-2.5 rounded-[var(--radius-lg)]">
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
        threshold: 0.1,
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
  const iconGradient = doc
    ? (FILE_ICON_CONFIG[doc.type] ?? FALLBACK_ICON_GRADIENT)
    : FALLBACK_ICON_GRADIENT;

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
      {/* ── Top: back nav + document card ───────────────────────────────── */}
      <div className="p-3 border-b border-[var(--color-sidebar-border)] shrink-0 space-y-3">
        <Link
          href="/dashboard"
          className="inline-flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-full
                     border border-[var(--color-sidebar-border)] text-xs font-medium
                     text-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]
                     transition-colors"
        >
          <ArrowLeftIcon />
          Library
        </Link>

        {doc ? (
          <div
            className="flex items-center gap-3 p-2.5 rounded-[var(--radius-lg)]
                       bg-[var(--color-surface)] border border-[var(--color-sidebar-border)]"
          >
            <div
              className={`flex items-center justify-center w-9 h-9 shrink-0 rounded-lg
                          bg-gradient-to-br ${iconGradient} text-white
                          shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]`}
              aria-hidden="true"
            >
              <FileGlyph />
            </div>
            <div className="min-w-0">
              <p
                className="font-semibold text-sm text-[var(--color-foreground)]
                           truncate leading-snug"
                title={doc.name}
              >
                {doc.name}
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">
                {doc.chunkCount > 0 ? `${doc.chunkCount} chunks · ` : ""}
                {doc.type.toUpperCase()}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)] px-1">Loading…</p>
        )}
      </div>

      {/* ── New chat button ───────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <button
          onClick={onNewChat}
          title={
            activeIsEmpty ? "You're already in a new chat" : "Start a new chat"
          }
          className={`w-full py-2 rounded-full
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
          className="px-2 pt-1 pb-2 text-[10px] font-semibold
                      text-[var(--color-muted-foreground)] uppercase tracking-wider"
        >
          History · Hover to delete
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
          const hasMessages = session.messages.length > 0;
          const msgCount = session.messages.length;
          const dateLabel = new Date(session.createdAt).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" },
          );
          const isDeleting = deletingId === session.id;
          const showDelete = hoveredId === session.id && !isDeleting;

          let subLabel: string;
          if (session.isLoaded) {
            subLabel = hasMessages
              ? `${msgCount} msg${msgCount !== 1 ? "s" : ""}`
              : "empty";
          } else {
            subLabel = "tap to load";
          }

          return (
            <div
              key={session.id}
              className="relative group"
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Active session accent bar */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px]
                             rounded-full bg-[var(--color-primary)]"
                />
              )}

              {/* Session row button */}
              <button
                onClick={() => onSelectSession(session.id)}
                disabled={isDeleting}
                className={`w-full text-left py-2.5 rounded-[var(--radius-lg)]
                           text-sm transition-colors pr-9
                           ${isActive ? "pl-4" : "pl-3"}
                           ${
                             isActive
                               ? "bg-[var(--color-primary-subtle)] text-[var(--color-foreground)]"
                               : "text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
                           }
                           ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
                aria-current={isActive ? "true" : undefined}
              >
                <p
                  className={
                    isActive ? "font-semibold truncate" : "font-medium truncate"
                  }
                >
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
