// FILE: apps/web/components/chat/MessageBubble.tsx
"use client";

import { useState, memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SourceCitation } from "./SourceCitation";
import type { ChatMessage } from "@docchat/types";

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
}

// ─── TYPING INDICATOR ────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span
      className="inline-flex items-center gap-[3px] h-4"
      aria-label="AI is typing"
      role="status"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[var(--color-muted)] opacity-40"
          style={{
            animation: "typing-bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
          aria-hidden="true"
        />
      ))}
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0);    opacity: 0.4; }
          30%            { transform: translateY(-5px); opacity: 1;   }
        }
      `}</style>
    </span>
  );
}

// ─── STREAMING CURSOR ────────────────────────────────────────────────────────

function StreamingCursor() {
  return (
    <>
      <span
        aria-hidden="true"
        className="inline-block w-[2px] h-[0.85em] ml-[2px] align-[-1px]
                   bg-[var(--color-primary)] opacity-90 rounded-full"
        style={{ animation: "blink-cursor 0.9s step-start infinite" }}
      />
      <style>{`
        @keyframes blink-cursor {
          0%, 100% { opacity: 0.9; }
          50%       { opacity: 0;   }
        }
      `}</style>
    </>
  );
}

// ─── INLINE CITATION ANNOTATION ──────────────────────────────────────────────
// Renders [Doc: filename, p.X] as smaller, muted inline text.
// Recedes behind the main sentence but is readable on hover.

function CitationAnnotation({
  filename,
  page,
}: {
  filename: string;
  page: string;
}) {
  const displayName =
    filename.length > 32 ? filename.slice(0, 30) + "…" : filename;

  return (
    <span
      title={`${filename}, ${page}`}
      className="inline-block align-baseline mx-[1px]
                 text-[0.72em] leading-none
                 text-[var(--color-muted-foreground)]
                 opacity-60 hover:opacity-100
                 transition-opacity cursor-default whitespace-nowrap"
      aria-label={`Source: ${filename}, ${page}`}
    >
      [{displayName}, {page}]
    </span>
  );
}

// ─── CITATION SEGMENT SPLITTER ────────────────────────────────────────────────
//
// WHY NOT use ReactMarkdown's `components` API for this?
//
// We tried three approaches that all failed in react-markdown v9 + remark-gfm v4:
//
//  1. `components.text` → removed entirely in v9
//  2. `[filename|page](doc-citation)` links → remark-gfm v4 parses `|` inside
//     link text as GFM table column separators, breaking the link
//  3. `[page](doc-citation://filename/page)` links → rehype sanitizes unknown
//     protocols, stripping the href so it arrives as `undefined` in `components.a`,
//     causing the link to render as plain text ("p.2")
//
// SOLUTION: split the raw content string on citation patterns BEFORE it reaches
// ReactMarkdown. Each piece is either a plain markdown string (rendered normally)
// or a citation object (rendered as <CitationAnnotation> directly in React).
// No markdown tricks needed — citations never enter the markdown pipeline at all.

type TextSegment = { type: "text"; content: string };
type CitationSegment = { type: "citation"; filename: string; page: string };
type Segment = TextSegment | CitationSegment;

const DOC_CITATION_RE = /\[Doc:\s*([^\],]+?),\s*(p\.[\d–\-,\s]+?)\]/g;

function splitIntoCitationSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  DOC_CITATION_RE.lastIndex = 0;

  while ((match = DOC_CITATION_RE.exec(content)) !== null) {
    // Plain text before this citation
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }
    // The citation itself
    segments.push({
      type: "citation",
      filename: match[1].trim(),
      page: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  // Any remaining text after the last citation
  if (lastIndex < content.length) {
    segments.push({ type: "text", content: content.slice(lastIndex) });
  }

  // If no citations were found, return a single text segment
  return segments.length > 0 ? segments : [{ type: "text", content }];
}

// ─── SHARED MARKDOWN COMPONENTS ──────────────────────────────────────────────
// Defined outside the component so the reference is stable across renders
// (prevents ReactMarkdown from remounting on every token during streaming).

const markdownComponents = {
  pre({ children, ...props }: any) {
    return (
      <div className="relative group/code">
        <pre {...props}>{children}</pre>
        <CopyCodeButton code={extractTextFromNode(children)} />
      </div>
    );
  },
  a({ href, children }: any) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

// ─── AI MESSAGE BODY ─────────────────────────────────────────────────────────
// Renders segments: markdown text pieces interspersed with citation chips.
// Each text segment gets its own <ReactMarkdown> instance so the prose
// styles and GFM features apply normally within each chunk.

interface AIBodyProps {
  content: string;
  isReceivingTokens: boolean;
}

function AIMessageBody({ content, isReceivingTokens }: AIBodyProps) {
  const segments = useMemo(() => splitIntoCitationSegments(content), [content]);

  // Find the index of the last text segment so we can attach the
  // streaming cursor to it (not to a trailing citation chip).
  const lastTextIdx = segments.reduce<number>(
    (last, seg, i) => (seg.type === "text" ? i : last),
    -1,
  );

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "citation") {
          return (
            <CitationAnnotation
              key={i}
              filename={seg.filename}
              page={seg.page}
            />
          );
        }

        // Text segment — wrap in a span so CitationAnnotation siblings sit inline
        const isLastText = i === lastTextIdx;

        return (
          // `contents` makes the span not create a new block box, so the
          // trailing citation chip stays inline with the preceding text.
          <span key={i} className="contents">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                ...markdownComponents,
                // Inject streaming cursor after the last paragraph of the
                // last text segment while tokens are still arriving.
                p({ children, ...props }: any) {
                  return (
                    <p {...props}>
                      {children}
                      {isReceivingTokens && isLastText && <StreamingCursor />}
                    </p>
                  );
                },
              }}
            >
              {seg.content}
            </ReactMarkdown>
          </span>
        );
      })}
    </>
  );
}

// ─── MESSAGE BUBBLE ───────────────────────────────────────────────────────────

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming,
}: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);

  const isWaitingForFirstToken = isStreaming && message.content.length === 0;
  const isReceivingTokens = isStreaming && message.content.length > 0;

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div
      className={`group flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      <div
        className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      >
        {/* Avatar */}
        <div
          className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                      text-xs font-semibold mt-0.5
                     ${
                       isUser
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
                     ${
                       isUser
                         ? "rounded-tr-[var(--radius-sm)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] px-4 py-2.5"
                         : "rounded-tl-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
                     }`}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
          ) : (
            <div
              className="prose prose-sm max-w-none dark:prose-invert
                            text-[var(--color-foreground)]
                            prose-p:my-1 prose-li:my-0.5
                            prose-headings:mt-3 prose-headings:mb-1
                            prose-code:bg-[var(--color-surface-hover)] prose-code:px-1 prose-code:rounded
                            prose-pre:bg-[var(--color-surface-hover)] prose-pre:p-3
                            prose-pre:rounded-[var(--radius-md)]"
            >
              {/* Phase 1 — waiting for first token */}
              {isWaitingForFirstToken && <TypingDots />}

              {/* Phase 2 — streaming or complete */}
              {!isWaitingForFirstToken && (
                <AIMessageBody
                  content={message.content}
                  isReceivingTokens={isReceivingTokens ?? false}
                />
              )}
            </div>
          )}

          {/* Copy button — AI only, hidden while streaming */}
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

      {/* Timestamp */}
      <span
        className={`text-xs text-[var(--color-muted-foreground)] px-9
                    transition-opacity duration-[var(--duration-fast)]
                   ${showTimestamp ? "opacity-100" : "opacity-0"}`}
        aria-label={`Sent at ${formatTime(message.createdAt)}`}
      >
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
});

// ─── COPY CODE BUTTON ─────────────────────────────────────────────────────────

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

function extractTextFromNode(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractTextFromNode).join("");
  if (node && typeof node === "object" && "props" in (node as any)) {
    return extractTextFromNode((node as any).props.children);
  }
  return "";
}
