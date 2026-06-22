"use client";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@docchat/stores";

export function StoreInitializer() {
  const initialize = useAuthStore((s) => s.initialize);
  // useRef prevents double-initialization in React StrictMode
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initialize();
    }
  }, [initialize]);

  // Renders nothing — pure side effect component
  return null;
}
