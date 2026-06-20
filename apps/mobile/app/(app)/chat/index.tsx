// FILE: /apps/mobile/app/(app)/chat/index.tsx

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuthStore } from "@docchat/stores";

export default function ChatIndexScreen() {
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Chat</Text>
        <TouchableOpacity
          onPress={() => signOut()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Sign out"
        >
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={s.content}>
        <Text style={s.emoji}>💬</Text>
        <Text style={s.title}>No document selected</Text>
        <Text style={s.sub}>
          Go to your Library and tap a document to start chatting.
        </Text>
        <TouchableOpacity
          style={s.btn}
          onPress={() => router.navigate("/(app)/documents/" as any)}
          accessibilityLabel="Go to document library"
        >
          <Text style={s.btnText}>Open Library</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  headerTitle: { color: "#F1F5F9", fontSize: 20, fontWeight: "700" },
  signOutText: { color: "#94A3B8", fontSize: 13 },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: {
    color: "#F1F5F9",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  sub: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  btnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
