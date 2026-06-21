// FILE: /apps/web/components/upload/UploadZone.tsx
"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useDocumentStore, useToast, selectUploadQueue } from "@docchat/stores";

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "text/x-markdown": [".md"],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

interface Props {
  onClose?: () => void;
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

export function UploadZone({ onClose }: Props) {
  const uploadDocument = useDocumentStore((s) => s.uploadDocument);
  const cancelUpload = useDocumentStore((s) => s.cancelUpload);
  const uploadQueue = useDocumentStore(selectUploadQueue);
  const toast = useToast();

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: any[]) => {
      for (const rejection of rejectedFiles) {
        const reason = rejection.errors[0]?.code;
        const msg =
          reason === "file-too-large"
            ? `${rejection.file.name}: File exceeds 10 MB limit`
            : reason === "file-invalid-type"
              ? `${rejection.file.name}: Only PDF and Markdown files are supported`
              : `${rejection.file.name}: Could not upload`;
        toast.error(msg);
      }

      for (const file of acceptedFiles) {
        uploadDocument(file).catch((err) => {
          toast.error(`Failed to upload ${file.name}`, {
            description: err.message,
          });
        });
      }

      if (acceptedFiles.length > 0 && onClose) {
        setTimeout(onClose, 500);
      }
    },
    [uploadDocument, toast, onClose],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_TYPES,
      maxSize: MAX_SIZE,
      multiple: true,
    });

  const queueItems = Object.values(uploadQueue);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`relative flex flex-col items-center justify-center gap-3
                   p-10 rounded-[var(--radius-lg)] border-2 border-dashed
                   cursor-pointer transition-all duration-[var(--duration-fast)] select-none
                   ${
                     isDragActive && !isDragReject
                       ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] upload-zone-active scale-[1.01]"
                       : isDragReject
                         ? "border-[var(--color-destructive)] bg-[var(--color-destructive-subtle)]"
                         : "border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface)]"
                   }`}
      >
        <input {...getInputProps()} aria-label="File upload input" />

        <span
          className={`text-5xl transition-transform duration-[var(--duration-fast)]
                     ${isDragActive ? "scale-125" : "scale-100"}`}
          aria-hidden="true"
        >
          {isDragReject ? "🚫" : isDragActive ? "📥" : "☁️"}
        </span>

        <div className="text-center">
          <p className="font-medium text-[var(--color-foreground)]">
            {isDragReject
              ? "Unsupported file type"
              : isDragActive
                ? "Drop to upload"
                : "Drag & drop files here"}
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            or{" "}
            <span className="text-[var(--color-primary)] underline cursor-pointer">
              browse files
            </span>
          </p>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            PDF, TXT, or Markdown · Max 10 MB per file
          </p>
        </div>
      </div>

      {/* In-progress uploads */}
      {queueItems.length > 0 && (
        <div className="space-y-2" role="list" aria-label="Upload progress">
          {queueItems.map((item) => {
            const isActive =
              item.status === "uploading" || item.status === "processing";

            return (
              <div
                key={item.tempId}
                role="listitem"
                className="flex items-center gap-3 p-3 rounded-[var(--radius-md)]
                           bg-[var(--color-surface)] border border-[var(--color-border)]"
              >
                <span className="text-xl shrink-0" aria-hidden="true">
                  📄
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                      {item.fileName}
                    </p>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Status label */}
                      <span
                        className={`text-xs ${
                          item.status === "error"
                            ? "text-[var(--color-destructive)]"
                            : item.status === "ready"
                              ? "text-[var(--color-success)]"
                              : "text-[var(--color-muted)]"
                        }`}
                      >
                        {item.status === "uploading"
                          ? `${item.progress}%`
                          : item.status === "processing"
                            ? "Processing…"
                            : item.status === "ready"
                              ? "✓ Ready"
                              : item.status === "error"
                                ? "Failed"
                                : ""}
                      </span>

                      {/*
                       * Cancel / dismiss button.
                       *
                       * Shown for ALL statuses:
                       *   uploading  → aborts the XHR mid-transfer
                       *   processing → stops polling and removes the card
                       *   error      → dismisses the error card
                       *   ready      → dismisses the completed card
                       *               (document is already in the grid)
                       *
                       * aria-label is status-aware for screen readers.
                       */}
                      <button
                        onClick={() => cancelUpload(item.tempId)}
                        aria-label={
                          isActive
                            ? `Cancel upload of ${item.fileName}`
                            : `Dismiss ${item.fileName}`
                        }
                        title={isActive ? "Cancel upload" : "Dismiss"}
                        className="w-5 h-5 flex items-center justify-center rounded-full
                                   text-[var(--color-muted)]
                                   hover:text-[var(--color-foreground)]
                                   hover:bg-[var(--color-surface-hover)]
                                   transition-colors"
                      >
                        <XIcon />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {(item.status === "uploading" ||
                    item.status === "processing") && (
                    <div
                      className="mt-1.5 h-1 bg-[var(--color-border)] rounded-full overflow-hidden"
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
                                       : "bg-[var(--color-primary)]"
                                   }`}
                        style={
                          item.status === "uploading"
                            ? { width: `${item.progress}%` }
                            : undefined
                        }
                      />
                    </div>
                  )}

                  {/* Error message */}
                  {item.status === "error" && item.error && (
                    <p className="mt-1 text-xs text-[var(--color-destructive)]">
                      {item.error}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
