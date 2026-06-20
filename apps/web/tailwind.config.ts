// FILE: /apps/web/tailwind.config.ts
// Tailwind v3 config. Tells Tailwind which files to scan for class names.
// Without this, Tailwind ships zero CSS because it finds no classes to include.

import type { Config } from "tailwindcss";

const config: Config = {
  // darkMode: 'class' means Tailwind enables dark: prefix when
  // the <html> element has class="dark" on it.
  // Our uiStore.setTheme() and the inline script in layout.tsx handle this.
  darkMode: "class",

  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],

  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        // Map our CSS custom properties to Tailwind color names.
        // This lets us use bg-background, text-foreground, etc.
        // The actual hex values live in globals.css as CSS variables.
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        primary: "var(--color-primary)",
        muted: "var(--color-muted)",
        destructive: "var(--color-destructive)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        subtle: "var(--shadow-subtle)",
        default: "var(--shadow-default)",
        elevated: "var(--shadow-elevated)",
        card: "var(--shadow-card)",
      },
    },
  },

  plugins: [],
};

export default config;
