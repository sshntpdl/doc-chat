"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  useDocumentStore,
  useUIStore,
  selectDocuments,
  selectUploadQueue,
} from "@docchat/stores";
import type { Document } from "@docchat/types";
import { DocumentCard } from "./DocumentCard";
import { UploadZone } from "../upload/UploadZone";

interface Props {
  initialDocuments: Document[];
}

// ─── CANCEL ICON ─────────────────────────────────────────────────────────────

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function DocumentGrid({ initialDocuments }: Props) {
  const router = useRouter();
  const documents = useDocumentStore(selectDocuments);
  const uploadQueue = useDocumentStore(selectUploadQueue);
  const cancelUpload = useDocumentStore((s) => s.cancelUpload);
  const { openUploadModal, uploadModalOpen, closeUploadModal } = useUIStore();

  const [search, setSearch] = useState("");

  // Seed Zustand store with server-fetched documents on first render
  useEffect(() => {
    if (documents.length === 0 && initialDocuments.length > 0) {
      useDocumentStore.setState({ documents: initialDocuments });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter((d) => d.name.toLowerCase().includes(q));
  }, [documents, search]);

  const queueItems = Object.values(uploadQueue);

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
            aria-hidden="true"
          >
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            aria-label="Search documents"
            className="w-full pl-9 pr-4 py-2.5 rounded-[var(--radius-md)] border
                       border-[var(--color-border)] bg-[var(--color-surface)]
                       text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]
                       focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-sm"
          />
        </div>
        <button
          onClick={openUploadModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)]
                     bg-[var(--color-primary)] text-white font-medium text-sm
                     hover:bg-[var(--color-primary-hover)] active:scale-[0.98]
                     transition-all whitespace-nowrap"
        >
          <span aria-hidden="true">+</span> Upload Document
        </button>
      </div>

      {/* Upload zone modal */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4
                     bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeUploadModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Upload document"
        >
          <div
            className="w-full max-w-lg bg-[var(--color-background)] rounded-[var(--radius-xl)]
                       shadow-[var(--shadow-elevated)] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
                Upload Document
              </h2>
              <button
                onClick={closeUploadModal}
                aria-label="Close upload dialog"
                className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)]
                           hover:bg-[var(--color-surface)] transition-colors text-[var(--color-muted)]"
              >
                ✕
              </button>
            </div>
            <UploadZone onClose={closeUploadModal} />
          </div>
        </div>
      )}

      {/* Active uploads */}
      {queueItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-[var(--color-muted)]">
            Uploading
          </h3>

          {queueItems.map((item) => {
            const isActive =
              item.status === "uploading" || item.status === "processing";

            return (
              <div
                key={item.tempId}
                className="flex items-center gap-3 p-3 rounded-[var(--radius-md)]
                           bg-[var(--color-surface)] border border-[var(--color-border)]"
              >
                {/* File icon */}
                <span className="text-xl shrink-0" aria-hidden="true">
                  📄
                </span>

                {/* Progress info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                    {item.fileName}
                  </p>

                  {/* Progress bar */}
                  <div
                    className="mt-1.5 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300
                        ${
                          item.status === "processing"
                            ? "bg-[var(--color-warning)] w-full animate-pulse"
                            : item.status === "error"
                              ? "bg-[var(--color-destructive)]"
                              : "bg-[var(--color-primary)]"
                        }`}
                      style={
                        item.status === "uploading"
                          ? { width: `${item.progress}%` }
                          : undefined
                      }
                    />
                  </div>

                  {/* Status text */}
                  <p
                    className={`mt-1 text-xs ${
                      item.status === "error"
                        ? "text-[var(--color-destructive)]"
                        : "text-[var(--color-muted)]"
                    }`}
                  >
                    {item.status === "uploading"
                      ? `Uploading… ${item.progress}%`
                      : item.status === "processing"
                        ? "Processing…"
                        : item.status === "error"
                          ? `Error: ${item.error}`
                          : "Ready"}
                  </p>
                </div>

                {/*
                 * Cancel / dismiss button.
                 */}
                <button
                  onClick={() => cancelUpload(item.tempId)}
                  aria-label={
                    isActive
                      ? `Cancel upload of ${item.fileName}`
                      : `Dismiss ${item.fileName}`
                  }
                  title={isActive ? "Cancel upload" : "Dismiss"}
                  className="shrink-0 w-6 h-6 flex items-center justify-center
                             rounded-full text-[var(--color-muted)]
                             hover:text-[var(--color-foreground)]
                             hover:bg-[var(--color-surface-hover)]
                             transition-colors"
                >
                  <XIcon />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 && queueItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-6 select-none" aria-hidden="true">
            📚
          </div>
          <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
            Your knowledge base is empty
          </h2>
          <p className="mt-2 text-[var(--color-muted)] max-w-sm">
            Upload a PDF or Markdown file to start chatting with your documents
            using AI.
          </p>
          <button
            onClick={openUploadModal}
            className="mt-6 px-6 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-primary)]
                       text-white font-medium hover:bg-[var(--color-primary-hover)]
                       active:scale-[0.98] transition-all"
          >
            Upload your first document
          </button>
        </div>
      )}

      {/* Search empty state */}
      {search && filtered.length === 0 && documents.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-4 select-none" aria-hidden="true">
            🔍
          </div>
          <p className="text-[var(--color-foreground)] font-medium">
            No documents matching "{search}"
          </p>
          <button
            onClick={() => setSearch("")}
            className="mt-3 text-sm text-[var(--color-primary)] hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Document grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onChat={() => router.push(`/chat/${doc.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
