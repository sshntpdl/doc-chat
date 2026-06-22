import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { User, Session, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@docchat/supabase";
import { AppError, ErrorCode } from "@docchat/types";

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
}

interface AuthActions {
  initialize(client?: SupabaseClient): Promise<void>;
  signInWithEmail(
    email: string,
    password: string,
    client?: SupabaseClient,
  ): Promise<AppError | null>;
  signUpWithEmail(
    email: string,
    password: string,
    client?: SupabaseClient,
  ): Promise<AppError | null>;
  signInWithMagicLink(
    email: string,
    client?: SupabaseClient,
  ): Promise<AppError | null>;
  signOut(client?: SupabaseClient): Promise<void>;
  setSession(session: Session | null): void;
  getAccessToken(client?: SupabaseClient): Promise<string | null>;
}

type AuthStore = AuthState & AuthActions;

const storeResetFns = new Set<() => void>();
export function registerStoreReset(fn: () => void) {
  storeResetFns.add(fn);
}
export function clearAllStores() {
  storeResetFns.forEach((fn) => fn());
}

declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    NEXT_PUBLIC_APP_URL?: string;
    [key: string]: string | undefined;
  };
};

export const useAuthStore = create<AuthStore>()(
  devtools(
    immer((set, get) => ({
      user: null,
      session: null,
      isLoading: false,
      isInitialized: false,

      async initialize(client) {
        try {
          const supabase = client ?? createBrowserClient();

          // Attach listener FIRST so we don't miss events during async getSession
          supabase.auth.onAuthStateChange((event, session) => {
            get().setSession(session);
            if (event === "INITIAL_SESSION") {
              set((s) => {
                s.isInitialized = true;
              });
            }
          });

          // INITIAL_SESSION fires synchronously above with the current session.
          const {
            data: { session },
          } = await supabase.auth.getSession();
          set((s) => {
            if (!s.isInitialized) {
              s.session = session;
              s.user = session?.user ?? null;
              s.isInitialized = true;
            }
          });
        } catch {
          set((s) => {
            s.isInitialized = true;
          });
        }
      },

      setSession(session) {
        set((s) => {
          s.session = session;
          s.user = session?.user ?? null;
        });
      },

      async getAccessToken(client) {
        try {
          const supabase = client ?? createBrowserClient();
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();
          if (error || !session) {
            set((s) => {
              s.session = null;
              s.user = null;
            });
            return null;
          }
          set((s) => {
            s.session = session;
            s.user = session.user;
          });
          return session.access_token;
        } catch {
          return null;
        }
      },

      async signInWithEmail(email, password, client) {
        set((s) => {
          s.isLoading = true;
        });
        try {
          const supabase = client ?? createBrowserClient();

          // Step 1: authenticate with Supabase — get tokens in response body
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            return new AppError(
              ErrorCode.UNAUTHORIZED,
              error.message,
              401,
              false,
            );
          }

          if (!data.session) {
            return new AppError(
              ErrorCode.UNAUTHORIZED,
              "No session returned",
              401,
              false,
            );
          }

          // Step 2: POST tokens to our server route so @supabase/ssr writes
          // the cookies in its own chunked format..
          const res = await fetch("/api/auth/set-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at,
              expires_in: data.session.expires_in,
              user: data.user,
            }),
          });

          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            return new AppError(
              ErrorCode.UNAUTHORIZED,
              body.error ?? "Failed to establish session",
              401,
              false,
            );
          }

          // Step 3: update the store directly (no onAuthStateChange needed —
          // the session is now in cookies AND in the store)
          set((s) => {
            s.session = data.session;
            s.user = data.session!.user;
          });

          return null;
        } finally {
          set((s) => {
            s.isLoading = false;
          });
        }
      },

      async signUpWithEmail(email, password, client) {
        set((s) => {
          s.isLoading = true;
        });
        try {
          const supabase = client ?? createBrowserClient();
          const redirectTo = `${
            process.env.EXPO_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL
          }/auth/callback`;
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: redirectTo },
          });
          if (error)
            return new AppError(
              ErrorCode.UNAUTHORIZED,
              error.message,
              400,
              false,
            );
          return null;
        } finally {
          set((s) => {
            s.isLoading = false;
          });
        }
      },

      async signInWithMagicLink(email, client) {
        set((s) => {
          s.isLoading = true;
        });
        try {
          const supabase = client ?? createBrowserClient();
          const redirectTo = `${
            process.env.EXPO_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL
          }/auth/callback`;
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: redirectTo },
          });
          if (error)
            return new AppError(
              ErrorCode.UNAUTHORIZED,
              error.message,
              400,
              false,
            );
          return null;
        } finally {
          set((s) => {
            s.isLoading = false;
          });
        }
      },

      async signOut(client) {
        try {
          const supabase = client ?? createBrowserClient();
          await supabase.auth.signOut();
          // Also clear server-side cookies
          await fetch("/api/auth/set-session", { method: "DELETE" }).catch(
            () => {},
          );
        } finally {
          clearAllStores();
          set((s) => {
            s.user = null;
            s.session = null;
          });
        }
      },
    })),
    { name: "AuthStore" },
  ),
);
