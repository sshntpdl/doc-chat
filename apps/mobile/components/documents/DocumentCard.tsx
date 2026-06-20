// FILE: apps/mobile/components/documents/DocumentCard.tsx
//
// Reusable document card used in:
//   - Document list screen (documents/index.tsx) — full row with swipe
//   - Upload screen (documents/upload.tsx) — compact form in upload queue
//
// Two variants controlled by the `variant` prop:
//   "row"     → full-width list row with status badge (default)
//   "compact" → smaller card for showing upload queue items

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import type { Document } from "@docchat/types";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const FILE_ICONS: Record<string, string> = {
  pdf: "📕",
  markdown: "📝",
  text: "📄",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "Ready",
  processing: "Processing…",
  partial: "Partial",
  error: "Error",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ready: { bg: "#052E16", text: "#4ADE80" },
  processing: { bg: "#1C1400", text: "#FCD34D" },
  partial: { bg: "#1C1400", text: "#FCD34D" },
  error: { bg: "#2D0A0A", text: "#F87171" },
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface DocumentCardProps {
  document: Document;
  variant?: "row" | "compact";
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  style?: ViewStyle;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export function DocumentCard({
  document: doc,
  variant = "row",
  onPress,
  onLongPress,
  selected = false,
  style,
}: DocumentCardProps) {
  const statusCfg = STATUS_COLORS[doc.status] ?? STATUS_COLORS.error;
  const icon = FILE_ICONS[doc.type] ?? "📄";

  // ── Compact variant (upload queue, small list) ────────────────────────────
  if (variant === "compact") {
    return (
      <View style={[s.compactCard, style]}>
        <Text style={s.compactIcon}>{icon}</Text>
        <View style={s.compactInfo}>
          <Text style={s.compactName} numberOfLines={1}>
            {doc.name}
          </Text>
          <Text style={s.compactMeta}>
            {formatSize(doc.size)}
            {doc.chunkCount > 0 ? ` · ${doc.chunkCount} chunks` : ""}
          </Text>
        </View>
        <View style={[s.badge, { backgroundColor: statusCfg.bg }]}>
          <Text style={[s.badgeText, { color: statusCfg.text }]}>
            {STATUS_LABELS[doc.status]}
          </Text>
        </View>
      </View>
    );
  }

  // ── Row variant (full-width list item) ────────────────────────────────────
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      activeOpacity={0.7}
      style={[s.row, selected && s.rowSelected, style]}
      accessibilityRole="button"
      accessibilityLabel={`${doc.name}, ${STATUS_LABELS[doc.status]}`}
      accessibilityState={{ selected }}
    >
      {/* Checkbox (shown in multi-select mode when `selected` is managed externally) */}
      {selected !== undefined && onLongPress && (
        <View style={[s.checkbox, selected && s.checkboxChecked]}>
          {selected && <Text style={s.checkMark}>✓</Text>}
        </View>
      )}

      {/* File icon */}
      <Text style={s.icon}>{icon}</Text>

      {/* Info */}
      <View style={s.info}>
        <Text style={s.name} numberOfLines={1}>
          {doc.name}
        </Text>
        <Text style={s.meta}>
          {formatDate(doc.createdAt)} · {formatSize(doc.size)}
        </Text>
        {doc.status === "error" && (
          <Text style={s.errorText} numberOfLines={1}>
            Processing failed — try re-uploading
          </Text>
        )}
      </View>

      {/* Status badge */}
      <View style={[s.badge, { backgroundColor: statusCfg.bg }]}>
        <Text
          style={[s.badgeText, { color: statusCfg.text }]}
          accessibilityLabel={`Status: ${STATUS_LABELS[doc.status]}`}
        >
          {STATUS_LABELS[doc.status]}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Row variant
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#0F172A",
    minHeight: 68,
    gap: 12,
  },
  rowSelected: {
    backgroundColor: "#1E1B4B",
  },
  icon: { fontSize: 26 },
  info: { flex: 1, gap: 3 },
  name: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "600",
  },
  meta: {
    color: "#64748B",
    fontSize: 12,
  },
  errorText: {
    color: "#F87171",
    fontSize: 11,
    marginTop: 2,
  },

  // Checkbox (multi-select)
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
  },
  checkMark: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Status badge (shared)
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Compact variant
  compactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: "#1E293B",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  compactIcon: { fontSize: 22 },
  compactInfo: { flex: 1 },
  compactName: {
    color: "#F1F5F9",
    fontSize: 13,
    fontWeight: "600",
  },
  compactMeta: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 2,
  },
});
