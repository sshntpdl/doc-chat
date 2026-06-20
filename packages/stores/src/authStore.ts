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
