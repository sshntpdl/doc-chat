// FILE: apps/web/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { StoreInitializer } from "@/components/providers/StoreInitializer";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { CommandPalette } from "@/components/command/CommandPalette";
import { AuthProvider } from "@/components/providers/AuthProvider";

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
      <head>
        {/* Apply saved theme before first paint — prevents flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const s = JSON.parse(localStorage.getItem('docchat-ui') || '{}');
                const t = s?.state?.theme ?? 'system';
                const d = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (d) document.documentElement.classList.add('dark');
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-[var(--color-background)] text-[var(--color-foreground)]`}
      >
        {/* Initialize Zustand stores (auth session check) */}
        <StoreInitializer />
        {/* Page content */}
        <AuthProvider>{children}</AuthProvider>
        {/* Global ⌘K command palette — rendered above everything */}
        <CommandPalette />
        {/* Global toast notifications */}
        <ToastContainer />
      </body>
    </html>
  );
}
