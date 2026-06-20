// FILE: /apps/web/next.config.ts
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

  // Security headers applied to every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com https://api-inference.huggingface.co",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
