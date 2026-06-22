import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function AppLayout(): React.JSX.Element {
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
