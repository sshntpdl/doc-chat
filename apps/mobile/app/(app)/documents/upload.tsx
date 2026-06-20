// FILE: apps/mobile/app/(app)/documents/upload.tsx
//
// Document upload screen for mobile.
//
// FLOW:
//   1. User taps "Pick a file" → expo-document-picker opens native file browser
//   2. Validate: type (PDF/MD/TXT) and size (≤ 10 MB) client-side
//   3. Upload via useDocumentStore.uploadDocument()
//      - Store uses fetch() on mobile (XHR causes "Stream Closed" on Android with Next.js)
//      - Store uses XHR on web for real byte-level upload progress
//   4. Poll GET /api/documents/:id every 2s until status = 'ready' (handled by store)
//   5. Show per-step progress UI: Picked → Uploading → Processing → Ready
//   6. On completion: navigate to document list or upload another
//
// WHY THE STORE HANDLES UPLOAD, NOT LOCAL XHR:
//   The documentStore already owns the upload + poll logic and exposes
//   uploadQueue so any screen can observe progress without duplicating XHR code.
//   The mobile path inside the store uses fetch() intentionally — XHR triggers
//   a "Stream Closed" crash on Android when hitting a Next.js API route.

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useAuthStore, useDocumentStore } from "@docchat/stores";
import { EmptyState } from "../../../components/ui/EmptyState";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type UploadStatus =
  | "idle"
  | "picked"
  | "uploading"
  | "processing"
  | "ready"
  | "error";

interface PickedFile {
  name: string;
  size: number;
  uri: string;
  mimeType: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);
