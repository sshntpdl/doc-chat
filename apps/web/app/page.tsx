// FILE: apps/web/app/page.tsx
// Root landing page at /
// Server Component: checks auth and redirects authenticated users to /dashboard.
// Unauthenticated users see the marketing hero page.

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@docchat/supabase";

export default async function LandingPage() {
  // If already authenticated, skip the landing page entirely
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* ── NAV ─────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <span className="text-xl font-bold text-[var(--color-primary)]">
          DocChat
        </span>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="px-4 py-2 text-sm text-[var(--color-muted)]
                       hover:text-[var(--color-foreground)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/login"
            className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)]
                       bg-[var(--color-primary)] text-white
                       hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5
                          rounded-full border border-[var(--color-border)]
                          bg-[var(--color-surface)] text-sm text-[var(--color-muted)]"
          >
            <span
              className="w-2 h-2 rounded-full bg-[var(--color-success)]
                             animate-pulse"
              aria-hidden="true"
            />
            Powered by Llama 3.3 70B via Groq
          </div>

          {/* Headline */}
          <h1
            className="text-5xl sm:text-6xl font-bold text-[var(--color-foreground)]
                         leading-tight tracking-tight"
          >
            Chat with your{" "}
            <span className="text-[var(--color-primary)]">documents</span>
            <br />
            using AI
          </h1>

          <p className="text-xl text-[var(--color-muted)] max-w-xl mx-auto leading-relaxed">
            Upload PDFs or Markdown files and ask natural language questions.
            Get precise answers with cited sources — page numbers and excerpts
            included.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/auth/login"
              className="w-full sm:w-auto px-8 py-3 rounded-[var(--radius-md)]
                         bg-[var(--color-primary)] text-white font-semibold text-base
                         hover:bg-[var(--color-primary-hover)] active:scale-[0.98]
                         transition-all shadow-[var(--shadow-elevated)]"
            >
              Start for free →
            </Link>
            <a
              href="#features"
              className="w-full sm:w-auto px-8 py-3 rounded-[var(--radius-md)]
                         border border-[var(--color-border)] text-[var(--color-foreground)]
                         font-medium text-base hover:bg-[var(--color-surface)]
                         transition-colors"
            >
              See how it works
            </a>
          </div>
        </div>
      </main>

      {/* ── FEATURES ────────────────────────────────────────────────── */}
      <section
        id="features"
        className="border-t border-[var(--color-border)] py-20 px-4"
      >
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-[var(--color-foreground)] mb-12">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: "📄",
                title: "Upload a document",
                desc: "Drag and drop a PDF or Markdown file. We extract and index every page.",
              },
              {
                step: "02",
                icon: "💬",
                title: "Ask a question",
                desc: "Type any natural language question about your document content.",
              },
              {
                step: "03",
                icon: "📌",
                title: "Get cited answers",
                desc: "AI answers stream in real time with exact page references so you can verify every claim.",
              },
            ].map((f) => (
              <div
                key={f.step}
                className="flex flex-col gap-3 p-6 rounded-[var(--radius-lg)]
                           border border-[var(--color-border)] bg-[var(--color-surface)]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl" aria-hidden="true">
                    {f.icon}
                  </span>
                  <span
                    className="text-xs font-bold text-[var(--color-primary)]
                                   tracking-widest"
                  >
                    STEP {f.step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[var(--color-foreground)]">
                  {f.title}
                </h3>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer
        className="border-t border-[var(--color-border)] py-6 text-center
                         text-sm text-[var(--color-muted-foreground)]"
      >
        DocChat — Built with Next.js 15, Supabase, Groq &amp; HuggingFace
      </footer>
    </div>
  );
}
