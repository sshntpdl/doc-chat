// FILE: /apps/mobile/app/(app)/documents/index.tsx

import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { router } from "expo-router";
import { useDocumentStore, useAuthStore } from "@docchat/stores";
import type { Document } from "@docchat/types";

const FILE_ICONS: Record<string, string> = {
  pdf: "📕",
  markdown: "📝",
  text: "📄",
};

export default function DocumentsScreen() {
  const { documents, isLoading, fetchDocuments, deleteDocument } =
    useDocumentStore();

  // FIX: subscribe to both session (for token) AND user (for sign-out detection).
  // Previously only `session` was read, but after signOut() the session becomes
  // null before navigation completes — causing a fetchDocuments(undefined) that
  // hits the server with no token and gets a 401.
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const token = session?.access_token;

  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiSelect, setMultiSelect] = useState(false);

  // Fetch documents on mount and whenever the token changes.
  // The token guard inside fetchDocuments() handles the sign-out race:
  // if token is undefined (user just signed out), fetchDocuments bails
  // immediately without hitting the server, so we never log a spurious 401.
  useEffect(() => {
    // Only fetch when we actually have an authenticated user.
    // This prevents the post-signOut render cycle from firing a request.
    if (user && token) {
      fetchDocuments(token);
    }
  }, [token, user]);

  // Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    if (!token) return; // nothing to refresh if signed out
    setRefreshing(true);
    await fetchDocuments(token);
    setRefreshing(false);
  }, [fetchDocuments, token]);

  // Long press enters multi-select mode
  function handleLongPress(id: string) {
    setMultiSelect(true);
    setSelectedIds(new Set([id]));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      if (next.size === 0) setMultiSelect(false);
      return next;
    });
  }

  function cancelMultiSelect() {
    setMultiSelect(false);
    setSelectedIds(new Set());
  }

  async function deleteSelected() {
    Alert.alert(
      "Delete Documents",
      `Delete ${selectedIds.size} document${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await Promise.all(
              [...selectedIds].map((id) => deleteDocument(id, token)),
            );
            cancelMultiSelect();
          },
        },
      ],
    );
  }

  // ── Document row ────────────────────────────────────────────────────────────
  function renderItem({ item }: { item: Document }) {
    const isSelected = selectedIds.has(item.id);

    return (
      <Swipeable
        renderLeftActions={() => (
          <TouchableOpacity
            style={s.swipeAction_chat}
            onPress={() => router.push(`/(app)/chat/${item.id}` as any)}
            accessibilityLabel={`Chat with ${item.name}`}
          >
            <Text style={s.swipeActionText}>💬{"\n"}Chat</Text>
          </TouchableOpacity>
        )}
        renderRightActions={() => (
          <TouchableOpacity
            style={s.swipeAction_delete}
            onPress={() => {
              Alert.alert("Delete", `Delete "${item.name}"?`, [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => deleteDocument(item.id, token),
                },
              ]);
            }}
            accessibilityLabel={`Delete ${item.name}`}
          >
            <Text style={s.swipeActionText}>🗑️{"\n"}Delete</Text>
          </TouchableOpacity>
        )}
      >
        <TouchableOpacity
          onPress={() => {
            if (multiSelect) {
              toggleSelect(item.id);
            } else {
              router.push(`/(app)/chat/${item.id}` as any);
            }
          }}
          onLongPress={() => handleLongPress(item.id)}
          delayLongPress={500}
          activeOpacity={0.7}
          style={[s.row, isSelected && s.rowSelected]}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.status}`}
          accessibilityState={{ selected: isSelected }}
        >
          {/* Multi-select checkbox */}
          {multiSelect && (
            <View style={[s.checkbox, isSelected && s.checkboxChecked]}>
              {isSelected && <Text style={s.checkMark}>✓</Text>}
            </View>
          )}

          {/* File icon */}
          <Text style={s.fileIcon}>{FILE_ICONS[item.type] ?? "📄"}</Text>

          {/* Info */}
          <View style={s.rowInfo}>
            <Text style={s.rowName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={s.rowMeta}>
              {new Date(item.createdAt).toLocaleDateString()} ·{" "}
              {item.chunkCount > 0
                ? `${item.chunkCount} chunks`
                : formatSize(item.size)}
            </Text>
          </View>

          {/* Status badge */}
          <View style={[s.statusBadge, statusColor(item.status)]}>
            <Text style={s.statusText}>{item.status}</Text>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  function renderEmpty() {
    if (isLoading) {
      return (
        <View style={s.skeletonContainer}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={s.skeletonRow}>
              <View style={s.skeletonIcon} />
              <View style={s.skeletonInfo}>
                <View style={s.skeletonTitle} />
                <View style={s.skeletonMeta} />
              </View>
              <View style={s.skeletonBadge} />
            </View>
          ))}
        </View>
      );
    }
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyEmoji}>📚</Text>
        <Text style={s.emptyTitle}>No documents yet</Text>
        <Text style={s.emptySub}>
          Upload a PDF or Markdown file to get started
        </Text>
        <TouchableOpacity
          style={s.emptyBtn}
          onPress={() => router.push("/(app)/documents/upload" as any)}
        >
          <Text style={s.emptyBtnText}>Upload Document</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        {multiSelect ? (
          <>
            <Text style={s.headerTitle}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={cancelMultiSelect} hitSlop={HIT_SLOP}>
              <Text style={s.headerAction}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.headerTitle}>Library</Text>
            <View style={s.headerRight}>
              <TouchableOpacity
                onPress={() => router.push("/(app)/documents/upload" as any)}
                style={s.uploadBtn}
                accessibilityLabel="Upload document"
              >
                <Text style={s.uploadBtnText}>+ Upload</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => signOut()}
                hitSlop={HIT_SLOP}
                accessibilityLabel="Sign out"
              >
                <Text style={s.signOutText}>Sign out</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        contentContainerStyle={
          documents.length === 0 ? { flex: 1 } : { paddingBottom: 20 }
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6366F1"
            colors={["#6366F1"]}
          />
        }
      />

      {/* Multi-select bottom action bar */}
      {multiSelect && selectedIds.size > 0 && (
        <View style={s.bottomBar}>
          <TouchableOpacity style={s.deleteBtn} onPress={deleteSelected}>
            <Text style={s.deleteBtnText}>Delete {selectedIds.size}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusColor(status: string) {
  switch (status) {
    case "ready":
      return { backgroundColor: "#052E16" };
    case "error":
      return { backgroundColor: "#2D0A0A" };
    default:
      return { backgroundColor: "#1C1400" };
  }
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
    borderBottomColor: "#334155",
  },
  headerTitle: { color: "#F1F5F9", fontSize: 20, fontWeight: "700" },
  headerAction: { color: "#818CF8", fontSize: 15 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  uploadBtn: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: "center",
  },
  uploadBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  signOutText: { color: "#94A3B8", fontSize: 13 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#0F172A",
    minHeight: 66,
    gap: 12,
  },
  rowSelected: { backgroundColor: "#1E1B4B" },
  rowInfo: { flex: 1, gap: 3 },
  rowName: { color: "#F1F5F9", fontSize: 15, fontWeight: "600" },
  rowMeta: { color: "#64748B", fontSize: 12 },
  fileIcon: { fontSize: 24 },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#6366F1", borderColor: "#6366F1" },
  checkMark: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: { color: "#94A3B8", fontSize: 11, fontWeight: "600" },

  separator: { height: 1, backgroundColor: "#1E293B" },

  swipeAction_chat: {
    backgroundColor: "#4F46E5",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
  },
  swipeAction_delete: {
    backgroundColor: "#DC2626",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
  },
  swipeActionText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    color: "#F1F5F9",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySub: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyBtn: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 52,
    justifyContent: "center",
  },
  emptyBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

  bottomBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    backgroundColor: "#1E293B",
  },
  deleteBtn: {
    backgroundColor: "#DC2626",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  deleteBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  skeletonContainer: { paddingTop: 8 },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    minHeight: 66,
  },
  skeletonIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1E293B",
  },
  skeletonInfo: { flex: 1, gap: 8 },
  skeletonTitle: {
    height: 14,
    borderRadius: 4,
    backgroundColor: "#1E293B",
    width: "70%",
  },
  skeletonMeta: {
    height: 11,
    borderRadius: 4,
    backgroundColor: "#1E293B",
    width: "40%",
  },
  skeletonBadge: {
    width: 52,
    height: 22,
    borderRadius: 20,
    backgroundColor: "#1E293B",
  },
});
