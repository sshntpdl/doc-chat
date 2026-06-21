// FILE: /packages/stores/src/index.ts

export { useAuthStore, clearAllStores, registerStoreReset } from "./authStore";
export {
  useDocumentStore,
  selectDocuments,
  selectUploadQueue,
  selectUploadItem,
} from "./documentStore";
export {
  useChatStore,
  useCurrentMessages,
  selectIsStreaming,
  selectSessions,
  useSessionList,
  selectStreamingMessageId,
} from "./chatStore";
export { useUIStore, useToast } from "./uiStore";
export type { Toast, Theme } from "./uiStore";

// FIX #12 — export the ONE shared setApiBase / getApiBase.
// Previously chatStore and documentStore each exported their own copy.
// Calling setApiBase from chatStore would NOT update documentStore's
// internal _apiBase, and vice versa. Now there is only one variable.
export { setApiBase, getApiBase } from "./apiBase";
