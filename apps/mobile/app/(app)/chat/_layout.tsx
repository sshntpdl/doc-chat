// FILE: /apps/mobile/app/(app)/chat/_layout.tsx

import { Stack } from "expo-router";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";

export default function ChatLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#0F172A" translucent={false} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0F172A" },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            contentStyle: { backgroundColor: "#0F172A" },
          }}
        />
        <Stack.Screen
          name="upload"
          options={{
            presentation: Platform.OS === "ios" ? "modal" : "card",
            animation: "slide_from_bottom",
            contentStyle: { backgroundColor: "#0F172A" },
          }}
        />
        <Stack.Screen
          name="[documentId]"
          options={{
            animation: "slide_from_right",
            contentStyle: { backgroundColor: "#0F172A" },
          }}
          // getId makes expo-router treat each unique documentId as a
          // completely separate screen instance in the stack.
          // Without this, pushing /chat/docA then /chat/docB then back
          // to /chat/docA reuses the cached docA component — same useRef,
          // same stale sessionId. With getId, each documentId gets its
          // own entry in the stack history and its own fresh component.
          getId={({ params }) =>
            typeof params?.documentId === "string"
              ? params.documentId
              : Array.isArray(params?.documentId)
                ? params.documentId[0]
                : "chat"
          }
        />
      </Stack>
    </>
  );
}
