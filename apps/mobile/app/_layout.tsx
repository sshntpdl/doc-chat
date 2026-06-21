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

setApiBase(process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000");

export default function RootLayout() {
  const { initialize, isInitialized, user } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    initialize(supabase);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/(app)/chat" as any);
    }
  }, [isInitialized, user, segments]);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url, supabase);
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url, supabase);
    });

    return () => sub.remove();
  }, []);

  if (!isInitialized) {
    return (
      // ← Same dark background on the loading screen so there's
      //   no color jump when the app transitions to the main stack.
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0F172A",
        }}
      >
        {/* StatusBar must be dark even on the loading screen */}
        <StatusBar
          style="light"
          backgroundColor="#0F172A"
          translucent={false}
        />
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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0F172A" }}>
      <SafeAreaProvider>
        {/*
          KEY FIXES:
          1. style="light"      — tells iOS the bg is dark → uses dark chrome,
                                  no white flash assumption during transitions.
          2. backgroundColor    — Android: sets the actual status bar bg color.
          3. translucent=false  — prevents Android from drawing status bar
                                  over your content with a semi-transparent
                                  scrim that can appear white during animation.
        */}
        <StatusBar
          style="light"
          backgroundColor="#0F172A"
          translucent={false}
        />
        <OfflineBanner />
        <Stack
          screenOptions={{
            headerShown: false,
            // This is the fix for the root Stack — every screen
            // that doesn't set its own contentStyle inherits this,
            // so the native card scaffold is never white.
            contentStyle: { backgroundColor: "#0F172A" },
          }}
        />
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
        router.replace("/(app)/chat" as any);
      }
    }
  } catch {
    // Malformed deep link — ignore
  }
}
