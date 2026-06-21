// FILE: /apps/mobile/app/_layout.tsx

import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Text, ActivityIndicator } from "react-native";
import * as Linking from "expo-linking";
import NetInfo from "@react-native-community/netinfo";
import { createBrowserClient } from "@docchat/supabase";
import { useAuthStore, setApiBase } from "@docchat/stores";
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

// ─── Set API base at module evaluation time ───────────────────────────────────
//
// This runs before ANY component mounts or useEffect fires.
// If this were inside useEffect, fetchDocuments() could fire first with the
// wrong URL (localhost:3000), causing Network request failed on real devices.
//
// EXPO_PUBLIC_API_URL must be set in your .env file and matches your dev
// machine's LAN IP (e.g. http://192.168.1.65:3000) or production domain.
setApiBase(process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000");

export default function RootLayout() {
  const { initialize, isInitialized, user } = useAuthStore();
  const segments = useSegments();

  // ── Bootstrap Supabase auth on app start ──────────────────────────────────
  // initialize() restores the persisted AsyncStorage session (if any) and
  // subscribes to auth state changes. Must run once before route guards.
  useEffect(() => {
    initialize(supabase);
  }, []); // eslint-disable-line

  // ── Route guard ───────────────────────────────────────────────────────────
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
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url, supabase);
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url, supabase);
    });

    return () => sub.remove();
  }, []);

  // ── Loading screen ────────────────────────────────────────────────────────
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

// ─── OFFLINE BANNER ───────────────────────────────────────────────────────────

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

async function handleDeepLink(
  url: string,
  supabase: ReturnType<typeof createBrowserClient>,
) {
  try {
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
    // Malformed deep link — ignore
  }
}
