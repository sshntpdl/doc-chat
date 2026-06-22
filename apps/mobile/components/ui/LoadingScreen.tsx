import React, { memo } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import type { AccessibilityRole } from "react-native";

interface LoadingScreenProps {
  readonly message?: string;
  readonly showLogo?: boolean;
}

const HEADER_ROLE: AccessibilityRole = "header";
const DEFAULT_SHOW_LOGO = true;

function LoadingScreenComponent({
  message,
  showLogo = DEFAULT_SHOW_LOGO,
}: LoadingScreenProps): React.JSX.Element {
  return (
    <View style={s.container}>
      {showLogo ? (
        <Text style={s.logo} accessibilityRole={HEADER_ROLE}>
          DocChat
        </Text>
      ) : null}

      <ActivityIndicator
        size="large"
        color="#6366F1"
        accessibilityLabel={message ?? "Loading"}
      />

      {message != null ? <Text style={s.message}>{message}</Text> : null}
    </View>
  );
}

export const LoadingScreen = memo(LoadingScreenComponent);

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
