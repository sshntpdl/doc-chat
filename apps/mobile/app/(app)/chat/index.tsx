// FILE: /apps/mobile/app/(app)/chat/index.tsx
// Redesigned with improved UI/UX — same functionality, better design.

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
  Pressable,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useAuthStore, useDocumentStore } from "@docchat/stores";
import type { Document } from "@docchat/types";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingScreen } from "../../../components/ui/LoadingScreen";

// ─── Constants ────────────────────────────────────────────────────────────────

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

const DOC_COLORS: Record<string, { bg: string; accent: string; icon: string }> =
  {
    pdf: { bg: "#1B2D1E", accent: "#22C55E", icon: "📗" },
    markdown: { bg: "#1B2D1E", accent: "#22C55E", icon: "📝" },
    default: { bg: "#1B1E2D", accent: "#818CF8", icon: "📄" },
  };

function getDocStyle(type: string) {
  return DOC_COLORS[type] ?? DOC_COLORS.default;
}

function formatChunks(count: number): string {
  if (count === 0) return "Processing…";
  return `${count} chunk${count !== 1 ? "s" : ""}`;
}

// ─── Greeting helpers ─────────────────────────────────────────────────────────

function getGreeting(): { text: string; wave: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: "Good morning", wave: "👋" };
  if (hour >= 12 && hour < 17) return { text: "Good afternoon", wave: "👋" };
  if (hour >= 17 && hour < 21) return { text: "Good evening", wave: "👋" };
  return { text: "Good night", wave: "🌙" };
}

