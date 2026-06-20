// FILE: apps/web/components/command/CommandPalette.tsx
"use client";
//
// Global ⌘K command palette powered by the `cmdk` package.
// Opened by:
//   - Keyboard shortcut ⌘K (Mac) / Ctrl+K (Windows/Linux)  — wired in DashboardNav
//   - Clicking the search button in the nav bar
//
// SEARCH CATEGORIES:
//   Documents  — navigates to /chat/:id
//   Actions    — Upload, Sign out, Toggle theme
//
// BEHAVIOUR:
//   - Shows recent documents when search is empty
//   - Fuzzy filters as user types
//   - Keyboard: ↑↓ arrows, Enter to select, Escape to close
//   - Closes automatically after any selection

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useUIStore, useDocumentStore, useAuthStore } from "@docchat/stores";

export function CommandPalette() {
  const router = useRouter();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const onClose = useUIStore((s) => s.closeCommandPalette);
  const { theme, setTheme } = useUIStore();
  const documents = useDocumentStore((s) => s.documents);
  const signOut = useAuthStore((s) => s.signOut);
  const openUpload = useUIStore((s) => s.openUploadModal);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  function select(fn: () => void) {
    fn();
    onClose();
  }

  const readyDocs = documents.filter(
    (d) => d.status === "ready" || d.status === "partial",
  );

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center
                 pt-[15vh] px-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <Command
        label="Command palette"
        className="w-full max-w-lg bg-[var(--color-background)]
                   rounded-[var(--radius-xl)] border border-[var(--color-border)]
                   shadow-[var(--shadow-elevated)] overflow-hidden"
        // cmdk handles ↑↓ and Enter internally
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4 py-3
                        border-b border-[var(--color-border)]"
        >
          <span
            className="text-[var(--color-muted)] text-lg"
            aria-hidden="true"
          >
            🔍
          </span>
          <Command.Input
            placeholder="Search documents or type a command…"
            className="flex-1 bg-transparent text-[var(--color-foreground)] text-sm
                       placeholder:text-[var(--color-muted-foreground)]
                       focus:outline-none"
            autoFocus
          />
          <kbd
            className="hidden sm:inline-block text-xs text-[var(--color-muted-foreground)]
                       bg-[var(--color-surface)] border border-[var(--color-border)]
                       px-1.5 py-0.5 rounded font-mono"
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-[var(--color-muted)]">
            No results found.
          </Command.Empty>

          {/* ── Documents ─────────────────────────────────────────────── */}
          {readyDocs.length > 0 && (
            <Command.Group
              heading={
                <span
                  className="px-2 py-1 text-xs font-semibold
                                  text-[var(--color-muted-foreground)] uppercase tracking-wide"
                >
                  Documents
                </span>
              }
            >
              {readyDocs.slice(0, 8).map((doc) => (
                <Command.Item
                  key={doc.id}
                  value={doc.name}
                  onSelect={() => select(() => router.push(`/chat/${doc.id}`))}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                             text-sm text-[var(--color-foreground)] cursor-pointer
                             aria-selected:bg-[var(--color-primary-subtle)]
                             aria-selected:text-[var(--color-primary)]"
                >
                  <span aria-hidden="true">
                    {doc.type === "pdf"
                      ? "📕"
                      : doc.type === "markdown"
                        ? "📝"
                        : "📄"}
                  </span>
                  <span className="flex-1 truncate">{doc.name}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    Chat →
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── Actions ───────────────────────────────────────────────── */}
          <Command.Group
            heading={
              <span
                className="px-2 py-1 text-xs font-semibold
                                text-[var(--color-muted-foreground)] uppercase tracking-wide"
              >
                Actions
              </span>
            }
          >
            <Command.Item
              value="upload document"
              onSelect={() => select(openUpload)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                         text-sm text-[var(--color-foreground)] cursor-pointer
                         aria-selected:bg-[var(--color-primary-subtle)]
                         aria-selected:text-[var(--color-primary)]"
            >
              <span aria-hidden="true">📤</span>
              <span>Upload document</span>
            </Command.Item>

            <Command.Item
              value="go to dashboard library"
              onSelect={() => select(() => router.push("/dashboard"))}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                         text-sm text-[var(--color-foreground)] cursor-pointer
                         aria-selected:bg-[var(--color-primary-subtle)]
                         aria-selected:text-[var(--color-primary)]"
            >
              <span aria-hidden="true">📚</span>
              <span>Go to Library</span>
            </Command.Item>

            <Command.Item
              value="toggle theme dark light"
              onSelect={() =>
                select(() =>
                  setTheme(
                    theme === "dark"
                      ? "light"
                      : theme === "light"
                        ? "system"
                        : "dark",
                  ),
                )
              }
              className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                         text-sm text-[var(--color-foreground)] cursor-pointer
                         aria-selected:bg-[var(--color-primary-subtle)]
                         aria-selected:text-[var(--color-primary)]"
            >
              <span aria-hidden="true">
                {theme === "dark" ? "☀️" : theme === "light" ? "💻" : "🌙"}
              </span>
              <span>
                Switch to{" "}
                {theme === "dark"
                  ? "light"
                  : theme === "light"
                    ? "system"
                    : "dark"}{" "}
                theme
              </span>
            </Command.Item>

            <Command.Item
              value="sign out log out"
              onSelect={() =>
                select(async () => {
                  await signOut();
                  router.push("/auth/login");
                })
              }
              className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)]
                         text-sm text-[var(--color-destructive)] cursor-pointer
                         aria-selected:bg-[var(--color-destructive-subtle)]"
            >
              <span aria-hidden="true">🚪</span>
              <span>Sign out</span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
