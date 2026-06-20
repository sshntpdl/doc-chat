// FILE: /apps/web/components/dashboard/DashboardNav.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Link                            from "next/link";
import { useRouter }                   from "next/navigation";
import type { User }                   from "@supabase/supabase-js";
import { useAuthStore, useUIStore }    from "@docchat/stores";

interface Props { user: User }

export function DashboardNav({ user }: Props) {
  const router         = useRouter();
  const signOut        = useAuthStore((s) => s.signOut);
  const { theme, setTheme, openCommandPalette } = useUIStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Global ⌘K shortcut
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openCommandPalette();
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [openCommandPalette]);

  async function handleSignOut() {
    await signOut();
    router.push("/auth/login");
  }

  const avatarLetter = (user.user_metadata?.full_name?.[0] ?? user.email?.[0] ?? "U").toUpperCase();

  const nextTheme: Record<string, string> = { light: "dark", dark: "system", system: "light" };
  const themeIcon: Record<string, string> = { light: "☀️", dark: "🌙", system: "💻" };

  return (
    <nav
      className="sticky top-0 z-40 border-b border-[var(--color-border)]
                 bg-[var(--color-background)]/80 backdrop-blur-sm"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="text-lg font-bold text-[var(--color-primary)] hover:opacity-80 transition-opacity"
          >
            DocChat
          </Link>

          <div className="flex items-center gap-2">
            {/* ⌘K button */}
            <button
              onClick={openCommandPalette}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)]
                         border border-[var(--color-border)] text-[var(--color-muted)] text-sm
                         hover:bg-[var(--color-surface)] transition-colors"
              aria-label="Open command palette"
            >
              <span>Search...</span>
              <kbd className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)]
                              px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => setTheme(nextTheme[theme] as any)}
              aria-label={`Switch to ${nextTheme[theme]} theme`}
              className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)]
                         hover:bg-[var(--color-surface)] transition-colors text-lg"
            >
              {themeIcon[theme]}
            </button>

            {/* User avatar + dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label="User menu"
                className="w-9 h-9 rounded-full bg-[var(--color-primary)] text-white
                           font-semibold text-sm flex items-center justify-center
                           hover:opacity-90 transition-opacity focus-visible:ring-2
                           focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
              >
                {avatarLetter}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-52 bg-[var(--color-surface)] border
                             border-[var(--color-border)] rounded-[var(--radius-lg)]
                             shadow-[var(--shadow-elevated)] overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-[var(--color-border)]">
                    <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                      {user.user_metadata?.full_name ?? "User"}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] truncate mt-0.5">
                      {user.email}
                    </p>
                  </div>
                  <div className="py-1">
                    <button
                      role="menuitem"
                      onClick={handleSignOut}
                      className="w-full px-4 py-2 text-left text-sm text-[var(--color-destructive)]
                                 hover:bg-[var(--color-destructive-subtle)] transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
