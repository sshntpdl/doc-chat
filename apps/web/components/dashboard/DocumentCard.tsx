"use client";

import { useState } from "react";
import type { Document } from "@docchat/types";
import { useDocumentStore, useToast } from "@docchat/stores";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FILE_CONFIG: Record<
  string,
  {
    label: string;
    gradient: string; // icon avatar + ambient glow stops
    hoverFrom: string; // hover: literal class — drives the gradient border
    hoverTo: string; // hover: literal class — drives the gradient border
    badgeBg: string;
    badgeText: string;
  }
> = {
  pdf: {
    label: "PDF",
    gradient: "from-emerald-400 to-teal-500",
    hoverFrom: "hover:from-emerald-400",
    hoverTo: "hover:to-teal-500",
    badgeBg: "bg-emerald-50 dark:bg-emerald-500/10",
    badgeText: "text-emerald-700 dark:text-emerald-300",
  },
  markdown: {
    label: "MD",
    gradient: "from-violet-400 to-purple-500",
    hoverFrom: "hover:from-violet-400",
    hoverTo: "hover:to-purple-500",
    badgeBg: "bg-violet-50 dark:bg-violet-500/10",
    badgeText: "text-violet-700 dark:text-violet-300",
  },
  text: {
    label: "TXT",
    gradient: "from-sky-400 to-blue-500",
    hoverFrom: "hover:from-sky-400",
    hoverTo: "hover:to-blue-500",
    badgeBg: "bg-sky-50 dark:bg-sky-500/10",
    badgeText: "text-sky-700 dark:text-sky-300",
  },
};

const FALLBACK_FILE_CONFIG = {
  label: "DOC",
  gradient: "from-slate-400 to-slate-500",
  hoverFrom: "hover:from-slate-400",
  hoverTo: "hover:to-slate-500",
  badgeBg: "bg-[var(--color-surface-hover)]",
  badgeText: "text-[var(--color-muted)]",
};

const STATUS_CONFIG = {
  ready: {
    label: "Ready",
    dot: "bg-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  processing: {
    label: "Processing",
    dot: "bg-amber-400 animate-pulse",
    text: "text-amber-600 dark:text-amber-400",
  },
  partial: {
    label: "Partial",
    dot: "bg-amber-400",
    text: "text-amber-600 dark:text-amber-400",
  },
  error: {
    label: "Error",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
  },
} as const;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── ICONS ────────────────────────────────────────────────────────────────────

