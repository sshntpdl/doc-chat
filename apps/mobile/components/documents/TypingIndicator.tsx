import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeBounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(600 - delay),
        ]),
      );

    const a1 = makeBounce(dot1, 0);
    const a2 = makeBounce(dot2, 150);
    const a3 = makeBounce(dot3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []);

  const dotStyle = (dot: Animated.Value) => ({
    opacity: dot,
    transform: [
      {
        translateY: dot.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -5],
        }),
      },
    ],
  });

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 4,
      }}
      accessibilityLabel="Assistant is typing"
    >
      <Animated.View style={[ti.dot, dotStyle(dot1)]} />
      <Animated.View style={[ti.dot, dotStyle(dot2)]} />
      <Animated.View style={[ti.dot, dotStyle(dot3)]} />
    </View>
  );
}

const ti = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#818CF8",
  },
});
