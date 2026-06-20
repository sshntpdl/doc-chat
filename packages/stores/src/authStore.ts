// FILE: /packages/stores/src/authStore.ts

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
  /**
   * Returns a guaranteed-fresh access token, or null if there's no valid
   * session (refresh token missing/expired too — caller should treat this
   * as "signed out" and route to login).
   *
   * WHY THIS EXISTS:
   * Don't read `session.access_token` directly off the store for outgoing
   * requests (chat, upload, etc). That value is only as fresh as the last
   * onAuthStateChange event, which depends on the background auto-refresh
   * timer — and on React Native that timer pauses/throttles while the app
   * is backgrounded. A user who leaves the app idle past the token's TTL
   * and then sends a message will silently fire a request with an expired
   * token, which the server correctly rejects with 401, surfacing as a
   * confusing "nothing happens" failure.
   *
   * supabase.auth.getSession() does an inline expiry check on every call:
   * if the access token is expired or near expiry, it transparently uses
   * the refresh token to mint a new one before returning — independent of
   * whether the background timer ever fired. Calling this immediately
   * before building a request header closes that gap.
   */
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
          const {
            data: { session },
          } = await supabase.auth.getSession();

          set((s) => {
            s.session = session;
            s.user = session?.user ?? null;
            s.isInitialized = true;
          });

          supabase.auth.onAuthStateChange((_event, session) => {
            get().setSession(session);
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
            // Refresh token is gone or invalid too — genuinely signed out.
            set((s) => {
              s.session = null;
              s.user = null;
            });
            return null;
          }

          // getSession() may have silently refreshed — keep the store
          // (and therefore every other screen reading `session`) in sync.
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
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error)
            return new AppError(
              ErrorCode.UNAUTHORIZED,
              error.message,
              401,
              false,
            );
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
