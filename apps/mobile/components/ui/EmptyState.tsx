import React, { memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
  type AccessibilityRole,
} from "react-native";

interface EmptyStateProps {
  /** Large emoji shown as the illustration */
  readonly emoji: string;
  /** Bold headline */
  readonly title: string;
  /** Softer description text below the title */
  readonly subtitle?: string;
  /** Label for the primary CTA button. Omit to hide the button. */
  readonly actionLabel?: string;
  /** Called when the CTA button is pressed */
  readonly onAction?: () => void;
  /** Optional extra styles on the outer container */
  readonly style?: ViewStyle;
}

const BUTTON_ACCESSIBILITY_ROLE: AccessibilityRole = "button";

function EmptyStateComponent({
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps): React.JSX.Element {
  const showCta = Boolean(actionLabel && onAction);

  return (
    <View style={[s.container, style]}>
      {/* Illustration */}
      <Text style={s.emoji} accessibilityElementsHidden>
        {emoji}
      </Text>

      {/* Text */}
      <Text style={s.title}>{title}</Text>

      {subtitle != null ? <Text style={s.subtitle}>{subtitle}</Text> : null}

      {/* CTA */}
      {showCta ? (
        <TouchableOpacity
          style={s.button}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole={BUTTON_ACCESSIBILITY_ROLE}
          accessibilityLabel={actionLabel}
        >
          <Text style={s.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export const EmptyState = memo(EmptyStateComponent);

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
