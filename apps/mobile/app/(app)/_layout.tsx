// FILE: /apps/mobile/app/(app)/_layout.tsx
//
// Wraps everything under (app)/ — currently the `chat` route group, and
// (until deleted) the legacy `documents` route group. Each of those folders
// owns its own nested Stack via its own _layout.tsx (see chat/_layout.tsx),
// so this parent layout must NOT redeclare any of their internal screens
// (index/upload/[documentId]) — doing so creates a second, conflicting
// registration for the same route, which is what caused the blank screen
// after login.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function AppLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#0F172A" translucent={false} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0F172A" },
        }}
      />
    </>
  );
}
