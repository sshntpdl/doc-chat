import React from "react";
import { Redirect } from "expo-router";
import { useAuthStore } from "@docchat/stores";

// This file handles the root "/" route that Expo Router always
// tries to render on app launch/resume. Without it, the app hits
// +not-found every time it starts fresh.

export default function Index(): React.JSX.Element | null {
  const { user, isInitialized } = useAuthStore();

  if (!isInitialized) return null;

  if (user != null) {
    return <Redirect href="/(app)/chat" />;
  }

  return <Redirect href="/(auth)/login" />;
}
