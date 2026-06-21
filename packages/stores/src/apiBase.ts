// FILE: /packages/stores/src/apiBase.ts
//
// Single source of truth for the API base URL used by ALL stores.
//
// WHY THIS MODULE EXISTS — FIX #12 (split _apiBase bug):
//   documentStore.ts and chatStore.ts each had their OWN module-level
//   `_apiBase` variable and their OWN exported `setApiBase()`. This meant:
//
//     import { setApiBase } from "@docchat/stores";          // re-exports chatStore's
//     setApiBase("http://192.168.1.65:3000");                // ← only updated chatStore
//     // documentStore._apiBase is still "http://localhost:3000" !!
//
//   On a physical device, localhost:3000 doesn't resolve → React Native's
//   whatwg-fetch polyfill throws [TypeError: Network request failed].
//   The console.log("[DocumentStore] API base:", _apiBase) fired at MODULE
//   LOAD TIME (before setApiBase was called), so it always printed the
//   env-var value and masked the real runtime value in use.
//
//   FIX: one shared mutable cell here. Both stores import `getApiBase` and
//   use it inside every method call (not captured in a closure at init).
//   The app calls `setApiBase` once at startup; all stores see the update.

function resolveDefaultApiBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    // Browser: always same-origin so cookies are sent automatically
    return window.location.origin;
  }
  // React Native / SSR fallback — overridden at runtime by setApiBase()
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

let _apiBase: string = resolveDefaultApiBase();

/**
 * Override the API base URL.
 * Call this once at app startup (e.g. in your root _layout.tsx).
 * React Native MUST call this because it has no window.location.
 *
 * @example
 *   setApiBase("http://192.168.1.65:3000");  // dev, LAN
 *   setApiBase("https://api.myapp.com");     // production
 */
export function setApiBase(url: string): void {
  _apiBase = url.replace(/\/$/, "");
  // Log here, not at module load — this is the true runtime value
  console.log("[ApiBase] set to:", _apiBase);
}

/**
 * Get the current API base URL.
 * Called inside every fetch() — never captured in a closure at init.
 */
export function getApiBase(): string {
  return _apiBase;
}
