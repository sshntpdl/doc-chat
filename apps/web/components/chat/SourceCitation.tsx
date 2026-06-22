// FILE: /apps/web/components/chat/SourceCitation.tsx
"use client";

import { useState } from "react";
import type { SourceCitation as Citation } from "@docchat/types";

interface Props {
  sources: Citation[];
}

export function SourceCitation({ sources }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedSnippets, setExpandedSnippets] = useState<Set<number>>(
    new Set(),
  );
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

  // Confidence color — used only inside the expanded snippet drawer
  function getSimilarityColor(sim: number): {
    bar: string;
    label: string;
    dot: string;
  } {
    if (sim >= 0.8)
      return {
        bar: "bg-[var(--color-success)]",
        label: "High",
        dot: "bg-[var(--color-success)]",
      };
    if (sim >= 0.6)
      return {
        bar: "bg-[var(--color-warning)]",
        label: "Moderate",
        dot: "bg-[var(--color-warning)]",
      };
    return {
      bar: "bg-[var(--color-destructive)]",
      label: "Low",
      dot: "bg-[var(--color-destructive)]",
    };
  }

  return (
    <div className="mt-1.5 w-full">
      {/* ── Toggle row ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs
                   text-[var(--color-muted-foreground)]
                   hover:text-[var(--color-foreground)]
                   transition-colors select-none"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} ${sources.length} source${sources.length !== 1 ? "s" : ""}`}
      >
        {/* Chevron */}
        <span
          className={`inline-block transition-transform duration-[var(--duration-fast)]
                     text-[var(--color-muted-foreground)]
                     ${expanded ? "rotate-90" : "rotate-0"}`}
          aria-hidden="true"
        >
          ›
        </span>

        <span className="font-medium">
          {expanded ? "Hide" : "Show"} sources
        </span>

        {/* Pill badge with count */}
        <span
          className="inline-flex items-center justify-center
                     min-w-[1.25rem] h-5 px-1.5 rounded-full
                     text-[0.65rem] font-semibold leading-none
                     bg-[var(--color-surface-hover)]
                     border border-[var(--color-border)]
                     text-[var(--color-muted-foreground)]"
          aria-hidden="true"
        >
          {sources.length}
        </span>
      </button>

      {/* ── Expanded source list ── */}
      <div
        className={`overflow-hidden transition-all duration-[var(--duration-normal)]
                   ${expanded ? "max-h-[800px] mt-2 opacity-100" : "max-h-0 opacity-0"}`}
      >
        <ol className="space-y-1" role="list" aria-label="Source citations">
          {sources.map((source, idx) => {
            const simConfig = getSimilarityColor(source.similarity);
            const isSnippetExpanded = expandedSnippets.has(idx);
            const isCopied = copiedIdx === idx;
            const citationNumber = idx + 1;

            return (
              <li key={idx} role="listitem">
                {/* ── Source row ── */}
                <div
                  className="flex items-start gap-2.5 group/row
                             py-1.5 px-0 rounded-[var(--radius-sm)]"
                >
                  {/* Number circle — matches the mobile numbered badges */}
                  <span
                    className="shrink-0 inline-flex items-center justify-center
                               w-5 h-5 mt-0.5 rounded-full
                               text-[0.6rem] font-bold leading-none
                               bg-[var(--color-surface-hover)]
                               border border-[var(--color-border)]
                               text-[var(--color-muted-foreground)]"
                    aria-hidden="true"
                  >
                    {citationNumber}
                  </span>

                  {/* Right side: doc name + page + actions */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      {/* Document name — primary label */}
                      <span
                        className="text-xs font-medium text-[var(--color-foreground)] truncate"
                        title={source.documentName}
                      >
                        {source.documentName}
                      </span>

                      {/* Page number — muted, always visible */}
                      <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
                        p. {source.pageNumber}
                      </span>
                    </div>

                    {/* ── Expandable snippet drawer ── */}
                    {source.snippet && (
                      <>
                        {isSnippetExpanded && (
                          <div className="mt-1.5 space-y-1.5">
                            {/* Snippet text */}
                            <p
                              className="text-xs italic leading-relaxed
                                         text-[var(--color-muted-foreground)]
                                         border-l-2 border-[var(--color-border)]
                                         pl-2"
                            >
                              "{source.snippet}"
                            </p>

                            {/* Similarity meter — tucked inside snippet */}
                            <div className="flex items-center gap-2">
                              <div
                                className="flex-1 h-0.5 bg-[var(--color-border)] rounded-full overflow-hidden"
                                role="meter"
                                aria-label={`Similarity: ${Math.round(source.similarity * 100)}%`}
                                aria-valuenow={Math.round(
                                  source.similarity * 100,
                                )}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              >
                                <div
                                  className={`h-full rounded-full ${simConfig.bar}
                                             transition-all duration-[var(--duration-slow)]`}
                                  style={{
                                    width: `${Math.round(source.similarity * 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[0.65rem] text-[var(--color-muted-foreground)] whitespace-nowrap">
                                {simConfig.label} ·{" "}
                                {Math.round(source.similarity * 100)}%
                              </span>
                            </div>

                            {/* Copy snippet button */}
                            <button
                              onClick={() => copySnippet(idx, source.snippet)}
                              className="text-[0.65rem] text-[var(--color-muted-foreground)]
                                         hover:text-[var(--color-foreground)]
                                         transition-colors"
                              aria-label={isCopied ? "Copied!" : "Copy snippet"}
                            >
                              {isCopied ? "✓ Copied" : "Copy snippet"}
                            </button>
                          </div>
                        )}

                        {/* Expand / collapse snippet toggle */}
                        <button
                          onClick={() => toggleSnippet(idx)}
                          className="mt-0.5 text-[0.65rem] text-[var(--color-primary)]
                                     hover:underline transition-colors"
                          aria-expanded={isSnippetExpanded}
                          aria-label={
                            isSnippetExpanded ? "Hide excerpt" : "Show excerpt"
                          }
                        >
                          {isSnippetExpanded ? "Hide excerpt" : "View excerpt"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Divider between items (not after last) */}
                {idx < sources.length - 1 && (
                  <div className="ml-[1.875rem] h-px bg-[var(--color-border)] opacity-60" />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
