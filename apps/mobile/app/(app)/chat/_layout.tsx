// FILE: /apps/mobile/app/(app)/chat/_layout.tsx

import { Stack } from "expo-router";

export default function ChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[documentId]"
        options={{
          animation: "slide_from_right",
          contentStyle: { backgroundColor: "#0F172A" },
        }}
      />
    </Stack>
  );
}
