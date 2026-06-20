// FILE: /apps/mobile/app/(auth)/_layout.tsx
// Auth group stack — login and verify screens.
// The root layout already handles redirecting authed users to (app).

import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown:    false,
        animation:      "fade",
        contentStyle:   { backgroundColor: "#0F172A" },
      }}
    />
  );
}
