// FILE: apps/web/components/ui/Badge.tsx
// Status badge used on DocumentCards and anywhere a small coloured label is needed.
// Variant maps directly to the semantic color tokens in globals.css.

type BadgeVariant = "success" | "warning" | "error" | "info" | "default";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  /** Pulsing animation — used for "Processing" status */
  pulse?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-[var(--color-success-subtle)]     text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-subtle)]     text-[var(--color-warning)]",
  error: "bg-[var(--color-destructive-subtle)] text-[var(--color-destructive)]",
  info: "bg-[var(--color-primary-subtle)]     text-[var(--color-primary)]",
  default: "bg-[var(--color-surface-hover)]      text-[var(--color-muted)]",
};

export function Badge({
  children,
  variant = "default",
  pulse = false,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5",
        "text-xs font-semibold rounded-full",
        "whitespace-nowrap",
        variantClasses[variant],
        pulse ? "animate-pulse" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

// ─── DOCUMENT STATUS BADGE ───────────────────────────────────────────────────
// Convenience wrapper that maps DocumentStatus → Badge variant automatically.

import type { DocumentStatus } from "@docchat/types";

const STATUS_MAP: Record<
  DocumentStatus,
  { variant: BadgeVariant; label: string; pulse: boolean }
> = {
  ready: { variant: "success", label: "Ready", pulse: false },
  processing: { variant: "warning", label: "Processing", pulse: true },
  partial: { variant: "warning", label: "Partial", pulse: false },
  error: { variant: "error", label: "Error", pulse: false },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.error;
  return (
    <Badge variant={cfg.variant} pulse={cfg.pulse}>
      {cfg.label}
    </Badge>
  );
}
