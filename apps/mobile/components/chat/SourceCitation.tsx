// FILE: apps/mobile/components/chat/SourceCitation.tsx
//
// Expandable source citation list shown below each AI message.
// Collapsed by default to save vertical space on mobile.
//
// Shows:
//   - Document name + page number
//   - Similarity confidence bar (green/yellow/red)
//   - Truncated snippet (expandable per-item)
//
// Uses LayoutAnimation for smooth expand/collapse without reanimated.

import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import type { SourceCitation as Citation } from "@docchat/types";

// Enable LayoutAnimation on Android (iOS has it enabled by default)
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface SourceCitationProps {
  sources: Citation[];
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function SourceCitation({ sources }: SourceCitationProps) {
  const [expanded, setExpanded] = useState(false);

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }

  const count = sources.length;

  return (
    <View style={s.wrapper}>
      {/* Toggle button */}
      <TouchableOpacity
        onPress={toggle}
        style={s.toggleRow}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Hide" : "Show"} ${count} source citation${count !== 1 ? "s" : ""}`}
        accessibilityState={{ expanded }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={s.chevron}>{expanded ? "▾" : "▸"}</Text>
        <Text style={s.toggleText}>
          {count} source{count !== 1 ? "s" : ""} cited
        </Text>
      </TouchableOpacity>

      {/* Citation cards (visible when expanded) */}
      {expanded && (
        <View style={s.list}>
          {sources.map((src, idx) => (
            <CitationCard key={idx} source={src} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── INDIVIDUAL CITATION CARD ────────────────────────────────────────────────

function CitationCard({ source }: { source: Citation }) {
  const [snippetExpanded, setSnippetExpanded] = useState(false);

  // Confidence colour coding based on cosine similarity (0–1)
  function getConfidence(sim: number): { color: string; label: string } {
    if (sim >= 0.8) return { color: "#4ADE80", label: "High" };
    if (sim >= 0.6) return { color: "#FCD34D", label: "Moderate" };
    return { color: "#F87171", label: "Low" };
  }

  const pct = Math.round(source.similarity * 100);
  const confidence = getConfidence(source.similarity);

  return (
    <View style={s.card}>
      {/* Header row */}
      <View style={s.cardHeader}>
        <Text style={s.cardIcon}>📄</Text>
        <View style={s.cardTitleBlock}>
          <Text style={s.cardName} numberOfLines={1}>
            {source.documentName}
          </Text>
          <Text style={s.cardPage}>Page {source.pageNumber}</Text>
        </View>
      </View>

      {/* Similarity bar */}
      <View style={s.simRow}>
        <View style={s.simTrack}>
          <View
            style={[
              s.simFill,
              { width: `${pct}%` as any, backgroundColor: confidence.color },
            ]}
          />
        </View>
        <Text style={[s.simLabel, { color: confidence.color }]}>
          {confidence.label} · {pct}%
        </Text>
      </View>

      {/* Snippet */}
      <Text style={s.snippet} numberOfLines={snippetExpanded ? undefined : 3}>
        "{source.snippet}"
      </Text>

      {source.snippet.length > 120 && (
        <TouchableOpacity
          onPress={() => setSnippetExpanded((v) => !v)}
          hitSlop={{ top: 6, bottom: 6 }}
        >
          <Text style={s.snippetToggle}>
            {snippetExpanded ? "Show less" : "Show more"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    marginTop: 6,
    gap: 6,
  },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
  },
  chevron: {
    color: "#818CF8",
    fontSize: 14,
  },
  toggleText: {
    color: "#818CF8",
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  list: {
    gap: 8,
  },

  card: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 8,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardIcon: { fontSize: 18 },
  cardTitleBlock: { flex: 1 },
  cardName: {
    color: "#F1F5F9",
    fontSize: 13,
    fontWeight: "600",
  },
  cardPage: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 1,
  },

  simRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  simTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "#334155",
    borderRadius: 2,
    overflow: "hidden",
  },
  simFill: {
    height: 4,
    borderRadius: 2,
  },
  simLabel: {
    fontSize: 11,
    fontWeight: "600",
    minWidth: 80,
    textAlign: "right",
  },

  snippet: {
    color: "#94A3B8",
    fontSize: 12,
    fontStyle: "italic",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
    backgroundColor: "#0F172A",
    borderLeftWidth: 3,
    borderLeftColor: "#6366F1",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2,
  },
  snippetToggle: {
    color: "#818CF8",
    fontSize: 11,
    marginTop: 2,
  },
});
