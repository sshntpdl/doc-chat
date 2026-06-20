// FILE: apps/web/components/chat/ChatSidebar.tsx
"use client";
//
// Collapsible left sidebar for the chat page.
// Contains:
//   - Back to Library link
//   - Current document info (name, chunk count, type)
//   - List of past chat sessions for this document
//   - New Chat button
//
// Width transitions smoothly between 280px (expanded) and 0px (collapsed).
// The chat area expands to fill the freed space via flexbox.

import Link from "next/link";
import { useChatStore } from "@docchat/stores";
import type { Document } from "@docchat/types";

interface ChatSidebarProps {
  document: Document | undefined;
  collapsed: boolean;
  onToggle: () => void;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
}

export function ChatSidebar({
  document: doc,
  collapsed,
  onToggle,
  activeSessionId,
  onSelectSession,
  onNewChat,
}: ChatSidebarProps) {
  const sessions = useChatStore((s) =>
    Object.values(s.sessions)
      .filter((s) => s.documentId === doc?.id || !s.documentId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
  );

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

      {/* ── Session list ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <p
          className="px-2 pt-1 pb-2 text-xs font-semibold
                      text-[var(--color-muted-foreground)] uppercase tracking-wide"
        >
          Chats
        </p>

        {sessions.length === 0 && (
          <p className="px-2 py-3 text-xs text-[var(--color-muted)]">
            No previous chats yet.
          </p>
        )}

        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`w-full text-left px-3 py-2.5 rounded-[var(--radius-md)]
                         text-sm transition-colors
                         ${
                           isActive
                             ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                             : "text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]"
                         }`}
              aria-current={isActive ? "true" : undefined}
            >
              <p className="font-medium truncate">{session.title}</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                {new Date(session.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
                {session.messages.length > 0 &&
                  ` · ${session.messages.length} msg${
                    session.messages.length !== 1 ? "s" : ""
                  }`}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── New chat button ───────────────────────────────────────────── */}
      <div className="p-3 border-t border-[var(--color-sidebar-border)] shrink-0">
        <button
          onClick={onNewChat}
          className="w-full py-2 rounded-[var(--radius-md)]
                     border border-[var(--color-border)] text-sm
                     text-[var(--color-muted)] hover:text-[var(--color-foreground)]
                     hover:bg-[var(--color-surface)] transition-colors
                     flex items-center justify-center gap-2"
          aria-label="Start a new chat"
        >
          <span aria-hidden="true">+</span> New Chat
        </button>
      </div>
    </aside>
  );
}
