import React, { useEffect } from "react";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import * as Linking from "expo-linking";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { type Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@docchat/supabase";
import { useAuthStore, setApiBase } from "@docchat/stores";
import { useState } from "react";
import { supabase } from "../supabase";

setApiBase(
  process.env.EXPO_PUBLIC_API_URL ?? "https://doc-chat-web-zo8m.vercel.app",
);

// ─── ROOT LAYOUT ──────────────────────────────────────────────────────────────

export default function RootLayout(): React.JSX.Element {
  const { initialize, isInitialized, user } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    initialize(supabase);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (user == null && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user != null && inAuthGroup) {
      router.replace("/(app)/chat");
    }
  }, [isInitialized, user, segments]);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url != null) {
        void handleDeepLink(url, supabase);
      }
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      void handleDeepLink(url, supabase);
    });

    return () => sub.remove();
  }, []);

  if (!isInitialized) {
    return (
      <View style={s.loadingContainer}>
        <StatusBar
          style="light"
          backgroundColor="#0F172A"
          translucent={false}
        />
        <Text style={s.loadingLogo}>DocChat</Text>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={s.root}>
      <SafeAreaProvider>
        <StatusBar
          style="light"
          backgroundColor="#0F172A"
          translucent={false}
        />
        <OfflineBanner />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0F172A" },
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── OFFLINE BANNER ───────────────────────────────────────────────────────────

function useOfflineState(): boolean | null {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  return isConnected;
}

function OfflineBanner(): React.JSX.Element | null {
  const isConnected = useOfflineState();

  if (isConnected !== false) return null;

  return (
    <View
      style={s.offlineBanner}
      accessibilityRole="alert"
      accessibilityLabel="No internet connection"
    >
      <Text style={s.offlineText}>
        📡 You're offline — reconnect to use DocChat
      </Text>
    </View>
  );
}

// ─── MAGIC LINK HANDLER ───────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createBrowserClient>;

interface DeepLinkParams {
  access_token?: string;
  refresh_token?: string;
}

async function handleDeepLink(
  url: string,
  client: SupabaseClient,
): Promise<void> {
  try {
    const fragment = url.split("#")[1] ?? "";
    const params = Object.fromEntries(
      new URLSearchParams(fragment),
    ) as DeepLinkParams;

    if (params.access_token != null && params.refresh_token != null) {
      const { data, error } = await client.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });

      if (error == null && data.session != null) {
        useAuthStore.getState().setSession(data.session as Session);
        router.replace("/(app)/chat");
      }
    }
  } catch {
    // Malformed deep link — ignore
  }
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
  },
  loadingLogo: {
    color: "#6366F1",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
  },
  offlineBanner: {
    backgroundColor: "#DC2626",
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  offlineText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
