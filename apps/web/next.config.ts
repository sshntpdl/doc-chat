// FILE: /apps/web/next.config.ts
//
// CHANGE vs previous version:
//   - Content-Security-Policy removed from static headers() here.
//   - CSP is now set dynamically in middleware.ts where we have access to
//     the live request URL. This fixes the LAN IP dev issue where 'self'
//     resolved to localhost:3000 but the page was loaded from 192.168.x.x:3000.
//   - All other security headers are kept here (they don't need to be dynamic).

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  transpilePackages: ["@docchat/types", "@docchat/supabase", "@docchat/stores"],

  // Next.js 15: serverComponentsExternalPackages moved OUT of experimental.
  // It is now a top-level key called serverExternalPackages.
  // pdf-parse uses Node.js built-ins (fs, path) that can't run in the Edge
  // runtime, so we tell Next.js to keep it in the Node.js bundle.
  serverExternalPackages: [
    "@huggingface/inference",
    "@langchain/community",
    "@langchain/groq",
    "@langchain/core",
    "pdf-parse",
  ],

  // Security headers applied to every response.
  // NOTE: Content-Security-Policy is intentionally absent here —
  // it is set in middleware.ts so it can be built dynamically from the
  // incoming request URL (needed for LAN IP access in development).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
