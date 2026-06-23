import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import {
  usePathname,
  useGlobalSearchParams,
  router,
  useSegments,
} from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function NotFoundScreen(): React.JSX.Element {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.inner}>
        {/* Icon */}
        <Text style={s.icon}>🗺️</Text>

        <Text style={s.title}>Route Not Found</Text>

        <Text style={s.subtitle}>
          The app tried to navigate to a page that doesn't exist.
        </Text>

        {/* Debug info — shows exactly what went wrong */}
        <View style={s.debugBox}>
          <Text style={s.debugTitle}>🔍 Debug Info</Text>

          <Text style={s.debugLabel}>Attempted path:</Text>
          <Text style={s.debugValue}>{pathname || "(empty)"}</Text>

          <Text style={s.debugLabel}>Route segments:</Text>
          <Text style={s.debugValue}>
            {segments.length > 0 ? JSON.stringify(segments) : "(none)"}
          </Text>

          <Text style={s.debugLabel}>Query params:</Text>
          <Text style={s.debugValue}>
            {Object.keys(params).length > 0
              ? JSON.stringify(params, null, 2)
              : "(none)"}
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={s.primaryBtnText}>Go to Login</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={() => router.replace("/(app)/chat")}
        >
          <Text style={s.secondaryBtnText}>Go to Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(auth)/login");
          }}
        >
          <Text style={s.secondaryBtnText}>← Go Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  inner: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  icon: {
    fontSize: 64,
    marginBottom: 8,
  },
  title: {
    color: "#F1F5F9",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  debugBox: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#334155",
    gap: 4,
    marginBottom: 8,
  },
  debugTitle: {
    color: "#818CF8",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  debugLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  debugValue: {
    color: "#F1F5F9",
    fontSize: 13,
    fontFamily: "monospace",
    backgroundColor: "#0F172A",
    padding: 8,
    borderRadius: 6,
    marginTop: 2,
  },
  primaryBtn: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    width: "100%",
    minHeight: 52,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    width: "100%",
    minHeight: 52,
  },
  secondaryBtnText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },
});
