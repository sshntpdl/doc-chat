// FILE: /apps/mobile/app/(app)/chat/index.tsx
//
// The landing screen for the Chat tab.
// Shown when the user taps "Chat" in the bottom tab bar but hasn't
// selected a document yet.
//
// WHAT IT SHOWS:
//   A) If the user has documents → list of documents to pick from
//   B) If no documents → prompt to upload first
//
// Tapping a document navigates to /chat/[documentId] (the actual chat).
// This screen also shows recent chat sessions grouped by document so
// the user can quickly resume a past conversation.

import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuthStore, useDocumentStore } from "@docchat/stores";
import type { Document } from "@docchat/types";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingScreen } from "../../../components/ui/LoadingScreen";

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function ChatIndexScreen() {
  const signOut = useAuthStore((s) => s.signOut);
  const { documents, isLoading, fetchDocuments } = useDocumentStore();
  const [refreshing, setRefreshing] = useState(false);

  // Load documents on mount if not already loaded
  useEffect(() => {
    if (documents.length === 0 && !isLoading) {
      fetchDocuments();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    await fetchDocuments();
    setRefreshing(false);
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading && documents.length === 0) {
    return <LoadingScreen message="Loading your documents…" showLogo={false} />;
  }

  // ── No documents yet ──────────────────────────────────────────────────────
  if (!isLoading && documents.length === 0) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Chat</Text>
          <TouchableOpacity
            onPress={() => signOut()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Sign out"
          >
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
        <EmptyState
          emoji="📚"
          title="No documents yet"
          subtitle={
            "Upload a PDF or Markdown file in the Library tab, " +
            "then come back here to chat with it."
          }
          actionLabel="Go to Library"
          onAction={() => router.push("/(app)/documents/" as any)}
        />
      </SafeAreaView>
    );
  }

  // ── Ready documents ───────────────────────────────────────────────────────
  const otherDocs = documents.filter(
    (d) => d.status !== "ready" && d.status !== "partial",
  );

  function renderDocumentItem({ item }: { item: Document }) {
    const isReady = item.status === "ready" || item.status === "partial";
    return (
      <TouchableOpacity
        style={[s.docRow, !isReady && s.docRowDisabled]}
        onPress={() => {
          if (!isReady) return;
          router.push(`/chat/${item.id}` as any);
        }}
        activeOpacity={isReady ? 0.7 : 1}
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${item.name}`}
        accessibilityState={{ disabled: !isReady }}
      >
        {/* Icon */}
        <Text style={s.docIcon}>
          {item.type === "pdf" ? "📕" : item.type === "markdown" ? "📝" : "📄"}
        </Text>

        {/* Info */}
        <View style={s.docInfo}>
          <Text style={s.docName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={s.docMeta}>
            {item.chunkCount > 0
              ? `${item.chunkCount} chunks`
              : item.type.toUpperCase()}
            {!isReady ? ` · ${item.status}` : ""}
          </Text>
        </View>

        {/* Chevron or status indicator */}
        {isReady ? (
          <Text style={s.chevron}>›</Text>
        ) : (
          <View style={s.processingDot} />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Chat</Text>
        <TouchableOpacity
          onPress={() => signOut()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Sign out"
        >
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={renderDocumentItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6366F1"
            colors={["#6366F1"]}
          />
        }
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListHeaderComponent={
          <View style={s.listHeader}>
            <Text style={s.listHeaderText}>SELECT A DOCUMENT TO CHAT WITH</Text>
          </View>
        }
        ListFooterComponent={
          otherDocs.length > 0 ? (
            <View style={s.footerNote}>
              <Text style={s.footerNoteText}>
                💡 {otherDocs.length} document
                {otherDocs.length !== 1 ? "s are" : " is"} still processing.
                They'll appear here when ready.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={s.listContent}
      />
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  headerTitle: {
    color: "#F1F5F9",
    fontSize: 22,
    fontWeight: "700",
  },
  signOutText: { color: "#94A3B8", fontSize: 13 },

  listContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },

  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  listHeaderText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },

  docRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#0F172A",
    minHeight: 68,
    gap: 12,
  },
  docRowDisabled: {
    opacity: 0.5,
  },

  docIcon: { fontSize: 28 },
  docInfo: { flex: 1 },
  docName: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "600",
  },
  docMeta: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 3,
  },

  chevron: {
    color: "#6366F1",
    fontSize: 22,
    fontWeight: "300",
  },

  processingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FCD34D",
  },

  separator: {
    height: 1,
    backgroundColor: "#1E293B",
    marginLeft: 60, // indent to align with text (past icon)
  },

  footerNote: {
    margin: 16,
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  footerNoteText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
  },
});
