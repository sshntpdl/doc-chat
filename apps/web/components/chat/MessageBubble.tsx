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

// ─── INLINE CITATION NUMBER BADGE ────────────────────────────────────────────

function CitationBadge({
  number,
  filename,
  page,
}: {
  number: number;
  filename: string;
  page: string;
}) {
  return (
    <sup
      title={`${filename}, ${page}`}
      className="inline-flex items-center justify-center
                 w-[1.1em] h-[1.1em] mx-[1px]
                 text-[0.6em] font-semibold leading-none
                 rounded-full
                 bg-[var(--color-surface-hover)]
                 text-[var(--color-muted-foreground)]
                 border border-[var(--color-border)]
                 align-super cursor-default
                 hover:bg-[var(--color-border)]
                 transition-colors"
      aria-label={`Source ${number}: ${filename}, ${page}`}
    >
      {number}
    </sup>
  );
}

// ─── CITATION SEGMENT SPLITTER ────────────────────────────────────────────────
import type { SourceCitation as CitationSource } from "@docchat/types";

type TextSegment = { type: "text"; content: string };
type CitationSegment = {
  type: "citation";
  filename: string;
  page: string;
  number: number;
};
type Segment = TextSegment | CitationSegment;

const DOC_CITATION_RE = /\[Doc:\s*([^\],]+?),\s*(p\.[\d–\-,\s]+?)\]/g;

/**
 * Build a lookup map: "normalised documentName||pageNumber"
 */
function buildSourceIndexMap(
  sources: CitationSource[] | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!sources) return map;
  sources.forEach((src, i) => {
    const key = `${src.documentName.trim().toLowerCase()}||${String(src.pageNumber).trim()}`;
    if (!map.has(key)) map.set(key, i + 1); // first occurrence wins, 1-based
  });
  return map;
}

function splitIntoCitationSegments(
  content: string,
  sourceIndexMap: Map<string, number>,
): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  DOC_CITATION_RE.lastIndex = 0;

  while ((match = DOC_CITATION_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }

    const filename = match[1].trim();
    const page = match[2].trim(); // e.g. "p.1"
    // Strip leading "p." so the page value matches src.pageNumber (which is a number)
    const pageNum = page.replace(/^p\.\s*/i, "").trim();
    const key = `${filename.toLowerCase()}||${pageNum}`;
    // Fall back to 1 if the token doesn't match any source (defensive)
    const number = sourceIndexMap.get(key) ?? 1;

    segments.push({ type: "citation", filename, page, number });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", content: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", content }];
}

// ─── SHARED MARKDOWN COMPONENTS ──────────────────────────────────────────────

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

interface AIBodyProps {
  content: string;
  isReceivingTokens: boolean;
  sources: CitationSource[] | undefined;
}

function AIMessageBody({ content, isReceivingTokens, sources }: AIBodyProps) {
  const segments = useMemo(() => {
    const sourceIndexMap = buildSourceIndexMap(sources);
    return splitIntoCitationSegments(content, sourceIndexMap);
  }, [content, sources]);

  const lastTextIdx = segments.reduce<number>(
    (last, seg, i) => (seg.type === "text" ? i : last),
    -1,
  );

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "citation") {
          return (
            <CitationBadge
              key={i}
              number={seg.number}
              filename={seg.filename}
              page={seg.page}
            />
          );
        }

        // Text segment — wrap in a span so CitationBadge siblings sit inline
        const isLastText = i === lastTextIdx;

        return (
          <span key={i} className="contents">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                ...markdownComponents,
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
                  sources={message.sources}
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
