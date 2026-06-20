// FILE: /apps/mobile/app/(app)/documents/_layout.tsx

import { Stack } from "expo-router";
import { Platform } from "react-native";

export default function DocumentsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="upload"
        options={{
          presentation: Platform.OS === "ios" ? "modal" : "card",
          animation: "slide_from_bottom",
          contentStyle: { backgroundColor: "#0F172A" },
        }}
      />
    </Stack>
  );
}
