"use client";
import {
  useRef,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  placeholder = "Ask a question about your document…",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea height
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      // Reset then expand — allows shrinking when text is deleted
      e.target.style.height = "auto";
      const maxHeight = 144; // 5 lines ≈ 144px
      e.target.style.height = `${Math.min(e.target.scrollHeight, maxHeight)}px`;
    },
    [onChange],
  );

  // Enter = send, Shift+Enter = newline
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming && value.trim()) onSend();
      }
    },
    [isStreaming, value, onSend],
  );

  const charCount = value.length;
  const showCounter = charCount >= 1500;
  const isOverLimit = charCount >= 1900;
  const canSend = value.trim().length > 0 && !isStreaming && !disabled;

  return (
    <div
      className="border-t border-[var(--color-border)] px-4 py-4
                    bg-[var(--color-background)]"
    >
      <div className="max-w-2xl mx-auto">
        {/* Input container */}
        <div
          className="flex items-end gap-3 rounded-[var(--radius-xl)] border
                     border-[var(--color-border)] bg-[var(--color-surface)]
                     px-4 py-3
                     focus-within:ring-2 focus-within:ring-[var(--color-primary)]
                     focus-within:border-transparent transition-all"
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Reconnect to send messages" : placeholder}
            rows={1}
            maxLength={2000}
            disabled={isStreaming || disabled}
            aria-label="Chat message input"
            aria-multiline="true"
            className="flex-1 resize-none bg-transparent
                       text-[var(--color-foreground)] text-sm leading-relaxed
                       placeholder:text-[var(--color-muted-foreground)]
                       focus:outline-none disabled:opacity-50"
            style={{ minHeight: "24px", maxHeight: "144px" }}
          />

          {/* Character counter */}
          {showCounter && (
            <span
              aria-live="polite"
              className={`text-xs shrink-0 mb-0.5 tabular-nums transition-colors
                         ${
                           isOverLimit
                             ? "text-[var(--color-destructive)] font-semibold"
                             : "text-[var(--color-muted)]"
                         }`}
            >
              {charCount}/2000
            </span>
          )}

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={onStop}
              aria-label="Stop generating response"
              className="shrink-0 w-8 h-8 flex items-center justify-center
                         rounded-[var(--radius-md)] bg-[var(--color-destructive)]
                         text-white hover:bg-[var(--color-destructive-hover)]
                         active:scale-95 transition-all"
            >
              {/* Stop icon — solid square */}
              <span
                className="w-3 h-3 bg-white rounded-sm"
                aria-hidden="true"
              />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!canSend}
              aria-label="Send message"
              className="shrink-0 w-8 h-8 flex items-center justify-center
                         rounded-[var(--radius-md)] bg-[var(--color-primary)]
                         text-white hover:bg-[var(--color-primary-hover)]
                         active:scale-95 transition-all
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {/* Arrow icon */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 7h12M7 1l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Keyboard hint */}
        <p className="mt-2 text-center text-xs text-[var(--color-muted-foreground)]">
          <kbd className="font-mono">Enter</kbd> to send ·{" "}
          <kbd className="font-mono">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
