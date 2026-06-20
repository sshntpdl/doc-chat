// FILE: /packages/stores/src/documentStore.ts

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Document, UploadItem, AppError, ErrorCode } from "@docchat/types";
import { AppError as Err } from "@docchat/types";
import { registerStoreReset } from "./authStore";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface MobileFileDescriptor {
  uri: string;
  name: string;
  mimeType: string;
}

export type UploadableFile = File | MobileFileDescriptor;

interface DocumentState {
  documents: Document[];
  uploadQueue: Record<string, UploadItem>;
  isLoading: boolean;
  error: AppError | null;
}

interface DocumentActions {
  fetchDocuments(token?: string): Promise<void>;
  uploadDocument(file: UploadableFile, token?: string): Promise<void>;
  deleteDocument(id: string, token?: string): Promise<void>;
  getDocumentById(id: string): Document | undefined;
  clearError(): void;
  _reset(): void;
  _pollDocument(
    tempId: string,
    documentId: string,
    token?: string,
  ): Promise<void>;
  _uploadWithFetch(
    tempId: string,
    formData: FormData,
    token?: string,
  ): Promise<void>;
  _uploadWithXHR(
    tempId: string,
    formData: FormData,
    token?: string,
  ): Promise<void>;
}

type DocumentStore = DocumentState & DocumentActions;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function generateTempId() {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isMobileFile(file: UploadableFile): file is MobileFileDescriptor {
  return "uri" in file;
}

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

console.log("[DocumentStore] API_BASE:", API_BASE);

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useDocumentStore = create<DocumentStore>()(
  devtools(
    immer((set, get) => {
      const initialState: DocumentState = {
        documents: [],
        uploadQueue: {},
        isLoading: false,
        error: null,
      };

      registerStoreReset(() => get()._reset());

      return {
        ...initialState,

        // ── fetchDocuments ──────────────────────────────────────────────────
        async fetchDocuments(token?: string) {
          set((s) => {
            s.isLoading = true;
            s.error = null;
          });

          try {
            const res = await fetch(`${API_BASE}/api/documents`, {
              headers: authHeaders(token),
            });
            const json = await res.json();

            if (!res.ok) throw Err.fromJSON(json.error);

            set((s) => {
              s.documents = json.documents;
              s.isLoading = false;
            });
          } catch (err) {
            set((s) => {
              s.error =
                err instanceof Err
                  ? err
                  : new Err(
                      "NETWORK_ERROR" as ErrorCode,
                      "Failed to load documents",
                    );
              s.isLoading = false;
            });
          }
        },

        // ── uploadDocument ──────────────────────────────────────────────────
        async uploadDocument(file: UploadableFile, token?: string) {
          const tempId = generateTempId();

          set((s) => {
            s.uploadQueue[tempId] = {
              tempId,
              fileName: file.name,
              progress: 0,
              status: "uploading",
            };
          });

          const formData = new FormData();

          if (isMobileFile(file)) {
            formData.append("file", {
              uri: file.uri,
              name: file.name,
              type: file.mimeType,
            } as any);
          } else {
            formData.append("file", file);
          }

          // Mobile uses fetch (XHR causes "Stream Closed" on Android with Next.js)
          // Web uses XHR for upload progress tracking
          if (isMobileFile(file)) {
            await get()._uploadWithFetch(tempId, formData, token);
          } else {
            await get()._uploadWithXHR(tempId, formData, token);
          }
        },

        // ── _uploadWithFetch (mobile) ───────────────────────────────────────
        async _uploadWithFetch(
          tempId: string,
          formData: FormData,
          token?: string,
        ) {
          try {
            set((s) => {
              if (s.uploadQueue[tempId]) s.uploadQueue[tempId].progress = 50;
            });

            const headers: Record<string, string> = {};
            if (token) headers["Authorization"] = `Bearer ${token}`;
            // DO NOT set Content-Type — fetch sets multipart boundary automatically

            console.log("Fetch upload to:", `${API_BASE}/api/ingest`);
            console.log("Token present:", !!token);

            const res = await fetch(`${API_BASE}/api/ingest`, {
              method: "POST",
              headers,
              body: formData,
            });

            const text = await res.text();
            console.log("Upload response status:", res.status);
            console.log("Upload response body:", text);

            if (!res.ok) {
              let errMsg = "Upload failed";
              try {
                errMsg = JSON.parse(text)?.error?.message ?? errMsg;
              } catch {}
              set((s) => {
                if (s.uploadQueue[tempId]) {
                  s.uploadQueue[tempId].status = "error";
                  s.uploadQueue[tempId].error = errMsg;
                }
              });
              throw new Error(errMsg);
            }

            const json = JSON.parse(text);

            set((s) => {
              if (s.uploadQueue[tempId]) {
                s.uploadQueue[tempId].status = "processing";
                s.uploadQueue[tempId].progress = 100;
                s.uploadQueue[tempId].documentId = json.documentId;
              }
            });

            await get()._pollDocument(tempId, json.documentId, token);
          } catch (err: any) {
            console.error("Fetch upload error:", err);
            set((s) => {
              if (s.uploadQueue[tempId]) {
                s.uploadQueue[tempId].status = "error";
                s.uploadQueue[tempId].error = err?.message ?? "Upload failed";
              }
            });
            throw err;
          }
        },

        // ── _uploadWithXHR (web, with progress) ────────────────────────────
        async _uploadWithXHR(
          tempId: string,
          formData: FormData,
          token?: string,
        ) {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const pct = Math.round((event.loaded / event.total) * 100);
                set((s) => {
                  if (s.uploadQueue[tempId]) {
                    s.uploadQueue[tempId].progress = pct;
                  }
                });
              }
            };

            xhr.onload = () => {
              console.log("XHR onload — status:", xhr.status);
              console.log("XHR response:", xhr.responseText);

              if (xhr.status === 200 || xhr.status === 201) {
                const json = JSON.parse(xhr.responseText);

                set((s) => {
                  if (s.uploadQueue[tempId]) {
                    s.uploadQueue[tempId].status = "processing";
                    s.uploadQueue[tempId].progress = 100;
                    s.uploadQueue[tempId].documentId = json.documentId;
                  }
                });

                get()
                  ._pollDocument(tempId, json.documentId, token)
                  .then(resolve)
                  .catch(reject);
              } else {
                let errMsg = "Upload failed";
                try {
                  errMsg =
                    JSON.parse(xhr.responseText)?.error?.message ?? errMsg;
                } catch {}

                set((s) => {
                  if (s.uploadQueue[tempId]) {
                    s.uploadQueue[tempId].status = "error";
                    s.uploadQueue[tempId].error = errMsg;
                  }
                });
                reject(new Error(errMsg));
              }
            };

            xhr.onerror = () => {
              console.error("XHR error, status:", xhr.status);
              console.error("XHR response:", xhr.responseText);
              set((s) => {
                if (s.uploadQueue[tempId]) {
                  s.uploadQueue[tempId].status = "error";
                  s.uploadQueue[tempId].error = "Network error during upload";
                }
              });
              reject(new Error("Network error during upload"));
            };

            xhr.open("POST", `${API_BASE}/api/ingest`);
            if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            xhr.send(formData);
          });
        },

        // ── _pollDocument ───────────────────────────────────────────────────
        async _pollDocument(
          tempId: string,
          documentId: string,
          token?: string,
        ) {
          let attempts = 0;
          const maxAttempts = 60; // 2 minutes max

          while (attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, 2000));
            attempts++;

            try {
              const res = await fetch(
                `${API_BASE}/api/documents/${documentId}`,
                {
                  headers: authHeaders(token),
                },
              );
              const json = await res.json();

              if (!res.ok) continue;

              const doc: Document = json.document;

              if (doc.status === "ready" || doc.status === "partial") {
                set((s) => {
                  s.documents.unshift(doc);
                  delete s.uploadQueue[tempId];
                });
                return;
              }

              if (doc.status === "error") {
                set((s) => {
                  if (s.uploadQueue[tempId]) {
                    s.uploadQueue[tempId].status = "error";
                    s.uploadQueue[tempId].error =
                      json.document.errorMessage ?? "Processing failed";
                  }
                });
                return;
              }
              // Still "processing" — keep polling
            } catch {
              // Network blip during poll — keep trying
              continue;
            }
          }

          // Timed out
          set((s) => {
            if (s.uploadQueue[tempId]) {
              s.uploadQueue[tempId].status = "error";
              s.uploadQueue[tempId].error = "Processing timed out. Try again.";
            }
          });
        },

        // ── deleteDocument ──────────────────────────────────────────────────
        async deleteDocument(id: string, token?: string) {
          const previous = get().documents.find((d) => d.id === id);

          // Optimistic removal
          set((s) => {
            s.documents = s.documents.filter((d) => d.id !== id);
          });

          const res = await fetch(`${API_BASE}/api/documents/${id}`, {
            method: "DELETE",
            headers: authHeaders(token),
          });

          if (!res.ok && previous) {
            // Rollback
            set((s) => {
              s.documents.push(previous);
              s.documents.sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
              );
            });

            const json = await res.json();
            set((s) => {
              s.error = Err.fromJSON(json.error);
            });
          }
        },

        // ── getDocumentById ─────────────────────────────────────────────────
        getDocumentById(id: string) {
          return get().documents.find((d) => d.id === id);
        },

        clearError() {
          set((s) => {
            s.error = null;
          });
        },

        _reset() {
          set(() => initialState);
        },
      };
    }),
    { name: "DocumentStore" },
  ),
);

// ─── SELECTORS ────────────────────────────────────────────────────────────────

export const selectDocuments = (s: DocumentStore) => s.documents;
export const selectUploadQueue = (s: DocumentStore) => s.uploadQueue;
export const selectUploadItem = (tempId: string) => (s: DocumentStore) =>
  s.uploadQueue[tempId];
