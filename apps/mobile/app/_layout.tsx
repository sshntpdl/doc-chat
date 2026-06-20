// FILE: /apps/mobile/app/_layout.tsx
//
// Root layout for the entire mobile app.
// Responsibilities:
//   1. Initialize Supabase Auth session (via useAuthStore.initialize)
//   2. Handle deep links for magic link email verification
//   3. Show a loading screen until auth is determined
//   4. Redirect to (auth) or (app) tabs based on session state
//   5. Show persistent offline banner via NetInfo
//
// WHY NOT EXPO AUTH SESSION:
// We use Supabase's own auth with deep link handling instead of
// expo-auth-session because Supabase's magic link flow generates its
// own callback URL that needs to be intercepted and processed.

import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Text, ActivityIndicator } from "react-native";
import * as Linking from "expo-linking";
import NetInfo from "@react-native-community/netinfo";
import { createBrowserClient } from "@docchat/supabase";
import { useAuthStore } from "@docchat/stores";
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

export default function RootLayout() {
  const { initialize, isInitialized, user, session } = useAuthStore();
  const segments = useSegments();

  // ── Bootstrap auth on app start ──────────────────────────────────────────
  useEffect(() => {
    initialize(supabase);
  }, []); // eslint-disable-line

  // ── Route guard: redirect based on auth state ─────────────────────────────
  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inAppGroup = segments[0] === "(app)";

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/(app)/documents" as any);
    }
  }, [isInitialized, user, segments]);

  // ── Deep link handler (magic link / email confirmation) ───────────────────
  useEffect(() => {
    // Handle the initial URL if app was opened via a magic link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url, supabase);
    });

    // Handle deep links while app is already running
    const sub = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url, supabase);
    });

    return () => sub.remove();
  }, []);

  // ── Show loading screen until auth check completes ────────────────────────
  if (!isInitialized) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0F172A",
        }}
      >
        <Text
          style={{
            color: "#6366F1",
            fontSize: 24,
            fontWeight: "700",
            marginBottom: 24,
          }}
        >
          DocChat
        </Text>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── OFFLINE BANNER ──────────────────────────────────────────────────────────
// Persistent warning strip shown at top when network is unreachable.
function useOfflineState() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  return isConnected;
}

function OfflineBanner() {
  const isConnected = useOfflineState();

  if (isConnected !== false) return null;

  return (
    <View
      style={{
        backgroundColor: "#DC2626",
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: "center",
      }}
      accessibilityRole="alert"
      accessibilityLabel="No internet connection"
    >
      <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>
        📡 You're offline — reconnect to use DocChat
      </Text>
    </View>
  );
}

// ─── MAGIC LINK HANDLER ───────────────────────────────────────────────────────
// Supabase magic links arrive as docchat://auth/callback#access_token=...
// We extract the token from the URL fragment and call setSession.

async function handleDeepLink(
  url: string,
  supabase: ReturnType<typeof createBrowserClient>,
) {
  try {
    // Parse fragment params (Supabase puts tokens in the URL hash)
    const parsed = Linking.parse(url);
    const fragment = url.split("#")[1] ?? "";
    const params = Object.fromEntries(new URLSearchParams(fragment));

    if (params.access_token && params.refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });

      if (!error && data.session) {
        useAuthStore.getState().setSession(data.session);
        router.replace("/(app)/documents" as any);
      }
    }
  } catch {
    // Malformed deep link — ignore silently
  }
}
