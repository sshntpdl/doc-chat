import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  type AccessibilityRole,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useAuthStore } from "@docchat/stores";

// ─── TYPES ───────────────────────────────────────────────────────────────────

type VerifyMode = "magic" | "signup";

// useLocalSearchParams requires all values to be string | string[] | undefined
// so we keep the raw param type as string and narrow it ourselves.
interface VerifyScreenParams {
  email: string;
  mode: string;
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const RESEND_COUNTDOWN_SECONDS = 30;
const FLOAT_DISTANCE = -8;
const FLOAT_DURATION_MS = 1200;
const BUTTON_ROLE: AccessibilityRole = "button";
const HEADER_ROLE: AccessibilityRole = "header";

// ─── SCREEN ──────────────────────────────────────────────────────────────────

export default function VerifyScreen(): React.JSX.Element {
  const { email = "", mode: rawMode = "magic" } =
    useLocalSearchParams() as unknown as VerifyScreenParams;

  // Narrow the raw string param to our union type
  const mode: VerifyMode = rawMode === "signup" ? "signup" : "magic";

  const signInWithMagicLink = useAuthStore((s) => s.signInWithMagicLink);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [countdown, setCountdown] = useState(RESEND_COUNTDOWN_SECONDS);
  const [resent, setResent] = useState(false);

  // useRef so the Animated.Value is stable across re-renders
  const floatAnim = useRef(new Animated.Value(0)).current;

  // Floating animation on the envelope emoji
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: FLOAT_DISTANCE,
          duration: FLOAT_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: FLOAT_DURATION_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [floatAnim]);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleResend = useCallback(async (): Promise<void> => {
    if (countdown > 0 || isLoading || email === "") return;
    await signInWithMagicLink(email);
    setCountdown(RESEND_COUNTDOWN_SECONDS);
    setResent(true);
  }, [countdown, isLoading, email, signInWithMagicLink]);

  const handleBackToLogin = useCallback(() => {
    router.replace("/(auth)/login");
  }, []);

  const isSignup = mode === "signup";
  const resendDisabled = countdown > 0 || isLoading;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>
        {/* Animated envelope */}
        <Animated.Text
          style={[s.emoji, { transform: [{ translateY: floatAnim }] }]}
          accessibilityElementsHidden
        >
          ✉️
        </Animated.Text>

        {/* Heading */}
        <Text style={s.title} accessibilityRole={HEADER_ROLE}>
          Check your inbox
        </Text>

        {/* Description */}
        <Text style={s.desc}>
          {isSignup
            ? "We sent a confirmation link to"
            : "We sent a magic link to"}
        </Text>

        <Text style={s.email} accessibilityLabel={`Email: ${email}`}>
          {email}
        </Text>

        <Text style={s.desc}>
          {isSignup
            ? "Click the link in that email to activate your account."
            : "Tap the link in that email to sign in instantly."}
        </Text>

        {/* Resent confirmation */}
        {resent ? (
          <Text style={s.resentNote} accessibilityLiveRegion="polite">
            ✓ Email resent!
          </Text>
        ) : null}

        {/* Resend button — hidden for signup, disabled during countdown */}
        {!isSignup ? (
          <TouchableOpacity
            onPress={() => void handleResend()}
            disabled={resendDisabled}
            style={[s.resendBtn, resendDisabled && s.resendBtnDisabled]}
            accessibilityRole={BUTTON_ROLE}
            accessibilityLabel={
              countdown > 0
                ? `Resend available in ${countdown} seconds`
                : "Resend magic link"
            }
          >
            <Text style={s.resendText}>
              {countdown > 0 ? `Resend in ${countdown}s` : "Resend email"}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Back to login */}
        <TouchableOpacity
          onPress={handleBackToLogin}
          style={s.backBtn}
          accessibilityRole={BUTTON_ROLE}
          accessibilityLabel="Back to sign in"
        >
          <Text style={s.backText}>← Back to sign in</Text>
        </TouchableOpacity>

        {/* Helper tip */}
        <View style={s.tipBox}>
          <Text style={s.tipTitle}>💡 Can't find the email?</Text>
          <Text style={s.tipBody}>
            Check your spam or junk folder. Emails from Supabase Auth sometimes
            land there.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  title: {
    color: "#F1F5F9",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  desc: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  email: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  resentNote: {
    color: "#4ADE80",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  resendBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  resendBtnDisabled: {
    opacity: 0.45,
  },
  resendText: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "600",
  },
  backBtn: {
    paddingVertical: 10,
    marginTop: 4,
  },
  backText: {
    color: "#818CF8",
    fontSize: 14,
  },
  tipBox: {
    marginTop: 24,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
    width: "100%",
    gap: 6,
  },
  tipTitle: {
    color: "#F1F5F9",
    fontSize: 13,
    fontWeight: "600",
  },
  tipBody: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
  },
});