function getFirstName(session: any): string {
  // Try common supabase user_metadata paths
  const meta = session?.user?.user_metadata;
  if (meta?.full_name) return meta.full_name.split(" ")[0];
  if (meta?.name) return meta.name.split(" ")[0];
  if (meta?.first_name) return meta.first_name;
  // Fall back to email prefix
  const email: string = session?.user?.email ?? "";
  return email.split("@")[0] || "there";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatIndexScreen() {
  const signOut = useAuthStore((s) => s.signOut);
  const session = useAuthStore((s) => s.session);
  const token = session?.access_token;
  const { documents, isLoading, fetchDocuments, deleteDocument } =
    useDocumentStore();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = useMemo(() => getFirstName(session), [session]);

  // Filtered documents based on search query
  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter((d) => d.name.toLowerCase().includes(q));
  }, [documents, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      if (token) {
        fetchDocuments(token);
      }
    }, [token]),
  );

  const handleRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    await fetchDocuments(token);
    setRefreshing(false);
  }, [token, fetchDocuments]);

  function openUpload() {
    router.push("/(app)/chat/upload" as any);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleLongPress(id: string) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }

  function handlePressItem(item: Document) {
    if (selectMode) {
      toggleSelect(item.id);
      return;
    }
    const isReady = item.status === "ready" || item.status === "partial";
    if (!isReady) return;
    router.push(`/chat/${item.id}` as any);
  }

  function confirmDelete() {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      count === 1 ? "Delete document?" : `Delete ${count} documents?`,
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const ids = Array.from(selectedIds);
            exitSelectMode();
            await Promise.all(ids.map((id) => deleteDocument(id, token)));
          },
        },
      ],
    );
  }

  if (isLoading && documents.length === 0) {
    return <LoadingScreen message="Loading your documents…" showLogo={false} />;
  }

  if (!isLoading && documents.length === 0) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <StatusBar
          style="light"
          backgroundColor="#080E1A"
          translucent={false}
        />
        <Header
          selectMode={false}
          selectedCount={0}
          onUpload={openUpload}
          onSignOut={() => signOut()}
          onDelete={() => {}}
          onCancel={() => {}}
        />
        <EmptyState
          emoji="📂"
          title="No documents yet"
          subtitle="Upload a PDF, Markdown, or text file to start chatting with it."
          actionLabel="Upload your first document"
          onAction={openUpload}
        />
      </SafeAreaView>
    );
  }

  const processingCount = documents.filter(
    (d) => d.status !== "ready" && d.status !== "partial",
  ).length;

  // The count shown in the list header reflects search results
  const displayedCount = filteredDocuments.length;

  function renderDocumentItem({ item }: { item: Document }) {
    const isReady = item.status === "ready" || item.status === "partial";
    const isSelected = selectedIds.has(item.id);
    const docStyle = getDocStyle(item.type);

    return (
      <Pressable
        style={({ pressed }) => [
          s.docCard,
          isSelected && s.docCardSelected,
          !isReady && !selectMode && s.docCardDisabled,
          pressed && (isReady || selectMode) && s.docCardPressed,
        ]}
        onPress={() => handlePressItem(item)}
        onLongPress={() => handleLongPress(item.id)}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${item.name}`}
        accessibilityState={{
          disabled: !isReady && !selectMode,
          selected: isSelected,
        }}
      >
        {/* Left accent bar */}
        <View style={[s.accentBar, { backgroundColor: docStyle.accent }]} />

        {/* Icon box */}
        <View style={[s.iconBox, { backgroundColor: docStyle.bg }]}>
          <Text style={s.docIcon}>{docStyle.icon}</Text>
        </View>

        {/* Text */}
        <View style={s.docInfo}>
          <Text style={s.docName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={s.docMetaRow}>
            <View style={[s.typePill, { borderColor: docStyle.accent + "55" }]}>
              <Text style={[s.typePillText, { color: docStyle.accent }]}>
                {item.type.toUpperCase()}
              </Text>
            </View>
            <Text style={s.docMeta}>
              {formatChunks(item.chunkCount)}
              {!isReady ? `  ·  ${item.status}` : ""}
            </Text>
          </View>
        </View>

        {/* Right side */}
        {selectMode ? (
          <View style={[s.checkbox, isSelected && s.checkboxChecked]}>
            {isSelected && <Text style={s.checkMark}>✓</Text>}
          </View>
        ) : isReady ? (
          <View style={s.chevronBox}>
            <Text style={s.chevron}>›</Text>
          </View>
        ) : (
          <View style={s.processingDot} />
        )}
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <StatusBar style="light" backgroundColor="#080E1A" translucent={false} />

      <Header
        selectMode={selectMode}
        selectedCount={selectedIds.size}
        onUpload={openUpload}
        onSignOut={() => signOut()}
        onDelete={confirmDelete}
        onCancel={exitSelectMode}
      />

      <FlatList
        data={filteredDocuments}
        keyExtractor={(item) => item.id}
        extraData={selectMode ? selectedIds : null}
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
          <>
            {/* ── Greeting ── */}
            {!selectMode && (
              <View style={s.greetingBlock}>
                <Text style={s.greetingLabel}>{greeting.text},</Text>
                <View style={s.greetingNameRow}>
                  <Text style={s.greetingName}>{firstName}</Text>
                  <Text style={s.greetingWave}>{greeting.wave}</Text>
                </View>

                {/* Knowledge-base card */}
                <View style={s.kbCard}>
                  <View style={s.kbIconWrap}>
                    <Text style={s.kbIcon}>🗂️</Text>
                  </View>
                  <View style={s.kbTextWrap}>
                    <Text style={s.kbCount}>{documents.length}</Text>
                    <Text style={s.kbLabel}>
                      document{documents.length !== 1 ? "s" : ""} in your
                      knowledge base
                    </Text>
                  </View>
                </View>

                {/* Search bar */}
                <View style={s.searchWrap}>
                  <Text style={s.searchIcon}>🔍</Text>
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search documents…"
                    placeholderTextColor="#3A4E66"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery("")}
                      hitSlop={HIT_SLOP}
                    >
                      <Text style={s.searchClear}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* ── List sub-header ── */}
            <View style={s.listHeader}>
              <Text style={s.listHeaderText}>
                {selectMode
                  ? `${selectedIds.size} SELECTED — TAP MORE TO ADD`
                  : searchQuery.trim()
                    ? `${displayedCount} RESULT${displayedCount !== 1 ? "S" : ""}  ·  LONG-PRESS TO SELECT`
                    : `${documents.length} DOCUMENT${documents.length !== 1 ? "S" : ""}  ·  LONG-PRESS TO SELECT`}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          searchQuery.trim() ? (
            <View style={s.noResults}>
              <Text style={s.noResultsEmoji}>🔎</Text>
              <Text style={s.noResultsTitle}>No results</Text>
              <Text style={s.noResultsSub}>
                No documents match "{searchQuery}"
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          processingCount > 0 ? (
            <View style={s.footerNote}>
              <View style={s.footerNoteRow}>
                <View style={s.processingPulse} />
                <Text style={s.footerNoteText}>
                  {processingCount} document
                  {processingCount !== 1 ? "s are" : " is"} still processing —
                  they'll appear here when ready
                </Text>
              </View>
            </View>
          ) : null
        }
        contentContainerStyle={s.listContent}
      />
    </SafeAreaView>
  );
}

// ─── Header subcomponent ──────────────────────────────────────────────────────

interface HeaderProps {
  selectMode: boolean;
  selectedCount: number;
  onUpload: () => void;
  onSignOut: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

function Header({
  selectMode,
  selectedCount,
  onUpload,
  onSignOut,
  onDelete,
  onCancel,
}: HeaderProps) {
  if (selectMode) {
    return (
      <View style={s.header}>
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={HIT_SLOP}
          accessibilityLabel="Cancel selection"
        >
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{selectedCount} selected</Text>
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={HIT_SLOP}
          disabled={selectedCount === 0}
          accessibilityLabel="Delete selected documents"
        >
          <View
            style={[s.deleteBtn, selectedCount === 0 && s.deleteBtnDisabled]}
          >
            <Text
              style={[
                s.deleteBtnText,
                selectedCount === 0 && s.deleteBtnTextDisabled,
              ]}
            >
              Delete
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.header}>
      <View>
        <Text style={s.headerEyebrow}>Your library</Text>
        <Text style={s.headerTitle}>Documents</Text>
      </View>
      <View style={s.headerActions}>
        <TouchableOpacity
          onPress={onUpload}
          hitSlop={HIT_SLOP}
          accessibilityLabel="Upload a document"
          style={s.uploadBtn}
        >
          <Text style={s.uploadBtnText}>＋ Upload</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSignOut}
          hitSlop={HIT_SLOP}
          accessibilityLabel="Sign out"
          style={s.signOutBtn}
        >
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080E1A" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#0F1A2E",
    backgroundColor: "#080E1A",
  },
  headerEyebrow: {
    color: "#4B5A72",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  headerTitle: {
    color: "#E8EFF8",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  // Upload button — prominent pill
  uploadBtn: {
    backgroundColor: "#4F46E5",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  uploadBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  // Sign out — subtle ghost
  signOutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E2E44",
  },
  signOutText: {
    color: "#4B5A72",
    fontSize: 13,
    fontWeight: "500",
  },

  cancelText: { color: "#818CF8", fontSize: 15 },
  deleteBtn: {
    backgroundColor: "#7F1D1D",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteBtnDisabled: { backgroundColor: "#1E2D44", opacity: 0.5 },
  deleteBtnText: { color: "#FCA5A5", fontSize: 14, fontWeight: "600" },
  deleteBtnTextDisabled: { color: "#475569" },

  // ── Greeting block ─────────────────────────────────────────────────────────
  greetingBlock: {
    paddingTop: 22,
    paddingBottom: 4,
    gap: 14,
  },
  greetingLabel: {
    color: "#6B7E99",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  greetingNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  greetingName: {
    color: "#E8EFF8",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  greetingWave: {
    fontSize: 26,
  },

  // Knowledge-base card
  kbCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1626",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#162035",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  kbIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#111E33",
    alignItems: "center",
    justifyContent: "center",
  },
  kbIcon: { fontSize: 22 },
  kbTextWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 5,
  },
  kbCount: {
    color: "#818CF8",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  kbLabel: {
    color: "#4B5A72",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },

  // Search bar
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1626",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#162035",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchIcon: { fontSize: 15 },
  searchInput: {
    flex: 1,
    color: "#D8E4F5",
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
    margin: 0,
  },
  searchClear: {
    color: "#3A4E66",
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 4,
  },

  // List
  listContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 32 },
  listHeader: { paddingTop: 16, paddingBottom: 10 },
  listHeaderText: {
    color: "#2E3D54",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  separator: { height: 8 },

  // No results
  noResults: {
    alignItems: "center",
    paddingTop: 48,
    gap: 8,
  },
  noResultsEmoji: { fontSize: 36 },
  noResultsTitle: {
    color: "#D8E4F5",
    fontSize: 17,
    fontWeight: "700",
  },
  noResultsSub: {
    color: "#3A4E66",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  // Document card
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1626",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#162035",
    overflow: "hidden",
    minHeight: 76,
    gap: 12,
    paddingRight: 14,
  },
  docCardPressed: {
    backgroundColor: "#111E33",
    borderColor: "#1E3050",
  },
  docCardSelected: {
    borderColor: "#4F46E5",
    backgroundColor: "#0F1836",
  },
  docCardDisabled: {
    opacity: 0.45,
  },

  accentBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 0,
  },

  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  docIcon: { fontSize: 22 },

  docInfo: { flex: 1, paddingVertical: 14, gap: 5 },
  docName: {
    color: "#D8E4F5",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  docMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typePill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typePillText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  docMeta: { color: "#3A4E66", fontSize: 12 },

  chevronBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#0F1A2E",
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    color: "#4F46E5",
    fontSize: 18,
    fontWeight: "400",
    lineHeight: 22,
  },

  processingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FBBF24",
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#2E3D54",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  checkMark: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  // Footer note
  footerNote: {
    marginTop: 20,
    backgroundColor: "#0D1626",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#162035",
  },
  footerNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  processingPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FBBF24",
  },
  footerNoteText: { color: "#3A4E66", fontSize: 13, lineHeight: 19, flex: 1 },
});
