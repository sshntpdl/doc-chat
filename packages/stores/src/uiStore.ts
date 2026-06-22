// Manages pure UI state: theme, toasts, sidebar collapse, modals.
import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface Toast {
  id: string;
  variant: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
  duration: number;
  action?: { label: string; onClick: () => void };
}

export type Theme = "light" | "dark" | "system";

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  toasts: Toast[];
  commandPaletteOpen: boolean;
  uploadModalOpen: boolean;
}

interface ToastOptions {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface UIActions {
  setTheme(theme: Theme): void;
  toggleSidebar(): void;
  setSidebarCollapsed(v: boolean): void;

  // Individual toast convenience methods
  addToast(toast: Omit<Toast, "id">): string;
  dismissToast(id: string): void;
  dismissAllToasts(): void;

  // Convenience wrappers — these are what components call
  toast: {
    success(title: string, options?: ToastOptions): string;
    error(title: string, options?: ToastOptions): string;
    warning(title: string, options?: ToastOptions): string;
    info(title: string, options?: ToastOptions): string;
  };

  openCommandPalette(): void;
  closeCommandPalette(): void;
  openUploadModal(): void;
  closeUploadModal(): void;
}

type UIStore = UIState & UIActions;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function generateToastId() {
  return `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Applies the theme class to <html> for Tailwind dark: prefix to work */
function applyThemeToDOM(theme: Theme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  root.classList.toggle("dark", isDark);
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      immer((set, get) => ({
        // ── initial state ──────────────────────────────────────────────────
        theme: "system",
        sidebarCollapsed: false,
        toasts: [],
        commandPaletteOpen: false,
        uploadModalOpen: false,

        // ── theme ─────────────────────────────────────────────────────────
        setTheme(theme: Theme) {
          set((s) => {
            s.theme = theme;
          });
          applyThemeToDOM(theme);
        },

        // ── sidebar ───────────────────────────────────────────────────────
        toggleSidebar() {
          set((s) => {
            s.sidebarCollapsed = !s.sidebarCollapsed;
          });
        },
        setSidebarCollapsed(v: boolean) {
          set((s) => {
            s.sidebarCollapsed = v;
          });
        },

        // ── toasts ────────────────────────────────────────────────────────
        addToast(toast: Omit<Toast, "id">) {
          const id = generateToastId();
          set((s) => {
            // Keep at most 3 toasts visible at once — oldest evicted first
            if (s.toasts.length >= 3) {
              s.toasts.shift();
            }
            s.toasts.push({ ...toast, id });
          });
          return id;
        },

        dismissToast(id: string) {
          set((s) => {
            s.toasts = s.toasts.filter((t) => t.id !== id);
          });
        },

        dismissAllToasts() {
          set((s) => {
            s.toasts = [];
          });
        },

        // ── toast convenience API ──────────────────────────────────────────
        toast: {
          success(title: string, options?: ToastOptions) {
            return get().addToast({
              variant: "success",
              title,
              duration: options?.duration ?? 4000,
              description: options?.description,
              action: options?.action,
            });
          },
          error(title: string, options?: ToastOptions) {
            return get().addToast({
              variant: "error",
              title,
              duration: options?.duration ?? 6000, // errors linger longer
              description: options?.description,
              action: options?.action,
            });
          },
          warning(title: string, options?: ToastOptions) {
            return get().addToast({
              variant: "warning",
              title,
              duration: options?.duration ?? 5000,
              description: options?.description,
              action: options?.action,
            });
          },
          info(title: string, options?: ToastOptions) {
            return get().addToast({
              variant: "info",
              title,
              duration: options?.duration ?? 4000,
              description: options?.description,
              action: options?.action,
            });
          },
        },

        // ── modals / overlays ─────────────────────────────────────────────
        openCommandPalette() {
          set((s) => {
            s.commandPaletteOpen = true;
          });
        },
        closeCommandPalette() {
          set((s) => {
            s.commandPaletteOpen = false;
          });
        },
        openUploadModal() {
          set((s) => {
            s.uploadModalOpen = true;
          });
        },
        closeUploadModal() {
          set((s) => {
            s.uploadModalOpen = false;
          });
        },
      })),
      {
        name: "docchat-ui",
        // Only persist theme and sidebar state — toasts and modals reset on refresh
        partialize: (s) => ({
          theme: s.theme,
          sidebarCollapsed: s.sidebarCollapsed,
        }),
        onRehydrateStorage: () => (state) => {
          if (state) applyThemeToDOM(state.theme);
        },
      },
    ),
    { name: "UIStore" },
  ),
);

// ─── HOOK: useToast ───────────────────────────────────────────────────────────

export function useToast() {
  return useUIStore((s) => s.toast);
}
