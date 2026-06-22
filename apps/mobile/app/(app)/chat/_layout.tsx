import React from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

// TYPES

interface DocumentIdParams {
  documentId?: string | string[];
}

// HELPERS

function resolveDocumentId(params: DocumentIdParams): string {
  if (typeof params.documentId === "string") return params.documentId;
  if (Array.isArray(params.documentId) && params.documentId.length > 0) {
    return params.documentId[0] ?? "chat";
  }
  return "chat";
}

// LAYOUT─

export default function ChatLayout(): React.JSX.Element {
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
          getId={({ params }) => resolveDocumentId(params as DocumentIdParams)}
        />
      </Stack>
    </>
  );
}
