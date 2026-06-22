import React, { useState, useRef, useEffect, useCallback, memo } from "react";
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
  type AccessibilityRole,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@docchat/stores";
import { supabase } from "../../supabase";

// ─── TYPES ───────────────────────────────────────────────────────────────────

type LoginMode = "signin" | "signup" | "magic" | "magic-sent";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const RESEND_COUNTDOWN_SECONDS = 30;
const BUTTON_ROLE: AccessibilityRole = "button";
const TAB_ROLE: AccessibilityRole = "tab";
const ALERT_ROLE: AccessibilityRole = "alert";
const IOS_KAV_BEHAVIOR = "padding" as const;
const ANDROID_KAV_BEHAVIOR = "height" as const;

// ─── MAGIC-SENT SUB-SCREEN ───────────────────────────────────────────────────

interface MagicSentViewProps {
  readonly email: string;
  readonly countdown: number;
  readonly isLoading: boolean;
  readonly onResend: () => void;
  readonly onBack: () => void;
}

const MagicSentView = memo(function MagicSentView({
  email,
  countdown,
  isLoading,
  onResend,
  onBack,
}: MagicSentViewProps): React.JSX.Element {
  const resendDisabled = countdown > 0 || isLoading;

  return (
    <SafeAreaView style={[s.container, s.center]}>
      <Text style={s.bigEmoji}>✉️</Text>

      <Text style={s.heading}>Check your inbox</Text>

      <Text style={s.sub}>
        We sent a magic link to{"\n"}
        <Text style={s.emailHighlight}>{email}</Text>
      </Text>

      <TouchableOpacity
        onPress={onResend}
        disabled={resendDisabled}
        style={[s.outlineBtn, resendDisabled && s.disabled]}
        accessibilityRole={BUTTON_ROLE}
        accessibilityLabel={
          countdown > 0 ? `Resend in ${countdown} seconds` : "Resend email"
        }
      >
        <Text style={s.outlineBtnText}>
          {countdown > 0 ? `Resend in ${countdown}s` : "Resend email"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onBack}
        style={s.backLink}
        accessibilityRole={BUTTON_ROLE}
        accessibilityLabel="Back to sign in"
      >
        <Text style={s.link}>← Back to sign in</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
});

// ─── MAIN LOGIN SCREEN ────────────────────────────────────────────────────────

export default function LoginScreen(): React.JSX.Element {
  const { signInWithEmail, signUpWithEmail, signInWithMagicLink, isLoading } =
    useAuthStore();

  const [mode, setMode] = useState<LoginMode>("signin");
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

  const handleSubmit = useCallback(async (): Promise<void> => {
    setError(null);

    if (email.trim() === "") {
      setError("Email is required");
      return;
    }

    if (mode === "magic") {
      const err = await signInWithMagicLink(email.trim(), supabase);
      if (err != null) {
        setError(err.message);
        return;
      }
      setMode("magic-sent");
      setCountdown(RESEND_COUNTDOWN_SECONDS);
      return;
    }

    if (password === "") {
      setError("Password is required");
      return;
    }

    const err =
      mode === "signup"
        ? await signUpWithEmail(email.trim(), password, supabase)
        : await signInWithEmail(email.trim(), password, supabase);

    if (err != null) {
      setError(err.message);
    } else if (mode === "signup") {
      setMode("magic-sent");
    }
    // Successful sign-in → root layout redirects to (app)
  }, [
    email,
    mode,
    password,
    signInWithEmail,
    signUpWithEmail,
    signInWithMagicLink,
  ]);

  const handleResend = useCallback(async (): Promise<void> => {
    if (countdown > 0 || isLoading) return;
    await signInWithMagicLink(email, supabase);
    setCountdown(RESEND_COUNTDOWN_SECONDS);
  }, [countdown, isLoading, email, signInWithMagicLink]);

  const handleModeToggle = useCallback((next: "signin" | "signup") => {
    setMode(next);
    setError(null);
  }, []);

  const handleMagicToggle = useCallback(() => {
    setMode((prev) => (prev === "magic" ? "signin" : "magic"));
  }, []);

  const handleShowPassword = useCallback(() => {
    setShowPassword((v) => !v);
  }, []);

  const handleEmailSubmit = useCallback(() => {
    if (mode !== "magic") {
      passwordRef.current?.focus();
    } else {
      void handleSubmit();
    }
  }, [mode, handleSubmit]);

  const handleBackToSignIn = useCallback(() => {
    setMode("signin");
  }, []);

  // ── Magic sent state ────────────────────────────────────────────────────────
  if (mode === "magic-sent") {
    return (
      <MagicSentView
        email={email}
        countdown={countdown}
        isLoading={isLoading}
        onResend={() => void handleResend()}
        onBack={handleBackToSignIn}
      />
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  const kvBehavior =
    Platform.OS === "ios" ? IOS_KAV_BEHAVIOR : ANDROID_KAV_BEHAVIOR;
  const kvOffset = Platform.OS === "ios" ? 0 : 20;

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={kvBehavior}
        style={s.flex}
        keyboardVerticalOffset={kvOffset}
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
                onPress={() => handleModeToggle(m)}
                style={[s.modeBtn, mode === m && s.modeBtnActive]}
                accessibilityRole={TAB_ROLE}
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
          {error != null ? (
            <View style={s.errorBanner} accessibilityRole={ALERT_ROLE}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Magic link toggle */}
          <TouchableOpacity
            onPress={handleMagicToggle}
            style={s.magicToggle}
            accessibilityRole={BUTTON_ROLE}
            accessibilityLabel={
              mode === "magic"
                ? "Switch to password login"
                : "Switch to magic link login"
            }
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
              onSubmitEditing={handleEmailSubmit}
              accessibilityLabel="Email address"
            />
          </View>

          {/* Password field (hidden for magic link) */}
          {mode !== "magic" ? (
            <View style={s.fieldGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.passwordRow}>
                <TextInput
                  ref={passwordRef}
                  style={[s.input, s.flex]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  returnKeyType="done"
                  onSubmitEditing={() => void handleSubmit()}
                  accessibilityLabel="Password"
                />
                <TouchableOpacity
                  onPress={handleShowPassword}
                  style={s.showHideBtn}
                  accessibilityRole={BUTTON_ROLE}
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
          ) : null}

          {/* Submit button */}
          <TouchableOpacity
            onPress={() => void handleSubmit()}
            disabled={isLoading}
            style={[s.primaryBtn, isLoading && s.disabled]}
            accessibilityRole={BUTTON_ROLE}
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

const s = StyleSheet.create({
  flex: { flex: 1 },
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
  label: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#F1F5F9",
    fontSize: 15,
    minHeight: 48,
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
    minHeight: 52,
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
    width: "100%",
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
  backLink: { marginTop: 16 },
});
