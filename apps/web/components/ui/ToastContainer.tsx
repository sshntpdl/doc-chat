// FILE: /apps/web/components/ui/ToastContainer.tsx
"use client";

import { useEffect, useRef } from "react";
import { useUIStore } from "@docchat/stores";
import type { Toast } from "@docchat/stores";

// ─── SINGLE TOAST ────────────────────────────────────────────────────────────

function ToastItem({ toast }: { toast: Toast }) {
  const dismissToast = useUIStore((s) => s.dismissToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (toast.duration === -1) return;

    timerRef.current = setTimeout(() => {
      dismissToast(toast.id);
    }, toast.duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, dismissToast]);

  const variantConfig = {
    success: {
      icon: "✓",
      border: "border-l-[var(--color-success)]",
      icon_bg: "bg-[var(--color-success-subtle)] text-[var(--color-success)]",
      bar: "bg-[var(--color-success)]",
    },
    error: {
      icon: "✕",
      border: "border-l-[var(--color-destructive)]",
      icon_bg:
        "bg-[var(--color-destructive-subtle)] text-[var(--color-destructive)]",
      bar: "bg-[var(--color-destructive)]",
    },
    warning: {
      icon: "⚠",
      border: "border-l-[var(--color-warning)]",
      icon_bg: "bg-[var(--color-warning-subtle)] text-[var(--color-warning)]",
      bar: "bg-[var(--color-warning)]",
    },
    info: {
      icon: "ℹ",
      border: "border-l-[#3B82F6]",
      icon_bg: "bg-[#EFF6FF] text-[#3B82F6]",
      bar: "bg-[#3B82F6]",
    },
  } as const;

  const cfg = variantConfig[toast.variant];

  return (
    <div
      role="alert"
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={[
        "relative overflow-hidden rounded-[var(--radius-lg)] border border-l-4",
        "border-[var(--color-border)] bg-[var(--color-background)]",
        "shadow-[var(--shadow-elevated)] min-w-[280px] max-w-[380px]",
        "animate-in slide-in-from-bottom-2 fade-in duration-300",
        cfg.border,
      ].join(" ")}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <span
          className={[
            "shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
            "text-xs font-bold",
            cfg.icon_bg,
          ].join(" ")}
          aria-hidden="true"
        >
          {cfg.icon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-[var(--color-foreground)]">
            {toast.title}
          </p>

          {toast.description && (
            <p className="mt-0.5 text-xs text-[var(--color-muted)] leading-relaxed">
              {toast.description}
            </p>
          )}

          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-xs font-medium text-[var(--color-primary)] hover:underline underline-offset-2"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => dismissToast(toast.id)}
          aria-label="Dismiss notification"
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface)] transition-colors text-xs mt-0.5"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      {toast.duration !== -1 && (
        <div className="h-0.5 bg-[var(--color-border)]">
          <div
            className={`h-full ${cfg.bar}`}
            style={{
              transformOrigin: "left",
              animation: `shrink ${toast.duration}ms linear forwards`,
            }}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes shrink {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }

        @keyframes slideIn {
          from {
            transform: translateY(8px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

// ─── CONTAINER ───────────────────────────────────────────────────────────────

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);

  if (!toasts.length) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed z-[9999] flex flex-col gap-2 bottom-4 right-4 sm:right-6 left-4 sm:left-auto items-stretch sm:items-end"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
