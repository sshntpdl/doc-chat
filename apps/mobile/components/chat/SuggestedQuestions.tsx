// FILE: apps/mobile/components/chat/SuggestedQuestions.tsx
//
// Clickable question chips shown only when the chat is empty.
// Tapping a chip fires onSelect(question) so the parent can
// populate ChatInput (and optionally auto-send).
//
// FEATURE PARITY WITH WEB:
//   ✅ DEFAULT_QUESTIONS constant + `questions` override prop
//   ✅ Centered empty-state layout: icon → heading → subtext → chips
//   ✅ Wrapping chip grid (flexWrap row, justify center)
//   ✅ Press-scale animation  — mirrors web's  active:scale-[0.97]
//   ✅ Primary-color highlight on press — mirrors web's hover:border/text-primary
//   ✅ Full accessibility (role="list", accessibilityLabel per chip)
//
// MOBILE-SPECIFIC DECISIONS:
//   - Animated.Value spring for the scale bounce (no CSS transitions available)
//   - Pressable `pressed` state drives border/text colour change synchronously
//   - hitSlop enlarges tap target without changing visual size
//   - No ScrollView needed — 5 short chips wrap into ≤ 3 rows on any phone

import { useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  type ViewStyle,
} from "react-native";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEFAULT_QUESTIONS = [
  "Summarize this document",
  "What are the key takeaways?",
  "List all main topics covered",
  "What conclusions does this document reach?",
  "Are there any action items or recommendations?",
];

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface SuggestedQuestionsProps {
  /** Called with the question text when a chip is tapped */
  onSelect: (question: string) => void;
  /** Override default questions (e.g. derived from document metadata) */
  questions?: string[];
}

// ─── QUESTION CHIP ───────────────────────────────────────────────────────────
// Mirrors web:  active:scale-[0.97]  +  hover:border/text-[color-primary]
//
// Implementation note: we use a single Animated.Value for scale so that rapid
// taps never leave the chip stuck at 0.97. The Pressable `pressed` boolean
// drives the colour change in-sync with the native gesture recogniser.

interface ChipProps {
  label: string;
  onPress: () => void;
}

function QuestionChip({ label, onPress }: ChipProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 60,
      bounciness: 0,
    }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 3,
    }).start();
  }, [scale]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Tap to use this question"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {/* `pressed` drives the highlighted style — matches web hover:border/text-primary */}
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
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function SuggestedQuestions({
  onSelect,
  questions = DEFAULT_QUESTIONS,
}: SuggestedQuestionsProps) {
  return (
    <View style={s.container}>
      {/* ── Icon ── */}
      <Text
        style={s.icon}
        accessible={false} // decorative — matches web's aria-hidden="true"
      >
        💬
      </Text>

      {/* ── Heading block ── */}
      <View style={s.headingBlock}>
        <Text style={s.heading}>Ask anything about this document</Text>
        <Text style={s.subtext}>
          Or pick a suggested question below to get started
        </Text>
      </View>

      {/* ── Chip grid ──
          accessibilityRole="list" mirrors the web's role="list".
          Each chip carries its own accessibilityRole="button" + label. */}
      <View
        style={s.chipGrid}
        accessibilityRole="list"
        accessibilityLabel="Suggested questions"
      >
        {questions.map((q) => (
          <QuestionChip key={q} label={q} onPress={() => onSelect(q)} />
        ))}
      </View>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
// Colour palette kept consistent with MessageBubble.tsx and SourceCitation.tsx:
//   Background surface  → #1E293B
//   Border default      → #334155
//   Border / text hover → #6366F1  (indigo — colour-primary)
//   Foreground          → #F1F5F9
//   Muted               → #64748B

const s = StyleSheet.create({
  // ── Outer wrapper ──────────────────────────────────────────────────────────
  // flex: 1 so it occupies the full empty chat area above ChatInput.
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
    lineHeight: 56, // prevents clipping on Android
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
  // flexWrap: "wrap" + justifyContent: "center" replicates the web's
  //   flex-wrap gap-2 justify-center  Tailwind classes.
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
    borderRadius: 999, // rounded-full
    borderWidth: 1,
    borderColor: "#334155", // var(--color-border)
    backgroundColor: "#1E293B", // var(--color-surface)
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#CBD5E1", // var(--color-foreground) at reduced brightness
    lineHeight: 18,
  },

  // ── Chip — pressed state ───────────────────────────────────────────────────
  // Mirrors  hover:border-[color-primary]  hover:text-[color-primary]
  chipPressed: {
    borderColor: "#6366F1", // var(--color-primary)
    backgroundColor: "#1E2A45", // subtly brighter than resting state
  },
  chipTextPressed: {
    color: "#818CF8", // var(--color-primary) lightened for dark bg
  },
});
