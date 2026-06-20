// FILE: apps/mobile/components/ui/LoadingScreen.tsx
//
// Full-screen loading overlay used during:
//   - Auth initialization (waiting for getSession())
//   - Navigating between heavy screens
//   - Any async operation that blocks the whole screen
//
// Shows the DocChat logo above the spinner so users know
// which app they're in even during a blank/loading state.

import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

interface LoadingScreenProps {
  /** Optional message shown below the spinner */
  message?: string;
  /** Show the DocChat logo above spinner (default true) */
  showLogo?: boolean;
}

export function LoadingScreen({
  message,
  showLogo = true,
}: LoadingScreenProps) {
  return (
    <View style={s.container}>
      {showLogo && (
        <Text style={s.logo} accessibilityRole="header">
          DocChat
        </Text>
      )}

      <ActivityIndicator
        size="large"
        color="#6366F1"
        accessibilityLabel={message ?? "Loading"}
      />

      {message ? <Text style={s.message}>{message}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  logo: {
    color: "#6366F1",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  message: {
    color: "#64748B",
    fontSize: 14,
  },
});
