import React, { useEffect, useRef, memo } from "react";
import { Animated, StyleSheet, View } from "react-native";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DOT_UP_DURATION = 300;
const DOT_DOWN_DURATION = 300;
const DOT_CYCLE_DURATION = 600;
const DOT_OFFSETS = [0, 150, 300] as const;
const DOT_TRANSLATE_UP = -5;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function makeBounce(
  dot: Animated.Value,
  delay: number,
): Animated.CompositeAnimation {
  return Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(dot, {
        toValue: 1,
        duration: DOT_UP_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(dot, {
        toValue: 0,
        duration: DOT_DOWN_DURATION,
        useNativeDriver: true,
      }),
      Animated.delay(DOT_CYCLE_DURATION - delay),
    ]),
  );
}

function dotAnimStyle(dot: Animated.Value): {
  opacity: Animated.Value;
  transform: Array<{ translateY: Animated.AnimatedInterpolation<number> }>;
} {
  return {
    opacity: dot,
    transform: [
      {
        translateY: dot.interpolate({
          inputRange: [0, 1],
          outputRange: [0, DOT_TRANSLATE_UP],
        }),
      },
    ],
  };
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

function TypingIndicatorComponent(): React.JSX.Element {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animations = [
      makeBounce(dot1, DOT_OFFSETS[0]),
      makeBounce(dot2, DOT_OFFSETS[1]),
      makeBounce(dot3, DOT_OFFSETS[2]),
    ];

    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dot1, dot2, dot3]);

  return (
    <View style={s.container} accessibilityLabel="Assistant is typing">
      <Animated.View style={[s.dot, dotAnimStyle(dot1)]} />
      <Animated.View style={[s.dot, dotAnimStyle(dot2)]} />
      <Animated.View style={[s.dot, dotAnimStyle(dot3)]} />
    </View>
  );
}

export const TypingIndicator = memo(TypingIndicatorComponent);

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#818CF8",
  },
});
