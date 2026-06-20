// FILE: /apps/mobile/app/auth/login.tsx
//
// Mobile login screen.
// KEY MOBILE UX DECISIONS:
//   - KeyboardAvoidingView keeps the form above the keyboard
//   - ScrollView allows content to scroll on small phones
//   - All touch targets are min 44×44pt (WCAG mobile guideline)
//   - Platform-specific keyboard types (email-address, default)
//   - returnKeyType chains fields: email → password → submit
//   - Magic link flow same as web: submit → "check inbox" state

import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@docchat/stores";
import { supabase } from "../../supabase";

type Mode = "signin" | "signup" | "magic" | "magic-sent";

export default function LoginScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithMagicLink, isLoading } =
    useAuthStore();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const passwordRef = useRef<TextInput>(null);

  // Resend countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleSubmit() {
    setError(null);
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (mode === "magic") {
      const err = await signInWithMagicLink(email.trim(), supabase);
      if (err) {
        setError(err.message);
        return;
      }
      setMode("magic-sent");
      setCountdown(30);
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    const err =
      mode === "signup"
        ? await signUpWithEmail(email.trim(), password, supabase)
        : await signInWithEmail(email.trim(), password, supabase);

    if (err) {
      setError(err.message);
    } else if (mode === "signup") {
      setMode("magic-sent"); // verify email
    }
    // Successful sign-in → root layout redirects to (app)
  }

  // ── Magic sent state ───────────────────────────────────────────────────────
  if (mode === "magic-sent") {
    return (
      <SafeAreaView style={[s.container, s.center]}>
        <Text style={s.bigEmoji}>✉️</Text>
        <Text style={s.heading}>Check your inbox</Text>
        <Text style={s.sub}>
          We sent a magic link to{"\n"}
          <Text style={s.emailHighlight}>{email}</Text>
        </Text>
        <TouchableOpacity
          onPress={async () => {
            if (countdown > 0) return;
            await signInWithMagicLink(email);
            setCountdown(30);
          }}
          disabled={countdown > 0 || isLoading}
          style={[s.outlineBtn, (countdown > 0 || isLoading) && s.disabled]}
          accessibilityLabel={
            countdown > 0 ? `Resend in ${countdown} seconds` : "Resend email"
          }
        >
          <Text style={s.outlineBtnText}>
            {countdown > 0 ? `Resend in ${countdown}s` : "Resend email"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMode("signin")}
          style={{ marginTop: 16 }}
          accessibilityLabel="Back to sign in"
        >
          <Text style={s.link}>← Back to sign in</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={s.header}>
            <Text style={s.logo}>DocChat</Text>
            <Text style={s.tagline}>AI Document Intelligence</Text>
          </View>

          {/* Mode toggle */}
          <View style={s.modeToggle}>
            {(["signin", "signup"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => {
                  setMode(m);
                  setError(null);
                }}
                style={[s.modeBtn, mode === m && s.modeBtnActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
              >
                <Text
                  style={[s.modeBtnText, mode === m && s.modeBtnTextActive]}
                >
                  {m === "signin" ? "Sign In" : "Sign Up"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Error banner */}
          {error && (
            <View style={s.errorBanner} accessibilityRole="alert">
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Magic link toggle */}
          <TouchableOpacity
            onPress={() => setMode(mode === "magic" ? "signin" : "magic")}
            style={s.magicToggle}
          >
            <Text style={s.link}>
              {mode === "magic"
                ? "Use password instead →"
                : "Use magic link instead ✨"}
            </Text>
          </TouchableOpacity>

          {/* Email field */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#64748B"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType={mode === "magic" ? "send" : "next"}
              onSubmitEditing={() => {
                if (mode !== "magic") passwordRef.current?.focus();
                else handleSubmit();
              }}
              accessibilityLabel="Email address"
            />
          </View>

          {/* Password field (hidden for magic link) */}
          {mode !== "magic" && (
            <View style={s.fieldGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.passwordRow}>
                <TextInput
                  ref={passwordRef}
                  style={[s.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  accessibilityLabel="Password"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={s.showHideBtn}
                  accessibilityLabel={
                    showPassword ? "Hide password" : "Show password"
                  }
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={s.showHideText}>
                    {showPassword ? "Hide" : "Show"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Submit button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isLoading}
            style={[s.primaryBtn, isLoading && s.disabled]}
            accessibilityRole="button"
            accessibilityLabel={
              mode === "magic"
                ? "Send magic link"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"
            }
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={s.primaryBtnText}>
                {mode === "magic"
                  ? "Send Magic Link"
                  : mode === "signup"
                    ? "Create Account"
                    : "Sign In"}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
// Using StyleSheet.create instead of NativeWind for the auth screen because
// the design heavily uses dynamic color values from our design token system.

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 40 },

  header: { alignItems: "center", marginBottom: 32 },
  logo: {
    color: "#6366F1",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: -1,
  },
  tagline: { color: "#94A3B8", fontSize: 14, marginTop: 4 },

  modeToggle: {
    flexDirection: "row",
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  modeBtnActive: { backgroundColor: "#6366F1" },
  modeBtnText: { color: "#94A3B8", fontWeight: "600", fontSize: 14 },
  modeBtnTextActive: { color: "#FFFFFF" },

  errorBanner: {
    backgroundColor: "#2D0A0A",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: "#F87171", fontSize: 13, lineHeight: 18 },

  magicToggle: { alignItems: "center", marginBottom: 20 },
  link: { color: "#818CF8", fontSize: 14 },

  fieldGroup: { marginBottom: 16 },
  label: { color: "#F1F5F9", fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#F1F5F9",
    fontSize: 15,
    minHeight: 48, // accessibility: min touch target
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  showHideBtn: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    minWidth: 55,
    alignItems: "center",
  },
  showHideText: { color: "#818CF8", fontSize: 13, fontWeight: "600" },

  primaryBtn: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
    minHeight: 52, // accessibility
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  outlineBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: "center",
    minHeight: 52,
    marginTop: 8,
  },
  outlineBtnText: { color: "#F1F5F9", fontSize: 15, fontWeight: "600" },

  disabled: { opacity: 0.5 },

  bigEmoji: { fontSize: 64, marginBottom: 20 },
  heading: {
    color: "#F1F5F9",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  sub: {
    color: "#94A3B8",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  emailHighlight: { color: "#F1F5F9", fontWeight: "600" },
});
