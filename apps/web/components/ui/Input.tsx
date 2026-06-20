// FILE: apps/web/components/ui/Input.tsx
// Reusable text input with label, helper text, error state, and icon slots.
// All form fields across login, search, and chat use this component.

import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Full-width by default */
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    leftIcon,
    rightIcon,
    fullWidth = true,
    className = "",
    id,
    ...rest
  },
  ref,
) {
  // Generate an id for label association if not provided
  const inputId = id ?? `input-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div className={`flex flex-col gap-1 ${fullWidth ? "w-full" : ""}`}>
      {/* Label */}
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--color-foreground)]"
        >
          {label}
        </label>
      )}

      {/* Input wrapper */}
      <div className="relative flex items-center">
        {leftIcon && (
          <span
            className="absolute left-3 text-[var(--color-muted)] pointer-events-none"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}

        <input
          ref={ref}
          id={inputId}
          aria-describedby={
            error
              ? `${inputId}-error`
              : helperText
                ? `${inputId}-helper`
                : undefined
          }
          aria-invalid={!!error}
          className={[
            "w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)]",
            "text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]",
            "px-3 py-2.5 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]",
            "focus:border-transparent transition-shadow",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error
              ? "border-[var(--color-destructive)]"
              : "border-[var(--color-border)]",
            leftIcon ? "pl-9" : "",
            rightIcon ? "pr-9" : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />

        {rightIcon && (
          <span
            className="absolute right-3 text-[var(--color-muted)]"
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        )}
      </div>

      {/* Error message — adjacent to field (WCAG requirement) */}
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="text-xs text-[var(--color-destructive)]"
        >
          {error}
        </p>
      )}

      {/* Helper text */}
      {!error && helperText && (
        <p
          id={`${inputId}-helper`}
          className="text-xs text-[var(--color-muted)]"
        >
          {helperText}
        </p>
      )}
    </div>
  );
});
