// FILE: /apps/web/app/auth/login/page.tsx
"use client";
// Full auth page: sign in + sign up in one component, animated slide transition.
// Magic link flow: submit email → "Check your inbox" state with 30s resend countdown.

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams }          from "next/navigation";
import { useAuthStore }                        from "@docchat/stores";

type Mode = "signin" | "signup" | "magic" | "magic-sent";

export default function LoginPage() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const redirectTo    = searchParams.get("redirectTo") ?? "/dashboard";

  const { signInWithEmail, signUpWithEmail, signInWithMagicLink, isLoading } =
    useAuthStore();

  const [mode,         setMode]         = useState<Mode>("signin");
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [fieldErrors,  setFieldErrors]  = useState<{ email?: string; password?: string }>({});
  const [countdown,    setCountdown]    = useState(0);
  const [isPending,    startTransition] = useTransition();

  // Resend countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // ── Validation (on-blur, not on-submit) ────────────────────────────────
  function validateEmail(val: string) {
    if (!val) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "Enter a valid email";
    return undefined;
  }

  function validatePassword(val: string) {
    if (!val && mode !== "magic") return "Password is required";
    if (val && val.length < 8) return "Password must be at least 8 characters";
    return undefined;
  }

  // ── Submit handlers ────────────────────────────────────────────────────
  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const emailErr    = validateEmail(email);
    const passwordErr = mode !== "magic" ? validatePassword(password) : undefined;
    if (emailErr || passwordErr) {
      setFieldErrors({ email: emailErr, password: passwordErr });
      return;
    }

    startTransition(async () => {
      const err =
        mode === "signup"
          ? await signUpWithEmail(email, password)
          : await signInWithEmail(email, password);

      if (err) {
        setError(err.message);
      } else if (mode === "signup") {
        setMode("magic-sent"); // show "check your email" for verification
      } else {
        router.push(redirectTo);
      }
    });
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const emailErr = validateEmail(email);
    if (emailErr) { setFieldErrors({ email: emailErr }); return; }

    startTransition(async () => {
      const err = await signInWithMagicLink(email);
      if (err) {
        setError(err.message);
      } else {
        setMode("magic-sent");
        setCountdown(30);
      }
    });
  }

  const busy = isLoading || isPending;

  // ── Magic link sent state ──────────────────────────────────────────────
  if (mode === "magic-sent") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)] p-4">
        <div className="w-full max-w-md text-center space-y-6">
          {/* Animated envelope icon */}
          <div className="text-7xl animate-bounce select-none" aria-hidden="true">✉️</div>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-foreground)]">
              Check your inbox
            </h1>
            <p className="mt-2 text-[var(--color-muted)]">
              We sent a link to <strong className="text-[var(--color-foreground)]">{email}</strong>.
              Click it to sign in.
            </p>
          </div>
          <button
            onClick={async () => {
              if (countdown > 0) return;
              await signInWithMagicLink(email);
              setCountdown(30);
            }}
            disabled={countdown > 0 || busy}
            className="w-full py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)]
                       text-[var(--color-foreground)] disabled:opacity-50 disabled:cursor-not-allowed
                       hover:bg-[var(--color-surface)] transition-colors text-sm"
          >
            {countdown > 0 ? `Resend in ${countdown}s` : "Resend email"}
          </button>
          <button
            onClick={() => setMode("signin")}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Main form layout ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex">
      {/* LEFT: Branding panel (hidden on mobile) */}
      <div
        className="hidden lg:flex flex-col justify-between w-[45%] p-12
                   bg-[var(--color-primary)] text-white"
      >
        <div>
          <div className="text-2xl font-bold tracking-tight">DocChat</div>
          <p className="mt-2 text-white/70 text-sm">AI Document Intelligence</p>
        </div>
        <div className="space-y-6">
          {[
            { icon: "📄", text: "Upload PDFs and Markdown files" },
            { icon: "🔍", text: "AI finds answers in your documents" },
            { icon: "📌", text: "Cited sources — know where each answer comes from" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <span className="text-xl" aria-hidden="true">{icon}</span>
              <p className="text-white/90">{text}</p>
            </div>
          ))}
        </div>
        <p className="text-white/50 text-xs">© 2024 DocChat</p>
      </div>

      {/* RIGHT: Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-[var(--color-background)]">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden text-xl font-bold text-[var(--color-primary)]">DocChat</div>

          {/* Mode heading */}
          <div>
            <h2 className="text-2xl font-semibold text-[var(--color-foreground)]">
              {mode === "signup" ? "Create account" : "Sign in"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {mode === "signup"
                ? "Already have an account?"
                : "Don't have an account?"}{" "}
              <button
                onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); setFieldErrors({}); }}
                className="text-[var(--color-primary)] hover:underline font-medium"
              >
                {mode === "signup" ? "Sign in" : "Sign up"}
              </button>
            </p>
          </div>

          {/* Global error */}
          {error && (
            <div role="alert" className="p-3 rounded-[var(--radius-md)] bg-[var(--color-destructive-subtle)]
                                         text-[var(--color-destructive)] text-sm">
              {error}
            </div>
          )}

          {/* Magic link toggle */}
          <div className="flex gap-2">
            {(["signin", "magic"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(mode === "signup" && m === "signin" ? "signup" : m); setError(null); }}
                className={`flex-1 py-2 text-sm rounded-[var(--radius-md)] border transition-colors
                  ${(mode === m || (mode === "signup" && m === "signin"))
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
                  }`}
              >
                {m === "signin" ? "Password" : "Magic Link"}
              </button>
            ))}
          </div>

          {/* Form */}
          <form
            onSubmit={mode === "magic" ? handleMagicLink : handleEmailAuth}
            className="space-y-4"
            noValidate
          >
            {/* Email */}
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-[var(--color-foreground)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setFieldErrors((f) => ({ ...f, email: validateEmail(email) }))}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                aria-invalid={!!fieldErrors.email}
                className={`w-full px-3 py-2.5 rounded-[var(--radius-md)] border bg-[var(--color-surface)]
                            text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]
                            focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition
                            ${fieldErrors.email ? "border-[var(--color-destructive)]" : "border-[var(--color-border)]"}`}
                placeholder="you@example.com"
              />
              {fieldErrors.email && (
                <p id="email-error" className="text-xs text-[var(--color-destructive)]" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password (hidden for magic link) */}
            {mode !== "magic" && (
              <div className="space-y-1">
                <label htmlFor="password" className="text-sm font-medium text-[var(--color-foreground)]">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setFieldErrors((f) => ({ ...f, password: validatePassword(password) }))}
                    aria-describedby={fieldErrors.password ? "password-error" : undefined}
                    aria-invalid={!!fieldErrors.password}
                    className={`w-full px-3 py-2.5 pr-10 rounded-[var(--radius-md)] border
                                bg-[var(--color-surface)] text-[var(--color-foreground)]
                                placeholder:text-[var(--color-muted-foreground)]
                                focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition
                                ${fieldErrors.password ? "border-[var(--color-destructive)]" : "border-[var(--color-border)]"}`}
                    placeholder="········"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]
                               hover:text-[var(--color-foreground)] transition-colors text-sm"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="password-error" className="text-xs text-[var(--color-destructive)]" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-[var(--radius-md)] bg-[var(--color-primary)]
                         text-[var(--color-primary-foreground)] font-medium
                         hover:bg-[var(--color-primary-hover)] active:scale-[0.98]
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-all flex items-center justify-center gap-2"
            >
              {busy && (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
              )}
              {mode === "magic"
                ? "Send magic link"
                : mode === "signup"
                ? "Create account"
                : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
