import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Document, UploadItem, AppError, ErrorCode } from "@docchat/types";
import { AppError as Err } from "@docchat/types";
import { registerStoreReset } from "./authStore";
import { getApiBase } from "./apiBase";

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
  /**
   * cancelUpload — aborts an in-flight upload XHR and removes the item
   * from the queue immediately..
   */
  cancelUpload(tempId: string): void;
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

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── XHR ABORT REGISTRY ───────────────────────────────────────────────────────
const xhrRegistry = new Map<string, XMLHttpRequest>();

// ─── POLL CANCELLATION ────────────────────────────────────────────────────────
const cancelledUploads = new Set<string>();

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
          if (!token) {
            set((s) => {
              s.isLoading = false;
              s.documents = [];
            });
            return;
          }

          set((s) => {
            s.isLoading = true;
            s.error = null;
          });

          try {
            const url = `${getApiBase()}/api/documents`;
            console.log("[DocumentStore] fetchDocuments →", url);

            const res = await fetch(url, {
              headers: authHeaders(token),
            });
            const json = await res.json();

            if (!res.ok) throw Err.fromJSON(json.error);

            set((s) => {
              s.documents = json.documents;
              s.isLoading = false;
            });
          } catch (err) {
            console.error("[DocumentStore] fetchDocuments error:", err);
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

          if (isMobileFile(file)) {
            await get()._uploadWithFetch(tempId, file as any, token);
          } else {
            const formData = new FormData();
            formData.append("file", file);
            await get()._uploadWithXHR(tempId, formData, token);
          }
        },

        // ── cancelUpload ────────────────────────────────────────────────────
        cancelUpload(tempId: string) {
          // 1. Abort the XHR if it is still in flight
          const xhr = xhrRegistry.get(tempId);
          if (xhr) {
            xhr.abort();
            xhrRegistry.delete(tempId);
          }

          // 2. Mark as cancelled so the polling loop exits cleanly
          cancelledUploads.add(tempId);

          // 3. Remove from queue immediately — no error state needed
          set((s) => {
            delete s.uploadQueue[tempId];
          });
        },

        // ── _uploadWithFetch (mobile — uses XHR under the hood) ────────────
        async _uploadWithFetch(tempId: string, file: any, token?: string) {
          return new Promise<void>((resolve, reject) => {
            const url = `${getApiBase()}/api/ingest`;
            const xhr = new XMLHttpRequest();

            // Register so cancelUpload() can abort this XHR
            xhrRegistry.set(tempId, xhr);

            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const pct = Math.round((event.loaded / event.total) * 90);
                set((s) => {
                  if (s.uploadQueue[tempId]) {
                    s.uploadQueue[tempId].progress = pct;
                  }
                });
              }
            };

            xhr.onload = () => {
              xhrRegistry.delete(tempId);

              // If the user cancelled during the XHR, the queue item is
              // already gone — just resolve and do nothing.
              if (cancelledUploads.has(tempId)) {
                cancelledUploads.delete(tempId);
                resolve();
                return;
              }

              if (xhr.status === 200 || xhr.status === 201) {
                let json: any;
                try {
                  json = JSON.parse(xhr.responseText);
                } catch {
                  set((s) => {
                    if (s.uploadQueue[tempId]) {
                      s.uploadQueue[tempId].status = "error";
                      s.uploadQueue[tempId].error = "Invalid server response";
                    }
                  });
                  reject(new Error("Invalid server response"));
                  return;
                }

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
              xhrRegistry.delete(tempId);
              if (cancelledUploads.has(tempId)) {
                cancelledUploads.delete(tempId);
                resolve();
                return;
              }
              set((s) => {
                if (s.uploadQueue[tempId]) {
                  s.uploadQueue[tempId].status = "error";
                  s.uploadQueue[tempId].error = "Network error during upload";
                }
              });
              reject(new Error("Network error during upload"));
            };

            xhr.onabort = () => {
              xhrRegistry.delete(tempId);
              resolve();
            };

            xhr.ontimeout = () => {
              xhrRegistry.delete(tempId);
              set((s) => {
                if (s.uploadQueue[tempId]) {
                  s.uploadQueue[tempId].status = "error";
                  s.uploadQueue[tempId].error = "Upload timed out";
                }
              });
              reject(new Error("Upload timed out"));
            };

            xhr.open("POST", url);
            xhr.timeout = 120_000;

            if (token) {
              xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            }

            const formData = new FormData();
            formData.append("file", {
              uri: file.uri,
              name: file.name,
              type: file.mimeType,
            } as any);

            xhr.send(formData);
          });
        },

        // ── _uploadWithXHR (web, with progress) ────────────────────────────
        async _uploadWithXHR(
          tempId: string,
          formData: FormData,
          token?: string,
        ) {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // Register so cancelUpload() can abort this XHR
            xhrRegistry.set(tempId, xhr);

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
              xhrRegistry.delete(tempId);

              if (cancelledUploads.has(tempId)) {
                cancelledUploads.delete(tempId);
                resolve();
                return;
              }

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
              xhrRegistry.delete(tempId);
              if (cancelledUploads.has(tempId)) {
                cancelledUploads.delete(tempId);
                resolve();
                return;
              }
              set((s) => {
                if (s.uploadQueue[tempId]) {
                  s.uploadQueue[tempId].status = "error";
                  s.uploadQueue[tempId].error = "Network error during upload";
                }
              });
              reject(new Error("Network error during upload"));
            };

            xhr.onabort = () => {
              xhrRegistry.delete(tempId);
              resolve();
            };

            xhr.open("POST", `${getApiBase()}/api/ingest`);
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

            // User cancelled during processing phase — exit immediately
            if (cancelledUploads.has(tempId)) {
              cancelledUploads.delete(tempId);
              return;
            }

            try {
              const res = await fetch(
                `${getApiBase()}/api/documents/${documentId}`,
                {
                  headers: authHeaders(token),
                },
              );
              const json = await res.json();

              if (!res.ok) continue;

              // Check again after the await
              if (cancelledUploads.has(tempId)) {
                cancelledUploads.delete(tempId);
                return;
              }

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
            } catch {
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

          set((s) => {
            s.documents = s.documents.filter((d) => d.id !== id);
          });

          const res = await fetch(`${getApiBase()}/api/documents/${id}`, {
            method: "DELETE",
            headers: authHeaders(token),
          });

          if (!res.ok && previous) {
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
