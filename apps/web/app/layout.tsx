// FILE: /apps/web/app/layout.tsx
// Root layout — wraps ALL pages including auth pages.
// Responsibilities:
//   - Apply Tailwind CSS globals
//   - Inject design system CSS variables (light + dark)
//   - Mount StoreInitializer (calls useAuthStore.initialize() once)
//   - Mount ToastContainer (global, always present)
//   - Apply saved theme class before first paint (avoid flash)

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { StoreInitializer } from "@/components/providers/StoreInitializer";
import { ToastContainer } from "@/components/ui/ToastContainer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocChat — AI Document Q&A",
  description: "Upload PDFs and chat with them using AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        suppressHydrationWarning on <html> is required because we set the
        `dark` class via a script before React hydrates, causing a mismatch
        between server-rendered HTML and client DOM. This is intentional.
      */}
      <head>
        {/* Inline script to apply saved theme BEFORE paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const stored = JSON.parse(localStorage.getItem('docchat-ui') || '{}');
                const theme  = stored?.state?.theme ?? 'system';
                const isDark = theme === 'dark' ||
                  (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (isDark) document.documentElement.classList.add('dark');
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-background text-foreground`}
      >
        {/* Initialize Zustand stores (auth session check) */}
        <StoreInitializer />
        {/* Main page content */}
        {children}
        {/* Global toast notifications — rendered in a portal above everything */}
        <ToastContainer />
      </body>
    </html>
  );
}
