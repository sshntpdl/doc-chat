declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    NEXT_PUBLIC_APP_URL?: string;
    [key: string]: string | undefined;
  };
};

function resolveDefaultApiBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
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

export function setApiBase(url: string): void {
  _apiBase = url.replace(/\/$/, "");
  // Log here, not at module load — this is the true runtime value
  console.log("[ApiBase] set to:", _apiBase);
}

export function getApiBase(): string {
  return _apiBase;
}
