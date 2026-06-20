// FILE: apps/mobile/app/auth/verify.tsx
//
// Shown in two situations:
//
//   1. After sign-up → "Check your inbox" (awaiting email confirmation)
//   2. After magic-link request → "Check your inbox" (awaiting click)
//
// The user arrives here via router.push('/auth/verify?email=...&mode=...')
// from the login screen after a successful form submission.
//
// Deep-link handling (actually processing the token) lives in _layout.tsx
// via Linking.addEventListener — this screen is just the waiting UI.

import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useAuthStore } from "@docchat/stores";

export default function VerifyScreen() {
  const { email = "", mode = "magic" } = useLocalSearchParams<{
    email: string;
    /** "magic" = magic link login | "signup" = email confirmation */
    mode: "magic" | "signup";
  }>();

  const signInWithMagicLink = useAuthStore((s) => s.signInWithMagicLink);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [countdown, setCountdown] = useState(30);
  const [resent, setResent] = useState(false);

  // Floating animation on the envelope emoji
  const floatAnim = new Animated.Value(0);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleResend() {
    if (countdown > 0 || isLoading || !email) return;
    await signInWithMagicLink(email);
    setCountdown(30);
    setResent(true);
  }

  const isSignup = mode === "signup";

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
        <Text style={s.title} accessibilityRole="header">
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
        {resent && (
          <Text style={s.resentNote} accessibilityLiveRegion="polite">
            ✓ Email resent!
          </Text>
        )}

        {/* Resend button — disabled during countdown */}
        {!isSignup && (
          <TouchableOpacity
            onPress={handleResend}
            disabled={countdown > 0 || isLoading}
            style={[
              s.resendBtn,
              (countdown > 0 || isLoading) && s.resendBtnDisabled,
            ]}
            accessibilityRole="button"
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
        )}

        {/* Back to login */}
        <TouchableOpacity
          onPress={() => router.replace("/auth/login" as any)}
          style={s.backBtn}
          accessibilityRole="button"
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