function FileGlyph() {
  return (
    <svg
      width="16"
      height="16"
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

function CalendarGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="2.5"
        width="9"
        height="8"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path
        d="M1.5 5h9M4 1.5v2M8 1.5v2"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScaleGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 1.5v9M3 3.5h6M2 6L3.5 3.5 5 6M7 6l1.5-2.5L10 6"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LayersGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 1.5l4.5 2.25L6 6 1.5 3.75 6 1.5zM1.5 6L6 8.25 10.5 6M1.5 8.25L6 10.5l4.5-2.25"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12.5 3h-10A1.5 1.5 0 001 4.5v6A1.5 1.5 0 002.5 12H5l2.5 2.5L10 12h2.5A1.5 1.5 0 0014 10.5v-6A1.5 1.5 0 0012.5 3z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
        d="M2.5 4h9M5.5 4V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5V4M6 6.5v4M8 6.5v4M3.5 4l.5 7.5a.5.5 0 00.5.5h5a.5.5 0 00.5-.5L10.5 4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

interface Props {
  document: Document;
  onChat: () => void;
}

export function DocumentCard({ document: doc, onChat }: Props) {
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const fileCfg = FILE_CONFIG[doc.type] ?? FALLBACK_FILE_CONFIG;
  const statusCfg = STATUS_CONFIG[doc.status];
  const canChat = doc.status === "ready" || doc.status === "partial";

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await deleteDocument(doc.id);
    toast.success("Document deleted");
    setConfirming(false);
  }

  function handleCancelDelete() {
    setConfirming(false);
  }

  return (
    <article
      className={`group relative rounded-2xl p-px bg-[var(--color-border)]
                  bg-gradient-to-br ${fileCfg.hoverFrom} ${fileCfg.hoverTo}
                  shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)]
                  transition-all duration-300 ease-out hover:-translate-y-1`}
      onMouseLeave={() => setConfirming(false)}
    >
      <div className="relative flex flex-col h-full rounded-2xl bg-[var(--color-surface)] overflow-hidden">
        {/* ── Ambient hover glow (subtle, file-type tinted) ───────────────── */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -top-10 -right-10 w-28 h-28
                      rounded-full bg-gradient-to-br ${fileCfg.gradient}
                      opacity-0 blur-3xl transition-opacity duration-500
                      group-hover:opacity-20`}
        />

        {/* ── Card body ────────────────────────────────────────────────────── */}
        <div className="relative flex flex-col flex-1 p-4 gap-3">
          {/* Row 1: file icon + type badge + status */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Gradient icon avatar */}
              <div
                className={`flex items-center justify-center w-9 h-9 shrink-0 rounded-xl
                            bg-gradient-to-br ${fileCfg.gradient} text-white
                            shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.08)]
                            transition-transform duration-300 ease-out
                            group-hover:scale-105`}
              >
                <FileGlyph />
              </div>

              {/* File type pill */}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px]
                            font-bold tracking-widest uppercase ${fileCfg.badgeBg} ${fileCfg.badgeText}`}
              >
                {fileCfg.label}
              </span>
            </div>

            {/* Status indicator */}
            <span
              className={`flex items-center gap-1.5 text-xs font-medium shrink-0 ${statusCfg.text}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusCfg.dot}`}
              />
              {statusCfg.label}
            </span>
          </div>

          {/* Row 2: file name */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-semibold text-[var(--color-foreground)] leading-snug
                         line-clamp-2 break-words"
              title={doc.name}
            >
              {doc.name}
            </h3>
          </div>

          {/* Row 3: metadata, each with a small glyph for scannability */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <CalendarGlyph />
              {formatDate(doc.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ScaleGlyph />
              {formatSize(doc.size)}
            </span>
            {doc.chunkCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <LayersGlyph />
                {doc.chunkCount} chunks
              </span>
            )}
          </div>

          {/* Error hint */}
          {doc.status === "error" && (
            <p className="text-xs text-[var(--color-destructive)] leading-snug">
              Processing failed — try re-uploading.
            </p>
          )}
        </div>

        {/* ── Divider ──────────────────────────────────────────────────────── */}
        <div
          className="relative h-px bg-[var(--color-border)] mx-4"
          aria-hidden="true"
        />

        {/* ── Action bar ───────────────────────────────────────────────────── */}
        <div className="relative flex items-center gap-2 px-4 py-3">
          {/* Primary: Chat */}
          <button
            onClick={onChat}
            disabled={!canChat}
            aria-label={`Chat with ${doc.name}`}
            className="flex-1 flex items-center justify-center gap-1.5
                       py-2 rounded-[var(--radius-md)] text-xs font-semibold text-white
                       bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)]
                       hover:from-[var(--color-primary-hover)] hover:to-[var(--color-primary)]
                       active:scale-[0.97] transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed
                       focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
          >
            <ChatIcon />
            Chat
          </button>

          {/* Secondary: Delete / Confirm */}
          {confirming ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleDelete}
                aria-label="Confirm deletion"
                className="px-3 py-2 rounded-[var(--radius-md)] text-xs font-semibold
                           bg-[var(--color-destructive)] text-white
                           active:scale-[0.97] transition-all
                           focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-[var(--color-destructive)]"
              >
                Delete
              </button>
              <button
                onClick={handleCancelDelete}
                aria-label="Cancel deletion"
                className="px-3 py-2 rounded-[var(--radius-md)] text-xs font-medium
                           text-[var(--color-muted)] bg-[var(--color-surface-hover)]
                           hover:text-[var(--color-foreground)] active:scale-[0.97]
                           transition-all focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-[var(--color-border)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              aria-label={`Delete ${doc.name}`}
              className="w-8 h-8 flex items-center justify-center shrink-0
                         rounded-[var(--radius-md)] text-[var(--color-muted)]
                         hover:text-[var(--color-destructive)]
                         hover:bg-[var(--color-destructive-subtle)]
                         active:scale-[0.97] transition-all
                         focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-[var(--color-destructive)]"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
