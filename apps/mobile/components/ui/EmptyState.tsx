// FILE: apps/mobile/components/ui/EmptyState.tsx
//
// Reusable full-screen empty state used across the app:
//   - No documents uploaded yet (Library screen)
//   - No chat selected yet (Chat tab)
//   - Search returns zero results
//
// Props are intentionally flexible so one component covers every scenario.

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
} from "react-native";

interface EmptyStateProps {
  /** Large emoji shown as the illustration */
  emoji: string;
  /** Bold headline */
  title: string;
  /** Softer description text below the title */
  subtitle?: string;
  /** Label for the primary CTA button. Omit to hide the button. */
  actionLabel?: string;
  /** Called when the CTA button is pressed */
  onAction?: () => void;
  /** Optional extra styles on the outer container */
  style?: ViewStyle;
}

export function EmptyState({
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  return (
    <View style={[s.container, style]}>
      {/* Illustration */}
      <Text style={s.emoji} accessibilityElementsHidden>
        {emoji}
      </Text>

      {/* Text */}
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}

      {/* CTA */}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={s.button}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={s.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 20,
    textAlign: "center",
  },
  title: {
    color: "#F1F5F9",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  button: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
