// FILE: apps/web/components/chat/SuggestedQuestions.tsx
"use client";
// Clickable question chips shown only when the chat is empty.
// Tapping a chip populates the textarea and focuses it so the
// user can send immediately or edit before sending.

const DEFAULT_QUESTIONS = [
  "Summarize this document",
  "What are the key takeaways?",
  "List all main topics covered",
  "What conclusions does this document reach?",
  "Are there any action items or recommendations?",
];

interface SuggestedQuestionsProps {
  /** Called with the question text when a chip is clicked */
  onSelect: (question: string) => void;
  /** Override default questions (e.g. from document metadata) */
  questions?: string[];
}

export function SuggestedQuestions({
  onSelect,
  questions = DEFAULT_QUESTIONS,
}: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      {/* Icon */}
      <span className="text-5xl select-none" aria-hidden="true">
        💬
      </span>

      {/* Heading */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-foreground)]">
          Ask anything about this document
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Or pick a suggested question below to get started
        </p>
      </div>

      {/* Question chips */}
      <div
        className="flex flex-wrap gap-2 justify-center max-w-lg"
        role="list"
        aria-label="Suggested questions"
      >
        {questions.map((q) => (
          <button
            key={q}
            role="listitem"
            onClick={() => onSelect(q)}
            className="px-4 py-2 rounded-[var(--radius-full)] text-sm
                       border border-[var(--color-border)] bg-[var(--color-surface)]
                       text-[var(--color-foreground)]
                       hover:bg-[var(--color-surface-hover)]
                       hover:border-[var(--color-primary)]
                       hover:text-[var(--color-primary)]
                       active:scale-[0.97] transition-all
                       focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
