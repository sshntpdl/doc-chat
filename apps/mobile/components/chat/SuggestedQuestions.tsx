import React, { useRef, useCallback, memo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  type AccessibilityRole,
} from "react-native";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEFAULT_QUESTIONS: readonly string[] = [
  "Summarize this document",
  "What are the key takeaways?",
  "List all main topics covered",
  "What conclusions does this document reach?",
  "Are there any action items or recommendations?",
] as const;

const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;

const PRESS_IN_CONFIG = {
  toValue: 0.97,
  useNativeDriver: true,
  speed: 60,
  bounciness: 0,
} as const;
const PRESS_OUT_CONFIG = {
  toValue: 1,
  useNativeDriver: true,
  speed: 40,
  bounciness: 3,
} as const;

const LIST_ROLE: AccessibilityRole = "list";
const BUTTON_ROLE: AccessibilityRole = "button";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface SuggestedQuestionsProps {
  /** Called with the question text when a chip is tapped */
  readonly onSelect: (question: string) => void;
  /** Override default questions (e.g. derived from document metadata) */
  readonly questions?: readonly string[];
}

interface ChipProps {
  readonly label: string;
  readonly onPress: () => void;
}

const QuestionChip = memo(function QuestionChip({
  label,
  onPress,
}: ChipProps): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, PRESS_IN_CONFIG).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, PRESS_OUT_CONFIG).start();
  }, [scale]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole={BUTTON_ROLE}
      accessibilityLabel={label}
      accessibilityHint="Tap to use this question"
      hitSlop={HIT_SLOP}
    >
      {({ pressed }) => (
        <Animated.View
          style={[s.chip, pressed && s.chipPressed, { transform: [{ scale }] }]}
        >
          <Text style={[s.chipText, pressed && s.chipTextPressed]}>
            {label}
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
});

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

function SuggestedQuestionsComponent({
  onSelect,
  questions = DEFAULT_QUESTIONS,
}: SuggestedQuestionsProps): React.JSX.Element {
  return (
    <View style={s.container}>
      {/* ── Icon ── */}
      <Text style={s.icon} accessible={false}>
        💬
      </Text>

      {/* ── Heading block ── */}
      <View style={s.headingBlock}>
        <Text style={s.heading}>Ask anything about this document</Text>
        <Text style={s.subtext}>
          Or pick a suggested question below to get started
        </Text>
      </View>

      {/* ── Chip grid ── */}
      <View
        style={s.chipGrid}
        accessibilityRole={LIST_ROLE}
        accessibilityLabel="Suggested questions"
      >
        {questions.map((q) => (
          <QuestionChip key={q} label={q} onPress={() => onSelect(q)} />
        ))}
      </View>
    </View>
  );
}

export const SuggestedQuestions = memo(SuggestedQuestionsComponent);

const s = StyleSheet.create({
  // ── Outer wrapper ──────────────────────────────────────────────────────────
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 20,
    gap: 24,
  },

  // ── Emoji icon ─────────────────────────────────────────────────────────────
  icon: {
    fontSize: 48,
    lineHeight: 56,
  },

  // ── Heading + subtext ──────────────────────────────────────────────────────
  headingBlock: {
    alignItems: "center",
    gap: 6,
  },
  heading: {
    fontSize: 18,
    fontWeight: "600",
    color: "#F1F5F9",
    textAlign: "center",
    lineHeight: 26,
  },
  subtext: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 19,
  },

  // ── Chip grid ──────────────────────────────────────────────────────────────
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },

  // ── Individual chip — default ──────────────────────────────────────────────
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1E293B",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#CBD5E1",
    lineHeight: 18,
  },

  // ── Chip — pressed state ───────────────────────────────────────────────────
  chipPressed: {
    borderColor: "#6366F1",
    backgroundColor: "#1E2A45",
  },
  chipTextPressed: {
    color: "#818CF8",
  },
});
