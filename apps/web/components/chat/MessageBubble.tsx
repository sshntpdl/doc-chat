// FILE: /apps/web/components/chat/MessageBubble.tsx
"use client";

import { useState, memo }    from "react";
import ReactMarkdown         from "react-markdown";
import remarkGfm             from "remark-gfm";
import { SourceCitation }    from "./SourceCitation";
import type { ChatMessage }  from "@docchat/types";

interface Props {
  message:    ChatMessage;
  isStreaming?: boolean; // true while this specific message is being streamed
}

// memo() prevents re-renders for messages that aren't being updated.
// Without memo, every appendToken() call would re-render ALL messages.
export const MessageBubble = memo(function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div
      className={`group flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div
          className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5
                     ${isUser
                       ? "bg-[var(--color-primary)] text-white"
                       : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)]"
                     }`}
          aria-hidden="true"
        >
          {isUser ? "U" : "AI"}
        </div>

        {/* Bubble */}
        <div
          className={`relative max-w-[75%] rounded-[var(--radius-lg)]
                     ${isUser
                       ? "rounded-tr-[var(--radius-sm)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-4 py-2.5"
                       : "rounded-tl-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
                     }`}
        >
          {isUser ? (
            // User messages: plain text (they typed it, no markdown needed)
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            // AI messages: render full markdown
            <div
              className={`prose prose-sm max-w-none dark:prose-invert
                          text-[var(--color-foreground)]
                          prose-p:my-1 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1
                          prose-code:bg-[var(--color-surface-hover)] prose-code:px-1 prose-code:rounded
                          prose-pre:bg-[var(--color-surface-hover)] prose-pre:p-3 prose-pre:rounded-[var(--radius-md)]
                          ${isStreaming ? "streaming-cursor" : ""}`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Code blocks with copy button
                  pre({ children, ...props }) {
                    return (
                      <div className="relative group/code">
                        <pre {...props}>{children}</pre>
                        <CopyCodeButton
                          code={extractTextFromNode(children)}
                        />
                      </div>
                    );
                  },
                }}
              >
                {message.content || (isStreaming ? " " : "")}
              </ReactMarkdown>
            </div>
          )}

          {/* Copy button (AI messages only, visible on hover) */}
          {!isUser && message.content && !isStreaming && (
            <button
              onClick={handleCopy}
              aria-label={copied ? "Copied!" : "Copy message"}
              className="absolute -top-2 -right-2 w-7 h-7 flex items-center justify-center
                         rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]
                         shadow-[var(--shadow-subtle)] text-xs
                         opacity-0 group-hover:opacity-100 transition-opacity
                         hover:bg-[var(--color-surface-hover)]"
            >
              {copied ? "✓" : "⎘"}
            </button>
          )}
        </div>
      </div>

      {/* Source citations */}
      {!isUser && message.sources && message.sources.length > 0 && (
        <div className="ml-9">
          <SourceCitation sources={message.sources} />
        </div>
      )}

      {/* Timestamp (on hover) */}
      <span
        className={`text-xs text-[var(--color-muted-foreground)] px-9 transition-opacity duration-[var(--duration-fast)]
                   ${showTimestamp ? "opacity-100" : "opacity-0"}`}
        aria-label={`Sent at ${formatTime(message.createdAt)}`}
      >
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
});

// ─── COPY CODE BUTTON (inside code blocks) ───────────────────────────────────

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied!" : "Copy code"}
      className="absolute top-2 right-2 px-2 py-1 text-xs rounded-[var(--radius-sm)]
                 bg-[var(--color-border)] text-[var(--color-muted)]
                 opacity-0 group-hover/code:opacity-100 transition-opacity
                 hover:bg-[var(--color-border-strong)]"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// Extracts plain text from React children (for copying code blocks)
function extractTextFromNode(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractTextFromNode).join("");
  if (node && typeof node === "object" && "props" in (node as any)) {
    return extractTextFromNode((node as any).props.children);
  }
  return "";
}
