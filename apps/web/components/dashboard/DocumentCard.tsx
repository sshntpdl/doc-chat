// FILE: /apps/web/components/dashboard/DocumentCard.tsx
"use client";

import { useState }            from "react";
import type { Document }       from "@docchat/types";
import { useDocumentStore, useToast } from "@docchat/stores";

const FILE_ICONS: Record<string, string> = {
  pdf:      "📕",
  markdown: "📝",
  text:     "📄",
};

const STATUS_CONFIG = {
  ready:      { label: "Ready",      color: "text-[var(--color-success)]  bg-[var(--color-success-subtle)]" },
  processing: { label: "Processing", color: "text-[var(--color-warning)]  bg-[var(--color-warning-subtle)]" },
  partial:    { label: "Partial",    color: "text-[var(--color-warning)]  bg-[var(--color-warning-subtle)]" },
  error:      { label: "Error",      color: "text-[var(--color-destructive)] bg-[var(--color-destructive-subtle)]" },
};

interface Props {
  document: Document;
  onChat:   () => void;
}

export function DocumentCard({ document: doc, onChat }: Props) {
  const deleteDocument  = useDocumentStore((s) => s.deleteDocument);
  const toast           = useToast();
  const [confirming, setConfirming] = useState(false);
  const [isHovered,  setIsHovered]  = useState(false);

  const statusCfg = STATUS_CONFIG[doc.status];
  const icon      = FILE_ICONS[doc.type] ?? "📄";

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return; }
    await deleteDocument(doc.id);
    toast.success("Document deleted");
    setConfirming(false);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  return (
    <div
      className="relative group rounded-[var(--radius-lg)] border border-[var(--color-border)]
                 bg-[var(--color-surface)] shadow-[var(--shadow-card)]
                 overflow-hidden transition-all duration-[var(--duration-normal)]
                 hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setConfirming(false); }}
    >
      <div className="p-5">
        {/* Icon + status */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="text-3xl" aria-hidden="true">{icon}</span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}
                        ${doc.status === "processing" ? "animate-pulse" : ""}`}
          >
            {statusCfg.label}
          </span>
        </div>

        {/* File name */}
        <h3
          className="font-semibold text-[var(--color-foreground)] truncate"
          title={doc.name}
        >
          {doc.name}
        </h3>

        {/* Metadata */}
        <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-muted)]">
          <span>{formatDate(doc.createdAt)}</span>
          <span>·</span>
          <span>{formatSize(doc.size)}</span>
          {doc.chunkCount > 0 && (
            <>
              <span>·</span>
              <span>{doc.chunkCount} chunks</span>
            </>
          )}
        </div>

        {/* Error tooltip */}
        {doc.status === "error" && (
          <p className="mt-2 text-xs text-[var(--color-destructive)]">
            Processing failed. Try re-uploading.
          </p>
        )}
      </div>

      {/* Hover action overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 flex gap-2 p-3 bg-gradient-to-t
                   from-[var(--color-surface)] to-transparent
                   transition-all duration-[var(--duration-fast)]
                   ${isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}
      >
        {/* Chat button — only available when document is ready */}
        <button
          onClick={onChat}
          disabled={doc.status !== "ready" && doc.status !== "partial"}
          className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--color-primary)]
                     text-white text-sm font-medium hover:bg-[var(--color-primary-hover)]
                     active:scale-[0.97] transition-all
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Chat
        </button>

        {/* Delete button — popover confirm (not a full modal) */}
        <button
          onClick={handleDelete}
          className={`px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium
                     transition-all active:scale-[0.97]
                     ${confirming
                       ? "bg-[var(--color-destructive)] text-white"
                       : "bg-[var(--color-surface-hover)] text-[var(--color-muted)] hover:text-[var(--color-destructive)]"
                     }`}
          aria-label={confirming ? "Confirm delete" : "Delete document"}
        >
          {confirming ? "Confirm?" : "Delete"}
        </button>
      </div>
    </div>
  );
}
