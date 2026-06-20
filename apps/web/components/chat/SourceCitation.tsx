// FILE: /apps/web/components/chat/SourceCitation.tsx
"use client";

import { useState }               from "react";
import type { SourceCitation as Citation } from "@docchat/types";

interface Props { sources: Citation[] }

export function SourceCitation({ sources }: Props) {
  const [expanded,  setExpanded]  = useState(false);
  const [expandedSnippets, setExpandedSnippets] = useState<Set<number>>(new Set());
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function toggleSnippet(idx: number) {
    setExpandedSnippets((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  async function copySnippet(idx: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  // Confidence color coding based on cosine similarity score
  function getSimilarityColor(sim: number) {
    if (sim >= 0.8) return { bar: "bg-[var(--color-success)]",      label: "High"     };
    if (sim >= 0.6) return { bar: "bg-[var(--color-warning)]",      label: "Moderate" };
    return              { bar: "bg-[var(--color-destructive)]",     label: "Low"      };
  }

  return (
    <div className="mt-2 w-full">
      {/* Collapsed toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]
                   hover:text-[var(--color-foreground)] transition-colors group"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} ${sources.length} source citation${sources.length !== 1 ? "s" : ""}`}
      >
        <span
          className={`transition-transform duration-[var(--duration-fast)]
                     ${expanded ? "rotate-90" : "rotate-0"}`}
          aria-hidden="true"
        >
          ›
        </span>
        <span className="underline underline-offset-2 decoration-dotted">
          {sources.length} source{sources.length !== 1 ? "s" : ""} cited
        </span>
      </button>

      {/* Expanded citations */}
      <div
        className={`overflow-hidden transition-all duration-[var(--duration-normal)]
                   ${expanded ? "max-h-[600px] mt-2 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="space-y-2" role="list" aria-label="Source citations">
          {sources.map((source, idx) => {
            const simConfig   = getSimilarityColor(source.similarity);
            const isSnippetExpanded = expandedSnippets.has(idx);
            const isCopied    = copiedIdx === idx;

            return (
              <button
                key={idx}
                role="listitem"
                onClick={() => copySnippet(idx, source.snippet)}
                className="w-full text-left p-3 rounded-[var(--radius-md)] border
                           border-[var(--color-border)] bg-[var(--color-surface)]
                           hover:border-[var(--color-border-strong)]
                           hover:bg-[var(--color-surface-hover)]
                           transition-colors group/citation relative"
                title="Click to copy snippet"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0" aria-hidden="true">📄</span>
                    <span className="text-xs font-semibold text-[var(--color-foreground)] truncate">
                      {source.documentName}
                    </span>
                  </div>
                  <span
                    className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)]
                               text-[var(--color-muted)] whitespace-nowrap"
                  >
                    p. {source.pageNumber}
                  </span>
                </div>

                {/* Similarity meter */}
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className="flex-1 h-1 bg-[var(--color-border)] rounded-full overflow-hidden"
                    role="meter"
                    aria-label={`Similarity: ${Math.round(source.similarity * 100)}%`}
                    aria-valuenow={Math.round(source.similarity * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`h-full rounded-full ${simConfig.bar} transition-all duration-[var(--duration-slow)]`}
                      style={{ width: `${Math.round(source.similarity * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">
                    {simConfig.label} · {Math.round(source.similarity * 100)}%
                  </span>
                </div>

                {/* Snippet */}
                <p
                  className={`mt-2 text-xs italic text-[var(--color-muted)] leading-relaxed
                             ${isSnippetExpanded ? "" : "line-clamp-2"}`}
                >
                  "{source.snippet}"
                </p>

                {source.snippet.length > 120 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSnippet(idx); }}
                    className="mt-1 text-xs text-[var(--color-primary)] hover:underline"
                  >
                    {isSnippetExpanded ? "Show less" : "Show more"}
                  </button>
                )}

                {/* Copy feedback */}
                {isCopied && (
                  <span
                    className="absolute top-2 right-2 text-xs text-[var(--color-success)]
                               bg-[var(--color-success-subtle)] px-2 py-0.5 rounded-full"
                    aria-live="polite"
                  >
                    Copied!
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