const ALLOWED_EXTS = [".pdf", ".txt", ".md"];

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const session = useAuthStore((s) => s.session);
  const uploadDocument = useDocumentStore((s) => s.uploadDocument);
  const uploadQueue = useDocumentStore((s) => s.uploadQueue);

  const [file, setFile] = useState<PickedFile | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0); // 0-100 upload %
  const [error, setError] = useState<string | null>(null);

  // tempId lets us look up this upload's entry in the shared uploadQueue
  const tempIdRef = useRef<string | null>(null);

  // ── Mirror store uploadQueue → local status ───────────────────────────────
  useEffect(() => {
    const tempId = tempIdRef.current;
    if (!tempId) return;

    const item = uploadQueue[tempId];
    if (!item) return;

    setProgress(item.progress ?? 0);

    if (item.status === "uploading") {
      setStatus("uploading");
    } else if (item.status === "processing") {
      setStatus("processing");
      setProgress(100);
    } else if (item.status === "error") {
      setStatus("error");
      setError(item.error ?? "Upload failed. Please try again.");
    }
    // "ready" is handled by the store removing the item from the queue —
    // we catch that in the uploadDocument promise (.then below).
  }, [uploadQueue]);

  // ── Step 1: Pick file ────────────────────────────────────────────────────

  async function handlePick() {
    console.log(
      "[Upload] session:",
      session?.access_token ? "present" : "MISSING",
    );

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/plain", "text/markdown"],
        copyToCacheDirectory: true, // required on Android to get a readable URI
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      // Client-side type validation (double-checked server-side too)
      const ext = asset.name.split(".").pop()?.toLowerCase() ?? "";
      const mimeOk = asset.mimeType ? ALLOWED_TYPES.has(asset.mimeType) : false;
      const extOk = ALLOWED_EXTS.includes(`.${ext}`);
      const decodedName = decodeURIComponent(asset.name);

      if (!mimeOk && !extOk) {
        setError("Only PDF, TXT, and Markdown (.md) files are supported.");
        return;
      }

      if (asset.size && asset.size > MAX_SIZE) {
        setError(
          `File is too large (${(asset.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
        );
        return;
      }

      setError(null);
      setFile({
        name: decodedName,
        size: asset.size ?? 0,
        uri: asset.uri,
        mimeType: asset.mimeType ?? "application/octet-stream",
      });
      setStatus("picked");
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setError("Could not open file picker. Please try again.");
    }
  }

  // ── Step 2: Upload via store ──────────────────────────────────────────────

  async function handleUpload() {
    if (!file) return;

    setStatus("uploading");
    setProgress(0);
    setError(null);

    try {
      // uploadDocument() returns after the store adds the item to the queue
      // and kicks off the upload. Progress updates arrive via the useEffect above.
      await uploadDocument(
        {
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType,
        },
        session?.access_token,
      );

      // Promise resolves once the document is "ready" (store removes queue item)
      setStatus("ready");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      // Error state is also set via the useEffect mirror, but we guard here too
      if (status !== "error") {
        setStatus("error");
        setError(err?.message ?? "Upload failed. Please try again.");
      }
    }
  }

  // ── Cancel: best-effort (store doesn't expose XHR abort externally) ───────

  function handleCancel() {
    // Navigating away stops the UI; the store's in-flight request will complete
    // or error on its own, which is acceptable UX for mobile.
    handleReset();
  }

  // ── Reset for another upload ──────────────────────────────────────────────

  function handleReset() {
    tempIdRef.current = null;
    setStatus("idle");
    setFile(null);
    setProgress(0);
    setError(null);
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={s.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Upload Document</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Idle: no file picked yet ─────────────────────────────────── */}
        {status === "idle" && (
          <EmptyState
            emoji="📂"
            title="Pick a document"
            subtitle={`Supported formats: PDF, TXT, Markdown\nMaximum size: 10 MB`}
            actionLabel="Choose File"
            onAction={handlePick}
            style={s.emptyState}
          />
        )}

        {/* ── File picked / uploading / processing / ready / error ─────── */}
        {status !== "idle" && file && (
          <View style={s.card}>
            {/* File info row */}
            <View style={s.fileRow}>
              <Text style={s.fileIcon}>
                {file.name.endsWith(".pdf") ? "📕" : "📝"}
              </Text>
              <View style={s.fileInfo}>
                <Text style={s.fileName} numberOfLines={2}>
                  {file.name}
                </Text>
                <Text style={s.fileMeta}>{formatSize(file.size)}</Text>
              </View>
            </View>

            {/* Step indicators */}
            <StepIndicator currentStatus={status} progress={progress} />

            {/* Error message */}
            {error && (
              <View style={s.errorBox} accessibilityRole="alert">
                <Text style={s.errorIcon}>⚠️</Text>
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={s.actions}>
              {status === "picked" && (
                <>
                  <TouchableOpacity
                    style={s.primaryBtn}
                    onPress={handleUpload}
                    accessibilityRole="button"
                    accessibilityLabel="Start upload"
                  >
                    <Text style={s.primaryBtnText}>Upload</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.outlineBtn}
                    onPress={handlePick}
                    accessibilityRole="button"
                    accessibilityLabel="Choose a different file"
                  >
                    <Text style={s.outlineBtnText}>Change file</Text>
                  </TouchableOpacity>
                </>
              )}

              {(status === "uploading" || status === "processing") && (
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={handleCancel}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel upload"
                >
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              )}

              {status === "ready" && (
                <>
                  <TouchableOpacity
                    style={s.primaryBtn}
                    onPress={() => router.replace("/documents")}
                    accessibilityRole="button"
                    accessibilityLabel="Go to document library"
                  >
                    <Text style={s.primaryBtnText}>View in Library</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.outlineBtn}
                    onPress={handleReset}
                    accessibilityRole="button"
                    accessibilityLabel="Upload another document"
                  >
                    <Text style={s.outlineBtnText}>Upload another</Text>
                  </TouchableOpacity>
                </>
              )}

              {status === "error" && (
                <>
                  <TouchableOpacity
                    style={s.primaryBtn}
                    onPress={handleReset}
                    accessibilityRole="button"
                    accessibilityLabel="Try again"
                  >
                    <Text style={s.primaryBtnText}>Try again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.outlineBtn}
                    onPress={() => router.back()}
                    accessibilityRole="button"
                  >
                    <Text style={s.outlineBtnText}>Go back</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        {/* Supported formats note */}
        <View style={s.supportedFormats}>
          <Text style={s.supportedTitle}>Supported formats</Text>
          {[
            { icon: "📕", name: "PDF", desc: "Searchable text PDFs" },
            { icon: "📝", name: "Markdown", desc: ".md files" },
            { icon: "📄", name: "Text", desc: "Plain .txt files" },
          ].map((fmt) => (
            <View key={fmt.name} style={s.formatRow}>
              <Text style={s.formatIcon}>{fmt.icon}</Text>
              <Text style={s.formatName}>{fmt.name}</Text>
              <Text style={s.formatDesc}>{fmt.desc}</Text>
            </View>
          ))}
          <Text style={s.sizeNote}>Maximum file size: 10 MB</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STEP INDICATOR ──────────────────────────────────────────────────────────
// Visual pipeline: Picked → Uploading → Processing → Ready

function StepIndicator({
  currentStatus,
  progress,
}: {
  currentStatus: UploadStatus;
  progress: number;
}) {
  const steps: Array<{ key: UploadStatus; label: string }> = [
    { key: "picked", label: "Picked" },
    { key: "uploading", label: "Uploading" },
    { key: "processing", label: "Processing" },
    { key: "ready", label: "Ready" },
  ];

  const ORDER: Record<string, number> = {
    picked: 0,
    uploading: 1,
    processing: 2,
    ready: 3,
    error: 4,
  };
  const currentOrder = ORDER[currentStatus] ?? 0;

  return (
    <View style={si.container}>
      {steps.map((step, idx) => {
        const stepOrder = ORDER[step.key];
        const done = stepOrder < currentOrder;
        const active = stepOrder === currentOrder;
        const isError = currentStatus === "error" && active;

        return (
          <View key={step.key} style={si.step}>
            {/* Connector line (not on first step) */}
            {idx > 0 && <View style={[si.line, done && si.lineDone]} />}

            {/* Circle */}
            <View
              style={[
                si.circle,
                done && si.circleDone,
                active && si.circleActive,
                isError && si.circleError,
              ]}
            >
              {done ? (
                <Text style={si.checkMark}>✓</Text>
              ) : active && currentStatus === "uploading" ? (
                <Text style={si.circleText}>{progress}%</Text>
              ) : (
                <Text style={si.circleText}>{idx + 1}</Text>
              )}
            </View>

            {/* Label */}
            <Text
              style={[si.label, done && si.labelDone, active && si.labelActive]}
            >
              {step.label}
            </Text>

            {/* Spinner for active processing step */}
            {active && currentStatus === "processing" && (
              <ActivityIndicator
                size="small"
                color="#6366F1"
                style={si.spinner}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  backBtn: { color: "#818CF8", fontSize: 15 },
  headerTitle: { color: "#F1F5F9", fontSize: 17, fontWeight: "600" },

  scroll: {
    flexGrow: 1,
    padding: 20,
    gap: 20,
  },

  emptyState: { minHeight: 360 },

  card: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 20,
  },

  fileRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  fileIcon: { fontSize: 36, marginTop: 2 },
  fileInfo: { flex: 1 },
  fileName: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  fileMeta: { color: "#64748B", fontSize: 12, marginTop: 4 },

  errorBox: {
    backgroundColor: "#2D0A0A",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#7F1D1D",
  },
  errorIcon: { fontSize: 16 },
  errorText: { color: "#FCA5A5", fontSize: 13, lineHeight: 19, flex: 1 },

  actions: { gap: 10 },
  primaryBtn: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  outlineBtn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  outlineBtnText: { color: "#94A3B8", fontSize: 15, fontWeight: "600" },
  cancelBtn: {
    borderWidth: 1,
    borderColor: "#7F1D1D",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  cancelBtnText: { color: "#F87171", fontSize: 15, fontWeight: "600" },

  supportedFormats: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 10,
  },
  supportedTitle: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  formatRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  formatIcon: { fontSize: 18, width: 24 },
  formatName: { color: "#F1F5F9", fontSize: 13, fontWeight: "600", width: 72 },
  formatDesc: { color: "#64748B", fontSize: 12 },
  sizeNote: { color: "#475569", fontSize: 11, marginTop: 4 },
});

const si = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  step: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  line: {
    position: "absolute",
    top: 14,
    right: "50%",
    left: "-50%",
    height: 2,
    backgroundColor: "#334155",
  },
  lineDone: { backgroundColor: "#6366F1" },

  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  circleDone: { backgroundColor: "#6366F1" },
  circleActive: {
    backgroundColor: "#4F46E5",
    borderWidth: 2,
    borderColor: "#818CF8",
  },
  circleError: { backgroundColor: "#DC2626" },

  circleText: { color: "#94A3B8", fontSize: 10, fontWeight: "700" },
  checkMark: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },

  label: { color: "#475569", fontSize: 10, textAlign: "center" },
  labelDone: { color: "#6366F1" },
  labelActive: { color: "#F1F5F9", fontWeight: "600" },

  spinner: { position: "absolute", top: 32 },
});
