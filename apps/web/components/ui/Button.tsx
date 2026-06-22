import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "destructive" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

// Omit the native broken style prop and redefine it cleanly as any
interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "style"
> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  style?: any;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] " +
    "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-foreground)] border border-[var(--color-border)] " +
    "hover:bg-[var(--color-surface-hover)]",
  destructive:
    "bg-[var(--color-destructive)] text-white hover:bg-[var(--color-destructive-hover)]",
  ghost: "text-[var(--color-foreground)] hover:bg-[var(--color-surface)]",
  outline:
    "border border-[var(--color-primary)] text-[var(--color-primary)] " +
    "hover:bg-[var(--color-primary-subtle)]",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-[var(--radius-sm)]",
  md: "px-4 py-2.5 text-sm gap-2   rounded-[var(--radius-md)]",
  lg: "px-6 py-3   text-base gap-2 rounded-[var(--radius-md)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      children,
      className = "",
      disabled,
      style,
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={isLoading}
        style={style}
        className={[
          "inline-flex items-center justify-center font-medium",
          "transition-all duration-[var(--duration-fast)]",
          "active:scale-[0.97]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth ? "w-full" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {/* Spinner replaces leftIcon while loading */}
        {isLoading ? (
          <span
            className="w-4 h-4 border-2 border-current border-t-transparent
                       rounded-full animate-spin shrink-0"
            aria-hidden="true"
          />
        ) : leftIcon ? (
          <span className="shrink-0" aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}

        {children}

        {!isLoading && rightIcon ? (
          <span className="shrink-0" aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </button>
    );
  },
);
